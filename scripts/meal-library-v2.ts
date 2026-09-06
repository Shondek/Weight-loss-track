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
import { LIB_PREFIX, libraryFoodId } from '../src/lib/nutrition/library.ts';

export { LIB_PREFIX };
const id = libraryFoodId;

const UNVERIFIED = 'ערכי אריזה טרם אומתו';

// ---------- מזהי מאגר (אושרו בשלב 0) ----------

export const MOH = {
  chickenBreast: '24122120', // בשר עוף, חזה, ללא עצם, צלוי, נאכל ללא עור — 160/30.1
  pastrami: '90000027', // FFQ-פסטרמה או חזה הודו מעושן — 100/17.7
  salad: '75145058', // סלט ירקות ישראלי ללא תוספת שמן — 17/0.8
  almonds: '42101000', // שקדים לא קלויים, ללא מלח — 579/21.1
  walnuts: '42116000', // אגוזי מלך, בלי קליפה, לא קלויים, ללא מלח — 654/15.2
  hazelnuts: '42107000', // אגוזי לוז, בלי קליפה, לא קלויים, ללא מלח — 628/14.9
  pecans: '42112000', // אגוזי פקאן, בלי קליפה, ללא תוספת מלח — 691/9.2
  peanuts: '42111020', // בוטנים, טריים — 567/25.8
  pistachios: '42114000', // אגוז, פיסטוק, בלי קליפה, ללא מלח, לא קלוי — 562/20.3
  cashews: '42104110', // אגוזי קשיו, קלויים ללא תוספת מלח — 580/16.8
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
  /** מסמך (2.1): אגוז אחד ביום, 20–25 ג'. המנה שנרשמת בלחיצה. */
  nutPortion: 25,
  /** מסמך: "כף 15 גר'" טחינה. */
  tahiniTbsp: 15,
  /** ✎ "כף שמן זית = 120 קק"ל" במסמך / 884 ל-100 ג' = 13.6 ג'. */
  oliveOilTbsp: 13.6,
  /** ✎ "כפית שמן = 40 קק"ל" במסמך / 884 = 4.5 ג'. */
  oilTsp: 4.5,
  /** ✎ פריכית אורז = 35 קק"ל במסמך / 378 ל-100 ג' במאגר = 9.26 ג'. (2.2: הוחלפה בפריכית תירס, יחידה = 1.) */
  riceCake: 9.26,
  /** מסמך: קופסת טונה 160 ג' = 112 ג' נטו מסונן. */
  tunaCan: 112,
  /** ✎ קפה + חלב = 190 − 130 (כדור תמר) = 60 קק"ל = 100 מ"ל חלב 3%. */
  milkInCoffee: 100,
  /** ✎ נפח הקפה עצמו לא במסמך. 150 מ"ל, ~4 קק"ל. */
  coffee: 150,
  /**
   * יחידה = 1 ג' (`unitFood`) עד לאימות משקל האריזה: ערכי היחידה נשמרים
   * ×100 ל-100 ג', והזנת 1 ברישום = יחידה אחת. פריטי יחידה נרשמים בנפרד
   * ולא בתוך מנה, כדי שמשקל המנה כפי שהוגדרה = משקל הצלחת.
   */
  unitAs1: 1,
} as const;

// ---------- מוצרים ממותגים: ערכי תווית מהמסמך ----------

type Custom = Omit<CustomFood, 'recipe'>;

const per100 = (kcal: number, protein: number, grams: number) => ({
  kcal: (kcal * 100) / grams,
  protein: (protein * 100) / grams,
});

