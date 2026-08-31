/** לוגיקת הצ'ק-אין השבועי. מודול טהור. */

import type { ISODate, WeeklyCheckin } from '../types';
import { addDays, compareISO, isSaturday, weekStart } from './date';

export function emptyCheckin(ws: ISODate): WeeklyCheckin {
  return {
    weekStart: ws,
    adherence: null,
    hunger: null,
    energy: null,
    sleepHours: null,
    unplannedSnackDays: null,
    note: '',
  };
}

export function getCheckin(
  list: readonly WeeklyCheckin[],
  ws: ISODate,
): WeeklyCheckin | null {
  return list.find((c) => c.weekStart === ws) ?? null;
}

export function upsertCheckin(
  list: readonly WeeklyCheckin[],
  c: WeeklyCheckin,
): WeeklyCheckin[] {
  const rest = list.filter((x) => x.weekStart !== c.weekStart);
  return [...rest, c].sort((a, b) => compareISO(a.weekStart, b.weekStart));
}

export function removeCheckin(
  list: readonly WeeklyCheckin[],
  ws: ISODate,
): WeeklyCheckin[] {
  return list.filter((c) => c.weekStart !== ws);
}

/** צ'ק-אין ריק לגמרי נחשב כאילו לא נעשה. */
export function isFilled(c: WeeklyCheckin | null): boolean {
  if (!c) return false;
  return (
    c.adherence !== null ||
    c.hunger !== null ||
    c.energy !== null ||
    c.sleepHours !== null ||
    c.unplannedSnackDays !== null ||
    c.note.trim() !== ''
  );
}

/**
 * האם לסמן את טאב הצ'ק-אין.
 * נכון בשבת אם השבוע הנוכחי עדיין לא מולא, או אם השבוע הקודם נסגר בלי צ'ק-אין.
 * `firstDataDate` מונע התראה על שבועות שקדמו לתחילת השימוש.
 */
export function needsCheckin(
  list: readonly WeeklyCheckin[],
  today: ISODate,
  firstDataDate: ISODate | null = null,
): boolean {
  const thisWeek = weekStart(today);
  if (isSaturday(today) && !isFilled(getCheckin(list, thisWeek))) return true;

  const prevWeek = addDays(thisWeek, -7);
  if (isFilled(getCheckin(list, prevWeek))) return false;
  // אין נתונים מהשבוע הקודם — אין על מה לעשות צ'ק-אין.
  if (!firstDataDate) return false;
  return compareISO(firstDataDate, addDays(prevWeek, 6)) <= 0;
}
