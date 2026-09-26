/**
 * תכולת מנה מורכבת — תצוגה בלבד (שלב 3.1). מודול טהור.
 *
 * מנה כמו "ע1 — קוטג' וביצים" נשמרת עם המתכון שלה (recipe.items); עד כאן
 * המסך הציג רק את השם, והמשתמש לא ידע מה בפנים. השורה כאן נבנית מהמתכון
 * החי לפי מזהה המזון; מזון שנמחק — אין שורה, לעולם לא כישלון.
 */

import type { Recipe } from '../../types';

/** גרמים לתצוגה: שלם כשאפשר, אחרת ספרה אחת. */
export function gramsText(g: number): string {
  const r = Math.round(g * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}

/**
 * שורת תכולה של מנה מורכבת: כל מרכיב כ-`u` אם יש ("2 ביצים"), אחרת
 * "<n או שם המזון> <גרמים> ג׳", מופרדים ב-" · ". null כשאין מתכון.
 * `resolveName` — שם המזון החי לפי מזהה; מרכיב שלא נמצא מוצג לפי המזהה.
 */
export function compositionLine(recipe: Recipe | null | undefined, resolveName: (id: string) => string | null): string | null {
  if (!recipe || recipe.items.length === 0) return null;
  return recipe.items
    .map((i) => {
      if (i.u) return i.u;
      const name = i.n ?? resolveName(i.foodId) ?? i.foodId;
      return `${name} ${gramsText(i.grams)} ג׳`;
    })
    .join(' · ');
}
