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

/**
 * גרסת המבנה של רשומת אימון שמורה.
 * 2 = `ex[].sets` באורך משתנה, שם התרגיל כטקסט ב-`n`. רשומות בלי השדה
 * (הגרסה הישנה) מומרות בקריאה ומקבלות אותו — ראה `parseWorkouts`.
 */
export const WORKOUT_SCHEMA_VERSION = 2;

export type WorkoutEntry = {
  schemaVersion: typeof WORKOUT_SCHEMA_VERSION;
  id: string;
  d: ISODate;
  t: WorkoutType;
  ex: LoggedExercise[];
  /** 0–10 */
  knee: number | null;
  /** 0–10 */
  shoulder: number | null;
};

/**
 * רשומת אימון שלא ניתן היה להמיר. נשמרת גולמית, כמו שהיא, ומוצגת כ"אימון ישן".
 * לעולם לא נמחקת בשמירה — `persist('workouts')` כותב אותה חזרה יחד עם השאר.
 */
export type LegacyWorkout = {
  raw: unknown;
  /** התאריך כפי שהופיע ברשומה, אם היה מחרוזת. להצגה בלבד. */
  d: string | null;
  reason: string;
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
  /**
   * התאריך שבו יוצא גיבוי מלא לאחרונה (הורדה או העתקת JSON). null = מעולם.
   * הנתונים חיים על המכשיר בלבד, וזה מה שמאפשר להזכיר כשעבר יותר מדי זמן.
   */
  lastBackup: ISODate | null;
};

export const DEFAULT_SETTINGS: Settings = {
  programStart: null,
  soundEnabled: true,
  lastBackup: null,
};

/** כל בסיס הנתונים בזיכרון. */
export type DB = {
  weights: WeightEntry[];
  workouts: WorkoutEntry[];
  /** אימונים שלא הומרו. חיים באותו מפתח אחסון כמו `workouts`, לא במפתח משלהם. */
  legacyWorkouts: LegacyWorkout[];
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
    legacyWorkouts: [],
    waist: [],
    checkins: [],
    settings: { ...DEFAULT_SETTINGS },
  };
}
