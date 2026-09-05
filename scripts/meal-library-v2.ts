/**
 * ספריית המנות v2 — הגדרת הנתונים לייבוא. מודול טהור: מקבל אינדקס מזון
 * ומחזיר CustomFood[] מוכן לקובץ ייבוא. הסקריפט build_meal_library.ts
 * טוען את מאגר משרד הבריאות, קורא לכאן וכותב את הקובץ.
 *
 * כל מספר כאן מגיע מאחד משני מקורות בלבד:
 *  - "מסמך" = meal-library-v2.md (ערכי תווית או ערכי בסיס מאומתים)
 *  - "מאגר" = מזון במאגר משרד הבריאות לפי מזהה בן 8 ספרות
 * מה שנגזר (משקל יחידה שאינו כתוב במסמך) מסומן ✎ עם דרך הגזירה.
 *
 * מזהים דטרמיניסטיים ("c:lib2:…") — ריצה חוזרת מייצרת אותו קובץ, וייבוא
 * חוזר מעדכן במקום לשכפל (upsert לפי מזהה).
 */

import type { CustomFood, FoodId, Recipe } from '../src/types.ts';
import type { FoodIndex } from '../src/lib/nutrition/index.ts';
import { resolveFood } from '../src/lib/nutrition/index.ts';
import { fromCustom } from '../src/lib/nutrition/foods.ts';
import { buildRecipeFood } from '../src/lib/nutrition/recipe.ts';

export const LIB_PREFIX = 'c:lib2:';
const id = (slug: string): FoodId => `${LIB_PREFIX}${slug}`;

const UNVERIFIED = 'ערכי אריזה טרם אומתו';

// ---------- מזהי מאגר (אושרו בשלב 0) ----------

export const MOH = {
  chickenBreast: '24122120', // בשר עוף, חזה, ללא עצם, צלוי, נאכל ללא עור — 160/30.1
  pastrami: '90000027', // FFQ-פסטרמה או חזה הודו מעושן — 100/17.7
  salad: '75145058', // סלט ירקות ישראלי ללא תוספת שמן — 17/0.8
  almonds: '42101000', // שקדים לא קלויים, ללא מלח — 579/21.1
  tahini: '43103119', // טחינה גולמית, שומשום מלא — 617/21.4
  cottage5: '14201019', // גבינת קוטג' 5% שומן, תנובה — 95/11
  eggBoiled: '31103000', // ביצה קשה שלמה, ללא קליפה — 154/12.5
  eggRaw: '31101010', // ביצה שלמה בלי קליפה — 143/12.6 (ביצה שמתבשלת במנה)
  eggWhite: '31108010', // ביצה חלבון לא מבושל — 52/10.9
  oliveOil: '82104000', // שמן זית — 884/100
  tomato: '74101000', // עגבניה, טריה — 18/0.9
  broccoliFrozen: '72201219', // ברוקולי, קפוא, לא מבושל, סנפרוסט — 31/3.3
  riceCake: '54319039', // פריכיות אורז, ללא מלח, אסם — 378/8.3
  milk3: '11111009', // חלב 3% שומן — 60/3.3
  coffee: '92103000', // קפה, מוכן מאבקת אינסטנט, רגיל — 3/0.1
} as const;

// ---------- משקלים ✎ ----------

export const GRAMS = {
  /** ✎ ביצה L ללא קליפה: 78 קק"ל במסמך / 154 ל-100 ג' במאגר ≈ 50 ג'. */
  egg: 50,
  /** ✎ 3 חלבונים = 52 קק"ל במסמך = 100 ג' חלבון ביצה במאגר. */
  eggWhites3: 100,
  /** מסמך: "כף 15 גר'" טחינה. */
  tahiniTbsp: 15,
  /** ✎ "כף שמן זית = 120 קק"ל" במסמך / 884 ל-100 ג' = 13.6 ג'. */
  oliveOilTbsp: 13.6,
  /** ✎ "כפית שמן = 40 קק"ל" במסמך / 884 = 4.5 ג'. */
  oilTsp: 4.5,
  /** ✎ פריכית = 35 קק"ל במסמך / 378 ל-100 ג' במאגר = 9.26 ג'. */
  riceCake: 9.26,
  /** מסמך: קופסת טונה 160 ג' = 112 ג' נטו מסונן. */
  tunaCan: 112,
  /** ✎ קפה + חלב = 190 − 130 (כדור תמר) = 60 קק"ל = 100 מ"ל חלב 3%. */
  milkInCoffee: 100,
  /** ✎ נפח הקפה עצמו לא במסמך. 150 מ"ל, ~4 קק"ל. */
  coffee: 150,
  /**
   * יחידה = 1 ג' עד לאימות משקל האריזה: הערכים המלאים של היחידה נשמרים
   * "ל-1 ג'" (כלומר ×100 ל-100 ג'), והזנת 1 ברישום = יחידה אחת.
   * כשתשקול — עדכן את המזון לערכים אמיתיים ל-100 ג'.
   */
  unitAs1: 1,
} as const;

