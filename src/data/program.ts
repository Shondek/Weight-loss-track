/**
 * תוכנית האימונים. התוכן עצמו חי ב-`program-abc.json` (Vite מייבא JSON
 * נטיבית, בלי תלות); הקובץ הזה טוען אותו, משלים ברירות מחדל וחושף את
 * ה-API היחיד שהקומפוננטות מכירות. הן לא יודעות דבר על תרגילים — הן
 * קוראות מכאן.
 *
 * פרופיל המכשיר (25/10/2026, data/profile.ts): כשהפרופיל הוא `partner`
 * נטען `program-partner.json` במקום — שני אימונים, A ו-B, לסירוגין. בלי
 * פרופיל נטען `program-abc.json` בדיוק כמו קודם. הבנייה עצמה
 * (data/programBuild.ts) זהה לשני הקבצים; הפרופיל נקבע ב-main.tsx לפני
 * שהמודול הזה מיובא.
 *
 * לשנות תרגיל, טווח, הערה או סרטון? ב-JSON. לשנות מנוחה לסוג תרגיל?
 * `REST_SECONDS` ב-src/data/config.ts.
 */

import type { ExerciseType, WorkoutType } from '../types';
import { REST_SECONDS } from './config';
import { activeProfile } from './profile';
import { buildProgram, type BuiltProgram, type Exercise, type ProgramJson } from './programBuild';
import abcJson from './program-abc.json';
import partnerJson from './program-partner.json';

export type { Exercise };

/** הסבב של שון: A→B→C; D (25/10/2026) אופציונלי, מחוץ לסבב. */
export const ABC_ROTATION: readonly WorkoutType[] = ['A', 'B', 'C'];
/** הסבב של בת הזוג: A↔B — הבא הוא זה שלא בוצע בפעם האחרונה. */
export const PARTNER_ROTATION: readonly WorkoutType[] = ['A', 'B'];

/** התוכנית של שון, כמו שהיא — בלי פרופיל זה מה שנטען. */
export function buildAbcProgram(): BuiltProgram {
  return buildProgram(abcJson as ProgramJson, 'program-abc.json', ABC_ROTATION);
}

/** התוכנית של בת הזוג (פרופיל `partner`). */
export function buildPartnerProgram(): BuiltProgram {
  return buildProgram(partnerJson as ProgramJson, 'program-partner.json', PARTNER_ROTATION);
}

const built: BuiltProgram = activeProfile() === 'partner' ? buildPartnerProgram() : buildAbcProgram();

/**
 * `type` קובע את משכי המנוחה. הערכים חיים ב-src/data/config.ts בלבד
 * ולא משוכפלים בכל תרגיל; נחשפים גם מכאן כדי שהקומפוננטות יקראו מקום אחד.
 */
export const TYPE_CONFIG = REST_SECONDS;

/** כל האימונים בתוכנית, בסדר ההצגה. שון: A/B/C/D (D אופציונלי — ראה `ROTATION`); בת הזוג: A/B. */
export const WORKOUT_TYPES: WorkoutType[] = built.types;

/**
 * הסבב: "הבא בתור" (`nextType`) ממשיך מהאימון האחרון שבסבב, ו-"אימונים
 * n/3" (`WORKOUTS_PER_WEEK`) סופר רק אותם. שון: A→B→C, ו-D נבחר ידנית בלבד
 * ולא משפיע על אף אחד מהשניים. בת הזוג: A↔B.
 */
export const ROTATION: readonly WorkoutType[] = built.rotation;

/** האם האימון בסבב ונספר ב-"אימונים n/3". D → false. */
export function isRotationType(t: WorkoutType): boolean {
  return ROTATION.includes(t);
}

/** התרגילים של כל אימון, בסדר הביצוע. אותו id יכול להופיע בשני אימונים עם סטים/טווח שונים. */
export const PROGRAM: Record<WorkoutType, Exercise[]> = built.program;

/** כותרת האימון להצגה ("דחיפה + ארבע-ראשי"). */
export const WORKOUT_TITLES: Record<WorkoutType, string> = built.titles;

/**
 * תרגילים שירדו מהתוכנית. נשארים כזהות בלבד כדי שרשומה ישנה תמשיך להיות
 * מובנת: "פלאנק צד" עדיין יודע שהוא בשניות, ותרגיל שירד עדיין מוצג בשמו.
 * לא מופיעים באף אימון ולא ניתן לבחור אותם.
 */
export const RETIRED: Exercise[] = built.retired;

/**
 * מאגר החלופות (שלב 4.1): תרגילים שאפשר להחליף אליהם לאימון אחד כשמכונה
 * תפוסה. סטים וטווח יורשים מהתא בזמן ההחלפה; הערכים כאן הם ברירת מחדל.
 * מזהה פרוש שתאם בשם הועבר לכאן — ההיסטוריה שלו ממשיכה.
 */
export const ALTERNATES: Exercise[] = built.alternates;

/** כמה אימוני סבב (A/B/C) בשבוע התוכנית מצפה להם. משמש לספירה "n/3" ולסעיף "חסר". D לא נספר. */
export const WORKOUTS_PER_WEEK = 3;

/** תזכורת קבועה בראש מסך האימונים. תזכורת, לא הגדרה — אין לה השפעה על הלוגיקה. */
export const CONSTRAINTS =
  'ברך — בלי כריעה מתחת ל-90°, בלי קפיצות. כתף — בלי לחיצה מעל הראש, מרפקים 45°.';

/**
 * זהות לפי id: המופע הראשון בתוכנית, ואחריו הפרושים. כשאותו id מופיע
 * בשני אימונים, הזהות (שם, סוג, דגלים) זהה — רק סטים/טווח שונים, ולהם
 * יש `exerciseIn`.
 */
const BY_ID: Map<string, Exercise> = built.byId;
const BY_NAME: Map<string, string> = built.byName;

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
  'לג-פרס במכונה חצי שכיבה': 'leg-press',
};

/**
 * מזהה ישן → מזהה נוכחי, כשמתברר שמדובר באותה מכונה. חל על כל רשומה
 * בקריאה מהאחסון ומהייבוא (ראה `parseExercise`), ולכן ההיסטוריה של שני
 * המזהים מוצגת כשורה אחת בלי לגעת בקובץ שנשמר.
 *
 * "לג-פרס במכונה חצי שכיבה" (03/09–05/09/2026) נרשם כמזהה נפרד ואוחד חזרה.
 */
export const EXERCISE_ID_ALIASES: Record<string, string> = {
  'leg-press-45': 'leg-press',
};

/** המזהה הנוכחי של מזהה שנקרא מרשומה. */
export function canonicalExerciseId(id: string): string {
  return EXERCISE_ID_ALIASES[id] ?? id;
}

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
    ALTERNATES.find((e) => e.name === trimmed)?.id ??
    RETIRED.find((e) => e.name === trimmed)?.id ??
    null
  );
}

/**
 * החלופות של תא בתוכנית, לפי הסדר בקובץ. תרגיל שאינו בתוכנית → ריק.
 * אותו מזהה בשני אימונים (לג-פרס) — אותה רשימה.
 */
export function alternatesFor(exerciseId: string): Exercise[] {
  const spec = WORKOUT_TYPES.flatMap((t) => PROGRAM[t]).find((e) => e.id === exerciseId);
  if (!spec) return [];
  return spec.alternates.map((id) => BY_ID.get(id)).filter((e): e is Exercise => e !== undefined);
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
