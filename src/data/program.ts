/**
 * תוכנית האימונים. הקובץ היחיד שמגדיר תרגילים, טווחי חזרות, מנוחות ותוספות
 * משקל. הקומפוננטות לא יודעות דבר על תרגילים — הן קוראות מכאן.
 *
 * לשנות תרגיל, טווח, מנוחה או תוספת? רק כאן.
 */

import type { ExerciseType, WorkoutType } from '../types';

export interface Exercise {
  /** מזהה יציב. זה המפתח להיסטוריה — לעולם לא לשנות אותו. */
  id: string;
  /** השם בעברית, מוצג למשתמש. מותר לשנות בלי לנתק היסטוריה. */
  name: string;
  /** שם קצר לדוח הצ'אט, שבו יש תקרת תווים. */
  short: string;
  /** שם המכונה באנגלית, כפי שהוא מופיע בחדר הכושר. null בתרגילי משקל גוף. */
  machine: string | null;
  muscles: string[];
  type: ExerciseType;
  sets: number;
  repRangeMin: number;
  repRangeMax: number;
  /** מוצג כ"לרגל" / "ליד". */
  unilateral: boolean;
  /** שניות במקום חזרות. */
  isTimed: boolean;
  /** אסור להוסיף משקל — ההתקדמות היא בחזרות. */
  bodyweightOnly: boolean;
  note: string | null;
}

/**
 * `type` קובע שלושה דברים בבת אחת: מנוחה בין סטים, מנוחה בין תרגילים,
 * וקפיצת המשקל. הערכים חיים כאן בלבד ולא משוכפלים בכל תרגיל.
 *
 * `weightIncrement: 0` פירושו "התקדם בחזרות, לא במשקל" — ראה
 * `getProgressionSuggestion` ב-src/lib/progression.ts.
 */
export const TYPE_CONFIG: Record<
  ExerciseType,
  { restBetweenSets: number; restBetweenExercises: number; weightIncrement: number }
> = {
  compound: { restBetweenSets: 120, restBetweenExercises: 180, weightIncrement: 5 },
  isolation: { restBetweenSets: 60, restBetweenExercises: 90, weightIncrement: 2.5 },
  core: { restBetweenSets: 45, restBetweenExercises: 90, weightIncrement: 0 },
};

type ExerciseInput = Omit<
  Exercise,
  'unilateral' | 'isTimed' | 'bodyweightOnly' | 'note'
> &
  Partial<Pick<Exercise, 'unilateral' | 'isTimed' | 'bodyweightOnly' | 'note'>>;

/** ברירות מחדל לדגלים, כדי שרק החריגים יצוינו במפורש. */
function ex(e: ExerciseInput): Exercise {
  return {
    unilateral: false,
    isTimed: false,
    bodyweightOnly: false,
    note: null,
    ...e,
  };
}

