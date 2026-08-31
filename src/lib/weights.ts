/**
 * לוגיקת משקל ומותניים. מודול טהור.
 *
 * העיקרון שמקודד כאן: החלטות מתקבלות רק מממוצע שבועי של 7 שקילות.
 * `WeekSummary.complete` הוא השער — כל השוואה בין שבועות עוברת דרכו.
 */

import type { ISODate, WaistEntry, WeightEntry } from '../types';
import { addDays, compareISO, diffDays, weekDays, weekStart } from './date';
import { mean, round2 } from './format';

export const WEEK_LENGTH = 7;

export type WeekSummary = {
  weekStart: ISODate;
  /** שבעה ערכים, מראשון לשבת. null = לא נשקל. */
  days: (number | null)[];
  /** כמה שקילות נרשמו מתוך 7. */
  count: number;
  /** ממוצע מעוגל ל-2 ספרות, או null אם אין אף שקילה. */
  avg: number | null;
  /** true רק ב-7 מתוך 7. */
  complete: boolean;
};

export type WeekChange = {
  /** חיובי = ירידה במשקל. */
  drop: number;
  /** אחוז ממשקל הגוף של השבוע הקודם. תמיד אי-שלילי. */
  pct: number;
  direction: 'down' | 'up' | 'same';
};

export function sortWeights(list: readonly WeightEntry[]): WeightEntry[] {
  return [...list].sort((a, b) => compareISO(a.d, b.d));
}

/** הזנה חוזרת לאותו תאריך מעדכנת ולא מכפילה. */
export function upsertWeight(
  list: readonly WeightEntry[],
  entry: WeightEntry,
): WeightEntry[] {
  const rest = list.filter((e) => e.d !== entry.d);
  return sortWeights([...rest, entry]);
}

export function removeWeight(list: readonly WeightEntry[], d: ISODate): WeightEntry[] {
  return list.filter((e) => e.d !== d);
}

/** השקילה האחרונה לפי תאריך. */
export function lastWeight(list: readonly WeightEntry[]): WeightEntry | null {
  let best: WeightEntry | null = null;
  for (const e of list) if (!best || compareISO(e.d, best.d) > 0) best = e;
  return best;
}

export function summarizeWeek(
  list: readonly WeightEntry[],
  ws: ISODate,
): WeekSummary {
  const byDate = new Map(list.map((e) => [e.d, e.w]));
  const days = weekDays(ws).map((d) => byDate.get(d) ?? null);
  const present = days.filter((v): v is number => v !== null);
  const avg = mean(present);
  return {
    weekStart: ws,
    days,
    count: present.length,
    avg: avg === null ? null : round2(avg),
    complete: present.length === WEEK_LENGTH,
  };
}

/**
 * סיכום לכל שבוע מהשבוע של השקילה הראשונה ועד השבוע של האחרונה, ברצף.
 * שבועות בלי אף שקילה נכללים (count 0) כדי שלא ייווצר "חור" סמוי בגרף.
 */
export function weeklyAverages(list: readonly WeightEntry[]): WeekSummary[] {
  const sorted = sortWeights(list);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  if (!first || !last) return [];

  const out: WeekSummary[] = [];
  let ws = weekStart(first.d);
  const end = weekStart(last.d);
  // גבול ביטחון: 20 שנה של שבועות.
  for (let i = 0; i < 1100 && compareISO(ws, end) <= 0; i++) {
    out.push(summarizeWeek(sorted, ws));
    ws = addDays(ws, 7);
  }
  return out;
}

/**
 * שינוי בין שני שבועות. מחזיר null אם אחד מהם אינו מלא —
 * זו הנקודה היחידה שבה מותר לגזור מסקנה מהשוואה.
 */
export function weekChange(
  current: WeekSummary,
  previous: WeekSummary | null | undefined,
): WeekChange | null {
  if (!previous) return null;
  if (!current.complete || !previous.complete) return null;
  if (current.avg === null || previous.avg === null) return null;

  const drop = round2(previous.avg - current.avg);
  const pct = previous.avg === 0 ? 0 : round2(Math.abs(drop / previous.avg) * 100);
  return {
    drop: Math.abs(drop),
    pct,
    direction: drop > 0 ? 'down' : drop < 0 ? 'up' : 'same',
  };
}

/** הימים בשבוע שאין בהם שקילה, עד ליום `upto` ועד בכלל. */
export function missingWeighDays(
  list: readonly WeightEntry[],
  ws: ISODate,
  upto: ISODate,
): ISODate[] {
  const byDate = new Set(list.map((e) => e.d));
  return weekDays(ws).filter((d) => compareISO(d, upto) <= 0 && !byDate.has(d));
}

// ---------- מותניים ----------

export function sortWaist(list: readonly WaistEntry[]): WaistEntry[] {
  return [...list].sort((a, b) => compareISO(a.d, b.d));
}

export function upsertWaist(
  list: readonly WaistEntry[],
  entry: WaistEntry,
): WaistEntry[] {
  const rest = list.filter((e) => e.d !== entry.d);
  return sortWaist([...rest, entry]);
}

export function removeWaist(list: readonly WaistEntry[], d: ISODate): WaistEntry[] {
  return list.filter((e) => e.d !== d);
}

export function lastWaist(list: readonly WaistEntry[]): WaistEntry | null {
  let best: WaistEntry | null = null;
  for (const e of list) if (!best || compareISO(e.d, best.d) > 0) best = e;
  return best;
}

/** המדידה האחרונה בתוך שבוע נתון. */
export function waistInWeek(
  list: readonly WaistEntry[],
  ws: ISODate,
): WaistEntry | null {
  const days = new Set(weekDays(ws));
  let best: WaistEntry | null = null;
  for (const e of list) {
    if (!days.has(e.d)) continue;
    if (!best || compareISO(e.d, best.d) > 0) best = e;
  }
  return best;
}

/** המדידה האחרונה שקדמה לשבוע נתון. */
export function waistBeforeWeek(
  list: readonly WaistEntry[],
  ws: ISODate,
): WaistEntry | null {
  let best: WaistEntry | null = null;
  for (const e of list) {
    if (compareISO(e.d, ws) >= 0) continue;
    if (!best || compareISO(e.d, best.d) > 0) best = e;
  }
  return best;
}

export const WAIST_REMINDER_DAYS = 7;

/** מספר הימים מאז המדידה האחרונה, או null אם אף פעם לא נמדד. */
export function daysSinceWaist(
  list: readonly WaistEntry[],
  today: ISODate,
): number | null {
  const last = lastWaist(list);
  return last ? diffDays(last.d, today) : null;
}
