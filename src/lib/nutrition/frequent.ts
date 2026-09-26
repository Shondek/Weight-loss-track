/**
 * "מה שאני אוכל": הפריטים שנרשמו בהכי הרבה ימים ב-14 הימים האחרונים.
 * מודול טהור. מחושב, לא נבחר ביד — הרובריקה הישנה ("התפריט שלי") לא
 * שיקפה מה נאכל בפועל.
 *
 * מזון מהמאגר/שלי מקובץ לפי מזהה; הזנה ידנית מקובצת לפי שם מנורמל
 * ונרשמת מחדש עם אותם ערכי ref. הערכת שישי אינה פריט — היא נרשמת מכפתורי
 * הדרגה.
 */

import type { FoodEntry, FoodRef, ISODate } from '../../types';
import { addDays, compareISO } from '../date';
import { entryName, normalizeName } from './entries';
import { isFridayEstimate } from './friday';

export type FrequentItem = {
  /** מזהה יציב לרינדור: "food:<id>" או "adhoc:<שם>". */
  key: string;
  kind: 'food' | 'adhoc';
  foodId: string;
  /** השם להצגה: כפי שנרשם לאחרונה. */
  name: string;
  /** ה-ref של הרישום האחרון — לרישום ידני חוזר, ולתצוגת ערכים כשהמזון החי חסר. */
  ref: FoodRef;
  lastGrams: number;
  lastTs: number;
  /** בכמה ימים שונים נרשם בחלון. */
  days: number;
  unitFood: boolean;
};

export const FREQUENT_WINDOW_DAYS = 14;
export const FREQUENT_LIMIT = 8;

export function frequentKey(e: FoodEntry): string {
  return e.adhoc === true ? `adhoc:${normalizeName(entryName(e, null))}` : `food:${e.foodId}`;
}

export function frequentItems(
  entries: readonly FoodEntry[],
  today: ISODate,
  limit = FREQUENT_LIMIT,
  windowDays = FREQUENT_WINDOW_DAYS,
): FrequentItem[] {
  const from = addDays(today, -(windowDays - 1));
  const groups = new Map<string, { item: FrequentItem; days: Set<ISODate> }>();

  for (const e of entries) {
    if (compareISO(e.d, from) < 0 || compareISO(e.d, today) > 0) continue;
    if (isFridayEstimate(e)) continue;
    const key = frequentKey(e);
    const g = groups.get(key);
    if (!g) {
      groups.set(key, {
        days: new Set([e.d]),
        item: {
          key,
          kind: e.adhoc === true ? 'adhoc' : 'food',
          foodId: e.foodId,
          name: normalizeName(entryName(e, null)),
          ref: e.ref,
          lastGrams: e.grams,
          lastTs: e.ts,
          days: 1,
          unitFood: e.ref.unitFood === true,
        },
      });
      continue;
    }
    g.days.add(e.d);
    if (e.ts > g.item.lastTs) {
      g.item = { ...g.item, ref: e.ref, lastGrams: e.grams, lastTs: e.ts, name: normalizeName(entryName(e, null)), unitFood: e.ref.unitFood === true };
    }
  }

  return [...groups.values()]
    .map((g) => ({ ...g.item, days: g.days.size }))
    .sort((a, b) => b.days - a.days || b.lastTs - a.lastTs)
    .slice(0, limit);
}

/** הכמות האחרונה שנרשמה למזון, לפי מזהה. null כשלא נרשם. */
export function lastGramsOf(entries: readonly FoodEntry[], foodId: string): number | null {
  let best: FoodEntry | null = null;
  for (const e of entries) if (e.foodId === foodId && (!best || e.ts > best.ts)) best = e;
  return best ? best.grams : null;
}
