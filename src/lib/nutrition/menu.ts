/**
 * "התפריט שלי": פתרון הרובריקה מול הספרייה, בחירת הקבוצה לפי השעה, וכלל
 * "אגוז אחד ביום". מודול טהור; הנתונים ב-data/mealMenu.ts.
 */

import type { FoodEntry, ISODate, Recipe } from '../../types.ts';
import { entriesOn } from './entries.ts';
import type { Food } from './foods.ts';
import { libraryFoodId } from './library.ts';

export type MenuGroupKey = 'lunch' | 'dinner' | 'blocks' | 'extras';

/** ברירת מחדל של מנה: תוסף שנרשם יחד איתה כרישום נפרד. `label` לטוסט. */
export type MenuDefault = { slug: string; grams: number; label: string };

export type MenuItem = {
  /** מזהה בספרייה בלי הקידומת: "c:lib2:<slug>". */
  slug: string;
  /** מה שכתוב על הכפתור לפני המספרים. */
  label: string;
  /** מה נרשם בלחיצה. חסר = משקל המנה כפי שהוגדרה (recipe.finalGrams). */
  grams?: number;
  /** נספר בכלל "אגוז אחד ביום". */
  nut?: true;
  /** תוסף שנספר ב"תוספים" בסיכום היום. */
  addon?: true;
  /**
   * תוספים שנוצרים יחד עם המנה כרישומים נפרדים — פעם אחת ביום לכל מנה:
   * אם המנה כבר נרשמה היום, לחיצה נוספת יוצרת רק את המנה. כך תוסף שנמחק
   * לא חוזר באותו יום.
   */
  defaults?: readonly MenuDefault[];
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
  /** שורת המרכיבים של מנה ("חזה עוף 250 · סלט 250 · טחינה כף מפולסת"); null למזון שאינו מנה. */
  ingredients: string | null;
};

export type ResolvedMenuGroup = {
  group: MenuGroup;
  items: ResolvedMenuItem[];
  /** כמה פריטים בהגדרה לא נמצאו בספרייה (טרם נטענה, או נמחקו). */
  missing: number;
};

/** גרמים לתצוגה: שלם כשאפשר, אחרת ספרה אחת. */
function gramsText(g: number): string {
  return (Math.round(g * 10) / 10).toString();
}

/**
 * מרכיב אחד בשורת המרכיבים. הכלל: מה שנמדד בכלי מטבח — "טחינה כף מפולסת";
 * מה שנספר — "2 ביצים" (התווית היא כל הטקסט); מה ששוקלים — "חזה עוף 250".
 * `n` הוא השם הקצר לתצוגה; בלעדיו — שם המזון.
 */
export function ingredientText(item: Recipe['items'][number], foodName: string): string {
  if (item.n) return `${item.n} ${item.u ?? gramsText(item.grams)}`;
  if (item.u) return item.u;
  return `${foodName} ${gramsText(item.grams)}`;
}

export function ingredientsLine(recipe: Recipe, resolve: (id: string) => Food | null): string {
  return recipe.items.map((i) => ingredientText(i, resolve(i.foodId)?.name ?? i.foodId)).join(' · ');
}

/** כמות ברירת המחדל לפריט: מה שהוגדר, ואם לא — משקל המנה. */
export function menuItemGrams(item: MenuItem, food: Food, finalGrams: number | null): number | null {
  if (item.grams !== undefined) return item.grams;
  if (food.isRecipe && finalGrams !== null) return finalGrams;
  return null;
}

/**
 * פותר את כל הקבוצות. פריט שאין לו מזון או כמות — מדולג ונספר ב-missing.
 * `recipeOf` מחזיר את המתכון של מזון ספרייה (null למזון שאינו מנה) — למשקל המנה ולשורת המרכיבים.
 */
export function resolveMenu(
  groups: readonly MenuGroup[],
  resolve: (id: string) => Food | null,
  recipeOf: (id: string) => Recipe | null,
): ResolvedMenuGroup[] {
  return groups.map((group) => {
    const items: ResolvedMenuItem[] = [];
    let missing = 0;
    for (const item of group.items) {
      const id = libraryFoodId(item.slug);
      const food = resolve(id);
      const recipe = recipeOf(id);
      const grams = food ? menuItemGrams(item, food, recipe?.finalGrams ?? null) : null;
      if (!food || food.archived || grams === null) {
        missing += 1;
        continue;
      }
      items.push({
        item,
        food,
        grams,
        kcal: (food.kcal * grams) / 100,
        protein: (food.protein * grams) / 100,
        ingredients: recipe ? ingredientsLine(recipe, resolve) : null,
      });
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

/** מזהי הספרייה של התוספים הנספרים, מתוך הגדרת התפריט. */
export function addonFoodIds(groups: readonly MenuGroup[]): Set<string> {
  const out = new Set<string>();
  for (const g of groups) for (const i of g.items) if (i.addon) out.add(libraryFoodId(i.slug));
  return out;
}

/** מפה: מזהה מנה → ברירות המחדל שלה. */
function defaultsById(groups: readonly MenuGroup[]): Map<string, readonly MenuDefault[]> {
  const out = new Map<string, readonly MenuDefault[]>();
  for (const g of groups) for (const i of g.items) if (i.defaults?.length) out.set(libraryFoodId(i.slug), i.defaults);
  return out;
}

/** האם המנה כבר נרשמה היום — ואז ברירות המחדל לא נוצרות שוב. */
export function dishLoggedOn(entries: readonly FoodEntry[], d: ISODate, dishId: string): boolean {
  return entries.some((e) => e.d === d && e.foodId === dishId);
}

/**
 * כמה תוספים "צפויים" היום: סכום ברירות המחדל (הנספרות כתוספים) של המנות
 * שנרשמו היום, פעם אחת לכל מנה — תואם את הכלל שברירות המחדל נוצרות פעם
 * אחת ביום לכל מנה. תוסף שנמחק בכוונה אינו ניתן להבחנה מתוסף שלא נרשם,
 * ולכן נספר כחסר: עדיף להראות פער מאשר להסתיר אותו.
 */
export function expectedAddonCount(entries: readonly FoodEntry[], d: ISODate, groups: readonly MenuGroup[]): number {
  const defaults = defaultsById(groups);
  const addons = addonFoodIds(groups);
  const seen = new Set<string>();
  let n = 0;
  for (const e of entries) {
    if (e.d !== d || seen.has(e.foodId)) continue;
    const list = defaults.get(e.foodId);
    if (!list) continue;
    seen.add(e.foodId);
    n += list.filter((x) => addons.has(libraryFoodId(x.slug))).length;
  }
  return n;
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
