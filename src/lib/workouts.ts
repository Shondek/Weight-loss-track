/** לוגיקת אימונים. מודול טהור. */

import type { ExerciseLog, ISODate, WorkoutEntry, WorkoutType } from '../types';
import { PROGRAM, WORKOUT_TYPES, specFor } from '../data/program';
import { compareISO, weekDays } from './date';

export function sortWorkouts(list: readonly WorkoutEntry[]): WorkoutEntry[] {
  return [...list].sort(
    (a, b) => compareISO(a.d, b.d) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
}

export function upsertWorkout(
  list: readonly WorkoutEntry[],
  entry: WorkoutEntry,
): WorkoutEntry[] {
  const rest = list.filter((w) => w.id !== entry.id);
  return sortWorkouts([...rest, entry]);
}

export function removeWorkout(
  list: readonly WorkoutEntry[],
  id: string,
): WorkoutEntry[] {
  return list.filter((w) => w.id !== id);
}

export function workoutsInWeek(
  list: readonly WorkoutEntry[],
  ws: ISODate,
): WorkoutEntry[] {
  const days = new Set(weekDays(ws));
  return sortWorkouts(list.filter((w) => days.has(w.d)));
}

/** האימון האחרון שנרשם, לפי תאריך ואז לפי סדר יציב. */
export function lastWorkout(list: readonly WorkoutEntry[]): WorkoutEntry | null {
  const sorted = sortWorkouts(list);
  return sorted[sorted.length - 1] ?? null;
}

/** הבא בסבב A→B→C מהאימון האחרון שנרשם. בלי היסטוריה — A. */
export function nextType(list: readonly WorkoutEntry[]): WorkoutType {
  const last = lastWorkout(list);
  if (!last) return 'A';
  const i = WORKOUT_TYPES.indexOf(last.t);
  return WORKOUT_TYPES[(i + 1) % WORKOUT_TYPES.length] ?? 'A';
}

export type ExerciseHistory = { d: ISODate; w: number | null; r: (number | null)[] };

/**
 * הרישום האחרון של תרגיל לפי שם, כדי לאכלס ברירת מחדל.
 * `excludeId` מאפשר להתעלם מהאימון שנערך כרגע.
 */
export function lastExercise(
  list: readonly WorkoutEntry[],
  name: string,
  excludeId?: string,
): ExerciseHistory | null {
  let best: { entry: WorkoutEntry; ex: ExerciseLog } | null = null;
  for (const w of list) {
    if (excludeId !== undefined && w.id === excludeId) continue;
    for (const ex of w.ex) {
      if (ex.n !== name) continue;
      // מתעלמים מרישום ריק לגמרי — הוא לא "המשקל האחרון".
      if (ex.w === null && ex.r.every((x) => x === null)) continue;
      if (
        !best ||
        compareISO(w.d, best.entry.d) > 0 ||
        (w.d === best.entry.d && w.id > best.entry.id)
      ) {
        best = { entry: w, ex };
      }
    }
  }
  return best ? { d: best.entry.d, w: best.ex.w, r: [...best.ex.r] } : null;
}

/** האם שלושת הסטים הגיעו לתקרת הטווח. תצוגה בלבד — לא משנה נתונים. */
export function rangeComplete(sets: readonly (number | null)[], max: number): boolean {
  const filled = sets.slice(0, 3);
  if (filled.length < 3) return false;
  return filled.every((v) => v !== null && v >= max);
}

/**
 * ההצעה להתקדמות כפולה לתרגיל, או null אם אין.
 * זו תצוגה בלבד: האפליקציה לעולם לא משנה את המשקל בעצמה.
 */
export function progressionHint(ex: ExerciseLog): string | null {
  const spec = specFor(ex.n);
  if (!spec) return null;
  if (!rangeComplete(ex.r, spec.max)) return null;
  if (spec.kind === 'time') return `טווח הושלם — הארך את הזמן בפעם הבאה`;
  return `טווח הושלם — +${spec.increment} ק"ג בפעם הבאה`;
}

/** שורות תרגילים ריקות לאימון חדש מסוג נתון. */
export function blankExercises(t: WorkoutType): ExerciseLog[] {
  return PROGRAM[t].map((spec) => ({ n: spec.n, w: null, r: [null, null, null] }));
}

/** האם התרגיל נרשם בכלל (יש משקל או לפחות סט אחד). */
export function hasData(ex: ExerciseLog): boolean {
  return ex.w !== null || ex.r.some((v) => v !== null);
}

export function isWorkoutEmpty(entry: WorkoutEntry): boolean {
  return (
    !entry.ex.some(hasData) && entry.knee === null && entry.shoulder === null
  );
}

/** מזהה אימון. הייחודיות מגיעה מבחוץ כדי שהמודול יישאר טהור. */
export function makeWorkoutId(d: ISODate, t: WorkoutType, unique: string): string {
  return `${d}-${t}-${unique}`;
}

/** כאב הכי גבוה שנרשם בקבוצת אימונים. null אם לא נרשם כלל. */
export function peakPain(
  list: readonly WorkoutEntry[],
  field: 'knee' | 'shoulder',
): number | null {
  let max: number | null = null;
  for (const w of list) {
    const v = w[field];
    if (v === null) continue;
    if (max === null || v > max) max = v;
  }
  return max;
}
