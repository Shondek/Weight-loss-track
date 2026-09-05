/**
 * ייבוא חד-פעמי של מאגר התזונה הלאומי (משרד הבריאות) מ-data.gov.il.
 *
 *   node scripts/import_nutrition_db.ts [--raw <dir>] [--audit] [--out <file>]
 *
 * מייצר את `public/nutrition/moh-foods.json` — שם, קטגוריה, קלוריות, חלבון,
 * פחמימה, שומן, סיבים ויחידות מידה לכל מזון. לא את שאר 77 הרכיבים, ולא
 * שדה חיפוש: הוא מחושב בטעינה ב-`normalizeSearch`, כדי שיהיה מקור אמת אחד
 * לכללי הנרמול.
 * הקובץ נכנס ל-Git ונפרס מהקומיט; הבנייה עצמה לא פונה לרשת.
 *
 * ריצה חוזרת בטוחה: הפלט דטרמיניסטי (ממוין לפי קוד מזון, כפילויות קוד
 * נזרקות), ולכן הרצה שנייה על אותם נתונים מייצרת קובץ זהה, לא כפול.
 *
 * מקור: ה-API של CKAN (`datastore_search`) ולא קובצי ה-CSV. קובצי ההורדה
 * הישירים יושבים מאחורי CloudFront שחוסם מחוץ לישראל, וה-API מחזיר UTF-8
 * נקי בלי בעיות קידוד. בלי תלויות: fetch של Node.
 *
 * `--raw <dir>` שומר את התשובות הגולמיות של ה-API לתיקייה וקורא מהן בריצה
 * הבאה במקום למשוך שוב. `--audit` מדפיס בדיקות איכות על הנתונים.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CATEGORY_LABELS,
  type FoodCategory,
  type MohFood,
  type MohFoodFile,
  type MohPortion,
} from '../src/lib/nutrition/foodDb.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_OUT = join(ROOT, 'public', 'nutrition', 'moh-foods.json');

const API = 'https://data.gov.il/api/3/action/datastore_search';
const DATASET = 'https://data.gov.il/dataset/nutrition-database';
const PAGE = 5000;

/** מזהי המשאבים בדאטהסט. הרכב המתכונים לא נחוץ — ערכי המתכונים כבר בטבלת המצרכים. */
const RESOURCES = {
  foods: 'c3cb0630-0650-46c1-a068-82d575c094b2',
  units: '98fb46fe-e8de-4067-94d2-b0a8ea4269da',
  unitWeights: '755d28c0-75f7-40e1-9c8c-ecdd106f9b2d',
} as const;

/** יחידות שמופיעות לכל מזון ואין בהן מידע: "גרמים" = 1 ג', "קילוגרם" = 1000 ג'. */
const TRIVIAL_UNITS = new Set(['700', '2000']);

/**
 * סדר ההצגה של משפחות היחידות (לפי המאה של קוד היחידה): כף, כפית, כוס,
 * פרוסה, יחידה, מנה קודם; אריזות (900) אחרונות. בתוך משפחה — לפי הקוד,
 * כך שהבסיס ("כף") קודם לתת-הסוגים ("כף שטוחה", "כף גדושה").
 */
const UNIT_FAMILY_ORDER = [300, 400, 200, 500, 100, 800, 600, 1200, 1000, 1100, 900];

/**
 * מזונות שהערך הקלורי שלהם במאגר לא מוסבר ע"י המאקרו ואין לו הסבר טבעי
 * (אלכוהול, סוכרים אלכוהוליים, סיבים). כנראה טעויות הזנה. הערך לא מתוקן —
 * הממשק רק מסמן שהוא חשוד. נמצאו ב-`--audit`.
 */
const SUSPECT_IDS: Record<string, string> = {
  // 20 קק"ל במאגר, 37 לפי המאקרו (P 2.1 / C 7 / F 0.1)
  '75302029': 'שעועית ירוקה עדינה, שלמה, קפואה, לא מבושלת, סנפרוסט',
  // 72 קק"ל במאגר, 126 לפי המאקרו (P 7 / C 12 / F 5.5)
  '27440109': "סלט ירוק עם קריספי/סלקט צ'יקן, אגוזי מלך, רוטב וינגרט דיאט, מקדונלדס",
};

