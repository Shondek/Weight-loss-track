/** מטא-נתונים של ימי תזונה: "סיימתי לרשום" וארוחת שישי. מודול טהור. */

import type { DayMeta, FridayTier, ISODate } from '../../types';
import { compareISO } from '../date';

export function sortDays(list: readonly DayMeta[]): DayMeta[] {
  return [...list].sort((a, b) => compareISO(a.d, b.d));
}

export function dayMeta(list: readonly DayMeta[], d: ISODate): DayMeta | null {
  return list.find((x) => x.d === d) ?? null;
}

export function isDayClosed(list: readonly DayMeta[], d: ISODate): boolean {
  return dayMeta(list, d)?.closed === true;
}

/** אותו תאריך מתעדכן ולא מכפיל. */
export function upsertDay(list: readonly DayMeta[], meta: DayMeta): DayMeta[] {
  const rest = list.filter((x) => x.d !== meta.d);
  return sortDays([...rest, meta]);
}

/**
 * סגירה / פתיחה של יום. סגירה שומרת את הזמן; פתיחה משאירה את שאר השדות
 * (ארוחת שישי) כמו שהם.
 */
export function setDayClosed(list: readonly DayMeta[], d: ISODate, closed: boolean, nowIso: string): DayMeta[] {
  const current = dayMeta(list, d) ?? { d, closed: false };
  const { closedAt: _drop, ...rest } = current;
  void _drop;
  return upsertDay(list, closed ? { ...rest, closed: true, closedAt: nowIso } : { ...rest, closed: false });
}

/** קובע או מסיר (null) את דרגת ארוחת השישי של היום. `closed` לא משתנה. */
export function setFridayTier(list: readonly DayMeta[], d: ISODate, tier: FridayTier | null): DayMeta[] {
  const current = dayMeta(list, d) ?? { d, closed: false };
  const { fridayTier: _drop, ...rest } = current;
  void _drop;
  return upsertDay(list, tier === null ? rest : { ...rest, fridayTier: tier });
}