// ---------- מוצרים ממותגים: ערכי תווית מהמסמך ----------

type Custom = Omit<CustomFood, 'recipe'>;

const per100 = (kcal: number, protein: number, grams: number) => ({
  kcal: (kcal * 100) / grams,
  protein: (protein * 100) / grams,
});

/** ערכי יחידה בקונבנציית "יחידה = 1 ג'": ל-100 ג' = ×100. */
const perUnitAs1 = (kcal: number, protein: number) => per100(kcal, protein, GRAMS.unitAs1);

export const CUSTOM_FOODS: Custom[] = [
  {
    id: id('roastbeef-hod-maadan'),
    name: 'רוסטביף הוד מעדן',
    cat: 2,
    kcal: 102,
    protein: 19,
    carbs: null,
    fat: null,
    fiber: null,
    portions: [],
    barcode: null,
    note: 'תווית: 102 קק"ל · 19 חלבון · 800 מ"ג נתרן ל-100 ג\'. פחמימה ושומן לא ידועים',
  },
  {
    id: id('pro40-yotvata'),
    name: 'יוטבתה PRO 40',
    cat: 1,
    ...perUnitAs1(195, 40),
    carbs: null,
    fat: null,
    fiber: null,
    portions: [{ u: 'בקבוק', g: GRAMS.unitAs1 }],
    barcode: null,
    note: 'בקבוק = 1 (הזן 1 לבקבוק). תווית: 193–196 קק"ל · 40 חלבון ל-350 מ"ל. פחמימה ושומן לא ידועים',
  },
  {
    id: id('greek-yogurt-0'),
    name: 'יוגורט יווני 0%',
    cat: 1,
    kcal: 60,
    protein: 10,
    carbs: null,
    fat: 0,
    fiber: null,
    portions: [{ u: 'גביע', g: 200 }],
    barcode: null,
    note: 'מהמסמך: 60 קק"ל · 10 חלבון ל-100 ג\'. שומן 0 לפי השם; פחמימה לא ידועה',
  },
  {
    id: id('bulgarit-5'),
    name: 'גבינה בולגרית 5%',
    cat: 1,
    kcal: 110,
    protein: 15,
    carbs: null,
    fat: 5,
    fiber: null,
    portions: [],
    barcode: null,
    note: 'מהמסמך: 110 קק"ל · 15 חלבון ל-100 ג\'. שומן 5 לפי השם; פחמימה לא ידועה',
  },
  {
    id: id('tuna-water-drained'),
    name: 'טונה במים, מסוננת',
    cat: 2,
    ...per100(116, 28, GRAMS.tunaCan),
    carbs: null,
    fat: null,
    fiber: null,
    portions: [{ u: 'קופסה מסוננת', g: GRAMS.tunaCan }],
    barcode: null,
    note: 'מהמסמך: 116 קק"ל · 28 חלבון לקופסה 160 ג\' (112 נטו). פחמימה ושומן לא ידועים',
  },
  {
    id: id('pita-light'),
    name: 'פיתה קלה',
    cat: 5,
    carbs: null,
    fat: null,
    fiber: null,
    ...perUnitAs1(120, 4),
    portions: [{ u: 'יחידה', g: GRAMS.unitAs1 }],
    barcode: null,
    note: `יחידה = 1 (הזן 1 לפיתה). ${UNVERIFIED}: 120 קק"ל · 4 חלבון ליחידה. פחמימה ושומן לא ידועים`,
  },
  {
    id: id('date-ball'),
    name: 'כדור תמר',
    cat: 9,
    carbs: null,
    fat: null,
    fiber: null,
    ...perUnitAs1(130, 0),
    portions: [{ u: 'יחידה', g: GRAMS.unitAs1 }],
    barcode: null,
    note: `יחידה = 1 (הזן 1 לכדור). ${UNVERIFIED}: ~130 קק"ל ליחידה, חלבון לא במסמך (0). פחמימה ושומן לא ידועים`,
  },
];

// ---------- מנות מורכבות ----------

export type DishDef = {
  slug: string;
  name: string;
  cat: number | null;
  items: { foodId: FoodId; grams: number }[];
  /** null = סכום המרכיבים (ברירת המחדל). */
  finalGrams: number | null;
  note?: string;
  /** מה שכתוב במסמך, לאימות. */
  doc: { kcal: number; protein: number; label: string };
};

const C = Object.fromEntries(CUSTOM_FOODS.map((f) => [f.id.slice(LIB_PREFIX.length), f.id])) as Record<string, FoodId>;

