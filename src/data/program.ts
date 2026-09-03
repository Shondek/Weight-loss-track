/**
 * תוכנית האימונים. התוכן עצמו חי ב-`program-abc.json` (Vite מייבא JSON
 * נטיבית, בלי תלות); הקובץ הזה טוען אותו, משלים ברירות מחדל וחושף את
 * ה-API היחיד שהקומפוננטות מכירות. הן לא יודעות דבר על תרגילים — הן
 * קוראות מכאן.
 *
 * לשנות תרגיל, טווח, הערה או סרטון? ב-JSON. לשנות מנוחה לסוג תרגיל?
 * `REST_SECONDS` ב-src/data/config.ts.
 */

import type { ExerciseType, WorkoutType } from '../types';
import { REST_SECONDS } from './config';
import programJson from './program-abc.json';

export interface Exercise {
  /** מזהה יציב. זה המפתח להיסטוריה — לעולם לא לשנות אותו. */
  id: string;
  /** השם בעברית, מוצג למשתמש. מותר לשנות בלי לנתק היסטוריה. */
  name: string;
  /** שם קצר לדוח הצ'אט, שבו יש תקרת תווים. */
  short: string;
  /** שם המכונה באנגלית, כפי שהוא מופיע בחדר הכושר. null בתרגילי משקל גוף. */
  machine: string | null;
  /** קבוצת שריר ראשית, כפי שהתקבלה בתוכנית (legs/chest/back/…). */
  muscle: string;
  muscles: string[];
  type: ExerciseType;
  sets: number;
  /** טווח החזרות כטקסט להצגה, כלשונו בתוכנית ("10-12", "10 לרגל", "30-45 שנ'"). */
  reps: string;
  repRangeMin: number;
  repRangeMax: number;
  /** הנחיית מאמץ להצגה בלבד ("RIR 2"). null כשאין. לא שדה קלט. */
  effort: string | null;
  /** מוצג כ"לרגל" / "ליד". */
  unilateral: boolean;
  /** שניות במקום חזרות. */
  isTimed: boolean;
  /** אסור להוסיף משקל — ההתקדמות היא בחזרות. */
  bodyweightOnly: boolean;
  /** המשקל הוא *סיוע* (גרוויטון): פחות משקל = קשה יותר. */
  assisted: boolean;
  note: string | null;
  /** סרטון הדגמה. null כשאין — ואז שום דבר לא מרונדר. */
  videoUrl: string | null;
}

/**
 * `type` קובע את משכי המנוחה. הערכים חיים ב-src/data/config.ts בלבד
 * ולא משוכפלים בכל תרגיל; נחשפים גם מכאן כדי שהקומפוננטות יקראו מקום אחד.
 */
export const TYPE_CONFIG = REST_SECONDS;

type OptionalKeys =
  | 'reps'
  | 'effort'
  | 'unilateral'
  | 'isTimed'
  | 'bodyweightOnly'
  | 'assisted'
  | 'note'
  | 'videoUrl';

/** צורת התרגיל ב-JSON: הזהות חובה, השאר אופציונלי. `type` מגיע כמחרוזת. */
type ExerciseInput = Omit<Exercise, OptionalKeys | 'type'> & {
  type: string;
} & Partial<{ [K in OptionalKeys]: Exercise[K] | undefined }>;

/**
 * ברירות מחדל לדגלים, כדי שרק החריגים יצוינו במפורש ב-JSON.
 * `effort: "—"` (כפי שהתקבל בתוכנית לתרגילי ליבה) הוא "אין הנחיה" → null.
 */
function ex(e: ExerciseInput): Exercise {
  const type = e.type as ExerciseType;
  if (!(type in REST_SECONDS) || type === 'cardio') {
    throw new Error(`program-abc.json: סוג תרגיל לא מוכר "${e.type}" ב-${e.id}`);
  }
  const effort = e.effort?.trim();
  return {
    id: e.id,
    name: e.name,
    short: e.short,
    machine: e.machine,
    muscle: e.muscle,
    muscles: e.muscles,
    type,
    sets: e.sets,
    reps: e.reps ?? `${e.repRangeMin}-${e.repRangeMax}`,
    repRangeMin: e.repRangeMin,
    repRangeMax: e.repRangeMax,
    effort: effort && effort !== '—' ? effort : null,
    unilateral: e.unilateral ?? false,
    isTimed: e.isTimed ?? false,
    bodyweightOnly: e.bodyweightOnly ?? false,
    assisted: e.assisted ?? false,
    note: e.note ?? null,
    videoUrl: e.videoUrl ?? null,
  };
}

export const WORKOUT_TYPES: WorkoutType[] = ['A', 'B', 'C'];

function isWorkoutType(code: string): code is WorkoutType {
  return (WORKOUT_TYPES as string[]).includes(code);
}

const workoutsByCode = new Map<WorkoutType, { title: string; exercises: Exercise[] }>();
for (const w of programJson.workouts) {
  if (!isWorkoutType(w.code)) {
    throw new Error(`program-abc.json: קוד אימון לא מוכר "${w.code}"`);
  }
  workoutsByCode.set(w.code, {
    title: w.title,
    exercises: w.exercises.map((e) => ex(e as ExerciseInput)),
  });
}
for (const t of WORKOUT_TYPES) {
  if (!workoutsByCode.has(t)) throw new Error(`program-abc.json: חסר אימון ${t}`);
}

/** התרגילים של כל אימון, בסדר הביצוע. אותו id יכול להופיע בשני אימונים עם סטים/טווח שונים. */
export const PROGRAM: Record<WorkoutType, Exercise[]> = {
  A: workoutsByCode.get('A')!.exercises,
  B: workoutsByCode.get('B')!.exercises,
  C: workoutsByCode.get('C')!.exercises,
};

