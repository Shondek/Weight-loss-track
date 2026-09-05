/**
 * מסמך ייחוס לספריית המנות — docs/meal-reference.md.
 *
 *   node scripts/build_meal_reference.ts
 *
 * נבנה מהערכים המחושבים בפועל ב-library/meal-library-v2.json (לא מהמסמך
 * המקורי), ומעוגל באותן פונקציות של שכבת התצוגה (kcalText, macroText) —
 * כך שכל מספר כאן זהה למה שהאפליקציה תציג ברישום.
 * ערך לא ידוע (null) מוצג כמקף; סכום שמכיל לא ידוע מסומן "לפחות".
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { CustomFood } from '../src/types.ts';
import type { MohFoodFile } from '../src/lib/nutrition/foodDb.ts';
import { buildFoodIndex, resolveFood } from '../src/lib/nutrition/index.ts';
import { kcalText, macroText } from '../src/lib/nutrition/display.ts';
import { LIB_PREFIX } from './meal-library-v2.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const LIB = JSON.parse(readFileSync(join(ROOT, 'library', 'meal-library-v2.json'), 'utf8')) as { customFoods: CustomFood[] };
const MOH = JSON.parse(readFileSync(join(ROOT, 'public', 'nutrition', 'moh-foods.json'), 'utf8')) as MohFoodFile;
const OUT = join(ROOT, 'docs', 'meal-reference.md');

const TARGET = { kcal: 1900, protein: 190, floor: 1850 };
const TWO_BLOCKS = 240;

const index = buildFoodIndex(MOH.foods, LIB.customFoods);
const byId = new Map(LIB.customFoods.map((f) => [f.id, f]));
const lib = (slug: string) => {
  const f = byId.get(`${LIB_PREFIX}${slug}`);
  if (!f) throw new Error(`חסר בספרייה: ${slug}`);
  return f;
};

// ---------- מטא-דאטה של האילוצים (מהמסמך המקורי) ----------

type Kind = 'meat' | 'dairy' | 'pareve';
const KIND_LABEL: Record<Kind, string> = { meat: '🥩 בשרי', dairy: '🧀 חלבי', pareve: '🌿 פרווה' };

type Item = {
  label: string;
  kind: Kind;
  eggs: number;
  carbsEvening: boolean;
  /** מה נרשם: מזון ספרייה × גרמים (המנה כפי שהוגדרה, או חלק ממנה). */
  parts: { food: CustomFood | { id: string }; grams: number; label?: string }[];
  /** פריטים שנרשמים בנפרד (לא בתוך המנה). */
  separate: string[];
  note?: string;
};

const dish = (slug: string, grams?: number) => {
  const f = lib(slug);
  return { food: f, grams: grams ?? f.recipe!.finalGrams };
};

const LUNCH: Item[] = [
  { label: 'צ1 — חזה עוף מתובל', kind: 'meat', eggs: 0, carbsEvening: false, parts: [dish('lunch-1-chicken')], separate: [] },
  { label: 'צ2 — רוסטביף', kind: 'meat', eggs: 0, carbsEvening: false, parts: [dish('lunch-2-roastbeef')], separate: [] },
  { label: 'צ3 — מעורב', kind: 'meat', eggs: 0, carbsEvening: false, parts: [dish('lunch-3-mixed')], separate: [] },
  { label: 'צ4 — פסטרמת הודו', kind: 'meat', eggs: 0, carbsEvening: false, parts: [dish('lunch-4-pastrami')], separate: [] },
  { label: 'צ5 — טונה וביצים', kind: 'pareve', eggs: 2, carbsEvening: false, parts: [dish('lunch-5-tuna-eggs')], separate: [] },
];