// ---------- שורות גולמיות ----------

type RawFood = {
  Code: number | string;
  smlmitzrach: number | string;
  shmmitzrach: string;
  english_name: string | null;
  food_energy: number | null;
  protein: number | null;
  carbohydrates: number | null;
  total_fat: number | null;
  total_dietary_fiber: number | null;
};
type RawUnit = { smlmida: string; shmmida: string };
type RawUnitWeight = { mmitzrach: string; mida: string; mishkal: string };

type Args = { raw: string | null; audit: boolean; out: string };

function parseArgs(argv: string[]): Args {
  const args: Args = { raw: null, audit: false, out: DEFAULT_OUT };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--raw') args.raw = argv[++i] ?? null;
    else if (a === '--audit') args.audit = true;
    else if (a === '--out') args.out = argv[++i] ?? DEFAULT_OUT;
    else throw new Error(`ארגומנט לא מוכר: ${a}`);
  }
  return args;
}

// ---------- משיכה ----------

type Fetched<T> = { records: T[]; fetchedAt: string };

async function fetchAll<T>(name: string, resourceId: string, rawDir: string | null): Promise<Fetched<T>> {
  const cachePath = rawDir ? join(rawDir, `${name}.json`) : null;
  if (cachePath && existsSync(cachePath)) {
    const cached = JSON.parse(readFileSync(cachePath, 'utf8')) as Partial<Fetched<T>>;
    if (!Array.isArray(cached.records) || typeof cached.fetchedAt !== 'string') {
      throw new Error(`${name}: מטמון פגום ב-${cachePath} — מחק אותו והרץ שוב`);
    }
    console.error(`${name}: ${cached.records.length} שורות מהמטמון ${cachePath} (נמשכו ${cached.fetchedAt})`);
    return { records: cached.records, fetchedAt: cached.fetchedAt };
  }

  const fetchedAt = new Date().toISOString();

  const records: T[] = [];
  let total = Infinity;
  for (let offset = 0; offset < total; offset += PAGE) {
    const url = `${API}?resource_id=${resourceId}&limit=${PAGE}&offset=${offset}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${name}: ${res.status} ${res.statusText} — ${url}`);
    const body = (await res.json()) as {
      success: boolean;
      result: { total: number; records: T[] };
    };
    if (!body.success) throw new Error(`${name}: success=false — ${url}`);
    total = body.result.total;
    records.push(...body.result.records);
    if (body.result.records.length === 0) break;
  }
  if (records.length !== total) {
    throw new Error(`${name}: השרת דיווח ${total} שורות אבל התקבלו ${records.length}`);
  }
  console.error(`${name}: ${records.length} שורות מ-data.gov.il`);

  const out: Fetched<T> = { records, fetchedAt };
  if (cachePath) {
    mkdirSync(dirname(cachePath), { recursive: true });
    writeFileSync(cachePath, JSON.stringify({ resourceId, ...out }));
  }
  return out;
}

// ---------- המרה ----------

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** מספר מהמאגר, או null. מחרוזת ריקה ו-NaN הם null — לא אפס. */
function num(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? round2(n) : null;
}

function cleanName(s: string): string {
  return s.split(/\s+/).filter((w) => w !== '').join(' ');
}

function unitRank(code: string): number {
  const family = Math.floor(Number(code) / 100) * 100;
  const i = UNIT_FAMILY_ORDER.indexOf(family);
  return (i === -1 ? UNIT_FAMILY_ORDER.length : i) * 10_000 + Number(code);
}

type Issue = { kind: string; detail: string };

