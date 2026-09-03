/**
 * הגדרות התנהגות של מסך האימון — כל המשכים והדגלים במקום אחד.
 *
 * מה שכאן הוא *מדיניות*, לא נתון: משכי מנוחה, ברירות מחדל של חימום ואירובי,
 * וקפיצת שדה המשקל. תוכן התוכנית (תרגילים, סטים, טווחים) חי ב-program-abc.json.
 * שום קובץ אחר לא מגדיר שניות.
 */

import type { CardioMode, ExerciseType } from '../types';

/**
 * מנוחה בשניות לפי סוג התנועה (`type` בכל תרגיל ב-program-abc.json).
 *
 * `betweenSets` — אחרי כל סט שאינו האחרון.
 * `betweenExercises` — אחרי הסט האחרון של התרגיל, לפני התרגיל הבא.
 * `cardio` הוא חימום/אירובי סיום: אין מנוחה אחריהם.
 */
export const REST_SECONDS: Record<
  ExerciseType,
  { betweenSets: number; betweenExercises: number }
> = {
  compound: { betweenSets: 90, betweenExercises: 90 },
  isolation: { betweenSets: 60, betweenExercises: 90 },
  core: { betweenSets: 60, betweenExercises: 90 },
  cardio: { betweenSets: 0, betweenExercises: 0 },
};

/** אפשרויות האירובי, בסדר ההצגה. */
export const CARDIO_MODES: { id: CardioMode; label: string }[] = [
  { id: 'bike', label: 'אופניים' },
  { id: 'treadmill', label: 'הליכון' },
];

/** חימום — תרגיל 0 בכל אימון. */
export const WARMUP = {
  defaultMode: 'bike' as CardioMode,
  defaultMinutes: 10,
} as const;

/**
 * אירובי סיום — התרגיל האחרון באימון. כלי של שלב 2 בתוכנית (מ-1/11/2026):
 * בנוי, כבוי. הפיכת הדגל ל-true מציגה אותו בלי שינוי קוד נוסף.
 */
export const FINISHER_CARDIO_ENABLED = false;

export const FINISHER_CARDIO = {
  defaultMode: 'bike' as CardioMode,
  defaultMinutes: 0,
} as const;

/** תקרת דקות לשדה החימום/האירובי. */
export const CARDIO_MAX_MINUTES = 120;

/** קפיצת כפתורי ה-± בשדה המשקל, בק"ג. */
export const WEIGHT_STEP = 0.5;

/** כמה ביצועים קודמים מוצגים מעל שדות הקלט של תרגיל. */
export const HISTORY_ROWS = 3;
