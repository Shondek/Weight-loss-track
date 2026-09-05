/**
 * נרמול טקסט לחיפוש מזון. מודול טהור.
 *
 * אותה פונקציה משמשת את סקריפט הייבוא (שמייצר את `search` לכל מזון) ואת
 * הממשק (שמנרמל את מה שהמשתמש מקליד). אם הכללים כאן משתנים, צריך להריץ
 * את הייבוא מחדש — אחרת ההקלדה והשדה לא ידברו באותה שפה.
 *
 * הכללים: הסרת ניקוד וטעמים (U+0591–U+05C7), הסרת פסיקים, איחוד רווחים,
 * אותיות קטנות לאנגלית. השם המקורי נשמר בנפרד ומוצג כמו שהוא.
 */

const HEBREW_MARKS = /[֑-ׇ]/g;

export function normalizeSearch(text: string): string {
  return text
    .replace(HEBREW_MARKS, '')
    .replace(/,/g, ' ')
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w !== '')
    .join(' ');
}

/** מילות החיפוש של שאילתה, מנורמלות. שאילתה ריקה = אין מילים. */
export function searchTerms(query: string): string[] {
  const n = normalizeSearch(query);
  return n === '' ? [] : n.split(' ');
}

/** כל מילות השאילתה מופיעות בשדה החיפוש, בכל סדר. */
export function matchesSearch(searchField: string, terms: readonly string[]): boolean {
  return terms.every((t) => searchField.includes(t));
}