/** הבסיס המשותף לכל ארוחות הצהריים: סלט 250, שקדים 25, טחינה כף. */
const lunchBase = [
  { foodId: MOH.salad, grams: 250 },
  { foodId: MOH.almonds, grams: 25 },
  { foodId: MOH.tahini, grams: GRAMS.tahiniTbsp },
];

export const DISHES: DishDef[] = [
  {
    slug: 'lunch-1-chicken',
    name: 'צ1 — חזה עוף מתובל',
    cat: 2,
    items: [{ foodId: MOH.chickenBreast, grams: 250 }, ...lunchBase],
    finalGrams: null,
    note: 'חזה עוף מתובל ממופה לחזה עוף צלוי ללא עור מהמאגר — תווית המוצר טרם אומתה',
    doc: { kcal: 704, protein: 89, label: 'צ1' },
  },
  {
    slug: 'lunch-2-roastbeef',
    name: 'צ2 — רוסטביף',
    cat: 2,
    items: [{ foodId: C['roastbeef-hod-maadan']!, grams: 350 }, ...lunchBase],
    finalGrams: null,
    doc: { kcal: 648, protein: 78, label: 'צ2' },
  },
  {
    slug: 'lunch-3-mixed',
    name: 'צ3 — מעורב',
    cat: 2,
    items: [
      { foodId: MOH.chickenBreast, grams: 150 },
      { foodId: C['roastbeef-hod-maadan']!, grams: 150 },
      ...lunchBase,
    ],
    finalGrams: null,
    note: 'חזה עוף מתובל ממופה לחזה עוף צלוי ללא עור מהמאגר — תווית המוצר טרם אומתה',
    doc: { kcal: 692, protein: 87, label: 'צ3' },
  },
  {
    slug: 'lunch-4-pastrami',
    name: 'צ4 — פסטרמת הודו',
    cat: 2,
    items: [{ foodId: MOH.pastrami, grams: 350 }, ...lunchBase],
    finalGrams: null,
    doc: { kcal: 676, protein: 69, label: 'צ4' },
  },
  {
    slug: 'lunch-5-tuna-eggs',
    name: 'צ5 — טונה וביצים',
    cat: 2,
    items: [
      { foodId: C['tuna-water-drained']!, grams: 2 * GRAMS.tunaCan },
      { foodId: MOH.eggBoiled, grams: 2 * GRAMS.egg },
      ...lunchBase,
    ],
    finalGrams: null,
    doc: { kcal: 679, protein: 76, label: 'צ5' },
  },
  {
    slug: 'dinner-1-cottage-eggs',
    name: "ע1 — קוטג' וביצים",
    cat: 1,
    items: [
      { foodId: MOH.eggBoiled, grams: 2 * GRAMS.egg },
      { foodId: MOH.cottage5, grams: 250 },
      { foodId: MOH.salad, grams: 250 },
      { foodId: MOH.riceCake, grams: 4 * GRAMS.riceCake },
      { foodId: MOH.tahini, grams: GRAMS.tahiniTbsp },
    ],
    finalGrams: null,
    doc: { kcal: 685, protein: 50, label: 'ע1' },
  },
  {
    slug: 'dinner-2-shakshuka',
    name: 'ע2 — שקשוקה',
    cat: 3,
    items: [
      { foodId: MOH.eggRaw, grams: 3 * GRAMS.egg },
      { foodId: MOH.tomato, grams: 200 },
      { foodId: C['bulgarit-5']!, grams: 100 },
      { foodId: MOH.oliveOil, grams: GRAMS.oilTsp },
      { foodId: C['pita-light']!, grams: GRAMS.unitAs1 },
      { foodId: C['greek-yogurt-0']!, grams: 200 },
    ],
    finalGrams: null,
    note: 'עגבניות טריות, לא רסק. פיתה קלה: יחידה = 1 עד לאימות המשקל',
    doc: { kcal: 682, protein: 61, label: 'ע2' },
  },
  {
    slug: 'dinner-3-eggs-cheese',
    name: 'ע3 — ביצים בשמן זית וגבינה',
    cat: 3,
    items: [
      { foodId: MOH.eggRaw, grams: 2 * GRAMS.egg },
      { foodId: MOH.oliveOil, grams: GRAMS.oliveOilTbsp },
      { foodId: C['bulgarit-5']!, grams: 150 },
      { foodId: MOH.salad, grams: 250 },
      { foodId: C['pita-light']!, grams: GRAMS.unitAs1 },
      { foodId: C['greek-yogurt-0']!, grams: 150 },
    ],
    finalGrams: null,
    note: 'פיתה קלה: יחידה = 1 עד לאימות המשקל',
    doc: { kcal: 706, protein: 58, label: 'ע3' },
  },
  {
    slug: 'dinner-4-broccoli-pie',
    name: 'ע4 — פשטידת ברוקולי (תבנית שלמה)',
    cat: 3,
    items: [
      { foodId: MOH.eggRaw, grams: 4 * GRAMS.egg },
      { foodId: MOH.broccoliFrozen, grams: 500 },
      { foodId: C['bulgarit-5']!, grams: 150 },
      { foodId: MOH.cottage5, grams: 200 },
      { foodId: MOH.oliveOil, grams: GRAMS.oliveOilTbsp },
    ],
    finalGrams: null,
    note: 'נאפית 35 דק\' ומאבדת מים — משקל התבנית אחרי אפייה טרם אומת. שקול את התבנית ועדכן את המשקל הסופי',
    doc: { kcal: 489 * 2, protein: 42 * 2, label: 'ע4 (חצי תבנית ×2)' },
  },
  {
    slug: 'dinner-5-no-cook',
    name: 'ע5 — בלי בישול',
    cat: 1,
    items: [
      { foodId: MOH.cottage5, grams: 250 },
      { foodId: C['greek-yogurt-0']!, grams: 300 },
      { foodId: MOH.riceCake, grams: 5 * GRAMS.riceCake },
      { foodId: MOH.salad, grams: 250 },
    ],
    finalGrams: null,
    doc: { kcal: 649, protein: 65, label: 'ע5' },
  },
  {
    slug: 'coffee-milk-date-ball',
    name: 'קפה קר עם חלב + כדור תמר',
    cat: 9,
    items: [
      { foodId: MOH.coffee, grams: GRAMS.coffee },
      { foodId: MOH.milk3, grams: GRAMS.milkInCoffee },
      { foodId: C['date-ball']!, grams: GRAMS.unitAs1 },
    ],
    finalGrams: null,
    note: 'חלב 100 מ"ל וקפה 150 מ"ל נגזרו מהמסמך (190 − 130 = 60 קק"ל). כדור תמר: יחידה = 1 עד לאימות המשקל',
    doc: { kcal: 190, protein: 4, label: 'קפה' },
  },
];

