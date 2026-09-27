/**
 * מעקב קריאטין. מודול טהור.
 *
 * 5 ג׳ ביום מ-27/9/2026, כולל ימי מנוחה. סימון = רשומה לתאריך; ביטול =
 * הסרתה. לא נרשם כמזון (0 קק״ל), ולא נכנס ליומן האוכל. שבוע = ראשון–שבת;
 * ימים לפני תאריך ההתחלה לא נספרים.
 */

import type { CreatineDay, ISODate } from '../types';
import { compareISO, weekDays } from './date';

export const CREATINE_START: ISODate = '2026-09-27';
export const CREATINE_DOSE_G = 5;

export function sortCreatine(list: readonly CreatineDay[]): CreatineDay[] {
  return [...list].sort((a, b) => compareISO(a.d, b.d));
}

export function creatineOn(list: readonly CreatineDay[], d: ISODate): CreatineDay | null {
  return list.find((x) => x.d === d) ?? null;
}

/** מסמן יום (מחליף סימון קיים לאותו יום) — `at` = מתי סומן. */
export function markCreatine(list: readonly CreatineDay[], d: ISODate, atIso: string, dose = CREATINE_DOSE_G): CreatineDay[] {
  const rest = list.filter((x) => x.d !== d);
  return sortCreatine([...rest, { d, taken: true, at: atIso, dose_g: dose }]);
}

export function unmarkCreatine(list: readonly CreatineDay[], d: ISODate): CreatineDay[] {
  return list.filter((x) => x.d !== d);
}

/** נגיעה: מסומן → מבוטל, לא מסומן → מסומן עכשיו. */
export function toggleCreatine(list: readonly CreatineDay[], d: ISODate, atIso: string): CreatineDay[] {
  return creatineOn(list, d) ? unmarkCreatine(list, d) : markCreatine(list, d, atIso);
}

export type CreatineWeek = {
  /** ימים שסומנו מבין הימים הנספרים. */
  taken: number;
  /** ימי השבוע מתאריך ההתחלה ואילך (0–7). 0 = השבוע כולו לפני ההתחלה. */
  eligible: number;
  /** שבעה ערכים, מראשון לשבת: מסומן / לא / לפני ההתחלה (null). */
  days: (boolean | null)[];
};

/** ספירה שבועית "קריאטין X/7". ימים לפני 27/9 לא נספרים ולא מוצגים. */
export function creatineWeek(list: readonly CreatineDay[], ws: ISODate, start: ISODate = CREATINE_START): CreatineWeek {
  const days = weekDays(ws).map((d) => (compareISO(d, start) < 0 ? null : creatineOn(list, d) !== null));
  const eligible = days.filter((v) => v !== null).length;
  return { taken: days.filter((v) => v === true).length, eligible, days };
}

/** "08:15" — השעה המקומית של הסימון, או null כשלא ניתן לקרוא. */
export function creatineTimeText(atIso: string): string | null {
  const t = Date.parse(atIso);
  if (!Number.isFinite(t)) return null;
  const d = new Date(t);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
