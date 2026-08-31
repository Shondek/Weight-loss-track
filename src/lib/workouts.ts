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
      // תרגיל בלי אף חזרה לא בוצע, ולכן אינו "האחרון".
      if (!ex.r.some((x) => x !== null)) continue;
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

/**
 * שורות תרגילים לאימון חדש, כשהמשקל מאוכלס מהרישום האחרון של כל תרגיל.
 * המטרה: לאשר או לשנות, לא להקליד מחדש. החזרות תמיד ריקות — המשקל לבדו
 * אינו נחשב נתון (ראה hasData), ולכן אימון כזה עדיין נחשב ריק.
 */
export function prefilledExercises(
  list: readonly WorkoutEntry[],
  t: WorkoutType,
): ExerciseLog[] {
  return PROGRAM[t].map((spec) => ({
    n: spec.n,
    w: spec.kind === 'time' ? null : (lastExercise(list, spec.n)?.w ?? null),
    r: [null, null, null],
  }));
}

/**
 * האם התרגיל בוצע. נדרשת לפחות חזרה אחת: המשקל לבדו הוא ברירת מחדל
 * שמולאה מההיסטוריה, לא נתון שהמשתמש רשם.
 */
export function hasData(ex: ExerciseLog): boolean {
  return ex.r.some((v) => v !== null);
}

export function isWorkoutEmpty(entry: WorkoutEntry): boolean {
  return (
    !entry.ex.some(hasData) && entry.knee === null && entry.shoulder === null
  );
}

/**
 * חותמת זמן בבסיס 36 ברוחב קבוע, כך שהשוואת מחרוזות שווה להשוואת זמן.
 * הריפוד לרוחב קבוע הוא מה שמבטיח את זה: בלעדיו מחרוזת קצרה יותר הייתה
 * מסודרת לפני ארוכה ממנה גם אם היא מאוחרת. תשעה תווים מספיקים עד שנת 5138.
 */
export function sortableStamp(nowMs: number): string {
  return Math.max(0, Math.floor(nowMs)).toString(36).padStart(9, '0');
}

/**
 * מזהה אימון. הייחודיות מגיעה מבחוץ כדי שהמודול יישאר טהור.
 * `unique` צריך להתחיל ב-sortableStamp כדי ששני אימונים באותו יום יסודרו
 * לפי סדר היצירה — זה מה שקובע מי "הבא בתור" בסבב.
 */
export function makeWorkoutId(d: ISODate, t: WorkoutType, unique: string): string {
  return `${d}-${unique}-${t}`;
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
