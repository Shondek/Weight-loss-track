/** לוגיקת אימונים. מודול טהור. */

import type {
  ISODate,
  LoggedExercise,
  LoggedSet,
  WorkoutEntry,
  WorkoutType,
} from '../types';
import {
  PROGRAM,
  WORKOUT_TYPES,
  type Exercise,
  exerciseById,
} from '../data/program';
import { compareISO, weekDays } from './date';
import { suggestedNextWeight } from './progression';

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

// ---------- סטים ----------

export function emptySet(): LoggedSet {
  return { weight: null, reps: null, seconds: null };
}

/** האם הסט בוצע. משקל לבדו הוא ברירת מחדל שאוכלסה, לא נתון. */
export function setPerformed(s: LoggedSet): boolean {
  return s.reps !== null || s.seconds !== null;
}

/** החזרות או השניות של הסט — מה שרלוונטי לתרגיל. */
export function setValue(s: LoggedSet): number | null {
  return s.reps ?? s.seconds;
}

/** האם התרגיל בוצע: לפחות סט אחד עם חזרות או שניות. */
export function hasData(ex: LoggedExercise): boolean {
  return ex.sets.some(setPerformed);
}

export function isWorkoutEmpty(entry: WorkoutEntry): boolean {
  return !entry.ex.some(hasData) && entry.knee === null && entry.shoulder === null;
}

/** המשקל האחרון שנרשם בתרגיל — הסט האחרון שיש בו משקל. */
export function lastWeightOf(ex: LoggedExercise): number | null {
  for (let i = ex.sets.length - 1; i >= 0; i--) {
    const w = ex.sets[i]?.weight;
    if (w !== null && w !== undefined) return w;
  }
  return null;
}

// ---------- היסטוריה לפי תרגיל ----------

export type ExerciseHistory = { d: ISODate; workoutId: string; ex: LoggedExercise };

/**
 * הרישום האחרון של תרגיל לפי מזהה.
 *
 * המזהה, ולא השם, הוא מה שמקשר היסטוריה: תרגיל ששמו השתנה בתוכנית עדיין
 * מוצא את הביצועים הקודמים שלו (ראה `EXERCISE_ALIASES` ב-data/program.ts).
 * `excludeId` מאפשר להתעלם מהאימון שנערך כרגע.
 */
export function lastExercise(
  list: readonly WorkoutEntry[],
  exerciseId: string,
  excludeId?: string,
): ExerciseHistory | null {
  let best: ExerciseHistory | null = null;
  for (const w of list) {
    if (excludeId !== undefined && w.id === excludeId) continue;
    for (const ex of w.ex) {
      if (ex.exerciseId !== exerciseId) continue;
      if (!hasData(ex)) continue;
      if (
        !best ||
        compareISO(w.d, best.d) > 0 ||
        (w.d === best.d && w.id > best.workoutId)
      ) {
        best = { d: w.d, workoutId: w.id, ex };
      }
    }
  }
  return best;
}

/**
 * הרישום שקדם לאימון נתון באותו תרגיל.
 * דרוש כדי לזהות כישלון שני ברצף — הכלל שמפעיל ירידה מדרגה.
 */
export function previousRecord(
  list: readonly WorkoutEntry[],
  exerciseId: string,
  before: { d: ISODate; id: string },
): ExerciseHistory | null {
  let best: ExerciseHistory | null = null;
  for (const w of list) {
    if (w.id === before.id) continue;
    const isEarlier =
      compareISO(w.d, before.d) < 0 || (w.d === before.d && w.id < before.id);
    if (!isEarlier) continue;
    for (const ex of w.ex) {
      if (ex.exerciseId !== exerciseId || !hasData(ex)) continue;
      if (
        !best ||
        compareISO(w.d, best.d) > 0 ||
        (w.d === best.d && w.id > best.workoutId)
      ) {
        best = { d: w.d, workoutId: w.id, ex };
      }
    }
  }
  return best;
}

/** כל הרישומים של תרגיל, מהישן לחדש. משמש למגמה בהיסטוריה. */
export function exerciseHistory(
  list: readonly WorkoutEntry[],
  exerciseId: string,
): ExerciseHistory[] {
  const out: ExerciseHistory[] = [];
  for (const w of sortWorkouts(list)) {
    for (const ex of w.ex) {
      if (ex.exerciseId === exerciseId && hasData(ex)) {
        out.push({ d: w.d, workoutId: w.id, ex });
      }
    }
  }
  return out;
}

