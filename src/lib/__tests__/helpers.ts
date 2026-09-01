/** עזרי בנייה לבדיקות. לא חלק מקוד האפליקציה. */

import type { LoggedExercise, LoggedSet, WorkoutEntry, WorkoutType } from '../../types';
import { exerciseById } from '../../data/program';

/**
 * תרגיל שבוצע, מתוך המפרט שבתוכנית.
 * `values` הם חזרות, או שניות בתרגיל זמן.
 */
export function le(
  exerciseId: string,
  weight: number | null,
  values: (number | null)[],
  over: Partial<LoggedExercise> = {},
): LoggedExercise {
  const spec = exerciseById(exerciseId);
  const timed = spec?.isTimed ?? false;
  const sets: LoggedSet[] = values.map((v) => ({
    weight: timed ? null : weight,
    reps: timed ? null : v,
    seconds: timed ? v : null,
  }));
  return {
    exerciseId,
    n: spec?.name ?? exerciseId,
    sets,
    targetRepMin: spec?.repRangeMin ?? 10,
    targetRepMax: spec?.repRangeMax ?? 12,
    type: spec?.type ?? 'isolation',
    bodyweightOnly: spec?.bodyweightOnly ?? false,
    assisted: spec?.assisted ?? false,
    ...over,
  };
}

export function wk(
  id: string,
  d: string,
  t: WorkoutType,
  ex: LoggedExercise[] = [],
  knee: number | null = null,
  shoulder: number | null = null,
): WorkoutEntry {
  return { schemaVersion: 2, id, d, t, ex, knee, shoulder };
}
