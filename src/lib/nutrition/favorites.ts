/** מועדפים ואחרונים. מודול טהור. */

import type { Favorite, FoodEntry, FoodId } from '../../types';
import { sortEntries } from './entries';

/** מועדף חוזר מעדכן את הכמות במקומו; חדש נכנס בסוף. סדר ההוספה הוא סדר ההצגה. */
export function upsertFavorite(list: readonly Favorite[], f: Favorite): Favorite[] {
  const i = list.findIndex((x) => x.foodId === f.foodId);
  if (i === -1) return [...list, f];
  return list.map((x, j) => (j === i ? f : x));
}

export function removeFavorite(list: readonly Favorite[], foodId: FoodId): Favorite[] {
  return list.filter((x) => x.foodId !== foodId);
}

export function isFavorite(list: readonly Favorite[], foodId: FoodId): boolean {
  return list.some((x) => x.foodId === foodId);
}

/**
 * מזונות אחרונים מהרישומים, מהחדש לישן, בלי כפילויות, עם הכמות האחרונה
 * שנרשמה. מה שכבר במועדפים לא חוזר כאן.
 */
export function recentFoods(
  entries: readonly FoodEntry[],
  favorites: readonly Favorite[],
  count: number,
): { foodId: FoodId; grams: number }[] {
  const skip = new Set(favorites.map((f) => f.foodId));
  const seen = new Set<FoodId>();
  const out: { foodId: FoodId; grams: number }[] = [];
  for (const e of sortEntries(entries).reverse()) {
    if (skip.has(e.foodId) || seen.has(e.foodId)) continue;
    seen.add(e.foodId);
    out.push({ foodId: e.foodId, grams: e.grams });
    if (out.length >= count) break;
  }
  return out;
}