/** ערכי יחידה במזון `unitFood`: ל-100 ג' = ×100, והדגל פוטר מתקרת הסבירות. */
const perUnitAs1 = (kcal: number, protein: number) => ({ ...per100(kcal, protein, GRAMS.unitAs1), unitFood: true as const });

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
    note: 'בקבוק = 1 ג\' (הזן 1 לבקבוק). תווית: 193–196 קק"ל · 40 חלבון ל-350 מ"ל. פחמימה ושומן לא ידועים',
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
    note: `יחידה = 1 ג' (הזן 1 לפיתה). ${UNVERIFIED}: 120 קק"ל · 4 חלבון ליחידה. פחמימה ושומן לא ידועים`,
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
    note: `יחידה = 1 ג' (הזן 1 לכדור). ${UNVERIFIED}: ~130 קק"ל ליחידה, חלבון לא במסמך (0). פחמימה ושומן לא ידועים`,
  },
  // 2.2: פריכיות תירס — ערכי תווית, קלוריות בלבד. חלבון חובה בסכימה ולכן 0 (חסם תחתון), כמו כדור התמר.
  {
    id: id('corn-cake-slim-delis'),
    name: 'פריכית תירס סלים דליס',
    cat: 5,
    carbs: null,
    fat: null,
    fiber: null,
    ...perUnitAs1(31, 0),
    portions: [{ u: 'יחידה', g: GRAMS.unitAs1 }],
    barcode: null,
    note: 'ערכי אריזה חלקיים — קלוריות בלבד מהתווית. לעדכן. יחידה = 1 (הזן 1 לפריכית): 31 קק"ל; חלבון לא בתווית (0), פחמימה ושומן לא ידועים',
  },
  {
    id: id('corn-cake-australian'),
    name: 'פריכית תירס אוסטרלית',
    cat: 5,
    carbs: null,
    fat: null,
    fiber: null,
    ...perUnitAs1(23, 0),
    portions: [{ u: 'יחידה', g: GRAMS.unitAs1 }],
    barcode: null,
    note: 'ערכי אריזה חלקיים — קלוריות בלבד מהתווית. לעדכן. יחידה = 1 (הזן 1 לפריכית): 23 קק"ל; חלבון לא בתווית (0), פחמימה ושומן לא ידועים',
  },
];

// ---------- פריטי ספרייה שמקורם במאגר: עותק של מזון מאגר ----------

/**
 * הרובריקה "התפריט שלי" מציגה רק פריטי ספרייה (c:lib2:*). פריט שהמקור שלו
 * הוא מזון במאגר (אגוזים, קוטג', חלבוני ביצה) נכנס לספרייה כעותק מדויק של
 * המזון במאגר — כל הערכים ל-100 ג' מועתקים כפי שהם, בלי לשנות דבר, והמזהה
 * במאגר נשמר בהערה. הבדיקה מאמתת שהעותק זהה למאגר.
 */
export type MohCopyDef = {
  slug: string;
  /** שם קצר לרובריקה; השם המלא במאגר נשמר בהערה. */
  name: string;
  mohId: FoodId;
  /** המנה שנרשמת בלחיצה ברובריקה. נכנסת ראשונה ברשימת היחידות. */
  portion: { u: string; g: number };
  nut?: true;
};

const nut = (slug: string, name: string, mohId: FoodId): MohCopyDef => ({
  slug,
  name,
  mohId,
  portion: { u: 'מנה', g: GRAMS.nutPortion },
  nut: true,
});

export const MOH_COPIES: MohCopyDef[] = [
  nut('nut-almonds', 'שקדים', MOH.almonds),
  nut('nut-walnuts', 'אגוזי מלך', MOH.walnuts),
  nut('nut-hazelnuts', 'אגוזי לוז', MOH.hazelnuts),
  nut('nut-pecans', 'פקאן', MOH.pecans),
  nut('nut-peanuts', 'בוטנים', MOH.peanuts),
  nut('nut-pistachios', 'פיסטוקים', MOH.pistachios),
  nut('nut-cashews', 'קשיו', MOH.cashews),
  { slug: 'block-cottage-5', name: "קוטג' 5%", mohId: MOH.cottage5, portion: { u: 'בלוק', g: 100 } },
  { slug: 'block-egg-whites', name: 'חלבוני ביצה', mohId: MOH.eggWhite, portion: { u: '3 חלבונים', g: GRAMS.eggWhites3 } },
];

/** עותק מדויק של מזון המאגר, עם מנת הרובריקה ראשונה ברשימת היחידות. */
export function mohCopy(def: MohCopyDef, index: FoodIndex): CustomFood {
  const f = resolveFood(index, def.mohId);
  if (!f) throw new Error(`${def.name}: ${def.mohId} לא נמצא במאגר`);
  if (f.source !== 'moh') throw new Error(`${def.name}: ${def.mohId} אינו מזון מאגר`);
  return {
    id: id(def.slug),
    name: def.name,
    cat: Number(def.mohId[0]),
    kcal: f.kcal,
    protein: f.protein,
    carbs: f.carbs,
    fat: f.fat,
    fiber: f.fiber,
    portions: [def.portion, ...f.portions.filter((p) => p.u !== def.portion.u)],
    barcode: null,
    note: `מהמאגר הלאומי ${def.mohId}: ${f.name}. ${def.nut ? `אגוז אחד ביום, ${GRAMS.nutPortion} ג'` : `מנה ${def.portion.g} ג'`}`,
  };
}

