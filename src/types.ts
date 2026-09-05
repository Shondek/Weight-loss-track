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
 * סוג התנועה. קובע את משכי המנוחה בין סטים ובין תרגילים — הערכים עצמם
 * ב-`REST_SECONDS` שב-src/data/config.ts. `cardio` = חימום / אירובי סיום.
 */
export type ExerciseType = 'compound' | 'isolation' | 'core' | 'cardio';

export type CardioMode = 'bike' | 'treadmill';

/**
 * חימום או אירובי סיום. `minutes` הוא מה שהוזן בשדה; הביצוע עצמו נרשם
 * ב-`sets[0].seconds` ברגע שלוחצים "התחל" — עד אז השורה ריקה ולא נחשבת נתון.
 */
export type CardioLog = { mode: CardioMode; minutes: number };

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
 * המשקל נשמר לכל סט (אותו ערך בכולם — הקלט הוא שדה אחד לתרגיל), כדי
 * שרשומות ישנות עם משקל שונה בכל סט ימשיכו להיטען ולהיות מוצגות.
 *
 * `targetRepMin/Max`, `type`, `bodyweightOnly` ו-`assisted` מוקפאים ברגע
 * השמירה, כדי שהרשומה תישאר מובנת גם אם התוכנית תשתנה מאז.
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
  /** המשקל הוא סיוע (גרוויטון) — פחות משקל = קשה יותר. */
  assisted: boolean;
  /** קיים רק בשורות חימום / אירובי סיום (`type: 'cardio'`). */
  cardio?: CardioLog;
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

// ---------- תזונה ----------

/**
 * מזהה מזון. 8 ספרות = קוד מזון של משרד הבריאות (`smlmitzrach`).
 * `"c:"` + uuid = מזון שהוזן ידנית. הקידומת מונעת התנגשות עם קוד עתידי במאגר.
 */
export type FoodId = string;

export const CUSTOM_FOOD_PREFIX = 'c:';

/** יחידת מידה נוחה: "כף" = 10 גרם. */
export type FoodPortion = { u: string; g: number };

/**
 * מנה מורכבת: נבנית פעם אחת ממרכיבים, והערכים ל-100 גרם של התערובת נשמרים
 * בשדות הרגילים של `CustomFood` — כך שכל שכבת החישוב עובדת בלי לדעת שזו מנה.
 *
 * `finalGrams` הוא משקל המנה המוגמרת. בבישול מתאדים מים והמשקל קטן מסכום
 * המרכיבים, ולכן הערכים ל-100 גרם מתרכזים. בסלט קר אין איבוד. ברירת המחדל
 * היא סכום המרכיבים, והשדה תמיד ניתן לעריכה.
 *
 * מרכיב הוא מזון מהמאגר או מזון שלי רגיל. מנה בתוך מנה לא נתמכת.
 */
export type Recipe = {
  items: { foodId: FoodId; grams: number }[];
  finalGrams: number;
};

/**
 * מזון שהוזן ידנית, עם המספרים מהתווית. הערכים ל-100 גרם.
 * `null` = לא ידוע (לא אפס). `cat` לפי `FoodCategory` שב-lib/nutrition/foodDb.ts.
 * עם `recipe` — מנה מורכבת; הערכים חושבו מהמרכיבים (ראה lib/nutrition/recipe.ts).
 */
export type CustomFood = {
  id: FoodId;
  name: string;
  cat: number | null;
  kcal: number;
  protein: number;
  carbs: number | null;
  fat: number;
  fiber: number | null;
  portions: FoodPortion[];
  /** לשימוש עתידי. */
  barcode: string | null;
  recipe?: Recipe;
};

export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';

/**
 * ערכי המקור של מזון ל-100 גרם, כפי שהיו בזמן הרישום. מוקפאים ברישום כדי
 * שהוא ישרוד אם המזון נמחק או נעלם מגרסה חדשה של המאגר — אותו דפוס כמו
 * `LoggedExercise.n`. בקריאה, המזון החי גובר; `ref` הוא הגיבוי.
 *
 * זה נתון מקור, לא תוצאה: שום קלוריה לא נשמרת ברישום. הסיכום תמיד מחושב
 * מ-`grams × ref / 100`.
 */
export type FoodRef = {
  name: string;
  kcal: number;
  protein: number;
  carbs: number | null;
  fat: number;
  fiber: number | null;
};

export type FoodEntry = {
  /** מתחיל ב-`sortableStamp(ts)` כדי שמיון מחרוזות = מיון זמן. */
  id: string;
  /** נגזר מ-`ts` ב-`toLocalISO` בזמן הכתיבה, ומוקפא. הסיכום היומי מקבץ לפיו. */
  d: ISODate;
  /** epoch ms */
  ts: number;
  meal: MealType;
  foodId: FoodId;
  grams: number;
  ref: FoodRef;
  /** טקסט חופשי, עד `ENTRY_NOTE_MAX` — לסימון אומדנים ואכילה בחוץ. */
  note?: string;
};

export const ENTRY_NOTE_MAX = 200;

/**
 * יעד יומי. `from` = תאריך תחילת תוקף; ההיסטוריה נשמרת ולא נדרסת, כדי
 * שסיכומים ישנים יישארו נכונים. המאקרו בגרמים.
 */
export type NutritionTarget = {
  from: ISODate;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
};

/** מזון לגישה מהירה. `grams` = כמות ברירת מחדל, מה שמאפשר רישום בנגיעה אחת. */
export type Favorite = {
  foodId: FoodId;
  grams: number | null;
};

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
  /** מזונות שהוזנו ידנית. מאגר משרד הבריאות אינו כאן — הוא asset, לא נתון משתמש. */
  customFoods: CustomFood[];
  entries: FoodEntry[];
  targets: NutritionTarget[];
  favorites: Favorite[];
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
    customFoods: [],
    entries: [],
    targets: [],
    favorites: [],
  };
}