const riceCake = { id: '54319039' };
const DINNER: Item[] = [
  { label: "ע1 — קוטג' וביצים", kind: 'dairy', eggs: 2, carbsEvening: true, parts: [dish('dinner-1-cottage-eggs')], separate: [] },
  {
    label: 'ע2 — שקשוקה',
    kind: 'dairy',
    eggs: 3,
    carbsEvening: true,
    parts: [dish('dinner-2-shakshuka'), { food: lib('pita-light'), grams: 1, label: 'פיתה קלה × 1' }],
    separate: ['פיתה קלה — הזן 1'],
    note: '3 ביצים — אין ביצים בשאר היום',
  },
  {
    label: 'ע3 — ביצים בשמן זית וגבינה',
    kind: 'dairy',
    eggs: 2,
    carbsEvening: true,
    parts: [dish('dinner-3-eggs-cheese'), { food: lib('pita-light'), grams: 1, label: 'פיתה קלה × 1' }],
    separate: ['פיתה קלה — הזן 1'],
  },
  {
    label: 'ע4 — פשטידת ברוקולי (חצי תבנית)',
    kind: 'dairy',
    eggs: 2,
    carbsEvening: true,
    parts: [
      { ...dish('dinner-4-broccoli-pie', lib('dinner-4-broccoli-pie').recipe!.finalGrams / 2), label: 'חצי תבנית' },
      { food: riceCake, grams: 3 * 9.26, label: 'פריכיות אורז × 3 (27.8 ג׳)' },
      { food: lib('greek-yogurt-0'), grams: 100, label: 'יוגורט יווני 0% × 100 ג׳' },
    ],
    separate: ['פריכיות אורז — 27.8 ג׳ (3 יחידות, מזון המאגר 54319039)', 'יוגורט יווני 0% — 100 ג׳'],
    note: 'חצי תבנית = מחצית משקל התבנית כפי שהוגדרה (עד שתשקול אחרי אפייה)',
  },
  { label: 'ע5 — בלי בישול', kind: 'dairy', eggs: 0, carbsEvening: true, parts: [dish('dinner-5-no-cook')], separate: [] },
];

const COFFEE: Item = {
  label: 'קפה קר עם חלב + כדור תמר',
  kind: 'dairy',
  eggs: 0,
  carbsEvening: false,
  parts: [dish('coffee-milk'), { food: lib('date-ball'), grams: 1, label: 'כדור תמר × 1' }],
  separate: ['כדור תמר — הזן 1'],
};

const BLOCKS: Item[] = [
  { label: 'טונה במים, מסוננת — קופסה', kind: 'pareve', eggs: 0, carbsEvening: false, parts: [{ food: lib('tuna-water-drained'), grams: 112 }], separate: [] },
  { label: 'יוגורט יווני 0% — 200 ג׳', kind: 'dairy', eggs: 0, carbsEvening: false, parts: [{ food: lib('greek-yogurt-0'), grams: 200 }], separate: [] },
  { label: "קוטג' 5% — 100 ג׳", kind: 'dairy', eggs: 0, carbsEvening: false, parts: [{ food: { id: '14201019' }, grams: 100 }], separate: [] },
  { label: 'גבינה בולגרית 5% — 100 ג׳', kind: 'dairy', eggs: 0, carbsEvening: false, parts: [{ food: lib('bulgarit-5'), grams: 100 }], separate: [] },
  { label: '3 חלבוני ביצה — 100 ג׳', kind: 'pareve', eggs: 0, carbsEvening: false, parts: [{ food: { id: '31108010' }, grams: 100 }], separate: [], note: 'חלבונים בלבד — לא נספרים במגבלת הביצים' },
  { label: 'PRO 40 — בקבוק', kind: 'pareve', eggs: 0, carbsEvening: false, parts: [{ food: lib('pro40-yotvata'), grams: 1 }], separate: [], note: 'מחליף את שני הבלוקים' },
];

// ---------- חישוב: בדיוק כמו entryNutrition ----------

type N = { kcal: number; protein: number; carbs: number; fat: number; carbsUnknown: boolean; fatUnknown: boolean; grams: number };

function resolveAny(food: CustomFood | { id: string }) {
  const f = resolveFood(index, food.id);
  if (!f) throw new Error(`לא נמצא: ${food.id}`);
  return f;
}

