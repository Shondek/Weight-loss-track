/**
 * שער לפעולות הרסניות (סיכון #3): החלפה בייבוא ו"מחק הכול". מודול טהור.
 *
 * שני תנאים לפני שהפעולה רצה, בסדר הזה:
 *  1. אישור מוקלד — המילה המדויקת, לא כפתור.
 *  2. גיבוי אוטומטי מלא יוצא מהמכשיר. אם ההורדה נכשלת (זורקת או מחזירה
 *     false) — הפעולה מבוטלת ושום דבר לא נכתב.
 * המסך מספק את ההורדה ואת הפעולה; כאן רק הסדר והתנאים, כדי שהם ייבדקו.
 */

import type { DB } from '../types';

export const REPLACE_WORD = 'החלף';
export const WIPE_WORD = 'מחק';

export function isConfirmed(typed: string, word: string): boolean {
  return typed.trim() === word;
}

export type GuardResult<T> =
  | { ok: true; value: T }
  | { ok: false; reason: 'not-confirmed' | 'backup-failed'; detail: string | null };

/**
 * מריץ `run` רק אחרי אישור מוקלד וגיבוי שהצליח. `backup` מחזיר האם ההורדה
 * יצאה לדרך (downloadText); חריגה נחשבת כישלון באותה מידה.
 */
export async function guardedRun<T>(opts: {
  typed: string;
  word: string;
  backup: () => boolean;
  run: () => Promise<T>;
}): Promise<GuardResult<T>> {
  if (!isConfirmed(opts.typed, opts.word)) return { ok: false, reason: 'not-confirmed', detail: null };
  let backedUp: boolean;
  try {
    backedUp = opts.backup();
  } catch (err) {
    return { ok: false, reason: 'backup-failed', detail: err instanceof Error ? err.message : String(err) };
  }
  if (!backedUp) return { ok: false, reason: 'backup-failed', detail: null };
  return { ok: true, value: await opts.run() };
}

// ---------- אזהרת מחיקת תזונה בהחלפה ----------

const NUTRITION_KEYS = ['entries', 'customFoods', 'targets', 'favorites'] as const;
type NutritionKey = (typeof NUTRITION_KEYS)[number];

export type NutritionErasure = Record<NutritionKey, number>;

/** האם קובץ הייבוא הגולמי מכיל לפחות מפתח תזונה אחד (כמערך). גיבוי v1 — לא. */
export function hasNutritionKeys(raw: unknown): boolean {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return false;
  return NUTRITION_KEYS.some((k) => Array.isArray((raw as Record<string, unknown>)[k]));
}

/**
 * מה יימחק אם מחליפים ב-`raw`: כשהקובץ בלי מפתחות תזונה והמכשיר מחזיק
 * תזונה כלשהי — הספירות; אחרת null (אין מה להזהיר). הקובץ עצמו לא
 * משתנה: החלפה בקובץ ישן באמת מוחקת את התזונה, וזה מה שהאזהרה אומרת.
 */
export function nutritionErasure(current: DB, raw: unknown): NutritionErasure | null {
  if (hasNutritionKeys(raw)) return null;
  const counts: NutritionErasure = {
    entries: current.entries.length,
    customFoods: current.customFoods.length,
    targets: current.targets.length,
    favorites: current.favorites.length,
  };
  return NUTRITION_KEYS.some((k) => counts[k] > 0) ? counts : null;
}
