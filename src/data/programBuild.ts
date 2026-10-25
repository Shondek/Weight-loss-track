/**
 * בניית תוכנית מקובץ JSON — הצורה של `program-abc.json` ו-`program-partner.json`.
 * טהור: מקבל את ה-JSON ומחזיר את הטבלאות; `program.ts` בוחר איזה קובץ
 * לבנות לפי פרופיל המכשיר (data/profile.ts) וחושף את התוצאה כקבועים.
 *
 * הקוד כאן הוא בדיוק מה שהיה ב-program.ts לפני הפרופיל — רק עבר לפונקציה,
 * כדי שאותה בנייה תשרת שני קבצים ותיבדק על כל אחד מהם בנפרד.
 */

import type { ExerciseType, WorkoutType } from '../types';
import { REST_SECONDS } from './config';

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
  /**
   * הנחיית המאמץ כלשונה בתוכנית ("RIR 2", "RIR 1-2"), מוצגת ליד הטווח. לא
   * שדה קלט. null כשאין. ממנה נגזר סף ה-RIR של התא לעלייה במשקל (17/10/2026):
   * min(2, הגבול התחתון) — `rirThreshold` ב-lib/progression.ts.
   */
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
  /**
   * קפיצת המשקל בק"ג להצעת האימון הבא (שלב 4). null = מכונה עם מדרגות לא
   * ידועות: ההצעה אומרת "דרגה אחת למעלה/למטה" וכלל הקפיצה הגדולה (R4) לא חל.
   */
  step: number | null;
  /**
   * מצב ההתקדמות (3/10/2026). `maintain` = מצב שימור: היעד קבוע
   * (repRangeMax × sets), וההצעה לאימון הבא היא תמיד "שימור" — בלי R1–R6
   * ובלי תלות ב-RIR (lib/progression.ts). `progress` (ברירת המחדל כשהשדה
   * חסר ב-JSON) = כללי ההתקדמות הרגילים. A8 (פלאנק) הוא היחיד בשימור.
   * `reps` (6/10/2026) = התקדמות בחזרות בלבד, לתרגיל משקל גוף בלי step:
   * R6 כרגיל, תקרה נקייה → "תקרה — נשארים" בלי הצעת משקל, שני אימונים
   * מתחת לרצפה → אותן חזרות בלי −10% עם סימון "לבדוק". B8 (הרמת רגליים)
   * הוא היחיד בחזרות בלבד.
   */
  mode: 'progress' | 'maintain' | 'reps';
  /**
   * מתחיל במשקל גוף (6/10/2026, A6 פשיטת ירך): שדה משקל ריק (או 0) הוא
   * עומס 0 ק"ג — משקל גוף — ולא "לא ידוע". ההצעה מתייחסת ל-0 כמשקל
   * אמיתי: הקפיצה הראשונה (step מתוך 0) היא תמיד קפיצה גדולה (R4 —
   * קודם תקרה +2 בכל הסטים, ואז step), ואין לאן לרדת מתחת למשקל גוף
   * (R3 נשאר במשקל גוף). מעל 0 — R1–R6 כרגיל. false (ברירת המחדל) =
   * שדה ריק הוא משקל לא ידוע, כמו תמיד. לא נוגע ב-`bodyweightOnly`
   * (שם אין שדה משקל בכלל) ולא בתרגילי זמן (הפלאנק נשאר כפי שהיה).
   */
  bodyweightStart: boolean;
  /**
   * חלופות מותרות לתא הזה (שלב 4.1) — מזהים במאגר `alternates` או תרגילים
   * בתוכנית. ריק לתרגיל שאינו בתוכנית. החלפה היא לאימון אחד בלבד.
   */
  alternates: string[];
}

type OptionalKeys =
  | 'reps'
  | 'step'
  | 'mode'
  | 'alternates'
  | 'effort'
  | 'unilateral'
  | 'isTimed'
  | 'bodyweightOnly'
  | 'assisted'
  | 'bodyweightStart'
  | 'note'
  | 'videoUrl';

/** צורת התרגיל ב-JSON: הזהות חובה, השאר אופציונלי. `type` מגיע כמחרוזת. */
export type ExerciseInput = Omit<Exercise, OptionalKeys | 'type'> & {
  type: string;
} & Partial<{ [K in Exclude<OptionalKeys, 'mode'>]: Exercise[K] | undefined }> & { mode?: string | undefined };

/** הצורה של קובץ תוכנית, כפי ש-Vite מייבא אותו. */
export type ProgramJson = {
  workouts: { code: string; title: string; exercises: unknown[] }[];
  retired: unknown[];
  alternates: unknown[];
};

export type BuiltProgram = {
  /** שם הקובץ — להודעות שגיאה. */
  source: string;
  /** כל האימונים בתוכנית, בסדר ההצגה (לפי הקובץ). */
  types: WorkoutType[];
  /** הסבב של "הבא בתור" ושל המונה השבועי. תת-קבוצה של `types`. */
  rotation: readonly WorkoutType[];
  /** התרגילים של כל אימון. סוג שאינו בתוכנית הזו → ריק. */
  program: Record<WorkoutType, Exercise[]>;
  /** כותרת האימון להצגה. סוג שאינו בתוכנית הזו → "". */
  titles: Record<WorkoutType, string>;
  retired: Exercise[];
  alternates: Exercise[];
  /** זהות לפי id: המופע הראשון בתוכנית, ואחריו החלופות והפרושים. */
  byId: Map<string, Exercise>;
  /** שם בתוכנית הנוכחית → id. */
  byName: Map<string, string>;
};

