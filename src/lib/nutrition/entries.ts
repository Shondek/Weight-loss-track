/** רישומי אכילה. מודול טהור. */

import type { FoodEntry, FoodRef, ISODate, MealType } from '../../types';
import { toLocalISO } from '../date';
import { sortableStamp } from '../workouts';
import type { Food } from './foods';

export const MEAL_ORDER: readonly MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];

export const MEAL_LABELS: Record<MealType, string> = {
  breakfast: 'בוקר',
  lunch: 'צהריים',
  dinner: 'ערב',
  snack: 'ביניים',
};

export function sortEntries(list: readonly FoodEntry[]): FoodEntry[] {
  return [...list].sort((a, b) => a.ts - b.ts || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

export function upsertEntry(list: readonly FoodEntry[], entry: FoodEntry): FoodEntry[] {
  const rest = list.filter((e) => e.id !== entry.id);
  return sortEntries([...rest, entry]);
}

export function removeEntry(list: readonly FoodEntry[], id: string): FoodEntry[] {
  return list.filter((e) => e.id !== id);
}

/** עריכת כמות בלבד. שאר הרישום, כולל `ref`, לא משתנה. */
export function setEntryGrams(list: readonly FoodEntry[], id: string, grams: number): FoodEntry[] {
  return list.map((e) => (e.id === id ? { ...e, grams } : e));
}

/**
 * מזהה רישום. מתחיל ב-`sortableStamp(ts)` כדי ששני רישומים באותה שנייה
 * יסודרו לפי סדר היצירה. `unique` מגיע מבחוץ.
 */
export function makeEntryId(ts: number, unique: string): string {
  return `${sortableStamp(ts)}-${unique}`;
}

/**
 * רישום חדש. `d` נגזר מ-`ts` לפי אזור הזמן של המכשיר ברגע הכתיבה ומוקפא —
 * זו הנקודה היחידה שקובעת לאיזה יום שייכת האכילה. 23:50 ו-00:10 הם ימים
 * שונים, וזה נכון.
 */
export function newEntry(
  food: Food,
  grams: number,
  meal: MealType,
  ts: number,
  unique: string,
  note = '',
): FoodEntry {
  const ref: FoodRef = {
    name: food.name,
    kcal: food.kcal,
    protein: food.protein,
    carbs: food.carbs,
    fat: food.fat,
    fiber: food.fiber,
  };
  return {
    id: makeEntryId(ts, unique),
    d: toLocalISO(new Date(ts)),
    ts,
    meal,
    foodId: food.id,
    grams,
    ref,
    ...(note.trim() === '' ? {} : { note: note.trim() }),
  };
}

/** הרישומים של יום, לפי סדר הזמן. */
export function entriesOn(list: readonly FoodEntry[], d: ISODate): FoodEntry[] {
  return sortEntries(list.filter((e) => e.d === d));
}

/** קיבוץ לפי ארוחה בסדר ההצגה. ארוחה בלי רישומים לא מופיעה. */
export function groupByMeal(list: readonly FoodEntry[]): { meal: MealType; entries: FoodEntry[] }[] {
  const sorted = sortEntries(list);
  return MEAL_ORDER.map((meal) => ({ meal, entries: sorted.filter((e) => e.meal === meal) })).filter(
    (g) => g.entries.length > 0,
  );
}

/**
 * ארוחת ברירת מחדל לפי שעת היום. הגבולות ב-`MEAL_HOURS` שב-data/config.ts.
 * זה רק מה שנבחר מראש בשדה — תמיד ניתן לשינוי.
 */
export function defaultMeal(hour: number, bounds: { lunchFrom: number; dinnerFrom: number; snackFrom: number }): MealType {
  if (hour < bounds.lunchFrom) return 'breakfast';
  if (hour < bounds.dinnerFrom) return 'lunch';
  if (hour < bounds.snackFrom) return 'dinner';
  return 'snack';
}