// ---------- מנות מורכבות ----------

export type DishDef = {
  slug: string;
  name: string;
  cat: number | null;
  /** `u` = תווית כמות לתצוגה בלבד (כלי מטבח או ספירה); `n` = שם קצר לשורת המרכיבים. החישוב לפי `grams`. */
  items: { foodId: FoodId; grams: number; u?: string; n?: string }[];
  /** null = סכום המרכיבים (ברירת המחדל). */
  finalGrams: number | null;
  note?: string;
  /** בארכיון: לא ברובריקה ולא בחיפוש; נשמר להיסטוריה. */
  archived?: true;
  /**
   * אומדן המסמך המקורי (לפני 2.3, כשהמסמך יושר לקוד), לאימות ולדיווח פערים.
   * מנה שנולדה בקוד — בלי אומדן: המתכון מחשב, לא מקודדים סכומים.
   */
  doc?: { kcal: number; protein: number; label: string };
};

const C = Object.fromEntries(CUSTOM_FOODS.map((f) => [f.id.slice(LIB_PREFIX.length), f.id])) as Record<string, FoodId>;

/**
 * הבסיס המשותף לכל ארוחות הצהריים: סלט 250, טחינה כף.
 * גרסה 2.1: השקדים (25 ג') יצאו מהמנות ונרשמים בנפרד מקבוצת "תוספות" —
 * אגוז אחד ביום, לבחירה. משקל הצלחת ירד ב-25 ג'.
 */
const lunchBase = [
  { foodId: MOH.salad, grams: 250, n: 'סלט' },
  { foodId: MOH.tahini, grams: GRAMS.tahiniTbsp, u: 'כף מפולסת', n: 'טחינה' },
];

/** תוויות כמות לתצוגה: מה שנמדד בכלי מטבח או נספר ביחידות. מה ששוקלים — בלי תווית. */
const eggs = (n: number) => `${n} ביצים`;
/**
 * פריכיות תירס בתוך מנה (2.2): ברירת המחדל סלים דליס — הגבוה מהשניים, עדיף
 * להעריך למעלה. מזון יחידה: grams = מספר הפריכיות, ולכן משקל המנה כפי
 * שהוגדרה כולל N "גרם" לפריכיות במקום משקלן האמיתי (טרם נמדד).
 */
const cornCakes = (n: number) => ({ foodId: C['corn-cake-slim-delis']!, grams: n * GRAMS.unitAs1, u: `${n} פריכיות תירס` });
/** המסמך: פריכית אורז 35 קק"ל ← פריכית תירס סלים דליס 31 קק"ל, חלבון 0 במקום ~0.8. */
const cornInsteadOfRice = (kcal: number, protein: number, n: number) => ({ kcal: kcal - 35 * n + 31 * n, protein: Math.round((protein - 0.77 * n) * 10) / 10 });

/** המסמך (2.1): ערכי המנה בלי השקדים = הערכים של גרסה 2 פחות 145 קק"ל · 5 חלבון. */
const withoutAlmonds = (kcal: number, protein: number) => ({ kcal: kcal - 145, protein: protein - 5 });