/** כותרת האימון להצגה ("דחיפה + ארבע-ראשי"). */
export const WORKOUT_TITLES: Record<WorkoutType, string> = {
  A: workoutsByCode.get('A')!.title,
  B: workoutsByCode.get('B')!.title,
  C: workoutsByCode.get('C')!.title,
};

/**
 * תרגילים שירדו מהתוכנית. נשארים כזהות בלבד כדי שרשומה ישנה תמשיך להיות
 * מובנת: "פלאנק צד" עדיין יודע שהוא בשניות, ותרגיל שירד עדיין מוצג בשמו.
 * לא מופיעים באף אימון ולא ניתן לבחור אותם.
 */
export const RETIRED: Exercise[] = programJson.retired.map((e) => ex(e as ExerciseInput));

/** כמה אימונים בשבוע התוכנית מצפה להם. משמש לספירה "n/3" ולסעיף "חסר". */
export const WORKOUTS_PER_WEEK = 3;

/** תזכורת קבועה בראש מסך האימונים. תזכורת, לא הגדרה — אין לה השפעה על הלוגיקה. */
export const CONSTRAINTS =
  'ברך — בלי כריעה מתחת ל-90°, בלי קפיצות. כתף — בלי לחיצה מעל הראש, מרפקים 45°.';

/**
 * זהות לפי id: המופע הראשון בתוכנית, ואחריו הפרושים. כשאותו id מופיע
 * בשני אימונים, הזהות (שם, סוג, דגלים) זהה — רק סטים/טווח שונים, ולהם
 * יש `exerciseIn`.
 */
const BY_ID: Map<string, Exercise> = new Map();
for (const e of [...WORKOUT_TYPES.flatMap((t) => PROGRAM[t]), ...RETIRED]) {
  if (!BY_ID.has(e.id)) BY_ID.set(e.id, e);
}

const BY_NAME: Map<string, string> = new Map(
  WORKOUT_TYPES.flatMap((t) => PROGRAM[t].map((e) => [e.name, e.id] as const)),
);

/**
 * שם עברי ישן → מזהה, כשמדובר באותה תנועה.
 *
 * זה מה שמקשר היסטוריה מעבר לשינוי שמות התרגילים: אימון שנרשם עם "לג פרס"
 * ימשיך להזין את המשקל האחרון של "לג-פרס במכונה בישיבה". שמות של תרגילים
 * שירדו מהתוכנית ממופים למזהה הפרוש שלהם, כדי שהרשומה תוצג נכון.
 *
 * "סקוואט גובלט לספסל" ו"כפיפת ופשיטת מרפקים" לא מופיעים כאן בכוונה — אין
 * להם מקבילה חד-ערכית, והם יישארו קריאים בהיסטוריה לפי שמם.
 */
export const EXERCISE_ALIASES: Record<string, string> = {
  'לג פרס': 'leg-press',
  'לחיצת חזה במכונה': 'chest-press',
  'חתירת כבל בישיבה': 'seated-cable-row',
  'פייס פול': 'face-pull',
  פלאנק: 'plank',
  'פלאנק צד': 'side-plank',
  'Dead bug': 'dead-bug',
  'הרמת אגן': 'hip-thrust',
  'פולי עליון': 'lat-pulldown',
  'כפיפת ברכיים': 'leg-curl',
  'חתירה נתמכת חזה': 'chest-supported-row',
  'מכרעים בולגריים': 'bulgarian-split-squat',
  'הרמות עגל': 'standing-calf-raise',
  'לחיצת חזה משקולות שיפוע 30°': 'incline-chest-press',
  'RDL משקולות יד': 'db-rdl',
};

export function exerciseById(id: string): Exercise | undefined {
  return BY_ID.get(id);
}

/**
 * המפרט של תרגיל *באימון מסוים* — סטים וטווח יכולים להיות שונים בין A ל-B
 * לאותו id (כפיפת ברכיים: 2×12-15 ב-A, 3×10-12 ב-B). כשהתרגיל לא באימון
 * הזה (רשומה ישנה) מחזיר undefined, והקורא נופל ל-`exerciseById`.
 */
export function exerciseIn(t: WorkoutType, id: string): Exercise | undefined {
  return PROGRAM[t].find((e) => e.id === id);
}

/**
 * המזהה של תרגיל לפי שם: קודם שם בתוכנית הנוכחית, אחר כך טבלת השמות
 * הישנים, ואחר כך שמות של תרגילים שירדו. מחזיר null כשאין התאמה — התרגיל
 * יוצג בהיסטוריה לפי שמו בלבד.
 */
export function resolveExerciseId(name: string): string | null {
  const trimmed = name.trim();
  return (
    BY_NAME.get(trimmed) ??
    EXERCISE_ALIASES[trimmed] ??
    RETIRED.find((e) => e.name === trimmed)?.id ??
    null
  );
}

/** שם קצר לדוח. תרגיל שאינו בתוכנית נשאר עם השם שנרשם איתו. */
export function shortName(id: string, fallback: string): string {
  return BY_ID.get(id)?.short ?? fallback;
}

/** כמה שניות מנוחה אחרי סט של התרגיל הזה — או אחרי הסט האחרון שלו. */
export function restSeconds(type: ExerciseType, afterLastSet: boolean): number {
  const cfg = REST_SECONDS[type];
  return afterLastSet ? cfg.betweenExercises : cfg.betweenSets;
}
