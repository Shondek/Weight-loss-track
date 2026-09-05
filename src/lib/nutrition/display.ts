/**
 * עיגול לתצוגה. מודול טהור. זו השכבה היחידה שמעגלת — החישוב ב-calc.ts
 * שומר דיוק מלא.
 *
 * קלוריות ← מספר שלם. מאקרו ← ספרה אחת אחרי הנקודה. שלילי נשאר שלילי.
 */

import { DASH } from '../format';

export function kcalText(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return DASH;
  // Math.round של -0.4 הוא -0; מנרמלים כדי שלא יודפס "-0".
  const r = Math.round(n);
  return String(r === 0 ? 0 : r);
}

export function macroText(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return DASH;
  const r = Math.round((n + Number.EPSILON) * 10) / 10;
  return (r === 0 ? 0 : r).toFixed(1);
}

/** "12.3" או "לפחות 12.3" כשחלק מהסיבים לא ידוע. */
export function fiberText(fiber: number, unknownGrams: number): string {
  return unknownGrams > 0 ? `לפחות ${macroText(fiber)}` : macroText(fiber);
}

/** חלבון לק"ג: שתי ספרות. */
export function perKgText(n: number | null): string {
  if (n === null || !Number.isFinite(n)) return DASH;
  return n.toFixed(2);
}