const ALL_CODES: readonly WorkoutType[] = ['A', 'B', 'C', 'D'];

function isWorkoutType(code: string): code is WorkoutType {
  return (ALL_CODES as readonly string[]).includes(code);
}

/**
 * ברירות מחדל לדגלים, כדי שרק החריגים יצוינו במפורש ב-JSON.
 * `effort: "—"` (כפי שהתקבל בתוכנית לתרגילי ליבה) הוא "אין הנחיה" → null.
 */
function ex(source: string, e: ExerciseInput): Exercise {
  const type = e.type as ExerciseType;
  if (!(type in REST_SECONDS) || type === 'cardio') {
    throw new Error(`${source}: סוג תרגיל לא מוכר "${e.type}" ב-${e.id}`);
  }
  if (e.mode !== undefined && e.mode !== 'progress' && e.mode !== 'maintain' && e.mode !== 'reps') {
    throw new Error(`${source}: mode לא מוכר "${e.mode}" ב-${e.id}`);
  }
  // חזרות בלבד = אין משקל ואין step; משקל גוף כפתיחה = יש שדה משקל ויש step.
  if (e.mode === 'reps' && (e.bodyweightOnly !== true || (typeof e.step === 'number' && e.step > 0))) {
    throw new Error(`${source}: mode "reps" דורש bodyweightOnly: true בלי step ב-${e.id}`);
  }
  if (e.bodyweightStart === true && (e.bodyweightOnly === true || !(typeof e.step === 'number' && e.step > 0))) {
    throw new Error(`${source}: bodyweightStart דורש step חיובי ולא bodyweightOnly ב-${e.id}`);
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
    bodyweightStart: e.bodyweightStart ?? false,
    note: e.note ?? null,
    videoUrl: e.videoUrl ?? null,
    step: typeof e.step === 'number' && e.step > 0 ? e.step : null,
    mode: e.mode === 'maintain' ? 'maintain' : e.mode === 'reps' ? 'reps' : 'progress',
    alternates: Array.isArray(e.alternates) ? e.alternates.filter((x): x is string => typeof x === 'string') : [],
  };
}

/**
 * בונה תוכנית מקובץ. `rotation` — הסבב של "הבא בתור"; כל סוג בו חייב להיות
 * בקובץ. סוגים שאינם בקובץ (D בתוכנית של בת הזוג, C ו-D שם) מקבלים
 * רשימה ריקה וכותרת ריקה, כך שרשומה ישנה או מיובאת עם סוג כזה עדיין
 * נטענת ומוצגת בלי להתרסק.
 */
export function buildProgram(json: ProgramJson, source: string, rotation: readonly WorkoutType[]): BuiltProgram {
  const workoutsByCode = new Map<WorkoutType, { title: string; exercises: Exercise[] }>();
  const types: WorkoutType[] = [];
  for (const w of json.workouts) {
    if (!isWorkoutType(w.code)) {
      throw new Error(`${source}: קוד אימון לא מוכר "${w.code}"`);
    }
    if (workoutsByCode.has(w.code)) {
      throw new Error(`${source}: אימון ${w.code} מופיע פעמיים`);
    }
    types.push(w.code);
    workoutsByCode.set(w.code, {
      title: w.title,
      exercises: w.exercises.map((e) => ex(source, e as ExerciseInput)),
    });
  }
  if (types.length === 0) throw new Error(`${source}: אין אימונים`);
  for (const t of rotation) {
    if (!workoutsByCode.has(t)) throw new Error(`${source}: חסר אימון ${t}`);
  }

  const program = {} as Record<WorkoutType, Exercise[]>;
  const titles = {} as Record<WorkoutType, string>;
  for (const t of ALL_CODES) {
    program[t] = workoutsByCode.get(t)?.exercises ?? [];
    titles[t] = workoutsByCode.get(t)?.title ?? '';
  }

  const retired = json.retired.map((e) => ex(source, e as ExerciseInput));
  const alternates = json.alternates.map((e) => ex(source, e as ExerciseInput));

  const byId = new Map<string, Exercise>();
  for (const e of [...types.flatMap((t) => program[t]), ...alternates, ...retired]) {
    if (!byId.has(e.id)) byId.set(e.id, e);
  }
  for (const e of types.flatMap((t) => program[t])) {
    for (const id of e.alternates) {
      if (!byId.has(id)) throw new Error(`${source}: חלופה לא מוכרת "${id}" ב-${e.id}`);
    }
  }
  const byName = new Map<string, string>(types.flatMap((t) => program[t].map((e) => [e.name, e.id] as const)));

  return { source, types, rotation, program, titles, retired, alternates, byId, byName };
}
