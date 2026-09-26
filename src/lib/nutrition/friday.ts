/**
 * ארוחת שישי לפי הערכה. מודול טהור.
 *
 * ארוחת שישי לא נשקלת. במקום לנחש פריט-פריט, בוחרים דרגה — בינונית /
 * רגילה / גדולה — ונרשמת רשומה ידנית אחת עם ערכי הדרגה. החלפת דרגה
 * מחליפה את הרשומה, לעולם לא מוסיפה שנייה. יום שמכיל הערכה מסומן כמוערך.
 */

import type { FoodEntry, FridayTier, ISODate } from '../../types';
import { dayOfWeek } from '../date';
import { entryName, newAdhocEntry, removeEntry, upsertEntry } from './entries';

export const FRIDAY_TIERS: Record<FridayTier, { label: string; kcal: number; protein: number }> = {
  medium: { label: 'בינונית', kcal: 700, protein: 45 },
  regular: { label: 'רגילה', kcal: 1000, protein: 55 },
  large: { label: 'גדולה', kcal: 1400, protein: 65 },
};

export const FRIDAY_TIER_ORDER: readonly FridayTier[] = ['medium', 'regular', 'large'];

export const FRIDAY_PREFIX = 'ארוחת שישי — ';

export function fridayEntryName(tier: FridayTier): string {
  return `${FRIDAY_PREFIX}${FRIDAY_TIERS[tier].label} (הערכה)`;
}

export function isFriday(d: ISODate): boolean {
  return dayOfWeek(d) === 5;
}

/** רשומת הערכת שישי — מזוהה לפי השם המוקפא, לא לפי היום. */
export function isFridayEstimate(e: FoodEntry): boolean {
  return e.adhoc === true && entryName(e, null).startsWith(FRIDAY_PREFIX);
}

export function fridayEstimateOn(list: readonly FoodEntry[], d: ISODate): FoodEntry | null {
  return list.find((e) => e.d === d && isFridayEstimate(e)) ?? null;
}

/** מסיר את הערכת השישי של היום, אם יש. */
export function removeFridayEstimate(list: readonly FoodEntry[], d: ISODate): FoodEntry[] {
  let out: FoodEntry[] = [...list];
  for (const e of list) if (e.d === d && isFridayEstimate(e)) out = removeEntry(out, e.id);
  return out;
}

/**
 * קובע דרגה ליום: הרשומה הקיימת (אם יש) מוסרת, ורשומה אחת חדשה נכנסת
 * כארוחת ערב. `ts` חייב ליפול בתוך `d` (ראה `tsForDay`).
 */
export function applyFridayTier(
  list: readonly FoodEntry[],
  d: ISODate,
  tier: FridayTier,
  ts: number,
  unique: string,
): FoodEntry[] {
  const t = FRIDAY_TIERS[tier];
  const entry = newAdhocEntry(
    { name: fridayEntryName(tier), kcal: t.kcal, protein: t.protein, carbs: null, fat: null },
    'dinner',
    ts,
    unique,
  );
  return upsertEntry(removeFridayEstimate(list, d), entry);
}