export const DISHES: DishDef[] = [
  {
    slug: 'lunch-1-chicken',
    name: 'צ1 — חזה עוף מתובל',
    cat: 2,
    items: [{ foodId: MOH.chickenBreast, grams: 250, n: 'חזה עוף' }, ...lunchBase],
    finalGrams: null,
    note: 'חזה עוף מתובל ממופה לחזה עוף צלוי ללא עור מהמאגר — תווית המוצר טרם אומתה',
    doc: { ...withoutAlmonds(704, 89), label: 'צ1' },
  },
  {
    slug: 'lunch-2-roastbeef',
    name: 'צ2 — רוסטביף',
    cat: 2,
    items: [{ foodId: C['roastbeef-hod-maadan']!, grams: 350, n: 'רוסטביף' }, ...lunchBase],
    finalGrams: null,
    // 2.3: המנה בוטלה (350 ג' רוסטביף = 2,800 מ"ג נתרן). בארכיון — לא נמחקת, הרישומים שלה נשארים.
    archived: true,
    note: 'בוטלה (2.3) — הוחלפה במעורב ב׳ (רוסטביף מוביל). בארכיון: לא ברובריקה ולא בחיפוש; רישומים קודמים נשמרים',
    doc: { ...withoutAlmonds(648, 78), label: 'צ2 (בארכיון)' },
  },
  {
    slug: 'lunch-3-mixed',
    // 2.3: שם תצוגה בלבד השתנה; ה-slug וה-id נשארו.
    name: "צ3 — מעורב א', עוף מוביל",
    cat: 2,
    items: [
      { foodId: MOH.chickenBreast, grams: 150, n: 'חזה עוף' },
      { foodId: C['roastbeef-hod-maadan']!, grams: 150, n: 'רוסטביף' },
      ...lunchBase,
    ],
    finalGrams: null,
    note: 'חזה עוף מתובל ממופה לחזה עוף צלוי ללא עור מהמאגר — תווית המוצר טרם אומתה',
    doc: { ...withoutAlmonds(692, 87), label: 'צ3' },
  },
  {
    slug: 'lunch-3b-mixed-beef',
    name: "צ3ב — מעורב ב', רוסטביף מוביל",
    cat: 2,
    items: [
      { foodId: C['roastbeef-hod-maadan']!, grams: 250, n: 'רוסטביף' },
      { foodId: MOH.chickenBreast, grams: 100, n: 'חזה עוף' },
      ...lunchBase,
    ],
    finalGrams: null,
    note: 'חזה עוף מתובל ממופה לחזה עוף צלוי ללא עור מהמאגר — תווית המוצר טרם אומתה',
    // נולדה בקוד (2.3) — אין אומדן מסמך.
  },
  {
    slug: 'lunch-4-pastrami',
    name: 'צ4 — פסטרמת הודו',
    cat: 2,
    items: [{ foodId: MOH.pastrami, grams: 350, n: 'פסטרמה' }, ...lunchBase],
    finalGrams: null,
    doc: { ...withoutAlmonds(676, 69), label: 'צ4' },
  },
  {
    slug: 'lunch-5-tuna-eggs',
    name: 'צ5 — טונה וביצים',
    cat: 2,
    items: [
      { foodId: C['tuna-water-drained']!, grams: 2 * GRAMS.tunaCan, u: '2 קופסאות' },
      { foodId: MOH.eggBoiled, grams: 2 * GRAMS.egg, u: eggs(2) },
      ...lunchBase,
    ],
    finalGrams: null,
    doc: { ...withoutAlmonds(679, 76), label: 'צ5' },
  },
  {
    slug: 'lunch-6-tuna-cottage',
    name: "צ6 — טונה וקוטג'",
    cat: 1,
    items: [
      { foodId: C['tuna-water-drained']!, grams: 2 * GRAMS.tunaCan, u: '2 קופסאות' },
      { foodId: MOH.cottage5, grams: 250, n: "קוטג'" },
      cornCakes(3),
    ],
    finalGrams: null,
    note: 'משמרת בוקר (שישי). חלבי-פרווה, בלי בשר. הפריכיות ביחידות (3) — משקל הצלחת כפי שהוגדר לא כולל את משקלן',
    // המסמך (2.2): 2 × 116 + 238 + 3 × 31 = 563 · 2 × 28 + 27.5 + 0 = 83.5.
    doc: { kcal: 2 * 116 + 238 + 3 * 31, protein: 2 * 28 + 27.5, label: 'צ6' },
  },
  {
    slug: 'dinner-1-cottage-eggs',
    name: "ע1 — קוטג' וביצים",
    cat: 1,
    items: [
      { foodId: MOH.eggBoiled, grams: 2 * GRAMS.egg, u: eggs(2) },
      { foodId: MOH.cottage5, grams: 250, n: "קוטג'" },
      { foodId: MOH.salad, grams: 250, n: 'ירקות' },
      cornCakes(4),
      { foodId: MOH.tahini, grams: GRAMS.tahiniTbsp, u: 'כף מפולסת', n: 'טחינה' },
    ],
    finalGrams: null,
    note: 'הפריכיות ביחידות (4) — משקל הצלחת כפי שהוגדר לא כולל את משקלן',
    doc: { ...cornInsteadOfRice(685, 50, 4), label: 'ע1' },
  },
  {
    slug: 'dinner-2-shakshuka',
    name: 'ע2 — שקשוקה',
    cat: 3,
    items: [
      { foodId: MOH.eggRaw, grams: 3 * GRAMS.egg, u: eggs(3) },
      { foodId: MOH.tomato, grams: 200, n: 'עגבניות' },
      { foodId: C['bulgarit-5']!, grams: 100, n: 'בולגרית' },
      { foodId: MOH.oliveOil, grams: GRAMS.oilTsp, u: 'כפית', n: 'שמן' },
      { foodId: C['greek-yogurt-0']!, grams: 200, n: 'יוגורט' },
    ],
    finalGrams: null,
    note: 'עגבניות טריות, לא רסק. בלי הפיתה — נרשמת בנפרד כ-1',
    // המסמך: 682 / 61 כולל פיתה קלה (120 / 4).
    doc: { kcal: 682 - 120, protein: 61 - 4, label: 'ע2 (בלי פיתה)' },
  },
  {
    slug: 'dinner-3-eggs-cheese',
    name: 'ע3 — ביצים בשמן זית וגבינה',
    cat: 3,
    items: [
      { foodId: MOH.eggRaw, grams: 2 * GRAMS.egg, u: eggs(2) },
      { foodId: MOH.oliveOil, grams: GRAMS.oliveOilTbsp, u: 'כף', n: 'שמן זית' },
      { foodId: C['bulgarit-5']!, grams: 150, n: 'בולגרית' },
      { foodId: MOH.salad, grams: 250, n: 'ירקות' },
      { foodId: C['greek-yogurt-0']!, grams: 150, n: 'יוגורט' },
    ],
    finalGrams: null,
    note: 'בלי הפיתה — נרשמת בנפרד כ-1',
    // המסמך: 706 / 58 כולל פיתה קלה (120 / 4).
    doc: { kcal: 706 - 120, protein: 58 - 4, label: 'ע3 (בלי פיתה)' },
  },
  {
    slug: 'dinner-4-broccoli-pie',
    name: 'ע4 — פשטידת ברוקולי (תבנית שלמה)',
    cat: 3,
    items: [
      { foodId: MOH.eggRaw, grams: 4 * GRAMS.egg, u: eggs(4) },
      { foodId: MOH.broccoliFrozen, grams: 500, n: 'ברוקולי' },
      { foodId: C['bulgarit-5']!, grams: 150, n: 'בולגרית' },
      { foodId: MOH.cottage5, grams: 200, n: "קוטג'" },
      { foodId: MOH.oliveOil, grams: GRAMS.oliveOilTbsp, u: 'כף', n: 'שמן זית' },
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
      { foodId: MOH.cottage5, grams: 250, n: "קוטג'" },
      { foodId: C['greek-yogurt-0']!, grams: 300, n: 'יוגורט' },
      cornCakes(5),
      { foodId: MOH.salad, grams: 250, n: 'ירקות' },
    ],
    finalGrams: null,
    note: 'הפריכיות ביחידות (5) — משקל הצלחת כפי שהוגדר לא כולל את משקלן',
    doc: { ...cornInsteadOfRice(649, 65, 5), label: 'ע5' },
  },
  {
    slug: 'coffee-milk',
    name: 'קפה קר עם חלב',
    cat: 9,
    items: [
      { foodId: MOH.coffee, grams: GRAMS.coffee, n: 'קפה' },
      { foodId: MOH.milk3, grams: GRAMS.milkInCoffee, n: 'חלב' },
    ],
    finalGrams: null,
    note: 'חלב 100 מ"ל וקפה 150 מ"ל נגזרו מהמסמך (190 − 130 כדור תמר = 60 קק"ל). כדור התמר נרשם בנפרד כ-1',
    // המסמך: 190 / 4 כולל כדור תמר (130 / 0).
    doc: { kcal: 190 - 130, protein: 4, label: 'קפה (בלי כדור תמר)' },
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
  const customs: CustomFood[] = [...CUSTOM_FOODS.map((f) => ({ ...f })), ...MOH_COPIES.map((d) => mohCopy(d, index))];

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
        ...(d.archived ? { archived: true as const } : {}),
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
