/**
 * הגדרות התנהגות של מסך האימון — כל המשכים והדגלים במקום אחד.
 *
 * מה שכאן הוא *מדיניות*, לא נתון: משכי מנוחה, ברירות מחדל של חימום ואירובי,
 * וקפיצת שדה המשקל. תוכן התוכנית (תרגילים, סטים, טווחים) חי ב-program-abc.json.
 * שום קובץ אחר לא מגדיר שניות.
 */

import type { CardioMode, ExerciseType, ISODate } from '../types';

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
 * אירובי סיום — התרגיל האחרון בכל אימון. השורה תמיד קיימת וריקה עד
 * שלוחצים "התחל" (ראה `hasData`); אימון בלי אירובי פשוט לא רושם אותה.
 * הדקות/שיפוע/מהירות ממולאים מהאירובי האחרון שנרשם; אלה ברירות המחדל
 * כשאין כזה.
 */
export const FINISHER_CARDIO = {
  defaultMode: 'bike' as CardioMode,
  defaultMinutes: 30,
} as const;

/** אירובי עצמאי — הכרטיס הרביעי במסך אימונים. אינו אימון. */
export const STANDALONE_CARDIO = {
  defaultMode: 'treadmill' as CardioMode,
  defaultMinutes: 60,
  defaultIncline: 2.5,
  defaultSpeed: 5.0,
} as const;

/** תקרת דקות לשדה החימום/האירובי. */
export const CARDIO_MAX_MINUTES = 120;

/** שיפוע (%) ומהירות (קמ"ש): קפיצת ה-± והתקרה. */
export const CARDIO_STEP = 0.5;
export const CARDIO_INCLINE_MAX = 30;
export const CARDIO_SPEED_MAX = 30;

/**
 * תקציב אירובי שבועי בדקות. סיום + עצמאי יחד, ראשון–שבת.
 * הערך הבסיסי הוא שלב 1; `CARDIO_BUDGET_SCHEDULE` מעלה אותו מתאריך נתון
 * (ראשון של השבוע שממנו התקציב החדש בתוקף). `cardioBudgetFor` ב-lib/cardio.ts.
 */
export const CARDIO_WEEKLY_BUDGET_MIN = 60;
export const CARDIO_BUDGET_SCHEDULE: readonly { from: ISODate; minutes: number }[] = [
  { from: '2026-11-01', minutes: 120 },
];

/** קפיצת כפתורי ה-± בשדה המשקל, בק"ג. */
export const WEIGHT_STEP = 0.5;

/** כמה ביצועים קודמים מוצגים מעל שדות הקלט של תרגיל. */
export const HISTORY_ROWS = 3;
