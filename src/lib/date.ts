/**
 * לוגיקת זמן. מודול טהור — בלי DOM ובלי אחסון.
 *
 * שני כללים שאסור לשבור:
 *  1. אסור `toISOString()` לצורך מפתח תאריך. הוא ממיר ל-UTC ומזיז את היום.
 *     `toLocalISO()` הוא הדרך היחידה לייצר מפתח תאריך.
 *  2. שבוע = ראשון 00:00 עד שבת 23:59. `weekStart(d) = d - d.getDay()`.
 *
 * ייצוג פנימי: כל `ISODate` נבנה חזרה ל-`Date` בשעה 12:00 מקומית. עוגן הצהריים
 * מבטיח שהוספת ימים ומעבר שעון קיץ/חורף לעולם לא יגלשו ליום שכן, גם באזורי
 * זמן שבהם חצות עצמה מדולגת במעבר שעון.
 */

import type { ISODate } from '../types';

const NOON = 12;

/** מפתח תאריך מקומי מתוך Date. זו הפונקציה היחידה שמייצרת ISODate. */
export function toLocalISO(date: Date): ISODate {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Date מקומי בשעה 12:00 מתוך מפתח תאריך. */
export function fromISO(iso: ISODate): Date {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
  return new Date(y, m - 1, d, NOON, 0, 0, 0);
}

export function isValidISO(value: unknown): value is ISODate {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = fromISO(value);
  return !Number.isNaN(d.getTime()) && toLocalISO(d) === value;
}

/** התאריך המקומי של עכשיו. הפרמטר קיים כדי שאפשר יהיה לבדוק אותו. */
export function today(now: Date = new Date()): ISODate {
  return toLocalISO(now);
}

export function addDays(iso: ISODate, days: number): ISODate {
  const d = fromISO(iso);
  d.setDate(d.getDate() + days);
  return toLocalISO(d);
}

/** מספר הימים מ-a ל-b (b - a). חסין לשעון קיץ בזכות עוגן הצהריים. */
export function diffDays(a: ISODate, b: ISODate): number {
  const ms = fromISO(b).getTime() - fromISO(a).getTime();
  return Math.round(ms / 86_400_000);
}

/** השוואה לקסיקוגרפית — תקפה כי הפורמט הוא YYYY-MM-DD. */
export function compareISO(a: ISODate, b: ISODate): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** 0 = ראשון … 6 = שבת */
export function dayOfWeek(iso: ISODate): number {
  return fromISO(iso).getDay();
}

/** הראשון שפותח את השבוע של התאריך. */
export function weekStart(iso: ISODate): ISODate {
  return addDays(iso, -dayOfWeek(iso));
}

/** השבת שסוגרת את השבוע של התאריך. */
export function weekEnd(iso: ISODate): ISODate {
  return addDays(weekStart(iso), 6);
}

/** שבעת הימים של השבוע, מראשון לשבת. */
export function weekDays(startIso: ISODate): ISODate[] {
  const out: ISODate[] = [];
  for (let i = 0; i < 7; i++) out.push(addDays(startIso, i));
  return out;
}

export function isSameWeek(a: ISODate, b: ISODate): boolean {
  return weekStart(a) === weekStart(b);
}

export function isSaturday(iso: ISODate): boolean {
  return dayOfWeek(iso) === 6;
}

/** מספר השבועות השלמים בין שני ראשונים (b - a). */
export function diffWeeks(aWeekStart: ISODate, bWeekStart: ISODate): number {
  return Math.round(diffDays(aWeekStart, bWeekStart) / 7);
}

/** מספר השבוע בתוכנית. שבוע ההתחלה הוא 1. */
export function weekNumber(programStart: ISODate, week: ISODate): number {
  return diffWeeks(weekStart(programStart), weekStart(week)) + 1;
}

// ---- תצוגה ----

const DAY_LETTERS = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'] as const;
const DAY_NAMES = [
  'ראשון',
  'שני',
  'שלישי',
  'רביעי',
  'חמישי',
  'שישי',
  'שבת',
] as const;

export function dayLetter(iso: ISODate): string {
  return DAY_LETTERS[dayOfWeek(iso)] ?? '';
}

export function dayName(iso: ISODate): string {
  return DAY_NAMES[dayOfWeek(iso)] ?? '';
}

/** "05/09" */
export function formatDM(iso: ISODate): string {
  const [, m, d] = iso.split('-') as [string, string, string];
  return `${d}/${m}`;
}

/** "05/09/2026" */
export function formatDMY(iso: ISODate): string {
  const [y, m, d] = iso.split('-') as [string, string, string];
  return `${d}/${m}/${y}`;
}

/** "30/08–05/09" */
export function weekRangeLabel(startIso: ISODate): string {
  return `${formatDM(startIso)}–${formatDM(addDays(startIso, 6))}`;
}

/** מספר המילישניות עד חצות המקומית הבאה. משמש לרענון "השבוע הנוכחי". */
export function msUntilNextMidnight(now: Date = new Date()): number {
  const next = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + 1,
    0,
    0,
    2,
    0,
  );
  return Math.max(1000, next.getTime() - now.getTime());
}
