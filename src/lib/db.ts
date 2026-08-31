/** גזירות שחוצות טבלאות. מודול טהור. */

import type { DB, ISODate } from '../types';
import { compareISO, weekStart } from './date';

/** התאריך המוקדם ביותר שיש עליו נתון כלשהו. */
export function firstDataDate(db: DB): ISODate | null {
  let best: ISODate | null = null;
  const take = (d: ISODate) => {
    if (!best || compareISO(d, best) < 0) best = d;
  };
  for (const e of db.weights) take(e.d);
  for (const e of db.workouts) take(e.d);
  for (const e of db.waist) take(e.d);
  for (const c of db.checkins) take(c.weekStart);
  return best;
}

/**
 * הראשון של שבוע 1 בתוכנית. ההגדרה הידנית גוברת; אחרת נגזר מהנתון הראשון.
 * שומר על מספור שבועות יציב בדוח.
 */
export function programStartWeek(db: DB): ISODate | null {
  if (db.settings.programStart) return weekStart(db.settings.programStart);
  const first = firstDataDate(db);
  return first ? weekStart(first) : null;
}