export const PROGRAM: Record<WorkoutType, Exercise[]> = {
  // A — חזה + גב אופקי
  A: [
    ex({
      id: 'leg-press',
      name: 'לחיצת רגליים',
      short: 'לחיצת רגליים',
      machine: 'Leg Press',
      muscles: ['ארבע ראשי', 'ישבן'],
      type: 'compound',
      sets: 3,
      repRangeMin: 10,
      repRangeMax: 12,
    }),
    ex({
      id: 'leg-press-calf-raise',
      name: 'הרמת שוקיים',
      short: 'שוקיים',
      machine: 'Leg Press Calf Raise',
      muscles: ['תאומים'],
      type: 'isolation',
      sets: 3,
      repRangeMin: 12,
      repRangeMax: 15,
    }),
    ex({
      id: 'chest-press',
      name: 'לחיצת חזה בישיבה',
      short: 'לחיצת חזה',
      machine: 'Chest Press',
      muscles: ['חזה', 'טרייספס', 'כתף קדמית'],
      type: 'compound',
      sets: 3,
      repRangeMin: 8,
      repRangeMax: 12,
    }),
    ex({
      id: 'seated-cable-row',
      name: 'חתירה בישיבה בכבל',
      short: 'חתירת כבל',
      machine: 'Seated Cable Row',
      muscles: ['גב רחב', 'טרפז', 'מעוינים'],
      type: 'compound',
      sets: 3,
      repRangeMin: 10,
      repRangeMax: 12,
    }),
    ex({
      id: 'leg-extension',
      name: 'פשיטת ברך',
      short: 'פשיטת ברך',
      machine: 'Leg Extension',
      muscles: ['ארבע ראשי'],
      type: 'isolation',
      sets: 2,
      repRangeMin: 12,
      repRangeMax: 15,
    }),
    ex({
      id: 'pec-deck',
      name: 'פרפר',
      short: 'פרפר',
      machine: 'Pec Deck',
      muscles: ['חזה'],
      type: 'isolation',
      sets: 2,
      repRangeMin: 12,
      repRangeMax: 15,
    }),
    ex({
      id: 'cable-lateral-raise',
      name: 'הרחקה לצד בכבל',
      short: 'הרחקה בכבל',
      machine: 'Cable Lateral Raise',
      muscles: ['כתף אמצעית'],
      type: 'isolation',
      sets: 2,
      repRangeMin: 12,
      repRangeMax: 15,
    }),
    ex({
      id: 'cable-curl',
      name: 'כפיפת מרפקים בכבל',
      short: 'כפיפת מרפקים',
      machine: 'Cable Curl',
      muscles: ['בייספס'],
      type: 'isolation',
      sets: 2,
      repRangeMin: 10,
      repRangeMax: 12,
    }),
    ex({
      id: 'plank',
      name: 'פלאנק',
      short: 'פלאנק',
      machine: null,
      muscles: ['ליבה'],
      type: 'core',
      sets: 3,
      repRangeMin: 30,
      repRangeMax: 45,
      isTimed: true,
      bodyweightOnly: true,
    }),
  ],

  // B — ירכיים אחוריות + גב אנכי
  B: [
    ex({
      id: 'leg-curl',
      name: 'כפיפת ברך',
      short: 'כפיפת ברך',
      machine: 'Leg Curl',
      muscles: ['ירך אחורית'],
      type: 'compound',
      sets: 3,
      repRangeMin: 10,
      repRangeMax: 12,
    }),
    ex({
      id: 'lat-pulldown',
      name: 'פולי עליון לחזה',
      short: 'פולי עליון',
      machine: 'Lat Pulldown',
      muscles: ['גב רחב', 'טרפז תחתון', 'בייספס'],
      type: 'compound',
      sets: 3,
      repRangeMin: 10,
      repRangeMax: 12,
    }),
    ex({
      id: 'hip-thrust',
      name: "היפ ת'ראסט",
      short: "היפ ת'ראסט",
      machine: 'Hip Thrust',
      muscles: ['ישבן', 'ירך אחורית'],
      type: 'compound',
      sets: 3,
      repRangeMin: 10,
      repRangeMax: 12,
    }),
    ex({
      id: 'chest-supported-row',
      name: 'חתירה בתמיכת חזה',
      short: 'חתירה נתמכת',
      machine: 'Chest Supported Row',
      muscles: ['טרפז אמצעי', 'מעוינים', 'גב רחב'],
      type: 'compound',
      sets: 3,
      repRangeMin: 10,
      repRangeMax: 12,
    }),
    ex({
      id: 'triceps-pushdown',
      name: 'פשיטת מרפקים בפולי',
      short: 'פשיטת מרפקים',
      machine: 'Triceps Pushdown',
      muscles: ['טרייספס'],
      type: 'isolation',
      sets: 2,
      repRangeMin: 12,
      repRangeMax: 15,
    }),
    ex({
      id: 'standing-calf-raise',
      name: 'הרמת שוקיים בעמידה',
      short: 'שוקיים בעמידה',
      machine: 'Standing Calf Raise',
      muscles: ['תאומים'],
      type: 'isolation',
      sets: 3,
      repRangeMin: 12,
      repRangeMax: 15,
    }),
    ex({
      id: 'dead-bug',
      name: 'Dead bug',
      short: 'Dead bug',
      machine: null,
      muscles: ['ליבה עמוקה'],
      type: 'core',
      sets: 3,
      repRangeMin: 10,
      repRangeMax: 10,
      unilateral: true,
      bodyweightOnly: true,
    }),
    ex({
      id: 'side-plank',
      name: 'פלאנק צד',
      short: 'פלאנק צד',
      machine: null,
      muscles: ['אלכסונים'],
      type: 'core',
      sets: 2,
      repRangeMin: 20,
      repRangeMax: 30,
      isTimed: true,
      unilateral: true,
      bodyweightOnly: true,
    }),
  ],

  // C — ידיים + חד-צדדי
  C: [
    ex({
      id: 'bulgarian-split-squat',
      name: 'סקוואט בולגרי',
      short: 'בולגרי',
      machine: null,
      muscles: ['ישבן', 'ארבע ראשי'],
      type: 'compound',
      sets: 3,
      repRangeMin: 8,
      repRangeMax: 10,
      unilateral: true,
      bodyweightOnly: true,
      note: 'משקל גוף בלבד — מגבלת ברך',
    }),
    ex({
      id: 'incline-chest-press',
      name: 'לחיצת חזה בשיפוע',
      short: 'חזה שיפוע',
      machine: 'Incline Chest Press',
      muscles: ['חזה עליון', 'כתף קדמית'],
      type: 'compound',
      sets: 3,
      repRangeMin: 10,
      repRangeMax: 12,
    }),
    ex({
      id: 'single-arm-cable-row',
      name: 'חתירת יד אחת בכבל',
      short: 'חתירת יד אחת',
      machine: 'Single-Arm Cable Row',
      muscles: ['גב רחב', 'מעוינים'],
      type: 'compound',
      sets: 3,
      repRangeMin: 10,
      repRangeMax: 12,
      unilateral: true,
    }),
    ex({
      id: 'face-pull',
      name: 'פייס פול',
      short: 'פייס פול',
      machine: 'Cable Face Pull',
      muscles: ['כתף אחורית', 'סובבי כתף'],
      type: 'isolation',
      sets: 3,
      repRangeMin: 15,
      repRangeMax: 15,
    }),
    ex({
      id: 'lateral-raise',
      name: 'הרחקה לצד',
      short: 'הרחקה לצד',
      machine: 'Lateral Raise',
      muscles: ['כתף אמצעית'],
      type: 'isolation',
      sets: 2,
      repRangeMin: 12,
      repRangeMax: 15,
    }),
    ex({
      id: 'hammer-curl',
      name: 'כפיפת פטיש',
      short: 'כפיפת פטיש',
      machine: 'Hammer Curl',
      muscles: ['בייספס', 'אמה'],
      type: 'isolation',
      sets: 2,
      repRangeMin: 10,
      repRangeMax: 12,
    }),
    ex({
      id: 'cable-crunch',
      name: 'כפיפות בטן בכבל',
      short: 'כפיפות בטן',
      machine: 'Cable Crunch',
      muscles: ['ישרי הבטן'],
      type: 'core',
      sets: 3,
      repRangeMin: 12,
      repRangeMax: 12,
    }),
  ],
};

