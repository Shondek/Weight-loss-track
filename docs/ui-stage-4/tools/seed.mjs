/**
 * נתוני דמה למסך התזונה — נכתבים ישירות ל-IndexedDB (`keyval-store`/`keyval`)
 * דרך Playwright. אותם 13 מפתחות של האפליקציה + סמן המיגרציה. כלי עבודה
 * לצילומים ולבדיקות השוויון בלבד; לא נכנס ל-build.
 *
 * מבוסס על docs/ui-stage-3/tools/seed.mjs (אימונים, שקילות, ימים), בתוספת
 * תזונה: 14 יום של רישומים חוזרים (מזהי משרד הבריאות אמיתיים, כך שהיחידות
 * — "גביע", "כף", "יחידה" — מגיעות מהמאגר), ארבעה מזונות שלי (תווית עם
 * "כף מפולסת", מזון-יחידה, מנה ממרכיבים, ושם ארוך לבדיקת החיתוך), שני
 * מועדפים במפתח הקיים, הערכה ידנית שחוזרת פעמיים, קריאטין, יעד יומי.
 * היום (שישי 30/10/2026 08:05): רישום אחד של בוקר, היום פתוח.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PROGRAM = JSON.parse(fs.readFileSync(path.join(HERE, '../../../src/data/program-abc.json'), 'utf8'));
const PARTNER = JSON.parse(fs.readFileSync(path.join(HERE, '../../../src/data/program-partner.json'), 'utf8'));

const START = '2026-09-06'; // ראשון, שבוע 1
const FIRST_WORKOUT = '2026-09-11'; // שישי: A
const KEYS = {
  weights: 'fatloss:weights',
  workouts: 'fatloss:workouts',
  waist: 'fatloss:waist',
  checkins: 'fatloss:checkins',
  standaloneCardio: 'fatloss:cardio-standalone',
  settings: 'fatloss:settings',
  customFoods: 'fatloss:customFoods',
  entries: 'fatloss:entries',
  targets: 'fatloss:targets',
  favorites: 'fatloss:favorites',
  days: 'fatloss:days',
  creatine: 'fatloss:creatine',
  quarantine: 'fatloss:quarantine',
};
const MARKER = 'fatloss:meta:ls-migrated';
const PROFILE = 'fatloss:profile';

function iso(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function fromISO(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d, 12);
}
export function addDays(s, n) {
  const d = fromISO(s);
  d.setDate(d.getDate() + n);
  return iso(d);
}
function diffDays(a, b) {
  return Math.round((fromISO(b) - fromISO(a)) / 86400000);
}

/** משקל "אמיתי" ליום: ירידה של ~0.35 ק"ג לשבוע + רעש יומי דטרמיניסטי. */
function weightOn(d) {
  const n = diffDays(START, d);
  const trend = 97.8 - (0.35 * n) / 7;
  const noise = [0.2, -0.1, 0.3, 0, -0.2, 0.1, -0.3][n % 7];
  return Math.round((trend + noise) * 10) / 10;
}

/** משקל פתיחה לכל תרגיל (ק״ג). תרגיל שלא כאן מתחיל ב-20. */
const BASE = {
  'leg-press': 120,
  'smith-bench-press': 40,
  'leg-extension': 35,
  'leg-curl': 30,
  'back-extension': null, // משקל גוף
  'db-lateral-raise-seated': 7.5,
  plank: null,
  'barbell-rdl': 50,
  'seated-cable-row': 45,
  'pec-deck': 40,
  'face-pull': 20,
  'db-supinated-curl': 10,
  'triceps-pushdown': 25,
  'floor-leg-raise': null,
  'machine-hip-abduction': 50,
  'machine-row': 45,
  'smith-incline-bench-press': 35,
  'db-lateral-raise-standing': 7.5,
  'ez-bar-preacher-curl': 20,
  'cable-torso-rotation': 15,
};
/** תרגילים שלא נרשמים אף פעם (סשן כיול). */
const NEVER = new Set(['lat-pulldown']);
/** תרגיל שהסשן האחרון שלו בלי RIR. */
const NO_RIR_LAST = 'smith-bench-press';

/**
 * שורת תרגיל באימון ה-k של הסוג (k מ-0). ברירת המחדל: תקרה עם RIR 2 בסשן
 * האחרון (→ R1), ולפני כן התקדמות הדרגתית בחזרות באותו משקל.
 */
