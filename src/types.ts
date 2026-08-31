/**
 * מודל הנתונים של האפליקציה.
 *
 * שים לב: `WeightEntry` ו-`WorkoutEntry` חייבים להישאר תואמים לגרסת ה-HTML
 * הישנה (אותם שמות שדות, אותם מפתחות אחסון). אין לשנות אותם.
 */

/** תאריך מקומי בפורמט "YYYY-MM-DD". תמיד מקומי, לעולם לא UTC. */
export type ISODate = string;

/** שקילת בוקר. משקל בק"ג, דיוק 0.1. */
export type WeightEntry = { d: ISODate; w: number };

/** מדידת מותניים בס"מ, בוקר, בטבור. פעם בשבוע. */
export type WaistEntry = { d: ISODate; cm: number };

export type WorkoutType = 'A' | 'B' | 'C';

/** תרגיל בודד בתוך אימון. `r` הוא שלושה סטים. */
export type ExerciseLog = {
  n: string;
  w: number | null;
  r: (number | null)[];
};

export type WorkoutEntry = {
  id: string;
  d: ISODate;
  t: WorkoutType;
  ex: ExerciseLog[];
  /** 0–10 */
  knee: number | null;
  /** 0–10 */
  shoulder: number | null;
};

export type WeeklyCheckin = {
  /** תמיד יום ראשון */
  weekStart: ISODate;
  /** 1–10 */
  adherence: number | null;
  /** 1–10 */
  hunger: number | null;
  /** 1–10 */
  energy: number | null;
  /** קפיצות של 0.5 */
  sleepHours: number | null;
  /** 0–7 */
  unplannedSnackDays: number | null;
  /** שדה הטקסט החופשי היחיד באפליקציה, עד 280 תווים */
  note: string;
};

export const NOTE_MAX = 280;

export type Settings = {
  /**
   * ראשון של שבוע 1 בתוכנית. null = נגזר אוטומטית מהשקילה הראשונה.
   * נשמר כדי שמספור השבועות בדוח לא יזוז אם מוחקים נתונים ישנים.
   */
  programStart: ISODate | null;
};

export const DEFAULT_SETTINGS: Settings = { programStart: null };

/** כל בסיס הנתונים בזיכרון. */
export type DB = {
  weights: WeightEntry[];
  workouts: WorkoutEntry[];
  waist: WaistEntry[];
  checkins: WeeklyCheckin[];
  settings: Settings;
};

/**
 * בסיס נתונים ריק. פונקציה ולא קבוע — קבוע משותף היה מחזיר את אותם
 * מערכים לכל הקוראים, ו-spread שטוח לא היה מפריד ביניהם.
 */
export function emptyDb(): DB {
  return {
    weights: [],
    workouts: [],
    waist: [],
    checkins: [],
    settings: { ...DEFAULT_SETTINGS },
  };
}
