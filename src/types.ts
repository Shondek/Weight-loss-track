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

/**
 * סוג התנועה. קובע מנוחה בין סטים, מנוחה בין תרגילים וקפיצת משקל —
 * הערכים עצמם ב-`TYPE_CONFIG` שב-src/data/program.ts.
 */
export type ExerciseType = 'compound' | 'isolation' | 'core';

/** סט בודד. `seconds` לתרגילי זמן, `reps` לכל השאר. */
export type LoggedSet = {
  weight: number | null;
  reps: number | null;
  seconds: number | null;
};

/**
 * תרגיל שבוצע. אורך `sets` משתנה — בתוכנית יש תרגילים של 2 ושל 3 סטים,
 * ואסור להניח מספר קבוע בשום מקום.
 *
 * `targetRepMin/Max`, `type`, `bodyweightOnly` ו-`assisted` מוקפאים ברגע
 * השמירה. כך המלצת ההתקדמות מחושבת מחדש בכל רינדור מהנתונים הגולמיים,
 * ובלי לצאת לחפש בתוכנית — שאולי כבר השתנתה מאז.
 */
export type LoggedExercise = {
  exerciseId: string;
  /** השם בזמן הרישום. שומר על רשומה קריאה גם אם התרגיל ירד מהתוכנית. */
  n: string;
  sets: LoggedSet[];
  targetRepMin: number;
  targetRepMax: number;
  type: ExerciseType;
  bodyweightOnly: boolean;
  /** המשקל הוא סיוע (גרוויטון) — התקדמות היא *פחות* משקל. */
  assisted: boolean;
};

export type WorkoutEntry = {
  id: string;
  d: ISODate;
  t: WorkoutType;
  ex: LoggedExercise[];
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
  /**
   * צליל בסיום טיימר המנוחה. הוויברציה תמיד פועלת — היא מה שעובד
   * בחדר כושר רועש. הצליל הוא תוספת שאפשר לכבות.
   */
  soundEnabled: boolean;
};

export const DEFAULT_SETTINGS: Settings = { programStart: null, soundEnabled: true };

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
