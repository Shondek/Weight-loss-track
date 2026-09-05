/**
 * מזונות: פתרון מזהה, מזון שהוזן ידנית, וערכי המקור שמוקפאים ברישום.
 * מודול טהור.
 *
 * שני מרחבי מזהים שלא יכולים להתנגש: 8 ספרות = משרד הבריאות, "c:" + מזהה
 * = מזון שלי. `MohFood` מגיע מקובץ ה-asset, `CustomFood` מהאחסון.
 */

import { CUSTOM_FOOD_PREFIX, type CustomFood, type FoodId, type FoodPortion, type FoodRef } from '../../types';
import type { MohFood } from './foodDb';

/** מזון שאפשר לרשום: מהמאגר או שלי. הממשק לא צריך להבחין ביניהם. */
export type Food = {
  id: FoodId;
  name: string;
  source: 'moh' | 'custom';
  kcal: number;
  protein: number;
  carbs: number | null;
  fat: number;
  fiber: number | null;
  portions: FoodPortion[];
  /** הערך במאגר חשוד (ראה `MohFood.suspect`). מאפיין של המאגר, לא של האכילה. */
  suspect: boolean;
};

export function isCustomFoodId(id: string): boolean {
  return id.startsWith(CUSTOM_FOOD_PREFIX) && id.length > CUSTOM_FOOD_PREFIX.length;
}

export function isMohFoodId(id: string): boolean {
  return /^\d{8}$/.test(id);
}

/** מזהה למזון חדש. הייחודיות (uuid) מגיעה מבחוץ כדי שהמודול יישאר טהור. */
export function makeCustomFoodId(unique: string): FoodId {
  return `${CUSTOM_FOOD_PREFIX}${unique}`;
}

export function fromMoh(f: MohFood): Food {
  return {
    id: f.id,
    name: f.name,
    source: 'moh',
    kcal: f.kcal,
    protein: f.protein,
    carbs: f.carbs,
    fat: f.fat,
    fiber: f.fiber,
    portions: f.portions,
    suspect: f.suspect === true,
  };
}

export function fromCustom(f: CustomFood): Food {
  return {
    id: f.id,
    name: f.name,
    source: 'custom',
    kcal: f.kcal,
    protein: f.protein,
    carbs: f.carbs,
    fat: f.fat,
    fiber: f.fiber,
    portions: f.portions,
    suspect: false,
  };
}

/** ערכי המקור ל-100 גרם שנשמרים ברישום. */
export function refOf(f: Food): FoodRef {
  return { name: f.name, kcal: f.kcal, protein: f.protein, carbs: f.carbs, fat: f.fat, fiber: f.fiber };
}

// ---------- מזונות שלי ----------

export function sortCustomFoods(list: readonly CustomFood[]): CustomFood[] {
  return [...list].sort((a, b) => a.name.localeCompare(b.name, 'he'));
}

/** הזנה חוזרת לאותו מזהה מעדכנת ולא מכפילה. */
export function upsertCustomFood(list: readonly CustomFood[], food: CustomFood): CustomFood[] {
  const rest = list.filter((f) => f.id !== food.id);
  return sortCustomFoods([...rest, food]);
}

/** מחיקה אמיתית. הרישומים של המזון שורדים דרך `ref`. */
export function removeCustomFood(list: readonly CustomFood[], id: FoodId): CustomFood[] {
  return list.filter((f) => f.id !== id);
}