export const WORKOUT_TYPES: WorkoutType[] = ['A', 'B', 'C'];

/** כמה אימונים בשבוע התוכנית מצפה להם. משמש לספירה "n/3" ולסעיף "חסר". */
export const WORKOUTS_PER_WEEK = 3;

/** תזכורת קבועה בראש מסך האימונים. תזכורת, לא הגדרה — אין לה השפעה על הלוגיקה. */
export const CONSTRAINTS =
  'ברך — בלי כריעה מתחת ל-90°, בלי קפיצות. כתף — בלי לחיצה מעל הראש, מרפקים 45°.';

const BY_ID: Map<string, Exercise> = new Map(
  WORKOUT_TYPES.flatMap((t) => PROGRAM[t].map((e) => [e.id, e] as const)),
);

const BY_NAME: Map<string, string> = new Map(
  WORKOUT_TYPES.flatMap((t) => PROGRAM[t].map((e) => [e.name, e.id] as const)),
);

/**
 * שם עברי ישן → מזהה חדש, כשמדובר באותה תנועה.
 *
 * זה מה שמקשר היסטוריה מעבר לשינוי שמות התרגילים: אימון שנרשם עם "לג פרס"
 * ימשיך להזין את המשקל האחרון של "לחיצת רגליים".
 *
 * תרגילים שנשמטו מהתוכנית ואין להם מקבילה (RDL משקולות יד, סקוואט גובלט
 * לספסל) לא מופיעים כאן בכוונה — הם יישארו קריאים בהיסטוריה בלי להתחזות
 * לתרגיל אחר. "כפיפת ופשיטת מרפקים" נפצל לשניים ולכן אינו ניתן למיפוי
 * חד-ערכי.
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
};

export function exerciseById(id: string): Exercise | undefined {
  return BY_ID.get(id);
}

/**
 * המזהה של תרגיל לפי שם: קודם שם בתוכנית הנוכחית, אחר כך טבלת השמות
 * הישנים. מחזיר null כשאין התאמה — התרגיל יוצג בהיסטוריה לפי שמו בלבד.
 */
export function resolveExerciseId(name: string): string | null {
  const trimmed = name.trim();
  return BY_NAME.get(trimmed) ?? EXERCISE_ALIASES[trimmed] ?? null;
}

/** שם קצר לדוח. תרגיל שאינו בתוכנית נשאר עם השם שנרשם איתו. */
export function shortName(id: string, fallback: string): string {
  return BY_ID.get(id)?.short ?? fallback;
}

/** כמה שניות מנוחה אחרי סט של התרגיל הזה — או אחרי הסט האחרון שלו. */
export function restSeconds(type: ExerciseType, afterLastSet: boolean): number {
  const cfg = TYPE_CONFIG[type];
  return afterLastSet ? cfg.restBetweenExercises : cfg.restBetweenSets;
}
