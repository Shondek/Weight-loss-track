/** עזרי תצוגה מספרית. מודול טהור. */

/** הסימן לשדה שלא מולא. אף פעם לא משמיטים שדה — כותבים את זה. */
export const DASH = '—';

export function round(n: number, digits: number): number {
  const f = 10 ** digits;
  return Math.round((n + Number.EPSILON) * f) / f;
}

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


/**
 * ממוצע מדויק. סכימה ישירה של ערכים כמו 80.1 צוברת שגיאת נקודה צפה
 * (80.1+80.0+79.8+80.2 = 320.09999999999997), ואז ערך שאמור להיות בדיוק
 * 80.025 מתעגל כלפי מטה. סוכמים באלפיות שלמות כדי למנוע את זה.
 * דיוק המקור נשמר עד 3 ספרות אחרי הנקודה — יותר מכל מה שהאפליקציה מזינה.
 */
const MEAN_SCALE = 1000;

export function mean(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  let total = 0;
  for (const v of values) total += Math.round(v * MEAN_SCALE);
  return total / (MEAN_SCALE * values.length);
}