function loggedExercise(spec, k, isLast) {
  const sets = spec.sets;
  const min = spec.repRangeMin;
  const max = spec.repRangeMax;
  const timed = spec.isTimed === true;
  const bwOnly = spec.bodyweightOnly === true;
  // null מפורש = משקל גוף (A6, פלאנק, B8); תרגיל שלא ברשימה מתחיל ב-20.
  const base = spec.id in BASE ? BASE[spec.id] : 20;
  const step = spec.step ?? 5;
  // משקל: עולה ב-step כל 3 אימונים של הסוג; משקל גוף נשאר null.
  const weight = base === null || bwOnly ? null : base + step * Math.floor(k / 3);
  // חזרות: עולות מהרצפה לתקרה לאורך 3 אימונים, ובאחרון תקרה בכל הסטים.
  const phase = k % 3;
  const target = isLast ? max : Math.min(max, min + phase);
  const reps = Array.from({ length: sets }, (_, i) => Math.max(min, target - (isLast ? 0 : i)));
  const e = {
    exerciseId: spec.id,
    n: spec.name,
    sets: reps.map((r) => ({ weight: bwOnly ? null : weight, reps: timed ? null : r, seconds: timed ? (isLast ? 60 : 45 + phase * 5) : null })),
    targetRepMin: min,
    targetRepMax: max,
    type: spec.type,
    bodyweightOnly: bwOnly,
    assisted: spec.assisted === true,
  };
  if (!(isLast && spec.id === NO_RIR_LAST)) e.rir = isLast ? 2 : 1 + (k % 2);
  return e;
}

// ---------------------------------------------------------------------------
// תזונה
// ---------------------------------------------------------------------------

/** מזהים אמיתיים מהמאגר (public/nutrition/moh-foods.json) — כדי שהיחידות יגיעו מהנתונים. */
export const MOH = {
  cottage: { id: '14201019', name: "גבינת קוטג' 5% שומן, תנובה", kcal: 95, protein: 11, carbs: 1.5, fat: 5, fiber: 0 }, // כף 40 · כפית 12 · גביע 250
  tuna: { id: '26153028', name: 'דג טונה אפוי עם מיץ לימון ללא תוספת שומן בבישול', kcal: 132, protein: 29.2, carbs: 0.3, fat: 0.6, fiber: 0 }, // מנה קטנה 64 · בינונית 151
  almonds: { id: '42101000', name: 'שקדים לא קלויים, ללא מלח', kcal: 579, protein: 21.1, carbs: 9.1, fat: 49.9, fiber: 12.5 }, // יחידה 1.5
  egg: { id: '31101010', name: 'ביצה שלמה בלי קליפה', kcal: 143, protein: 12.6, carbs: 0.7, fat: 9.5, fiber: 0 }, // יחידה בינונית 49.5
  bulgarian: { id: '14101129', name: 'גבינה בולגרית 3% שומן, מעודנת, גד', kcal: 110, protein: 15.5, carbs: 5.3, fat: 3, fiber: 0 }, // כף 16
};

/** ארבעה מזונות שלי. ערכים ל-100 ג׳; מזון-יחידה ×100; המנה עם המתכון שלה. */
export const CUSTOM_FOODS = [
  { id: 'c:seed-tahini', name: 'טחינה גולמית מלאה', cat: 8, kcal: 620, protein: 23, carbs: 10, fat: 55, fiber: 10, portions: [{ u: 'כף מפולסת', g: 15 }], barcode: null },
  { id: 'c:seed-pro40', name: 'PRO 40 יטבתה', cat: 1, kcal: 21000, protein: 4000, carbs: 1200, fat: 300, fiber: 0, portions: [], barcode: null, unitFood: true },
  {
    id: 'c:seed-dinner1',
    name: 'ע1 — קוטג׳ וביצים',
    cat: null,
    // 250 ג׳ קוטג׳ 5% + 2 ביצים (99 ג׳) = 349 ג׳; ערכים ל-100 ג׳ של התערובת.
    kcal: 108.6,
    protein: 11.5,
    carbs: 1.3,
    fat: 6.3,
    fiber: 0,
    portions: [],
    barcode: null,
    recipe: { items: [{ foodId: '14201019', grams: 250, n: 'קוטג׳' }, { foodId: '31101010', grams: 99, u: '2 ביצים' }], finalGrams: 349 },
  },
  { id: 'c:seed-salad', name: 'סלט ירקות קצוץ עם שמן זית, לימון, מלח ופטרוזיליה — הגרסה הביתית הגדולה', cat: 7, kcal: 62, protein: 1.5, carbs: 5, fat: 4, fiber: 2.2, portions: [], barcode: null },
];

