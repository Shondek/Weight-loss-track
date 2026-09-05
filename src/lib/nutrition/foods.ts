/**
 * מזונות: פתרון מזהה, מזון שהוזן ידנית, וערכי המקור שמוקפאים ברישום.
 * מודול טהור.
 *
 * שני מרחבי מזהים שלא יכולים להתנגש: 8 ספרות = משרד הבריאות, "c:" + מזהה
 * = מזון שלי. `MohFood` מגיע מקובץ ה-asset, `CustomFood` מהאחסון.
 */

import {
  CUSTOM_FOOD_PREFIX,
  UNIT_FOOD_SCALE,
  type CustomFood,
  type FoodId,
  type FoodPortion,
  type FoodRef,
} from '../../types.ts';
import type { MohFood } from './foodDb';

/** מזון שאפשר לרשום: מהמאגר או שלי. הממשק לא צריך להבחין ביניהם. */
export type Food = {
  id: FoodId;
  name: string;
  source: 'moh' | 'custom';
  kcal: number;
  protein: number;
  carbs: number | null;
  fat: number | null;
  fiber: number | null;
  portions: FoodPortion[];
  /** הערך במאגר חשוד (ראה `MohFood.suspect`). מאפיין של המאגר, לא של האכילה. */
  suspect: boolean;
  /** מנה מורכבת — הערכים חושבו ממרכיבים. לא יכולה להיות מרכיב במנה אחרת. */
  isRecipe: boolean;
  /** יחידה = 1 ג': הערכים ל-100 ג' הם ערכי יחידה ×100. הזנת 1 = יחידה. */
  unitFood: boolean;
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
    isRecipe: false,
    unitFood: false,
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
    isRecipe: f.recipe !== undefined,
    unitFood: f.unitFood === true,
  };
}

/** ערכי המקור ל-100 גרם שנשמרים ברישום. `unitFood` מוקפא איתם. */
export function refOf(f: Food): FoodRef {
  return {
    name: f.name,
    kcal: f.kcal,
    protein: f.protein,
    carbs: f.carbs,
    fat: f.fat,
    fiber: f.fiber,
    ...(f.unitFood ? { unitFood: true as const } : {}),
  };
}

/**
 * הערכים להצגה: ל-100 ג' במזון רגיל, ליחידה במזון יחידה (÷100).
 * הסכום היומי לא צריך את זה — הוא עובד על הערכים כפי שהם.
 */
export function displayValues(f: Food): { kcal: number; protein: number; carbs: number | null; fat: number | null; per: string } {
  const k = f.unitFood ? 1 / UNIT_FOOD_SCALE : 1;
  return {
    kcal: f.kcal * k,
    protein: f.protein * k,
    carbs: f.carbs === null ? null : f.carbs * k,
    fat: f.fat === null ? null : f.fat * k,
    per: f.unitFood ? 'ליחידה (הזן 1)' : 'ל-100 ג׳',
  };
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
