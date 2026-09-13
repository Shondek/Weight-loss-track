/**
 * "התפריט שלי" — הרובריקה שמעל החיפוש במסך התזונה. ארבע קבוצות בסדר קבוע,
 * ורק פריטי ספרייה (c:lib2:*). ה-slug הוא מזהה הפריט בספרייה; `grams` הוא
 * מה שנרשם בלחיצה אחת — למנה מורכבת, ברירת המחדל היא משקל המנה כפי
 * שהוגדרה (recipe.finalGrams), ולכן אין כאן מספר.
 *
 * הערכים עצמם לא כאן: הם נקראים מהמזון בספרייה בזמן ריצה.
 */

import type { MenuDefault, MenuGroup } from '../lib/nutrition/menu';

/** אגוז אחד ביום, 20–25 ג'. המנה ברובריקה. */
export const NUT_GRAMS = 25;

/**
 * ברירות מחדל (2.5): לחיצה על מנה יוצרת גם את התוספים שלה כרישומים נפרדים,
 * כל אחד עם ה-ref שלו, עריך ונמחק בנפרד. התוספים נשארים מחוץ להגדרת המנה —
 * זה קיצור רישום בלבד. אגוז ברירת המחדל: שקדים. פריכית: סלים דליס.
 */
const TAHINI: MenuDefault = { slug: 'tahini-raw', grams: 15, label: 'טחינה' };
const ALMONDS: MenuDefault = { slug: 'nut-almonds', grams: NUT_GRAMS, label: 'שקדים' };
const cakes = (n: number): MenuDefault => ({ slug: 'corn-cake-slim-delis', grams: n, label: `${n} פריכיות` });
const LUNCH_DEFAULTS: MenuDefault[] = [TAHINI, ALMONDS];

export const MEAL_MENU: readonly MenuGroup[] = [
  {
    key: 'lunch',
    label: 'צהריים',
    items: [
      { slug: 'lunch-1-chicken', label: 'צ1 חזה עוף', defaults: LUNCH_DEFAULTS },
      { slug: 'lunch-2-roastbeef', label: 'צ2 רוסטביף וסלט', defaults: LUNCH_DEFAULTS },
      { slug: 'lunch-3-mixed', label: "צ3 מעורב א' (עוף)", defaults: LUNCH_DEFAULTS },
      { slug: 'lunch-3b-mixed-beef', label: "צ3ב מעורב ב' (רוסטביף)", defaults: LUNCH_DEFAULTS },
      { slug: 'lunch-4-pastrami', label: 'צ4 פסטרמה', defaults: LUNCH_DEFAULTS },
      { slug: 'lunch-5-tuna-eggs', label: 'צ5 טונה וביצים', defaults: LUNCH_DEFAULTS },
      { slug: 'lunch-6-tuna-cottage', label: "צ6 טונה וקוטג'", defaults: [cakes(3)] },
    ],
  },
  {
    key: 'dinner',
    label: 'ערב',
    items: [
      { slug: 'dinner-1-cottage-eggs', label: "ע1 קוטג' וביצים", defaults: [TAHINI, cakes(4)] },
      { slug: 'dinner-2-shakshuka', label: 'ע2 שקשוקה' },
      { slug: 'dinner-3-eggs-cheese', label: 'ע3 ביצים וגבינה' },
      { slug: 'dinner-4-broccoli-pie', label: 'ע4 פשטידה (תבנית)', defaults: [cakes(3), { slug: 'greek-yogurt-0', grams: 100, label: 'יוגורט 100' }] },
      { slug: 'dinner-5-no-cook', label: 'ע5 בלי בישול', defaults: [cakes(5)] },
    ],
  },
  {
    key: 'blocks',
    label: 'בלוקים',
    items: [
      { slug: 'tuna-water-drained', label: 'טונה', grams: 112 },
      { slug: 'greek-yogurt-0', label: 'יוגורט יווני', grams: 200 },
      { slug: 'block-cottage-5', label: "קוטג'", grams: 100 },
      { slug: 'bulgarit-5', label: 'בולגרית', grams: 100 },
      { slug: 'block-egg-whites', label: 'חלבוני ביצה', grams: 100 },
      { slug: 'pro40-yotvata', label: 'PRO 40', grams: 1 },
    ],
  },
  {
    key: 'extras',
    label: 'תוספות',
    items: [
      // `addon`: נספר ב"תוספים" בסיכום היום (מול הצפוי מברירות המחדל של המנות שנרשמו).
      { slug: 'nut-almonds', label: 'שקדים', grams: NUT_GRAMS, nut: true, addon: true },
      { slug: 'nut-walnuts', label: 'אגוזי מלך', grams: NUT_GRAMS, nut: true, addon: true },
      { slug: 'nut-hazelnuts', label: 'אגוזי לוז', grams: NUT_GRAMS, nut: true, addon: true },
      { slug: 'nut-pecans', label: 'פקאן', grams: NUT_GRAMS, nut: true, addon: true },
      { slug: 'nut-peanuts', label: 'בוטנים', grams: NUT_GRAMS, nut: true, addon: true },
      { slug: 'nut-pistachios', label: 'פיסטוקים', grams: NUT_GRAMS, nut: true, addon: true },
      { slug: 'nut-cashews', label: 'קשיו', grams: NUT_GRAMS, nut: true, addon: true },
      { slug: 'tahini-raw', label: 'טחינה כף מפולסת', grams: 15, addon: true },
      { slug: 'pita-light', label: 'פיתה קלה', grams: 1 },
      { slug: 'corn-cake-slim-delis', label: 'פריכית תירס סלים דליס', grams: 1, addon: true },
      { slug: 'corn-cake-australian', label: 'פריכית תירס אוסטרלית', grams: 1, addon: true },
      { slug: 'date-ball', label: 'כדור תמר', grams: 1 },
      { slug: 'coffee-milk', label: 'קפה עם חלב' },
    ],
  },
];
