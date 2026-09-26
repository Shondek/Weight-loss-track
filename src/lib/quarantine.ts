/**
 * הסגר: רשומות שהפרסר דחה ולא נזרקות. מודול טהור.
 *
 * הבעיה שזה פותר (ביקורת שלב 1, סיכון #1): `loadDB` השמיט את `rejected[]`
 * של כל מפתח פרט לאימונים, והשמירה הבאה של אותו מפתח כתבה את המערך
 * המסונן — הרשומה נעלמה בלי שום סימן. כאן היא נשמרת גולמית, עם המפתח,
 * הסיבה והזמן, ומאוחדת לפי טביעת אצבע כדי שטעינה חוזרת לא תכפיל אותה.
 */

import type { QuarantineItem } from '../types';
import type { Rejection } from './schema';

/** טביעת אצבע יציבה של רשומה גולמית. ערך שאינו ניתן ל-JSON מקבל את ה-String שלו. */
export function fingerprint(raw: unknown): string {
  try {
    const s = JSON.stringify(raw);
    return s === undefined ? `undefined:${String(raw)}` : s;
  } catch {
    return `unserializable:${String(raw)}`;
  }
}

/** מזהה הכפילות: אותו מפתח ואותה טביעת אצבע. */
function dedupKey(item: Pick<QuarantineItem, 'key' | 'fp'>): string {
  return `${item.key}\n${item.fp}`;
}

/**
 * פריטי הסגר מרשימת הדחיות של מפתח אחד. רק דחייה שנושאת את הרשומה
 * הגולמית (`'raw' in r`) היא רשומה שנעלמה; דחייה בלי `raw` היא הערה על
 * רשומה שנשמרה (למשל מתכון מקונן שהוסר) ואין מה להסגיר.
 */
export function quarantineFromRejections(
  key: string,
  rejected: readonly Rejection[],
  at: string,
): QuarantineItem[] {
  const out: QuarantineItem[] = [];
  for (const r of rejected) {
    if (!Object.prototype.hasOwnProperty.call(r, 'raw')) continue;
    out.push({ key, raw: r.raw, reason: r.reason, at, fp: fingerprint(r.raw) });
  }
  return out;
}

/**
 * מיזוג: הקיים נשאר כמו שהוא, נכנס רק מה שאין. שום פריט לא נמחק ולא
 * מוחלף — ההסגר הוא ראיה, לא מצב.
 */
export function mergeQuarantine(
  current: readonly QuarantineItem[],
  incoming: readonly QuarantineItem[],
): QuarantineItem[] {
  const seen = new Set(current.map(dedupKey));
  const out = [...current];
  for (const item of incoming) {
    const k = dedupKey(item);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(item);
  }
  return out;
}

/** כמה פריטים לכל מפתח, לתצוגה במסך הנתונים. */
export function quarantineCounts(list: readonly QuarantineItem[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const item of list) out[item.key] = (out[item.key] ?? 0) + 1;
  return out;
}