function nutritionOf(parts: Item['parts']): N {
  const n: N = { kcal: 0, protein: 0, carbs: 0, fat: 0, carbsUnknown: false, fatUnknown: false, grams: 0 };
  for (const p of parts) {
    const f = resolveAny(p.food);
    const k = p.grams / 100;
    n.kcal += f.kcal * k;
    n.protein += f.protein * k;
    if (f.carbs === null) n.carbsUnknown = true;
    else n.carbs += f.carbs * k;
    if (f.fat === null) n.fatUnknown = true;
    else n.fat += f.fat * k;
    n.grams += p.grams;
  }
  return n;
}

const add = (a: N, b: N): N => ({
  kcal: a.kcal + b.kcal,
  protein: a.protein + b.protein,
  carbs: a.carbs + b.carbs,
  fat: a.fat + b.fat,
  carbsUnknown: a.carbsUnknown || b.carbsUnknown,
  fatUnknown: a.fatUnknown || b.fatUnknown,
  grams: a.grams + b.grams,
});

const atLeast = (v: number, unknown: boolean) => (unknown ? `לפחות ${macroText(v)}` : macroText(v));
const g = (n: number) => (Number.isInteger(n) ? String(n) : (Math.round(n * 10) / 10).toString());
const bold = (s: string) => `**${s}**`;

// ---------- רינדור ----------

const out: string[] = [];
const L = (s = '') => out.push(s);

L('# ייחוס מנות — ספרייה v2');
L();
L(`יעד יומי: **${TARGET.kcal.toLocaleString('en')} קק"ל · ${TARGET.protein} ג׳ חלבון** · רצפה ${TARGET.floor.toLocaleString('en')}. הערכים מחושבים מ-\`library/meal-library-v2.json\` באותו עיגול של האפליקציה. מקף = לא ידוע (לא אפס).`);
L();

// 1. summary
L('## 1. סיכום — לפי קלוריות');
L();
L('| מנה | קק"ל | חלבון | פחמימה | שומן | משקל הצלחת | נשאר מ-1,900 |');
L('|---|---|---|---|---|---|---|');
type Row = { item: Item; n: N; kind: 'dish' | 'block' };
const rows: Row[] = [
  ...LUNCH.map((item) => ({ item, n: nutritionOf(item.parts), kind: 'dish' as const })),
  ...DINNER.map((item) => ({ item, n: nutritionOf(item.parts), kind: 'dish' as const })),
  { item: COFFEE, n: nutritionOf(COFFEE.parts), kind: 'dish' as const },
  ...BLOCKS.map((item) => ({ item, n: nutritionOf(item.parts), kind: 'block' as const })),
].sort((a, b) => a.n.kcal - b.n.kcal);
for (const { item, n, kind } of rows) {
  const carbs = n.carbsUnknown && n.carbs === 0 ? '—' : n.carbsUnknown ? `≥${macroText(n.carbs)}` : macroText(n.carbs);
  const fat = n.fatUnknown && n.fat === 0 ? '—' : n.fatUnknown ? `≥${macroText(n.fat)}` : macroText(n.fat);
  const unit = resolveAny(item.parts[0]!.food).unitFood;
  const weight = kind === 'block' ? (unit ? '1 (יחידה)' : g(n.grams)) : item.parts.length === 1 ? bold(g(n.grams)) : `${bold(g(item.parts[0]!.grams))} + נפרד`;
  L(`| ${item.label}${kind === 'block' ? ' (בלוק)' : ''} | ${kcalText(n.kcal)} | ${macroText(n.protein)} | ${carbs} | ${fat} | ${weight} | ${kcalText(TARGET.kcal - n.kcal)} |`);
}
L();
L('≥ = חלק מהמרכיבים בלי ערך ידוע; זה חסם תחתון. "+ נפרד" = הפריטים שברשימת "נרשם בנפרד" של המנה.');
L();

