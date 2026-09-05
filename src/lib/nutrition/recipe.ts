/**
 * מנה מורכבת: חישוב הערכים ל-100 גרם של תערובת ממרכיבים. מודול טהור.
 *
 *   סך הערכים            = Σ לכל מרכיב: (ערך ל-100 ג' × גרמים) / 100
 *   ערך ל-100 ג' של המנה = סך הערכים × 100 / finalGrams
 *
 * התוצאה נשמרת בשדות הרגילים של `CustomFood`, ומשם המנה מתנהגת כמו כל מזון.
 * `finalGrams` קטן מסכום המרכיבים = ריכוז (בישול); גדול = דילול (מים).
 *
 * פחמימה, שומן או סיבים לא ידועים באחד המרכיבים → לא ידועים במנה כולה
 * (null), במקום מספר שנראה מדויק וחסר חלק.
 */

import type { CustomFood, FoodId, Recipe } from '../../types';
import type { Food } from './foods';

export type RecipeItem = Recipe['items'][number];

export type RecipeTotals = {
  kcal: number;
  protein: number;
  carbs: number | null;
  fat: number | null;
  fiber: number | null;
  /** סכום משקלי המרכיבים — ברירת המחדל של המשקל הסופי. */
  sumGrams: number;
};

export type RecipeProblem =
  | { kind: 'missing'; foodId: FoodId }
  | { kind: 'nested'; foodId: FoodId; name: string }
  | { kind: 'no-items' }
  | { kind: 'bad-final' };

/** בעיות שחוסמות שמירה. רשימה ריקה = אפשר לשמור. */
export function recipeProblems(
  items: readonly RecipeItem[],
  finalGrams: number | null,
  resolve: (id: FoodId) => Food | null,
): RecipeProblem[] {
  const out: RecipeProblem[] = [];
  if (items.length === 0) out.push({ kind: 'no-items' });
  for (const i of items) {
    const f = resolve(i.foodId);
    if (!f) out.push({ kind: 'missing', foodId: i.foodId });
    else if (f.isRecipe) out.push({ kind: 'nested', foodId: i.foodId, name: f.name });
  }
  if (finalGrams === null || !Number.isFinite(finalGrams) || finalGrams <= 0) out.push({ kind: 'bad-final' });
  return out;
}

/** סך הערכים של המרכיבים. מרכיב שלא נמצא נזרק — `recipeProblems` הוא שמדווח עליו. */
export function recipeTotals(items: readonly RecipeItem[], resolve: (id: FoodId) => Food | null): RecipeTotals {
  const t: RecipeTotals = { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sumGrams: 0 };
  for (const i of items) {
    const f = resolve(i.foodId);
    if (!f) continue;
    const k = i.grams / 100;
    t.kcal += f.kcal * k;
    t.protein += f.protein * k;
    t.carbs = t.carbs === null || f.carbs === null ? null : t.carbs + f.carbs * k;
    t.fat = t.fat === null || f.fat === null ? null : t.fat + f.fat * k;
    t.fiber = t.fiber === null || f.fiber === null ? null : t.fiber + f.fiber * k;
    t.sumGrams += i.grams;
  }
  return t;
}

/** ערכים ל-100 גרם של המנה המוגמרת. */
export function recipePer100(
  totals: RecipeTotals,
  finalGrams: number,
): Pick<CustomFood, 'kcal' | 'protein' | 'carbs' | 'fat' | 'fiber'> {
  const k = 100 / finalGrams;
  return {
    kcal: totals.kcal * k,
    protein: totals.protein * k,
    carbs: totals.carbs === null ? null : totals.carbs * k,
    fat: totals.fat === null ? null : totals.fat * k,
    fiber: totals.fiber === null ? null : totals.fiber * k,
  };
}

/** יחס הריכוז: 1 בסלט קר, >1 אחרי בישול, <1 אחרי הוספת מים. */
export function concentration(sumGrams: number, finalGrams: number): number {
  return finalGrams > 0 ? sumGrams / finalGrams : 1;
}

/**
 * מזון שלי מוכן לשמירה: הערכים ל-100 ג' מחושבים מהמרכיבים, והמתכון נשמר
 * לצדם לעריכה עתידית. `base` נותן מזהה, שם, קטגוריה וכו'.
 */
export function buildRecipeFood(
  base: Omit<CustomFood, 'kcal' | 'protein' | 'carbs' | 'fat' | 'fiber' | 'recipe'>,
  items: readonly RecipeItem[],
  finalGrams: number,
  resolve: (id: FoodId) => Food | null,
): CustomFood {
  const per100 = recipePer100(recipeTotals(items, resolve), finalGrams);
  return { ...base, ...per100, recipe: { items: items.map((i) => ({ ...i })), finalGrams } };
}
