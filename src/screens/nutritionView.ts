/**
 * לוגיקת תצוגה טהורה של מסך התזונה. בלי DOM, בלי אחסון, בלי חישוב חדש:
 * כל ערך מגיע מ-src/lib; כאן רק ההחלטה *איך* להציג אותו.
 */

import { gramsText } from '../lib/nutrition/composition';
import { deriveUnit, quantityLabel, type PortionSource } from '../lib/nutrition/portions';

/**
 * יחידת מידה מוצגת עד ×10 — תקרת בורר היחידות (portions.ts). כמות גדולה
 * מזו לא הוזנה ביחידה הזו, ולכן מוצגת בגרמים.
 */
export const UNIT_DISPLAY_MAX = 10;

/**
 * הכמות להצגה של רישום: כמו `quantityLabel`, חוץ מכמות שיוצאת יותר מ-10
 * יחידות — היא מוצגת בגרמים (issue #13: 250 ג׳ חלב בשייק הוצגו "כף ×25",
 * כי היחידה הראשית של החלב במאגר היא כף של 10 ג׳).
 *
 * הכלל של שלב 3.1 (`deriveUnit`: היחידה הראשית בלבד) לא השתנה — טחינה 15 ג׳
 * עדיין "כף מפולסת ×1" ו-20 ג׳ עדיין "20 ג׳". מזון-יחידה ("×12") לא מושפע.
 * תצוגה בלבד: הרישום עצמו תמיד בגרמים.
 */
export function displayQuantity(food: PortionSource | null, grams: number): string {
  const d = food ? deriveUnit(food, grams) : null;
  if (d && d.label !== null && d.qty > UNIT_DISPLAY_MAX) return `${gramsText(grams)} ג׳`;
  return quantityLabel(food, grams);
}
