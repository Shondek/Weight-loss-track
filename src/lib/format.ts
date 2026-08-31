/** עזרי תצוגה מספרית. מודול טהור. */

/** הסימן לשדה שלא מולא. אף פעם לא משמיטים שדה — כותבים את זה. */
export const DASH = '—';

export function round(n: number, digits: number): number {
  const f = 10 ** digits;
  return Math.round((n + Number.EPSILON) * f) / f;
}

export const round1 = (n: number): number => round(n, 1);
export const round2 = (n: number): number => round(n, 2);

/** מספר עם מספר קבוע של ספרות אחרי הנקודה, או "—" אם אין ערך. */
export function fixed(n: number | null | undefined, digits: number): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return DASH;
  return n.toFixed(digits);
}

/** מספר "נקי": בלי אפסים מיותרים בסוף. 60 → "60", 62.5 → "62.5" */
export function clean(n: number | null | undefined, maxDigits = 2): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return DASH;
  return String(round(n, maxDigits));
}

/** מגביל ערך לטווח. */
export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}
