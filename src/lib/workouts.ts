/** לוגיקת אימונים. מודול טהור. */

import type {
  CardioLog,
  CardioMode,
  CardioSegment,
  ISODate,
  LoggedExercise,
  LoggedSet,
  WorkoutEntry,
  WorkoutType,
} from '../types';
import {
  PROGRAM,
  WORKOUT_TYPES,
  type Exercise,
  exerciseById,
} from '../data/program';
import { CARDIO_MODES, FINISHER_CARDIO, WARMUP } from '../data/config';
import { compareISO, weekDays } from './date';
import { dominantSegment, segmentsOf, segmentsText, stepsText, totalMinutes } from './cardioSession';

export function sortWorkouts(list: readonly WorkoutEntry[]): WorkoutEntry[] {
  return [...list].sort(
    (a, b) => compareISO(a.d, b.d) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
}

export function upsertWorkout(
  list: readonly WorkoutEntry[],
  entry: WorkoutEntry,
): WorkoutEntry[] {
  const rest = list.filter((w) => w.id !== entry.id);
  return sortWorkouts([...rest, entry]);
}

export function removeWorkout(
  list: readonly WorkoutEntry[],
  id: string,
): WorkoutEntry[] {
  return list.filter((w) => w.id !== id);
}

export function workoutsInWeek(
  list: readonly WorkoutEntry[],
  ws: ISODate,
): WorkoutEntry[] {
  const days = new Set(weekDays(ws));
  return sortWorkouts(list.filter((w) => days.has(w.d)));
}

/** האימון האחרון שנרשם, לפי תאריך ואז לפי סדר יציב. */
export function lastWorkout(list: readonly WorkoutEntry[]): WorkoutEntry | null {
  const sorted = sortWorkouts(list);
  return sorted[sorted.length - 1] ?? null;
}

/** הבא בסבב A→B→C מהאימון האחרון שנרשם. בלי היסטוריה — A. */
export function nextType(list: readonly WorkoutEntry[]): WorkoutType {
  const last = lastWorkout(list);
  if (!last) return 'A';
  const i = WORKOUT_TYPES.indexOf(last.t);
  return WORKOUT_TYPES[(i + 1) % WORKOUT_TYPES.length] ?? 'A';
}

// ---------- סטים ----------

export function emptySet(): LoggedSet {
  return { weight: null, reps: null, seconds: null };
}

/** האם הסט בוצע. משקל לבדו הוא ברירת מחדל שאוכלסה, לא נתון. */
export function setPerformed(s: LoggedSet): boolean {
  return s.reps !== null || s.seconds !== null;
}

/** החזרות או השניות של הסט — מה שרלוונטי לתרגיל. */
export function setValue(s: LoggedSet): number | null {
  return s.reps ?? s.seconds;
}

/** האם התרגיל בוצע: לפחות סט אחד עם חזרות או שניות. */
export function hasData(ex: LoggedExercise): boolean {
  return ex.sets.some(setPerformed);
}

/**
 * תרגילים שהיו באימון ולא נרשמה בהם אף חזרה. השורות הריקות נשמרות עם
 * הרשומה, ולכן "מה היה מתוכנן באותו יום" מוקפא בה — לא נגזר מהתוכנית
 * הנוכחית, שאולי השתנתה מאז. חימום/אירובי לא נחשבים "דולגו" — הם
 * מדווחים רק כשבוצעו.
 */
export function skippedExercises(entry: WorkoutEntry): LoggedExercise[] {
  return entry.ex.filter((e) => !hasData(e) && !isCardio(e));
}

/** התרגילים "האמיתיים" של האימון — בלי חימום ואירובי. */
export function strengthExercises(entry: WorkoutEntry): LoggedExercise[] {
  return entry.ex.filter((e) => !isCardio(e));
}

export function isWorkoutEmpty(entry: WorkoutEntry): boolean {
  return !entry.ex.some(hasData) && entry.knee === null && entry.shoulder === null;
}

/** המשקל האחרון שנרשם בתרגיל — הסט האחרון שיש בו משקל. */
export function lastWeightOf(ex: LoggedExercise): number | null {
  for (let i = ex.sets.length - 1; i >= 0; i--) {
    const w = ex.sets[i]?.weight;
    if (w !== null && w !== undefined) return w;
  }
  return null;
}

// ---------- היסטוריה לפי תרגיל ----------

export type ExerciseHistory = { d: ISODate; workoutId: string; ex: LoggedExercise };

/**
 * הרישום האחרון של תרגיל לפי מזהה.
 *
 * המזהה, ולא השם, הוא מה שמקשר היסטוריה: תרגיל ששמו השתנה בתוכנית עדיין
 * מוצא את הביצועים הקודמים שלו (ראה `EXERCISE_ALIASES` ב-data/program.ts).
 * `excludeId` מאפשר להתעלם מהאימון שנערך כרגע.
 */
export function lastExercise(
  list: readonly WorkoutEntry[],
  exerciseId: string,
  excludeId?: string,
): ExerciseHistory | null {
  let best: ExerciseHistory | null = null;
  for (const w of list) {
    if (excludeId !== undefined && w.id === excludeId) continue;
    for (const ex of w.ex) {
      if (ex.exerciseId !== exerciseId) continue;
      if (!hasData(ex)) continue;
      if (
        !best ||
        compareISO(w.d, best.d) > 0 ||
        (w.d === best.d && w.id > best.workoutId)
      ) {
        best = { d: w.d, workoutId: w.id, ex };
      }
    }
  }
  return best;
}

/** כל הרישומים של תרגיל, מהישן לחדש. משמש למגמה בהיסטוריה. */
export function exerciseHistory(
  list: readonly WorkoutEntry[],
  exerciseId: string,
): ExerciseHistory[] {
  const out: ExerciseHistory[] = [];
  for (const w of sortWorkouts(list)) {
    for (const ex of w.ex) {
      if (ex.exerciseId === exerciseId && hasData(ex)) {
        out.push({ d: w.d, workoutId: w.id, ex });
      }
    }
  }
  return out;
}

/**
 * הערך שמייצג ביצוע אחד בגרף ההתקדמות: המשקל בתרגיל משקל, השניות הטובות
 * ביותר בתרגיל זמן, והחזרות הטובות ביותר בתרגיל משקל גוף. ביצוע בלי ערך
 * (משקל שלא נרשם) נשמט — הגרף מצייר רק מה שנרשם.
 */
export function progressValue(
  ex: LoggedExercise,
  measure: 'weight' | 'seconds' | 'reps',
): number | null {
  if (measure === 'weight') return lastWeightOf(ex);
  const values = ex.sets
    .map((s) => (measure === 'seconds' ? s.seconds : s.reps))
    .filter((v): v is number => v !== null);
  return values.length ? Math.max(...values) : null;
}

/** נקודות הגרף של תרגיל, מהישן לחדש: תאריך וערך לכל ביצוע שיש בו ערך. */
export function progressPoints(
  history: readonly ExerciseHistory[],
  measure: 'weight' | 'seconds' | 'reps',
): { d: ISODate; value: number }[] {
  const out: { d: ISODate; value: number }[] = [];
  for (const h of history) {
    const value = progressValue(h.ex, measure);
    if (value !== null) out.push({ d: h.d, value });
  }
  return out;
}

/**
 * הביצועים האחרונים של תרגיל, מהחדש לישן — מה שמוצג מעל שדות הקלט.
 * `excludeId` מתעלם מהאימון שנערך כרגע, כדי שהוא לא יופיע כ"קודם" של עצמו.
 */
export function recentExercises(
  list: readonly WorkoutEntry[],
  exerciseId: string,
  count: number,
  excludeId?: string,
): ExerciseHistory[] {
  return exerciseHistory(list, exerciseId)
    .filter((h) => excludeId === undefined || h.workoutId !== excludeId)
    .slice(-count)
    .reverse();
}

// ---------- חימום ואירובי סיום ----------

/** מזהי השורות המיוחדות. לא בתוכנית — קיימים רק ברשומה. */
export const WARMUP_ID = 'warmup';
export const FINISHER_ID = 'finisher-cardio';

export const CARDIO_NAMES: Record<typeof WARMUP_ID | typeof FINISHER_ID, string> = {
  [WARMUP_ID]: 'חימום',
  [FINISHER_ID]: 'אירובי',
};

export function isCardioId(id: string): id is typeof WARMUP_ID | typeof FINISHER_ID {
  return id === WARMUP_ID || id === FINISHER_ID;
}

export function isCardio(ex: LoggedExercise): boolean {
  return isCardioId(ex.exerciseId);
}

/** "אופניים" / "הליכון". */
export function cardioModeLabel(mode: CardioMode): string {
  return CARDIO_MODES.find((m) => m.id === mode)?.label ?? mode;
}

/** "שיפוע 2.5% · 5 קמ״ש" — רק מה שנרשם. ריק כשאין. */
export function cardioGaugeText(incline: number | null | undefined, speed: number | null | undefined): string {
  const parts: string[] = [];
  if (incline !== null && incline !== undefined) parts.push(`שיפוע ${incline}%`);
  if (speed !== null && speed !== undefined) parts.push(`${speed} קמ״ש`);
  return parts.join(' · ');
}

/**
 * "חימום · אופניים · 10 דק׳" — השורה בהיסטוריה. null כשלא בוצע.
 * אירובי עם שיפוע/מהירות: "אירובי · הליכון · 30 דק׳ · שיפוע 2.5% · 5 קמ״ש"
 * (של המקטע הארוך ביותר). הפירוט לפי מקטעים ב-`cardioDetailLine`.
 */
export function cardioLine(ex: LoggedExercise): string | null {
  const minutes = cardioMinutesDone(ex);
  if (minutes === null) return null;
  const c = cardioOf(ex);
  const gauges = cardioGaugeText(c.incline, c.speed);
  return `${ex.n} · ${cardioModeLabel(c.mode)} · ${minutes} דק׳${gauges ? ` · ${gauges}` : ''}`;
}

/** המקטעים של שורת אירובי (רשומה ישנה = מקטע יחיד). */
export function cardioSegmentsOf(ex: LoggedExercise): CardioSegment[] {
  return segmentsOf(cardioOf(ex));
}

/**
 * השורה השנייה בהיסטוריה: פירוט המקטעים כשיש יותר מאחד, וצעדים כשנרשמו.
 * null כשאין מה להוסיף מעבר ל-`cardioLine`.
 */
export function cardioDetailLine(ex: LoggedExercise): string | null {
  if (cardioMinutesDone(ex) === null) return null;
  const c = cardioOf(ex);
  const parts: string[] = [];
  const segs = segmentsOf(c);
  if (segs.length > 1) parts.push(segmentsText(segs));
  if (c.steps !== undefined) parts.push(stepsText(c.steps));
  return parts.length ? parts.join(' · ') : null;
}

/**
 * סיום ריצה: המקטעים והצעדים נכנסים לרשומה, `minutes` = הסכום,
 * שיפוע/מהירות העליונים = של המקטע הארוך ביותר, והביצוע נרשם
 * ב-sets[0].seconds. זה הנתיב היחיד שכותב אירובי סיום עם מקטעים.
 */
export function finishCardio(
  ex: LoggedExercise,
  mode: CardioMode,
  segments: readonly CardioSegment[],
  steps: number | null,
): LoggedExercise {
  const total = totalMinutes(segments);
  const dom = dominantSegment(segments);
  const cardio: CardioLog = { mode, minutes: total };
  if (dom?.incline !== null && dom?.incline !== undefined) cardio.incline = dom.incline;
  if (dom?.speed !== null && dom?.speed !== undefined) cardio.speed = dom.speed;
  if (segments.length > 0) cardio.segments = segments.map((x) => ({ ...x }));
  if (steps !== null) cardio.steps = steps;
  return { ...ex, cardio, sets: [{ weight: null, reps: null, seconds: total * 60 }] };
}

/**
 * שורת חימום/אירובי ריקה, בלי ביצוע. `prefill` (לאירובי סיום) מחליף את
 * ברירות המחדל של config.ts במה שנרשם באירובי האחרון.
 */
export function blankCardio(
  id: typeof WARMUP_ID | typeof FINISHER_ID,
  prefill: CardioLog | null = null,
): LoggedExercise {
  const defaults = id === WARMUP_ID ? WARMUP : FINISHER_CARDIO;
  return {
    exerciseId: id,
    n: CARDIO_NAMES[id],
    sets: [],
    targetRepMin: 0,
    targetRepMax: 0,
    type: 'cardio',
    bodyweightOnly: true,
    assisted: false,
    cardio: prefill ?? { mode: defaults.defaultMode, minutes: defaults.defaultMinutes },
  };
}

/** המצב והדקות של שורת אירובי, עם ברירות מחדל לרשומה שנקלטה בלי `cardio`. */
export function cardioOf(ex: LoggedExercise): CardioLog {
  if (ex.cardio) return ex.cardio;
  const seconds = ex.sets[0]?.seconds ?? null;
  return { mode: 'bike', minutes: seconds === null ? 0 : Math.round(seconds / 60) };
}

/**
 * האירובי סיום האחרון שבוצע — מה שממלא מראש את שורת האירובי באימון חדש:
 * מצב, סך הדקות, ושיפוע/מהירות של המקטע הארוך ביותר (לא הראשון — הראשון
 * הוא בדרך כלל חימום). בלי מקטעים ובלי צעדים: ריצה חדשה מתחילה נקייה.
 * `mode` מצמצם לאותו מכשיר; `excludeId` מתעלם מהאימון שנערך כרגע.
 */
export function lastFinisherCardio(
  list: readonly WorkoutEntry[],
  mode?: CardioMode,
  excludeId?: string,
): CardioLog | null {
  let best: { d: ISODate; id: string; cardio: CardioLog } | null = null;
  for (const w of list) {
    if (excludeId !== undefined && w.id === excludeId) continue;
    for (const ex of w.ex) {
      if (ex.exerciseId !== FINISHER_ID || cardioMinutesDone(ex) === null) continue;
      const c = cardioOf(ex);
      if (mode !== undefined && c.mode !== mode) continue;
      if (!best || compareISO(w.d, best.d) > 0 || (w.d === best.d && w.id > best.id)) {
        best = { d: w.d, id: w.id, cardio: c };
      }
    }
  }
  if (!best) return null;
  const c = best.cardio;
  return {
    mode: c.mode,
    minutes: c.minutes,
    ...(c.incline !== undefined ? { incline: c.incline } : {}),
    ...(c.speed !== undefined ? { speed: c.speed } : {}),
  };
}

/**
 * הדקות שבוצעו בפועל — מה שנרשם בלחיצה על "התחל". null כשלא בוצע.
 * נגזר מ-`sets[0].seconds` כדי ש-`hasData` יעבוד כמו בכל תרגיל אחר.
 */
export function cardioMinutesDone(ex: LoggedExercise): number | null {
  const seconds = ex.sets[0]?.seconds ?? null;
  return seconds === null ? null : Math.round(seconds / 60);
}

/** מסמן אירובי כבוצע: הדקות מהשדה נכנסות ל-`sets[0].seconds`. */
export function markCardioDone(ex: LoggedExercise, minutes: number): LoggedExercise {
  const cardio = { ...cardioOf(ex), minutes };
  return { ...ex, cardio, sets: [{ weight: null, reps: null, seconds: minutes * 60 }] };
}

/**
 * משנה מצב/דקות/שיפוע/מהירות בלי לגעת בביצוע — מלבד עדכון הדקות אם כבר
 * בוצע. `incline: null` / `speed: null` מסירים את השדה.
 */
export function patchCardio(
  ex: LoggedExercise,
  patch: Partial<{ mode: CardioMode; minutes: number; incline: number | null; speed: number | null }>,
): LoggedExercise {
  const { incline, speed, ...rest } = patch;
  const cardio: CardioLog = { ...cardioOf(ex), ...rest };
  if (incline !== undefined) {
    if (incline === null) delete cardio.incline;
    else cardio.incline = incline;
  }
  if (speed !== undefined) {
    if (speed === null) delete cardio.speed;
    else cardio.speed = speed;
  }
  const done = cardioMinutesDone(ex) !== null;
  return {
    ...ex,
    cardio,
    sets: done ? [{ weight: null, reps: null, seconds: cardio.minutes * 60 }] : ex.sets,
  };
}

// ---------- בניית אימון ----------

/** שורת תרגיל ריקה לפי המפרט, עם משקל התחלתי אופציונלי. */
export function blankLoggedExercise(
  spec: Exercise,
  weight: number | null = null,
): LoggedExercise {
  const usesWeight = !spec.isTimed && !spec.bodyweightOnly;
  return {
    exerciseId: spec.id,
    n: spec.name,
    sets: Array.from({ length: spec.sets }, () => ({
      weight: usesWeight ? weight : null,
      reps: null,
      seconds: null,
    })),
    targetRepMin: spec.repRangeMin,
    targetRepMax: spec.repRangeMax,
    type: spec.type,
    bodyweightOnly: spec.bodyweightOnly,
    assisted: spec.assisted,
  };
}

/** שורות תרגילים ריקות לאימון חדש מסוג נתון. */
export function blankExercises(t: WorkoutType): LoggedExercise[] {
  return PROGRAM[t].map((spec) => blankLoggedExercise(spec));
}

/**
 * המשקל שאיתו לפתוח את התרגיל: בדיוק מה שנרשם בביצוע האחרון.
 * בלי תוספת ובלי חישוב — ההחלטה על משקל מתקבלת מחוץ לאפליקציה.
 * null כשאין על מה להתבסס.
 */
export function openingWeight(
  list: readonly WorkoutEntry[],
  exerciseId: string,
  excludeId?: string,
): number | null {
  const last = lastExercise(list, exerciseId, excludeId);
  return last ? lastWeightOf(last.ex) : null;
}

/**
 * שורות תרגילים לאימון חדש: חימום בראש, תרגילי התוכנית עם המשקל מהרישום
 * האחרון, ואירובי סיום בסוף — ריק, ממולא מראש מהאירובי האחרון שנרשם.
 * המטרה: לאשר או לשנות, לא להקליד מחדש. החזרות תמיד ריקות — המשקל לבדו
 * אינו נחשב נתון (ראה `hasData`), ולכן אימון כזה עדיין נחשב ריק.
 */
export function prefilledExercises(
  list: readonly WorkoutEntry[],
  t: WorkoutType,
): LoggedExercise[] {
  return [
    blankCardio(WARMUP_ID),
    ...PROGRAM[t].map((spec) => blankLoggedExercise(spec, openingWeight(list, spec.id))),
    blankCardio(FINISHER_ID, lastFinisherCardio(list)),
  ];
}

/**
 * שורות התרגילים להצגה באימון, בסדר הביצוע: חימום (אינדקס 0), תרגילי
 * התוכנית לפי סדרן, תרגילים שנרשמו בעבר ואינם בתוכנית הנוכחית — כדי
 * שהיסטוריה לא תיעלם מהמסך — ואירובי סיום אחרון.
 *
 * רשומה ישנה בלי חימום או בלי אירובי מקבלת שורה ריקה; שורה ריקה אינה
 * נתון (ראה `hasData`) ולא משנה את הרשומה עד שלוחצים "התחל".
 */
export function exercisesFor(
  entry: WorkoutEntry,
  all: readonly WorkoutEntry[],
): LoggedExercise[] {
  const byId = new Map(entry.ex.map((e) => [e.exerciseId, e]));
  const rows: LoggedExercise[] = [byId.get(WARMUP_ID) ?? blankCardio(WARMUP_ID)];
  for (const spec of PROGRAM[entry.t]) {
    const existing = byId.get(spec.id);
    rows.push(
      existing
        ? withSetCount(existing, spec.sets)
        : blankLoggedExercise(spec, openingWeight(all, spec.id, entry.id)),
    );
  }
  const placed = new Set(rows.map((r) => r.exerciseId));
  for (const e of entry.ex) {
    if (!placed.has(e.exerciseId) && e.exerciseId !== FINISHER_ID && hasData(e)) {
      rows.push(e);
    }
  }
  rows.push(
    byId.get(FINISHER_ID) ?? blankCardio(FINISHER_ID, lastFinisherCardio(all, undefined, entry.id)),
  );
  return rows;
}

/**
 * משלים את מספר הסטים לזה שבתוכנית. רשומות נשמרות בלי סטים ריקים בסוף,
 * ולכן צריך להרחיב אותן חזרה לתצוגה — בלי לקצץ אם נרשמו יותר.
 */
export function withSetCount(ex: LoggedExercise, count: number): LoggedExercise {
  if (ex.sets.length >= count) return ex;
  return {
    ...ex,
    sets: [
      ...ex.sets,
      ...Array.from({ length: count - ex.sets.length }, () => emptySet()),
    ],
  };
}

// ---------- מזהים וכאב ----------

/**
 * חותמת זמן בבסיס 36 ברוחב קבוע, כך שהשוואת מחרוזות שווה להשוואת זמן.
 * הריפוד לרוחב קבוע הוא מה שמבטיח את זה: בלעדיו מחרוזת קצרה יותר הייתה
 * מסודרת לפני ארוכה ממנה גם אם היא מאוחרת. תשעה תווים מספיקים עד שנת 5138.
 */
export function sortableStamp(nowMs: number): string {
  return Math.max(0, Math.floor(nowMs)).toString(36).padStart(9, '0');
}

/**
 * מזהה אימון. הייחודיות מגיעה מבחוץ כדי שהמודול יישאר טהור.
 * `unique` צריך להתחיל ב-sortableStamp כדי ששני אימונים באותו יום יסודרו
 * לפי סדר היצירה — זה מה שקובע מי "הבא בתור" בסבב.
 */
export function makeWorkoutId(d: ISODate, t: WorkoutType, unique: string): string {
  return `${d}-${unique}-${t}`;
}

/** כאב הכי גבוה שנרשם בקבוצת אימונים. null אם לא נרשם כלל. */
export function peakPain(
  list: readonly WorkoutEntry[],
  field: 'knee' | 'shoulder',
): number | null {
  let max: number | null = null;
  for (const w of list) {
    const v = w[field];
    if (v === null) continue;
    if (max === null || v > max) max = v;
  }
  return max;
}

/** האם התרגיל הוא תרגיל זמן, לפי המפרט הנוכחי. */
export function isTimedExercise(ex: LoggedExercise): boolean {
  if (isCardio(ex)) return true;
  return exerciseById(ex.exerciseId)?.isTimed ?? ex.sets.some((s) => s.seconds !== null);
}
