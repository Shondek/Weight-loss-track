/** רישומי אכילה. מודול טהור. */

import { ADHOC_FOOD_ID, ADHOC_MAX_KCAL, ADHOC_MAX_MACRO, UNIT_FOOD_SCALE, type FoodEntry, type FoodRef, type ISODate, type MealType } from '../../types';

export { ADHOC_MAX_KCAL, ADHOC_MAX_MACRO };
import { toLocalISO } from '../date';
import { sortableStamp } from '../workouts';
import { refOf, type Food } from './foods';

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
  const ref: FoodRef = refOf(food);
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

/** מה שמוזן ברישום ידני: הערכה לארוחה שלמה, לא ל-100 ג'. */
export type AdhocValues = {
  name: string;
  kcal: number;
  protein: number;
  carbs: number | null;
  fat: number | null;
};

/**
 * רישום ידני (אוכל בחוץ, הערכה מהצ'אט). אין מזון בספרייה: הערכים חיים
 * ב-`ref` בלבד, והשם ב-`n` — כמו `n` באימון.
 *
 * נשמר כ"יחידה אחת" (`unitFood`, ערכים ×100, grams = 1) ולא כ-100 ג':
 * תקרת הסבירות של הפרסר היא 900 קק"ל ל-100 ג', וארוחת מסעדה של 1,200 קק"ל
 * הייתה נדחית בקריאה הבאה. `grams × ref / 100` מחזיר בדיוק מה שהוזן.
 */
export function newAdhocEntry(values: AdhocValues, meal: MealType, ts: number, unique: string): FoodEntry {
  const name = values.name.trim();
  const ref: FoodRef = {
    name,
    kcal: values.kcal * UNIT_FOOD_SCALE,
    protein: values.protein * UNIT_FOOD_SCALE,
    carbs: values.carbs === null ? null : values.carbs * UNIT_FOOD_SCALE,
    fat: values.fat === null ? null : values.fat * UNIT_FOOD_SCALE,
    fiber: null,
    unitFood: true,
  };
  return {
    id: makeEntryId(ts, unique),
    d: toLocalISO(new Date(ts)),
    ts,
    meal,
    foodId: ADHOC_FOOD_ID,
    grams: 1,
    ref,
    n: name,
    adhoc: true,
  };
}

/**
 * בדיקת שפיות להזנה ידנית: 4·חלבון + 4·פחמימה + 9·שומן מול הקלוריות.
 * רצה רק כששלושת המאקרו מולאו. מחזירה את הפער היחסי (0.2 = 20%), או null.
 * אזהרה בלבד — שומרים בכל מקרה.
 */
export function macroKcalGap(kcal: number, protein: number, carbs: number | null, fat: number | null): number | null {
  if (carbs === null || fat === null || kcal <= 0) return null;
  const fromMacros = 4 * protein + 4 * carbs + 9 * fat;
  return Math.abs(fromMacros - kcal) / kcal;
}

export const MACRO_GAP_WARN = 0.2;

/** השם להצגה: מה שהוקפא ברישום ידני, אחרת המזון החי, אחרת ההקפאה. */
export function entryName(entry: FoodEntry, liveName: string | null): string {
  return entry.n ?? liveName ?? entry.ref.name;
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
