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
 * מקטע אירובי: כמה דקות באיזה שיפוע ומהירות. נגזר מחותמות זמן של שינויי
 * ה-Stepper תוך כדי ריצה (lib/cardioSession.ts), וניתן לעריכה בסיכום.
 * `null` = לא הוזן.
 */
export type CardioSegment = {
  minutes: number;
  /** אחוז */
  incline: number | null;
  /** קמ"ש */
  speed: number | null;
};

/**
 * חימום או אירובי סיום. `minutes` הוא מה שהוזן בשדה; הביצוע עצמו נרשם
 * ב-`sets[0].seconds` ברגע שלוחצים "התחל" — עד אז השורה ריקה ולא נחשבת נתון.
 *
 * `incline` (אחוז) ו-`speed` (קמ"ש) אופציונליים: נוספו אחרי שרשומות כבר
 * נשמרו בלעדיהם, ורשומה ישנה נטענת כמו שהיא. רלוונטיים לאירובי סיום.
 *
 * `segments` — פירוט לפי מקטעים. כשקיים: `minutes` = סכום המקטעים,
 * ו-`incline`/`speed` = של המקטע הארוך ביותר (הראשון בשוויון). רשומה בלי
 * `segments` נקראת כמקטע יחיד. `steps` — צעדי הליכון, לא מד צעדים יומי.
 */
export type CardioLog = {
  mode: CardioMode;
  minutes: number;
  incline?: number;
  speed?: number;
  segments?: CardioSegment[];
  steps?: number;
};

/**
 * אירובי עצמאי — לא חלק מאימון כוח, ולכן לא ברשומת אימון ולא בספירת
 * "אימונים השבוע". מפתח אחסון משלו (`fatloss:cardio-standalone`).
 * `incline`/`speed` הם null כשלא הוזנו.
 */
export type StandaloneCardio = {
  id: string;
  d: ISODate;
  mode: CardioMode;
  minutes: number;
  /** אחוז */
  incline: number | null;
  /** קמ"ש */
  speed: number | null;
  note: string;
  /** אותם כללים כמו ב-`CardioLog`: סכום = `minutes`, העליון = הארוך ביותר. */
  segments?: CardioSegment[];
  steps?: number;
};

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
  items: {
    foodId: FoodId;
    grams: number;
    /**
     * תצוגה בלבד: הכמות כפי שמודדים אותה במטבח — "כף מפולסת", "2 ביצים",
     * "4 פריכיות". מה ששוקלים נשאר בלי שדה זה ומוצג בגרמים. החישוב תמיד
     * לפי `grams`. עד `RECIPE_UNIT_MAX` תווים.
     */
    u?: string;
    /**
     * תצוגה בלבד: שם קצר לשורת המרכיבים ברובריקה ("חזה עוף", "ירקות")
     * במקום השם המלא במאגר. עד `RECIPE_UNIT_MAX` תווים.
     */
    n?: string;
  }[];
  finalGrams: number;
};

export const RECIPE_UNIT_MAX = 40;

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
  /** `null` = לא ידוע (למשל תווית חלקית). נספר כאפס בסיכום, ומסומן "לפחות". */
  fat: number | null;
  fiber: number | null;
  portions: FoodPortion[];
  /** לשימוש עתידי. */
  barcode: string | null;
  recipe?: Recipe;
  /** טקסט חופשי עד `FOOD_NOTE_MAX` — מקור הערכים, מה טרם אומת. */
  note?: string;
  /**
   * "היחידה היא 1 גרם": הערכים ל-100 ג' הם ערכי היחידה ×100, והזנת 1
   * ברישום = יחידה אחת. לפריט בלי משקל אריזה ידוע. פוטר מתקרות הסבירות
   * ל-100 ג' (ראה `UNIT_FOOD_SCALE`), ולכן ניתן רק במפורש.
   */
  unitFood?: true;
  /**
   * בארכיון: לא מוצע ברובריקה ובחיפוש, אבל לא נמחק — רישומים ישנים ממשיכים
   * להצביע עליו ולהציג את שמו. ארכוב במקום מחיקה.
   */
  archived?: true;
};

export const FOOD_NOTE_MAX = 200;
/** ערכי יחידה נשמרים ×100 (ל-100 ג' = 100 יחידות של 1 ג'). */
export const UNIT_FOOD_SCALE = 100;

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
  fat: number | null;
  fiber: number | null;
  /** מוקפא יחד עם הערכים — הפרסר צריך לדעת שהם ערכי יחידה ×100. */
  unitFood?: true;
};

/**
 * מזהה המזון של רישום ידני: לא מזון אמיתי, לא בחיפוש ולא ברובריקה. הערכים
 * חיים רק ב-`ref` של הרישום (ראה `newAdhocEntry` ב-lib/nutrition/entries.ts).
 */
export const ADHOC_FOOD_ID = 'c:adhoc';
/** תקרות להזנה ידנית — ארוחה אחת, לא יום. הפרסר מרים את תקרת ה-100 ג' רק לרישום עם `adhoc`. */
export const ADHOC_MAX_KCAL = 5000;
export const ADHOC_MAX_MACRO = 500;

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
  /**
   * ערכי המקור ל-100 ג' כפי שהיו ברגע הרישום. **זה מה שקובע** — המזון החי
   * משמש רק לשם ולסימון שההגדרה השתנתה מאז (ראה lib/nutrition/calc.ts).
   */
  ref: FoodRef;
  /**
   * השם בזמן הרישום, לרישום ידני — אותו דפוס כמו `LoggedExercise.n`.
   * ברישום רגיל השם נלקח מהמזון החי ואם נעלם — מ-`ref.name`.
   */
  n?: string;
  /**
   * רישום ידני: קלוריות ומאקרו שהוזנו ביד (אוכל בחוץ, הערכה). מסומן
   * בהיסטוריה ונספר בנפרד בסיכום היום — הערכה, לא מדידה.
   */
  adhoc?: true;
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
  /** אירובי עצמאי. נפרד מ-`workouts` בכוונה — ראה `StandaloneCardio`. */
  standaloneCardio: StandaloneCardio[];
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
    standaloneCardio: [],
    settings: { ...DEFAULT_SETTINGS },
    customFoods: [],
    entries: [],
    targets: [],
    favorites: [],
  };
}