/** בלוקים: פריט בודד × גרמים. לא מנה; רק לאימות מול המסמך. */
export const BLOCKS: { label: string; foodId: FoodId; grams: number; doc: { kcal: number; protein: number } }[] = [
  { label: 'טונה 160 ג\' (112 נטו)', foodId: C['tuna-water-drained']!, grams: GRAMS.tunaCan, doc: { kcal: 116, protein: 28 } },
  { label: 'יוגורט יווני 0%, 200 ג\'', foodId: C['greek-yogurt-0']!, grams: 200, doc: { kcal: 118, protein: 20 } },
  { label: "קוטג' 5%, 100 ג'", foodId: MOH.cottage5, grams: 100, doc: { kcal: 95, protein: 11 } },
  { label: 'בולגרית 5%, 100 ג\'', foodId: C['bulgarit-5']!, grams: 100, doc: { kcal: 110, protein: 15 } },
  { label: '3 חלבוני ביצה', foodId: MOH.eggWhite, grams: GRAMS.eggWhites3, doc: { kcal: 52, protein: 11 } },
  { label: 'PRO 40 (בקבוק = 1)', foodId: C['pro40-yotvata']!, grams: GRAMS.unitAs1, doc: { kcal: 195, protein: 40 } },
];

// ---------- בנייה ----------

export function buildMealLibrary(index: FoodIndex): CustomFood[] {
  const customs: CustomFood[] = CUSTOM_FOODS.map((f) => ({ ...f }));

  // המנות פותרות מרכיבים גם מהמאגר וגם מהמוצרים הממותגים שלמעלה.
  const byId = new Map(customs.map((c) => [c.id, fromCustom(c)]));
  const resolve = (foodId: FoodId) => byId.get(foodId) ?? resolveFood(index, foodId);

  const dishes = DISHES.map((d) => {
    for (const i of d.items) {
      if (!resolve(i.foodId)) throw new Error(`${d.name}: מרכיב ${i.foodId} לא נמצא`);
    }
    const sum = d.items.reduce((n, i) => n + i.grams, 0);
    const food = buildRecipeFood(
      {
        id: id(d.slug),
        name: d.name,
        cat: d.cat,
        portions: [],
        barcode: null,
        ...(d.note ? { note: d.note } : {}),
      },
      d.items,
      d.finalGrams ?? sum,
      resolve,
    );
    return food;
  });

  return [...customs, ...dishes];
}

/** מזהה המנה לפי ה-slug, לבדיקות ולטבלת האימות. */
export function libId(slug: string): FoodId {
  return id(slug);
}

/** המתכון של מנה כפי שהוגדר — לבדיקות. */
export function recipeOf(slug: string): Recipe | null {
  const d = DISHES.find((x) => x.slug === slug);
  if (!d) return null;
  return { items: d.items, finalGrams: d.finalGrams ?? d.items.reduce((n, i) => n + i.grams, 0) };
}
