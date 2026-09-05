/**
 * אינדקס המזונות לחיפוש ולפתרון מזהה. מודול טהור.
 *
 * נבנה פעם אחת בטעינה (ומחדש רק כשרשימת המזונות שלי משתנה), לא בכל הקלדה:
 * שדה החיפוש של כל מזון מחושב כאן דרך `normalizeSearch` — אותה פונקציה
 * שמנרמלת את השאילתה, ולכן מקור אמת אחד לכללים.
 */

import type { CustomFood, FoodId } from '../../types';
import type { MohFood } from './foodDb';
import { fromCustom, fromMoh, type Food } from './foods.ts';
import { matchesSearch, normalizeSearch, searchTerms } from './search.ts';

export type IndexedFood = { food: Food; search: string };

export type FoodIndex = {
  byId: Map<FoodId, Food>;
  /** המזונות שלי קודם — הם מעטים ומדויקים לתווית; אחריהם המאגר לפי סדר הקובץ. */
  all: IndexedFood[];
};

export function buildFoodIndex(moh: readonly MohFood[], custom: readonly CustomFood[]): FoodIndex {
  const byId = new Map<FoodId, Food>();
  const all: IndexedFood[] = [];
  const add = (food: Food, text: string) => {
    byId.set(food.id, food);
    all.push({ food, search: normalizeSearch(text) });
  };
  for (const c of custom) add(fromCustom(c), c.name);
  for (const m of moh) add(fromMoh(m), m.en ? `${m.name} ${m.en}` : m.name);
  return { byId, all };
}

export function emptyFoodIndex(): FoodIndex {
  return { byId: new Map(), all: [] };
}

export function resolveFood(index: FoodIndex, id: FoodId): Food | null {
  return index.byId.get(id) ?? null;
}

/**
 * חיפוש: כל מילות השאילתה חייבות להופיע. התוצאות מדורגות: התאמה בתחילת
 * השם קודם, אחר כך שם קצר יותר (מזון בסיסי לפני וריאציה ארוכה). שאילתה
 * ריקה מחזירה כלום — אין טעם להציג 4,600 שורות.
 */
export function searchFoods(index: FoodIndex, query: string, limit: number): Food[] {
  const terms = searchTerms(query);
  if (terms.length === 0) return [];
  const first = terms[0]!;
  const hits: { food: Food; rank: number }[] = [];
  for (const { food, search } of index.all) {
    if (!matchesSearch(search, terms)) continue;
    const rank = (search.startsWith(first) ? 0 : 1_000_000) + search.length;
    hits.push({ food, rank });
  }
  hits.sort((a, b) => a.rank - b.rank);
  return hits.slice(0, limit).map((h) => h.food);
}