/** שני מועדפים במפתח הקיים, באותו מבנה: מזון-יחידה וקוטג׳ בגביע. */
export const FAVORITES = [
  { foodId: 'c:seed-pro40', grams: 1 },
  { foodId: '14201019', grams: 250 },
];

const refOf = (f) => ({ name: f.name, kcal: f.kcal, protein: f.protein, carbs: f.carbs, fat: f.fat, fiber: f.fiber, ...(f.unitFood ? { unitFood: true } : {}) });
const CUSTOM = Object.fromEntries(CUSTOM_FOODS.map((f) => [f.id, f]));

/** מזהה רישום כמו באפליקציה: sortableStamp(ts) + סיומת. */
function entryId(ts, suffix) {
  return `${Math.floor(ts).toString(36).padStart(9, '0')}-${suffix}`;
}

/** שעה מקומית בישראל (+02:00 בסוף אוקטובר) — הסקריפט רץ ב-Node באזור זמן אחר. */
function at(d, hh, mm) {
  return Date.parse(`${d}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00+02:00`);
}

/**
 * 14 יום של אכילה חוזרת (בלי היום): בוקר קוטג׳ בגביע + PRO 40; צהריים המנה
 * ע1 + כף טחינה + סלט (בחלק מהימים); ביניים שקדים; ערב טונה. הערכה ידנית
 * "המבורגר במסעדה" פעמיים. היום: קוטג׳ אחד בבוקר (07:10).
 */
export function nutritionEntries(today, time) {
  const out = [];
  let k = 0;
  const push = (d, hh, mm, meal, food, grams) => {
    const ts = at(d, hh, mm);
    out.push({ id: entryId(ts, `seed${String(k++).padStart(3, '0')}`), d, ts, meal, foodId: food.id, grams, ref: refOf(food) });
  };
  const pushAdhoc = (d, hh, mm, meal, name, kcal, protein) => {
    const ts = at(d, hh, mm);
    out.push({
      id: entryId(ts, `seed${String(k++).padStart(3, '0')}`),
      d,
      ts,
      meal,
      foodId: 'c:adhoc',
      grams: 1,
      ref: { name, kcal: kcal * 100, protein: protein * 100, carbs: null, fat: null, fiber: null, unitFood: true },
      n: name,
      adhoc: true,
    });
  };
  for (let i = 14; i >= 1; i--) {
    const d = addDays(today, -i);
    push(d, 7, 10, 'breakfast', MOH.cottage, 250);
    push(d, 10, 30, 'breakfast', CUSTOM['c:seed-pro40'], 1);
    if (i % 3 !== 0) push(d, 13, 0, 'lunch', CUSTOM['c:seed-dinner1'], 349);
    push(d, 13, 5, 'lunch', CUSTOM['c:seed-tahini'], 15);
    if (i % 2 === 0) push(d, 13, 10, 'lunch', CUSTOM['c:seed-salad'], 150);
    if (i % 4 === 0) push(d, 13, 12, 'lunch', MOH.bulgarian, 32);
    push(d, 16, 30, 'snack', MOH.almonds, 25);
    if (i === 6 || i === 9) pushAdhoc(d, 20, 0, 'dinner', 'המבורגר במסעדה', 850, 45);
    else push(d, 19, 40, 'dinner', MOH.tuna, 151);
  }
  // היום: קוטג׳ בגביע בבוקר, לפני שעת התרחיש.
  const [hh] = time.split(':').map(Number);
  if (hh >= 7) push(today, 7, 10, 'breakfast', MOH.cottage, 250);
  return out;
}

/** קריאטין: סומן בכל 14 הימים שלפני היום; היום עדיין לא. */
export function creatineDays(today) {
  const out = [];
  for (let i = 14; i >= 1; i--) {
    const d = addDays(today, -i);
    out.push({ d, taken: true, at: `${d}T06:40:00.000Z`, dose_g: 5 });
  }
  return out;
}

/**
 * @param {object} o
 * @param {string} o.today  התאריך של התרחיש
 * @param {string} [o.time]
 * @param {'partner'|null} [o.profile]
 * @param {boolean} [o.emptyWorkouts]  בלי היסטוריית אימונים בכלל (סשן כיול מלא)
 */