// 2. details
L('## 2. פירוט');
L();
function detail(item: Item) {
  const n = nutritionOf(item.parts);
  L(`### ${item.label}`);
  L();
  L(`${KIND_LABEL[item.kind]} · ביצים: ${item.eggs}${item.carbsEvening ? ' · פחמימות — ערב' : ''}${item.note ? ` · ${item.note}` : ''}`);
  L();
  for (const p of item.parts) {
    const f = resolveAny(p.food);
    const cf = 'recipe' in p.food ? (p.food as CustomFood) : null;
    if (cf?.recipe) {
      const scale = p.grams / cf.recipe.finalGrams;
      L(`${p.label ? `**${p.label}** — ` : ''}מרכיבים${scale !== 1 ? ` (×${scale.toFixed(2)} מהמנה המוגדרת)` : ''}:`);
      L();
      L('| מרכיב | גרמים | קק"ל | חלבון |');
      L('|---|---|---|---|');
      for (const i of cf.recipe.items) {
        const ing = resolveFood(index, i.foodId)!;
        const gr = i.grams * scale;
        L(`| ${ing.name} | ${g(gr)} | ${kcalText((ing.kcal * gr) / 100)} | ${macroText((ing.protein * gr) / 100)} |`);
      }
    } else {
      L(`- ${p.label ?? f.name}: ${g(p.grams)} ג׳ → ${kcalText((f.kcal * p.grams) / 100)} קק"ל · ${macroText((f.protein * p.grams) / 100)} חלבון`);
    }
  }
  L();
  L(`**מחושב:** ${kcalText(n.kcal)} קק"ל · ${macroText(n.protein)} חלבון · פחמימה ${n.carbsUnknown && n.carbs === 0 ? '—' : atLeast(n.carbs, n.carbsUnknown)} · שומן ${n.fatUnknown && n.fat === 0 ? '—' : atLeast(n.fat, n.fatUnknown)}`);
  L();
  const main = item.parts[0]!;
  L(`**משקל הצלחת להזנה: ${g(main.grams)} ג׳**${item.parts.length > 1 ? ` (${resolveAny(main.food).name})` : ''}`);
  L();
  if (item.separate.length) {
    L('נרשם בנפרד:');
    for (const s of item.separate) L(`- ${s}`);
    L();
  }
  const unknown: string[] = [];
  for (const p of item.parts) {
    const cf = 'recipe' in p.food ? (p.food as CustomFood) : null;
    const ings = cf?.recipe ? cf.recipe.items.map((i) => resolveFood(index, i.foodId)!) : [resolveAny(p.food)];
    for (const ing of ings) {
      const missing = [ing.carbs === null ? 'פחמימה' : null, ing.fat === null ? 'שומן' : null, ing.fiber === null ? 'סיבים' : null].filter(Boolean);
      if (missing.length) unknown.push(`${ing.name}: ${missing.join(', ')} — ${ing.source === 'custom' ? 'לא במסמך המקורי' : 'חסר במאגר הלאומי'}`);
    }
  }
  if (unknown.length) {
    L('לא ידוע:');
    for (const u of [...new Set(unknown)]) L(`- ${u}`);
    L();
  }
}
L('### צהריים');
L();
for (const i of LUNCH) detail(i);
L('### ערב');
L();
for (const i of DINNER) detail(i);
L('### קפה');
L();
detail(COFFEE);
L('### בלוקים');
L();
for (const i of BLOCKS) detail(i);

// 3. combos
L('## 3. יום שלם — צהריים + ערב');
L();
L(`נשאר = ${TARGET.kcal.toLocaleString('en')} − צהריים − ערב, לפני בלוקים, קפה ומילוי. שני בלוקים ≈ ${TWO_BLOCKS} קק"ל. ⚠ = פחות מ-${TWO_BLOCKS} לבלוקים · ✗ = חריגה מהיעד · 🥚 = שני ביצים ביום מוצו.`);
L();
L('| צהריים | ערב | קק"ל | חלבון | פחמימה | שומן | נשאר קק"ל | נשאר חלבון | |');
L('|---|---|---|---|---|---|---|---|---|');
for (const l of LUNCH) {
  const ln = nutritionOf(l.parts);
  for (const d of DINNER) {
    const dn = nutritionOf(d.parts);
    const t = add(ln, dn);
    const left = TARGET.kcal - t.kcal;
    const eggs = l.eggs + d.eggs;
    const flags = [left < 0 ? '✗' : left < TWO_BLOCKS ? '⚠' : '', eggs > 3 ? '🥚✗' : eggs >= 2 ? '🥚' : ''].filter(Boolean).join(' ');
    L(`| ${l.label.split(' — ')[0]} | ${d.label.split(' — ')[0]} | ${kcalText(t.kcal)} | ${macroText(t.protein)} | ${atLeast(t.carbs, t.carbsUnknown)} | ${atLeast(t.fat, t.fatUnknown)} | ${kcalText(left)} | ${macroText(TARGET.protein - t.protein)} | ${flags} |`);
  }
}
L();
L('צ5 + ע2 = 5 ביצים (🥚✗) · צ5 + ע1/ע3/ע4 = 4 ביצים (🥚✗) · ע2 לבדה = 3 ביצים — אין ביצים בשאר היום.');
L();

