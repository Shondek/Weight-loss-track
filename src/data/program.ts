/**
 * תוכנית האימונים. הקובץ היחיד שמגדיר תרגילים, טווחי חזרות ותוספות משקל.
 * הקומפוננטות לא יודעות דבר על תרגילים — הן קוראות מכאן.
 *
 * לשנות תרגיל, טווח או תוספת? רק כאן.
 */

import type { WorkoutType } from '../types';

export type ExerciseKind = 'reps' | 'time';

export type ExerciseSpec = {
  /** השם המלא. חייב להישאר יציב — הוא המפתח להיסטוריה של התרגיל. */
  n: string;
  /** שם קצר לדוח הצ'ט, שבו יש תקרת תווים. */
  short: string;
  kind: ExerciseKind;
  /** טווח היעד. עבור kind='time' — שניות. */
  min: number;
  max: number;
  /** קפיצת המשקל בכפתורי −/+. */
  step: number;
  /** התוספת המומלצת כשהטווח הושלם בכל שלושת הסטים. */
  increment: number;
};

const MACHINE = { kind: 'reps', min: 8, max: 12, step: 2.5, increment: 5 } as const;
const DUMBBELL = { kind: 'reps', min: 10, max: 15, step: 2.5, increment: 2.5 } as const;
const TIMED = { kind: 'time', min: 30, max: 60, step: 2.5, increment: 0 } as const;

export const PROGRAM: Record<WorkoutType, ExerciseSpec[]> = {
  A: [
    { n: 'לג פרס', short: 'לג פרס', ...MACHINE },
    { n: 'לחיצת חזה במכונה', short: 'לחיצת חזה', ...MACHINE },
    { n: 'חתירת כבל בישיבה', short: 'חתירת כבל', ...MACHINE },
    { n: 'RDL משקולות יד', short: 'RDL', ...DUMBBELL },
    { n: 'פייס פול', short: 'פייס פול', ...DUMBBELL },
    { n: 'פלאנק', short: 'פלאנק', ...TIMED },
  ],
  B: [
    { n: 'הרמת אגן', short: 'הרמת אגן', ...MACHINE },
    { n: 'פולי עליון', short: 'פולי עליון', ...MACHINE },
    { n: 'לחיצת חזה משקולות שיפוע 30°', short: 'לחיצת חזה שיפוע', ...DUMBBELL },
    { n: 'כפיפת ברכיים', short: 'כפיפת ברכיים', ...MACHINE },
    { n: 'כפיפת ופשיטת מרפקים', short: 'מרפקים', ...DUMBBELL },
    { n: 'Dead bug', short: 'Dead bug', ...TIMED },
  ],
  C: [
    { n: 'סקוואט גובלט לספסל', short: 'סקוואט גובלט', ...DUMBBELL },
    { n: 'חתירה נתמכת חזה', short: 'חתירה נתמכת', ...MACHINE },
    { n: 'לחיצת חזה במכונה', short: 'לחיצת חזה', ...MACHINE },
    { n: 'מכרעים בולגריים', short: 'בולגריים', ...DUMBBELL },
    { n: 'הרמות עגל', short: 'הרמות עגל', ...DUMBBELL },
    { n: 'פלאנק צד', short: 'פלאנק צד', ...TIMED },
  ],
};

export const WORKOUT_TYPES: WorkoutType[] = ['A', 'B', 'C'];

/** כמה אימונים בשבוע התוכנית מצפה להם. משמש לספירה "n/3" ולסעיף "חסר". */
export const WORKOUTS_PER_WEEK = 3;

/** תזכורת קבועה בראש מסך האימונים. תזכורת, לא הגדרה — אין לה השפעה על הלוגיקה. */
export const CONSTRAINTS =
  'ברך — בלי כריעה מתחת ל-90°, בלי קפיצות. כתף — בלי לחיצה מעל הראש, מרפקים 45°.';

const SPEC_INDEX: Map<string, ExerciseSpec> = new Map(
  WORKOUT_TYPES.flatMap((t) => PROGRAM[t].map((e) => [e.n, e] as const)),
);

/** מפרט התרגיל לפי שם, כולל תרגילים שנרשמו בגרסה ישנה ואינם בתוכנית. */
export function specFor(name: string): ExerciseSpec | undefined {
  return SPEC_INDEX.get(name);
}

/** שם קצר לדוח. תרגיל לא מוכר נשאר עם שמו המלא. */
export function shortName(name: string): string {
  return SPEC_INDEX.get(name)?.short ?? name;
}

export function isTimed(name: string): boolean {
  return SPEC_INDEX.get(name)?.kind === 'time';
}