// ---------- בניית אימון ----------

/** שורת תרגיל ריקה לפי המפרט, עם משקל התחלתי אופציונלי. */
export function blankLoggedExercise(
  spec: Exercise,
  weight: number | null = null,
): LoggedExercise {
  const usesWeight = !spec.isTimed && !spec.bodyweightOnly;
  return {
    exerciseId: spec.id,
    n: spec.name,
    sets: Array.from({ length: spec.sets }, () => ({
      weight: usesWeight ? weight : null,
      reps: null,
      seconds: null,
    })),
    targetRepMin: spec.repRangeMin,
    targetRepMax: spec.repRangeMax,
    type: spec.type,
    bodyweightOnly: spec.bodyweightOnly,
    assisted: spec.assisted,
  };
}

/** שורות תרגילים ריקות לאימון חדש מסוג נתון. */
export function blankExercises(t: WorkoutType): LoggedExercise[] {
  return PROGRAM[t].map((spec) => blankLoggedExercise(spec));
}

/**
 * המשקל שאיתו לפתוח את התרגיל בפעם הבאה: מה שנרשם לאחרונה, ועוד התוספת
 * אם ההמלצה מהאימון הקודם הייתה לעלות. null כשאין על מה להתבסס.
 */
export function openingWeight(
  list: readonly WorkoutEntry[],
  exerciseId: string,
  excludeId?: string,
): number | null {
  const last = lastExercise(list, exerciseId, excludeId);
  if (!last) return null;
  const before = previousRecord(list, exerciseId, {
    d: last.d,
    id: last.workoutId,
  });
  return suggestedNextWeight(last.ex, before?.ex ?? null);
}

/**
 * שורות תרגילים לאימון חדש, כשהמשקל מאוכלס מהרישום האחרון — כולל
 * ההעלאה שההמלצה הקודמת הציעה. המטרה: לאשר או לשנות, לא להקליד מחדש.
 * החזרות תמיד ריקות — המשקל לבדו אינו נחשב נתון (ראה `hasData`), ולכן
 * אימון כזה עדיין נחשב ריק.
 */
export function prefilledExercises(
  list: readonly WorkoutEntry[],
  t: WorkoutType,
): LoggedExercise[] {
  return PROGRAM[t].map((spec) =>
    blankLoggedExercise(spec, openingWeight(list, spec.id)),
  );
}

/**
 * שורות התרגילים להצגה באימון: תרגילי התוכנית לפי סדרן, ואחריהן תרגילים
 * שנרשמו בעבר ואינם בתוכנית הנוכחית — כדי שהיסטוריה לא תיעלם מהמסך.
 */
export function exercisesFor(
  entry: WorkoutEntry,
  all: readonly WorkoutEntry[],
): LoggedExercise[] {
  const byId = new Map(entry.ex.map((e) => [e.exerciseId, e]));
  const rows = PROGRAM[entry.t].map((spec) => {
    const existing = byId.get(spec.id);
    if (existing) return withSetCount(existing, spec.sets);
    return blankLoggedExercise(spec, openingWeight(all, spec.id, entry.id));
  });
  const planned = new Set(PROGRAM[entry.t].map((s) => s.id));
  for (const e of entry.ex) {
    if (!planned.has(e.exerciseId) && hasData(e)) rows.push(e);
  }
  return rows;
}

/**
 * משלים את מספר הסטים לזה שבתוכנית. רשומות נשמרות בלי סטים ריקים בסוף,
 * ולכן צריך להרחיב אותן חזרה לתצוגה — בלי לקצץ אם נרשמו יותר.
 */
export function withSetCount(ex: LoggedExercise, count: number): LoggedExercise {
  if (ex.sets.length >= count) return ex;
  return {
    ...ex,
    sets: [
      ...ex.sets,
      ...Array.from({ length: count - ex.sets.length }, () => emptySet()),
    ],
  };
}

// ---------- מזהים וכאב ----------

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

/** האם התרגיל הוא תרגיל זמן, לפי המפרט הנוכחי. */
export function isTimedExercise(ex: LoggedExercise): boolean {
  return exerciseById(ex.exerciseId)?.isTimed ?? ex.sets.some((s) => s.seconds !== null);
}
