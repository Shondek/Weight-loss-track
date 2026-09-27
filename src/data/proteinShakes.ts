/**
 * שייקי חלבון — ארבע אבקות Impact (Myprotein) והשילובים לרישום בלחיצה אחת.
 *
 * הערכים התזונתיים אינם כאן: הם בפריטי הספרייה (scripts/meal-library-v2.ts,
 * ערכי התווית ל-100 ג'). כאן רק מה שמגדיר את השילוב: משקל הסקופ לכל מוצר
 * (במקום אחד — נעדכן אחרי שקילה של סקופ אמיתי), והחלב.
 */

import type { ISODate } from '../types';

export type ProteinShake = {
  /** מזהה בספרייה בלי הקידומת: "c:lib2:<slug>". */
  slug: string;
  /** השם על כפתור המוצר. */
  label: string;
  /** משקל סקופ אחד בגרמים — לפי התווית, או לפי שקילה בפועל כשנשקל. */
  scoopGrams: number;
};

export const PROTEIN_SHAKES: readonly ProteinShake[] = [
  { slug: 'impact-whey-vanilla', label: 'Impact Whey וניל', scoopGrams: 30 },
  { slug: 'impact-whey-chocolate', label: 'Impact Whey שוקולד חלק', scoopGrams: 30 },
  // סקופ נשקל בפועל 27/9/2026: 33 ג׳ (בתווית כתוב 29).
  { slug: 'impact-milkshake-fudge', label: "Impact Milkshake שוקולד פאדג'", scoopGrams: 33 },
  { slug: 'impact-milkshake-caramel', label: 'Impact Milkshake קרמל מלוח', scoopGrams: 29 },
];

/**
 * החלב לשייק: חלב 3% מהמאגר (אותו פריט כמו בקפה עם חלב), 250 מ"ל = 250 ג'
 * (1:1 — המוסכמה הקיימת באפליקציה, אין המרת נפח).
 */
export const SHAKE_MILK = { foodId: '11111009', grams: 250, label: 'חלב 3%' } as const;

/** אפשרויות הסקופים בכפתורים. */
export const SHAKE_SCOOPS: readonly number[] = [1, 2];

/** מתי הקבוצה פתוחה כברירת מחדל: לפני הצהריים ואחרי הביניים — כמו "בלוקים". */
export function shakesOpenByDefault(hour: number, bounds: { lunchFrom: number; snackFrom: number }): boolean {
  return hour < bounds.lunchFrom || hour >= bounds.snackFrom;
}

/** ראשון של השבוע שבו נוספה הקבוצה — לתיעוד בלבד. */
export const SHAKES_SINCE: ISODate = '2026-09-27';