function build(
  foods: RawFood[],
  units: RawUnit[],
  unitWeights: RawUnitWeight[],
  issues: Issue[],
): MohFood[] {
  const unitName = new Map(units.map((u) => [u.smlmida, cleanName(u.shmmida)]));

  // יחידות לפי `Code` הפנימי — זה מפתח החיבור בזמן ייבוא בלבד. הוא לא נכנס לפלט.
  const portionsByCode = new Map<string, { code: string; p: MohPortion }[]>();
  for (const w of unitWeights) {
    if (TRIVIAL_UNITS.has(w.mida)) continue;
    const label = unitName.get(w.mida);
    if (!label) {
      issues.push({ kind: 'unit-unknown', detail: `יחידה ${w.mida} למזון ${w.mmitzrach}` });
      continue;
    }
    const g = num(w.mishkal);
    if (g === null || g <= 0) {
      issues.push({ kind: 'unit-weight', detail: `משקל "${w.mishkal}" ליחידה ${label} במזון ${w.mmitzrach}` });
      continue;
    }
    const list = portionsByCode.get(w.mmitzrach) ?? [];
    list.push({ code: w.mida, p: { u: label, g } });
    portionsByCode.set(w.mmitzrach, list);
  }

  const byId = new Map<string, MohFood>();
  const seenCodes = new Set<string>();
  for (const r of foods) {
    const id = String(r.smlmitzrach);
    const code = String(r.Code);
    seenCodes.add(code);
    if (!/^\d{8}$/.test(id)) {
      issues.push({ kind: 'bad-id', detail: `${id} — ${r.shmmitzrach}` });
      continue;
    }
    if (byId.has(id)) {
      issues.push({ kind: 'dup-id', detail: `${id} — ${r.shmmitzrach}` });
      continue;
    }
    const name = cleanName(r.shmmitzrach ?? '');
    if (name === '') {
      issues.push({ kind: 'no-name', detail: id });
      continue;
    }
    const kcal = num(r.food_energy);
    const protein = num(r.protein);
    const fat = num(r.total_fat);
    if (kcal === null || protein === null || fat === null) {
      issues.push({ kind: 'missing-core', detail: `${id} — ${name}` });
      continue;
    }
    const cat = Number(id[0]) as FoodCategory;
    if (!(cat in CATEGORY_LABELS)) {
      issues.push({ kind: 'bad-category', detail: `${id} — ${name}` });
      continue;
    }
    const en = r.english_name ? cleanName(r.english_name) : '';
    const portions = (portionsByCode.get(code) ?? [])
      .sort((a, b) => unitRank(a.code) - unitRank(b.code))
      .map((x) => x.p);

    byId.set(id, {
      id,
      name,
      en: en === '' ? null : en,
      cat,
      kcal,
      protein,
      carbs: num(r.carbohydrates),
      fat,
      fiber: num(r.total_dietary_fiber),
      portions,
      ...(id in SUSPECT_IDS ? { suspect: true as const } : {}),
    });
  }

  for (const id of Object.keys(SUSPECT_IDS)) {
    if (!byId.has(id)) issues.push({ kind: 'suspect-missing', detail: `${id} — ${SUSPECT_IDS[id]}` });
  }

  for (const code of portionsByCode.keys()) {
    if (!seenCodes.has(code)) {
      issues.push({ kind: 'unit-orphan', detail: `יחידות למזון Code=${code} שאינו בטבלת המצרכים` });
    }
  }

  return [...byId.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

// ---------- כתיבה ----------

/** כותרת מרווחת, ומזון אחד בכל שורה — כדי ש-diff ב-Git יהיה קריא. */
function serialize(file: MohFoodFile): string {
  const { foods, ...head } = file;
  const headJson = JSON.stringify(head, null, 2);
  const lines = foods.map((f) => '    ' + JSON.stringify(f));
  return headJson.slice(0, -2) + ',\n  "foods": [\n' + lines.join(',\n') + '\n  ]\n}\n';
}

// ---------- ביקורת ----------

function audit(foods: MohFood[]): void {
  console.log('\n=== סטיית קלוריות: |4P + 4C + 9F − kcal| / kcal > 25% ===');
  const off = foods
    .filter((f) => f.carbs !== null && f.kcal > 0)
    .map((f) => {
      const est = 4 * f.protein + 4 * (f.carbs ?? 0) + 9 * f.fat;
      return { f, est, dev: Math.abs(est - f.kcal) / f.kcal };
    })
    .filter((x) => x.dev > 0.25)
    .sort((a, b) => b.dev - a.dev);
  console.log(`${off.length} מזונות\n`);
  console.log('סטייה | kcal מאגר | 4P+4C+9F | P | C | F | שם');
  for (const { f, est, dev } of off) {
    console.log(
      `${(dev * 100).toFixed(0).padStart(4)}% | ${String(f.kcal).padStart(4)} | ${est.toFixed(0).padStart(4)} | ${f.protein} | ${f.carbs} | ${f.fat} | ${f.name}`,
    );
  }

  console.log('\n=== קטגוריות: 3 דוגמאות אקראיות מכל קבוצה (זרע קבוע) ===');
  let seed = 20260905;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  for (const cat of Object.keys(CATEGORY_LABELS).map(Number) as FoodCategory[]) {
    const pool = foods.filter((f) => f.cat === cat);
    const picks = new Set<number>();
    while (picks.size < Math.min(3, pool.length)) picks.add(Math.floor(rnd() * pool.length));
    console.log(`\n${cat} — ${CATEGORY_LABELS[cat]} (${pool.length})`);
    for (const i of picks) {
      const f = pool[i]!;
      console.log(`   ${f.id}  ${f.name}`);
    }
  }
}

// ---------- ראשי ----------

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  const [foodsRes, unitsRes, unitWeightsRes] = await Promise.all([
    fetchAll<RawFood>('foods', RESOURCES.foods, args.raw),
    fetchAll<RawUnit>('units', RESOURCES.units, args.raw),
    fetchAll<RawUnitWeight>('unitWeights', RESOURCES.unitWeights, args.raw),
  ]);
  const foods = foodsRes.records;
  const units = unitsRes.records;
  const unitWeights = unitWeightsRes.records;
  // מועד המשיכה המוקדם מבין השלוש — יציב בריצה חוזרת מהמטמון, כך שהקובץ לא
  // משתנה ב-Git רק בגלל חותמת זמן.
  const fetchedAt = [foodsRes, unitsRes, unitWeightsRes]
    .map((r) => r.fetchedAt)
    .sort()[0]!;

  const issues: Issue[] = [];
  const built = build(foods, units, unitWeights, issues);

  const file: MohFoodFile = {
    source: 'moh',
    dataset: DATASET,
    fetchedAt,
    resources: { ...RESOURCES },
    categories: Object.fromEntries(
      Object.entries(CATEGORY_LABELS).map(([k, v]) => [k, v]),
    ),
    count: built.length,
    foods: built,
  };

  mkdirSync(dirname(args.out), { recursive: true });
  const text = serialize(file);
  writeFileSync(args.out, text);

  const withPortions = built.filter((f) => f.portions.length > 0).length;
  const portionCount = built.reduce((n, f) => n + f.portions.length, 0);
  console.log(`נכתב ${args.out}`);
  console.log(`  מזונות: ${built.length} מתוך ${foods.length} במקור`);
  console.log(`  עם יחידות מידה: ${withPortions} · סה"כ יחידות: ${portionCount}`);
  console.log(`  carbs=null: ${built.filter((f) => f.carbs === null).length} · fiber=null: ${built.filter((f) => f.fiber === null).length} · en=null: ${built.filter((f) => f.en === null).length} · suspect: ${built.filter((f) => f.suspect).length}`);
  console.log(`  גודל: ${(Buffer.byteLength(text) / 1024).toFixed(0)}KB`);

  const byKind = new Map<string, Issue[]>();
  for (const i of issues) byKind.set(i.kind, [...(byKind.get(i.kind) ?? []), i]);
  for (const [kind, list] of byKind) {
    console.log(`  ${kind}: ${list.length}` + (list.length <= 3 ? ' — ' + list.map((i) => i.detail).join('; ') : ''));
  }

  if (args.audit) audit(built);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