export function buildSeed(o) {
  const today = o.today;
  const weights = [];
  for (let d = START; d < today; d = addDays(d, 1)) weights.push({ d, w: weightOn(d) });

  const waist = [];
  const thisWeekStart = addDays(today, -fromISO(today).getDay());
  let cm = 99.0;
  for (let d = '2026-09-09'; d < thisWeekStart; d = addDays(d, 7)) {
    waist.push({ d, cm: Math.round(cm * 2) / 2 });
    cm -= 0.35;
  }

  // אימונים A→B→C, שלושה בשבוע (ו׳, ב׳, ד׳), מ-11/09 עד היום (לא כולל).
  const program = o.profile === 'partner' ? PARTNER : PROGRAM;
  // הסבב בלבד: D אופציונלי ומחוץ לסבב (בת הזוג: A↔B).
  const types = program.workouts.map((w) => w.code).filter((t) => t !== 'D');
  const dates = [];
  for (let d = FIRST_WORKOUT; d < today; d = addDays(d, 1)) {
    const dow = fromISO(d).getDay();
    if (dow === 1 || dow === 3 || dow === 5) dates.push(d);
  }
  const perType = Object.fromEntries(types.map((t) => [t, 0]));
  const counts = {};
  for (const [i, d] of dates.entries()) counts[d] = types[i % types.length];
  const lastOfType = {};
  for (const d of dates) lastOfType[counts[d]] = d;
  const workouts = [];
  if (!o.emptyWorkouts) {
    for (const d of dates) {
      const t = counts[d];
      const k = perType[t]++;
      const isLast = lastOfType[t] === d;
      const w = program.workouts.find((x) => x.code === t);
      const ex = w.exercises.filter((spec) => !NEVER.has(spec.id)).map((spec) => loggedExercise(spec, k, isLast));
      workouts.push({ schemaVersion: 2, id: `${d}-seed-${t}`, d, t, ex, knee: k % 4 === 0 ? 1 : 0, shoulder: 0 });
    }
  }

  const days = [];
  for (let i = 14; i >= 1; i--) {
    const d = addDays(today, -i);
    days.push({ d, closed: true, closedAt: `${d}T21:30:00.000Z`, steps: 7200 + (i % 5) * 600 });
  }

  const data = {
    [KEYS.weights]: weights,
    [KEYS.workouts]: workouts,
    [KEYS.waist]: waist,
    [KEYS.checkins]: [],
    [KEYS.standaloneCardio]: [],
    [KEYS.settings]: { programStart: START, soundEnabled: false, lastBackup: addDays(today, -2) },
    [KEYS.customFoods]: o.profile === 'partner' ? [] : CUSTOM_FOODS,
    [KEYS.entries]: o.profile === 'partner' ? [] : nutritionEntries(today, o.time ?? '08:05:00'),
    [KEYS.targets]: [{ from: START, kcal: 2100, protein: 170, carbs: 200, fat: 65 }],
    [KEYS.favorites]: o.profile === 'partner' ? [] : FAVORITES,
    [KEYS.days]: days,
    [KEYS.creatine]: o.profile === 'partner' ? [] : creatineDays(today),
    [KEYS.quarantine]: [],
    [MARKER]: { at: `${START}T06:00:00.000Z`, keys: Object.keys(KEYS) },
  };
  if (o.profile) data[PROFILE] = o.profile;
  return data;
}

/** רץ בתוך הדפדפן: כותב את כל המפתחות ל-IndexedDB של idb-keyval. */
export function seedInBrowser(data) {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('keyval-store');
    req.onupgradeneeded = () => req.result.createObjectStore('keyval');
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const db = req.result;
      const tx = db.transaction('keyval', 'readwrite');
      const st = tx.objectStore('keyval');
      st.clear();
      for (const [k, v] of Object.entries(data)) st.put(v, k);
      tx.oncomplete = () => {
        db.close();
        resolve(true);
      };
      tx.onerror = () => reject(tx.error);
    };
  });
}

/** רץ בתוך הדפדפן: מנקה את ה-IndexedDB ואת localStorage. */
export function wipeInBrowser() {
  return new Promise((resolve) => {
    try {
      localStorage.clear();
    } catch {}
    const req = indexedDB.deleteDatabase('keyval-store');
    req.onsuccess = req.onerror = req.onblocked = () => resolve(true);
  });
}