// 4. constraints
L('## 4. אילוצים');
L();
L('| מנה | סוג | ביצים | פחמימות |');
L('|---|---|---|---|');
for (const i of [...LUNCH, ...DINNER, COFFEE, ...BLOCKS]) L(`| ${i.label} | ${KIND_LABEL[i.kind]} | ${i.eggs || '—'} | ${i.carbsEvening ? 'ערב' : '—'} |`);
L();
L('- בשר וגבינה לא באותה ארוחה: צ1–צ4 בשרי, ע1–ע5 חלבי, צ5 פרווה. בלוקים חלביים (יוגורט, קוטג\', בולגרית) לא צמודים לצהריים בשרי.');
L('- מקסימום 2 ביצים ביום. ע2 = 3, ואז 0 בשאר היום. חלבוני ביצה לא נספרים.');
L('- כל הפחמימות בערב: פריכיות, פיתה קלה. כדור התמר בקפה — אחרי שתי ארוחות, לא בבוקר.');
L();

// 5. known gaps
L('## 5. פערים ידועים — מטלות');
L();
L('| מה | למדוד | מה זה ישנה |');
L('|---|---|---|');
L('| פיתה קלה | משקל יחידה + פחמימה/שומן מהאריזה | היום יחידה = 1 ג\' (הזן 1). אחרי מדידה: ערכים ל-100 ג\', ואפשר לשקול. פחמימה/שומן ליום יפסיקו להיות "לפחות" |');
L('| כדור תמר | משקל, קלוריות, חלבון, פחמימה, שומן מהאריזה | ~130 קק"ל וחלבון 0 הם הערכה מהמסמך. כל הערכים ליום עם קפה הם "לפחות" |');
L('| PRO 40 | פחמימה ושומן מהתווית | היום בקבוק = 1. קלוריות וחלבון מהתווית; מאקרו אחר לא ידוע |');
L('| רוסטביף הוד מעדן | פחמימה ושומן מהתווית | צ2 וצ3: פחמימה ושומן "לפחות" |');
L('| טונה במים | שומן ופחמימה מהתווית | צ5 ובלוק הטונה: שומן "לפחות" |');
L('| יוגורט יווני 0% | פחמימה מהתווית | ע2–ע5 ובלוק: פחמימה "לפחות" |');
L('| גבינה בולגרית 5% | פחמימה מהתווית | ע2–ע4 ובלוק: פחמימה "לפחות" |');
L('| חזה עוף מתובל | תווית המוצר מהעבודה | היום ממופה לחזה עוף צלוי ללא עור (160/30.1). המסמך מעריך +5% קלוריות ונתרן גבוה |');
L('| פשטידת ברוקולי | לשקול את התבנית אחרי אפייה | היום 1,063.6 ג\' = סכום המרכיבים. אחרי מדידה הערך ל-100 ג\' יתרכז; "חצי תבנית" = מחצית המשקל שנמדד |');
L('| קפה קר עם חלב | כמות החלב בפועל | 100 מ"ל חלב 3% נגזר מהמסמך (60 קק"ל). אם יותר — כל הקפה זז |');
L();
L('כשמעדכנים מזון בעורך, רישומים קודמים לא משתנים (הערכים הוקפאו בזמן הרישום). המסמך הזה מתחדש עם `node scripts/build_meal_reference.ts`.');

writeFileSync(OUT, out.join('\n') + '\n');
console.log(`נכתב ${OUT}: ${out.length} שורות`);
