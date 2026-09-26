/**
 * "לשמור כמזון קבוע?" — הזנה ידנית שחוזרת על עצמה הופכת למזון שלי.
 * מודול טהור. הרישומים הישנים לא משתנים: הם נשארים ידניים עם ה-ref שלהם.
 */

import { CUSTOM_FOOD_PREFIX, UNIT_FOOD_SCALE, type CustomFood, type FoodEntry, type FoodRef, type ISODate } from '../../types';
import { addDays, compareISO } from '../date';
import { MAX_KCAL_PER_100G, MAX_MACRO_PER_100G } from '../schema';
import { entryName, normalizeName } from './entries';
import { isFridayEstimate } from './friday';

export const SAVE_OFFER_MIN = 2;

/** כמה רישומים ידניים בשם הזה (מנורמל) בחלון של `windowDays` ימים עד היום. */
export function adhocOccurrences(
  entries: readonly FoodEntry[],
  name: string,
  today: ISODate,
  windowDays = 14,
): number {
  const target = normalizeName(name);
  if (target === '') return 0;
  const from = addDays(today, -(windowDays - 1));
  let n = 0;
  for (const e of entries) {
    if (e.adhoc !== true || isFridayEstimate(e)) continue;
    if (compareISO(e.d, from) < 0 || compareISO(e.d, today) > 0) continue;
    if (normalizeName(entryName(e, null)) === target) n++;
  }
  return n;
}

/** האם השם כבר קיים כמזון שלי (בלי תלות ברווחים/רישיות). */
export function hasCustomFoodNamed(foods: readonly CustomFood[], name: string): boolean {
  const target = normalizeName(name).toLowerCase();
  return foods.some((f) => normalizeName(f.name).toLowerCase() === target);
}

/**
 * מזון-יחידה מ-ref של הזנה ידנית: הערכים כבר ×100 (unitFood), ולכן עוברים
 * כמו שהם. הפרסר של מזונות שלי מגביל יחידה ל-900 קק"ל ו-100 ג' מאקרו —
 * ארוחה גדולה מזה לא יכולה להישמר כמזון (טווחי האימות לא משתנים).
 */
export function canSaveAsFood(ref: FoodRef): boolean {
  const kcalMax = MAX_KCAL_PER_100G * UNIT_FOOD_SCALE;
  const macroMax = MAX_MACRO_PER_100G * UNIT_FOOD_SCALE;
  const within = (v: number | null) => v === null || (v >= 0 && v <= macroMax);
  return ref.unitFood === true && ref.kcal >= 0 && ref.kcal <= kcalMax && within(ref.protein) && within(ref.carbs) && within(ref.fat) && within(ref.fiber);
}

export function customFoodFromAdhoc(ref: FoodRef, name: string, unique: string): CustomFood {
  return {
    id: `${CUSTOM_FOOD_PREFIX}${unique}`,
    name: normalizeName(name),
    cat: null,
    kcal: ref.kcal,
    protein: ref.protein,
    carbs: ref.carbs,
    fat: ref.fat,
    fiber: ref.fiber,
    portions: [],
    barcode: null,
    unitFood: true,
    note: 'נשמר מהזנה ידנית — ערכים ליחידה אחת (הזן 1)',
  };
}
