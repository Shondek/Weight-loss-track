/**
 * ספריית המנות v2 — הצד של האפליקציה. מודול טהור.
 *
 * הספרייה נבנית ב-scripts/meal-library-v2.ts ונכתבת ל-
 * public/library/meal-library-v2.json (asset, ב-precache). כפתור "טען את
 * ספריית המנות" במסך נתונים מושך אותה ומטמיע במיזוג: מזון שקיים באותו
 * מזהה מתעדכן, מזון שלי אחר לא נוגע. רישומים קודמים לא משתנים — ה-ref
 * שלהם הוקפא בזמן הרישום.
 */

import type { CustomFood, FoodId } from '../../types.ts';
import { upsertCustomFood } from './foods.ts';

/** קידומת המזהה של כל פריט ספרייה: "c:lib2:<slug>". */
export const LIB_PREFIX = 'c:lib2:';

export function libraryFoodId(slug: string): FoodId {
  return `${LIB_PREFIX}${slug}`;
}

export function isLibraryFoodId(id: string): boolean {
  return id.startsWith(LIB_PREFIX) && id.length > LIB_PREFIX.length;
}

export type LibraryMerge = {
  list: CustomFood[];
  /** מזהים שלא היו קיימים. */
  added: number;
  /** מזהים שהיו קיימים ותוכנם השתנה. */
  updated: number;
  /** מזהים שהיו קיימים ותוכנם זהה — ייבוא חוזר. */
  unchanged: number;
};

/** השוואת תוכן בלי תלות בסדר מפתחות. */
function sameFood(a: CustomFood, b: CustomFood): boolean {
  return JSON.stringify(normalize(a)) === JSON.stringify(normalize(b));
}

function normalize(f: CustomFood): unknown {
  return {
    id: f.id,
    name: f.name,
    cat: f.cat,
    kcal: f.kcal,
    protein: f.protein,
    carbs: f.carbs,
    fat: f.fat,
    fiber: f.fiber,
    portions: f.portions,
    barcode: f.barcode,
    recipe: f.recipe ?? null,
    note: f.note ?? null,
    unitFood: f.unitFood === true,
    archived: f.archived === true,
  };
}

/**
 * מיזוג בלבד: הנכנס גובר על אותו מזהה, שום דבר קיים לא נמחק.
 * ריצה חוזרת על אותו קובץ: added 0, updated 0 — ורשימה זהה.
 */
export function mergeLibrary(current: readonly CustomFood[], incoming: readonly CustomFood[]): LibraryMerge {
  const byId = new Map(current.map((f) => [f.id, f]));
  let list: CustomFood[] = [...current];
  let added = 0;
  let updated = 0;
  let unchanged = 0;
  for (const f of incoming) {
    const existing = byId.get(f.id);
    if (!existing) added += 1;
    else if (sameFood(existing, f)) {
      unchanged += 1;
      continue;
    } else updated += 1;
    list = upsertCustomFood(list, f);
    byId.set(f.id, f);
  }
  return { list, added, updated, unchanged };
}
