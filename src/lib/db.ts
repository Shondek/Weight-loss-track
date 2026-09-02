/** גזירות שחוצות טבלאות. מודול טהור. */

import type { DB, ISODate, LegacyWorkout } from '../types';
import { compareISO, weekStart } from './date';
import { upsertCheckin } from './checkins';
import { upsertWaist, upsertWeight } from './weights';
import { upsertWorkout } from './workouts';

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

/** כמה רשומות נתונים יש בסך הכול. הגדרות אינן רשומה. */
export function recordCount(db: DB): number {
  return db.weights.length + db.workouts.length + db.waist.length + db.checkins.length;
}

/** המאוחר מבין שני תאריכים, או מה שקיים כשאחד מהם חסר. */
function laterOf(a: ISODate | null, b: ISODate | null): ISODate | null {
  if (a === null) return b;
  if (b === null) return a;
  return compareISO(a, b) >= 0 ? a : b;
}

/**
 * מיזוג ייבוא לתוך הנתונים הקיימים. הרשומה המיובאת גוברת על התנגשות:
 * משקל ומותניים לפי תאריך, אימון לפי מזהה, צ'ק-אין לפי שבוע.
 * שום דבר קיים לא נמחק — לכן ייבוא בטעות אינו מאבד נתונים.
 *
 * הגדרות מתמזגות שדה-שדה: תחילת התוכנית מהקובץ אם יש בו כזו, הצליל הוא
 * העדפת מכשיר ונשאר מקומי, ותאריך הגיבוי הוא המאוחר מבין השניים.
 */
export function mergeDb(current: DB, incoming: DB): DB {
  let weights = current.weights;
  for (const e of incoming.weights) weights = upsertWeight(weights, e);

  let waist = current.waist;
  for (const e of incoming.waist) waist = upsertWaist(waist, e);

  let workouts = current.workouts;
  for (const e of incoming.workouts) workouts = upsertWorkout(workouts, e);

  let checkins = current.checkins;
  for (const c of incoming.checkins) checkins = upsertCheckin(checkins, c);

  return {
    weights,
    waist,
    workouts,
    legacyWorkouts: mergeLegacy(current.legacyWorkouts, incoming.legacyWorkouts),
    checkins,
    settings: {
      programStart: incoming.settings.programStart ?? current.settings.programStart,
      soundEnabled: current.settings.soundEnabled,
      lastBackup: laterOf(current.settings.lastBackup, incoming.settings.lastBackup),
    },
  };
}

/** רשומות גולמיות אין להן מזהה — כפילות מזוהה לפי תוכן זהה. */
function mergeLegacy(current: LegacyWorkout[], incoming: LegacyWorkout[]): LegacyWorkout[] {
  const fingerprint = (l: LegacyWorkout): string | null => {
    try {
      return JSON.stringify(l.raw) ?? null;
    } catch {
      return null;
    }
  };
  const seen = new Set(current.map(fingerprint).filter((f): f is string => f !== null));
  const out = [...current];
  for (const l of incoming) {
    const f = fingerprint(l);
    if (f !== null && seen.has(f)) continue;
    if (f !== null) seen.add(f);
    out.push(l);
  }
  return out;
}
