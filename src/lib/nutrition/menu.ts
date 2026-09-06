/**
 * "התפריט שלי": פתרון הרובריקה מול הספרייה, בחירת הקבוצה לפי השעה, וכלל
 * "אגוז אחד ביום". מודול טהור; הנתונים ב-data/mealMenu.ts.
 */

import type { FoodEntry, ISODate } from '../../types.ts';
import { entriesOn } from './entries.ts';
import type { Food } from './foods.ts';
import { libraryFoodId } from './library.ts';

export type MenuGroupKey = 'lunch' | 'dinner' | 'blocks' | 'extras';

export type MenuItem = {
  /** מזהה בספרייה בלי הקידומת: "c:lib2:<slug>". */
  slug: string;
  /** מה שכתוב על הכפתור לפני המספרים. */
  label: string;
  /** מה נרשם בלחיצה. חסר = משקל המנה כפי שהוגדרה (recipe.finalGrams). */
  grams?: number;
  /** נספר בכלל "אגוז אחד ביום". */
  nut?: true;
};

export type MenuGroup = {
  key: MenuGroupKey;
  label: string;
  items: readonly MenuItem[];
};

/** פריט שנפתר מול הספרייה: המזון החי והכמות שתירשם. */
export type ResolvedMenuItem = {
  item: MenuItem;
  food: Food;
  grams: number;
  kcal: number;
  protein: number;
};

export type ResolvedMenuGroup = {
  group: MenuGroup;
  items: ResolvedMenuItem[];
  /** כמה פריטים בהגדרה לא נמצאו בספרייה (טרם נטענה, או נמחקו). */
  missing: number;
};

/** כמות ברירת המחדל לפריט: מה שהוגדר, ואם לא — משקל המנה. */
export function menuItemGrams(item: MenuItem, food: Food, finalGrams: number | null): number | null {
  if (item.grams !== undefined) return item.grams;
  if (food.isRecipe && finalGrams !== null) return finalGrams;
  return null;
}

/**
 * פותר את כל הקבוצות. פריט שאין לו מזון או כמות — מדולג ונספר ב-missing.
 * `finalGramsOf` מחזיר את משקל המנה של מזון ספרייה (null למזון שאינו מנה).
 */
export function resolveMenu(
  groups: readonly MenuGroup[],
  resolve: (id: string) => Food | null,
  finalGramsOf: (id: string) => number | null,
): ResolvedMenuGroup[] {
  return groups.map((group) => {
    const items: ResolvedMenuItem[] = [];
    let missing = 0;
    for (const item of group.items) {
      const id = libraryFoodId(item.slug);
      const food = resolve(id);
      const grams = food ? menuItemGrams(item, food, finalGramsOf(id)) : null;
      if (!food || grams === null) {
        missing += 1;
        continue;
      }
      items.push({ item, food, grams, kcal: (food.kcal * grams) / 100, protein: (food.protein * grams) / 100 });
    }
    return { group, items, missing };
  });
}

/**
 * הקבוצה שנפתחת לפי השעה: לפני הצהריים ואחרי הביניים — בלוקים; אחרת
 * הארוחה של השעה. אותם גבולות כמו `defaultMeal`.
 */
export function menuGroupForHour(
  hour: number,
  bounds: { lunchFrom: number; dinnerFrom: number; snackFrom: number },
): MenuGroupKey {
  if (hour < bounds.lunchFrom) return 'blocks';
  if (hour < bounds.dinnerFrom) return 'lunch';
  if (hour < bounds.snackFrom) return 'dinner';
  return 'blocks';
}

/** מזהי הספרייה של האגוזים, מתוך הגדרת התפריט. */
export function nutFoodIds(groups: readonly MenuGroup[]): Set<string> {
  const out = new Set<string>();
  for (const g of groups) for (const i of g.items) if (i.nut) out.add(libraryFoodId(i.slug));
  return out;
}

/** הרישומים של אגוזים ביום — לכלל "אגוז אחד ביום" (אזהרה רכה, לא חסימה). */
export function nutEntriesOn(entries: readonly FoodEntry[], d: ISODate, nutIds: ReadonlySet<string>): FoodEntry[] {
  return entriesOn(entries, d).filter((e) => nutIds.has(e.foodId));
}
