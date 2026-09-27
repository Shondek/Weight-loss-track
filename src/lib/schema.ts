/**
 * אימות ונרמול של נתונים שנכנסים מבחוץ — מהאחסון או מקובץ ייבוא.
 * מודול טהור. לעולם לא זורק: מחזיר את מה שתקין ורשימת דחיות עם סיבה.
 */

import {
  type CardioLog,
  type CardioMode,
  type CardioSegment,
  type CustomFood,
  type DayMeta,
  type CreatineDay,
  type DB,
  type ExerciseType,
  type Favorite,
  type FoodEntry,
  type FoodPortion,
  type FoodRef,
  type FridayTier,
  type ISODate,
  type LegacyWorkout,
  type LoggedExercise,
  type LoggedSet,
  type MealType,
  type NutritionTarget,
  type QuarantineItem,
  type Recipe,
  type Rir,
  type Settings,
  type StandaloneCardio,
  type WaistEntry,
  type WeeklyCheckin,
  type WeightEntry,
  type WorkoutEntry,
  type WorkoutType,
  DEFAULT_SETTINGS,
  ENTRY_NOTE_MAX,
  FOOD_NOTE_MAX,
  RECIPE_UNIT_MAX,
  ADHOC_MAX_KCAL,
  ADHOC_MAX_MACRO,
  NOTE_MAX,
  UNIT_FOOD_SCALE,
  WORKOUT_SCHEMA_VERSION,
} from '../types';
import { canonicalExerciseId, exerciseById, resolveExerciseId } from '../data/program';
import { compareISO, isValidISO, toLocalISO, weekStart } from './date';
import { isCardioId } from './workouts';
import { sortStandalone } from './cardio';
import { dominantSegment, totalMinutes } from './cardioSession';
import { CARDIO_INCLINE_MAX, CARDIO_SPEED_MAX } from '../data/config';
import { isCustomFoodId, isMohFoodId } from './nutrition/foods';
import { fingerprint, mergeQuarantine, quarantineFromRejections } from './quarantine';

/**
 * דחייה. `raw` קיים כשהרשומה עצמה נדחתה ולא תיכנס ל-`ok` — היא הולכת להסגר
 * (lib/quarantine.ts). דחייה בלי `raw` היא הערה על רשומה שכן נשמרה.
 */
export type Rejection = { reason: string; raw?: unknown };

export type ParseResult<T> = { ok: T[]; rejected: Rejection[] };

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function num(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function intInRange(v: unknown, min: number, max: number): number | null {
  const n = num(v);
  if (n === null) return null;
  const r = Math.round(n);
  return r >= min && r <= max ? r : null;
}

function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

// ---------- משקל ----------

export const MIN_WEIGHT = 20;
export const MAX_WEIGHT = 400;

export function parseWeights(input: unknown): ParseResult<WeightEntry> {
  const rejected: Rejection[] = [];
  const byDate = new Map<ISODate, WeightEntry>();

  for (const raw of asArray(input)) {
    if (!isRecord(raw)) {
      rejected.push({ raw, reason: 'רשומה שאינה אובייקט' });
      continue;
    }
    if (!isValidISO(raw.d)) {
      rejected.push({ raw, reason: 'תאריך לא תקין' });
      continue;
    }
    const w = num(raw.w);
    if (w === null) {
      rejected.push({ raw, reason: 'משקל שאינו מספר' });
      continue;
    }
    if (w < MIN_WEIGHT || w > MAX_WEIGHT) {
      rejected.push({ raw, reason: `משקל מחוץ לטווח ${MIN_WEIGHT}–${MAX_WEIGHT} ק"ג` });
      continue;
    }
    byDate.set(raw.d, { d: raw.d, w });
  }

  const ok = [...byDate.values()].sort((a, b) => compareISO(a.d, b.d));
  return { ok, rejected };
}

// ---------- מותניים ----------

export const MIN_WAIST = 30;
export const MAX_WAIST = 300;

export function parseWaist(input: unknown): ParseResult<WaistEntry> {
  const rejected: Rejection[] = [];
  const byDate = new Map<ISODate, WaistEntry>();

  for (const raw of asArray(input)) {
    if (!isRecord(raw)) {
      rejected.push({ raw, reason: 'רשומה שאינה אובייקט' });
      continue;
    }
    if (!isValidISO(raw.d)) {
      rejected.push({ raw, reason: 'תאריך לא תקין' });
      continue;
    }
    const cm = num(raw.cm);
    if (cm === null) {
      rejected.push({ raw, reason: 'היקף מותניים שאינו מספר' });
      continue;
    }
    if (cm < MIN_WAIST || cm > MAX_WAIST) {
      rejected.push({ raw, reason: `היקף מותניים מחוץ לטווח ${MIN_WAIST}–${MAX_WAIST} ס"מ` });
      continue;
    }
    byDate.set(raw.d, { d: raw.d, cm });
  }

  const ok = [...byDate.values()].sort((a, b) => compareISO(a.d, b.d));
  return { ok, rejected };
}

// ---------- אימונים ----------

const TYPES: readonly WorkoutType[] = ['A', 'B', 'C'];

const MAX_SETS = 10;
const EXERCISE_TYPES: readonly ExerciseType[] = ['compound', 'isolation', 'core', 'cardio'];
const CARDIO_MODES: readonly CardioMode[] = ['bike', 'treadmill'];
const MAX_CARDIO_MINUTES = 1000;

/** מספר חזרות/דקות תקין, או null. */
function count(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = num(v);
  return n === null || n < 0 || n > 1000 ? null : Math.round(n);
}

/**
 * שניות של סט. תקרה נפרדת מחזרות: אירובי של 30 דק׳ הוא 1,800 שניות,
 * ותקרת ה-1000 של `count` הייתה מוחקת אותו בקריאה — כאילו לא בוצע.
 */
const MAX_SET_SECONDS = 24 * 60 * 60;
function seconds(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = num(v);
  return n === null || n < 0 || n > MAX_SET_SECONDS ? null : Math.round(n);
}

function weight(v: unknown): number | null {
  const n = num(v);
  return n !== null && n >= 0 && n <= 1000 ? n : null;
}

/** מסיר סטים ריקים מהסוף, כדי ש-`sets.length` ישקף כמה באמת נרשמו. */
function trimTrailingEmpty(sets: LoggedSet[]): LoggedSet[] {
  let end = sets.length;
  while (end > 0) {
    const s = sets[end - 1];
    if (!s || (s.reps === null && s.seconds === null && s.weight === null)) end--;
    else break;
  }
  return sets.slice(0, end);
}

/** הפורמט החדש: מערך סטים באורך משתנה. */
function parseLoggedSets(input: unknown): LoggedSet[] {
  const out: LoggedSet[] = [];
  for (const raw of asArray(input).slice(0, MAX_SETS)) {
    if (!isRecord(raw)) {
      out.push({ weight: null, reps: null, seconds: null });
      continue;
    }
    out.push({
      weight: weight(raw.weight),
      reps: count(raw.reps),
      seconds: seconds(raw.seconds),
    });
  }
  return trimTrailingEmpty(out);
}

/**
 * הפורמט הישן: משקל אחד לתרגיל ומערך חזרות באורך 3.
 * מועלה לפורמט החדש בקריאה — המשקל מוכפל לכל סט שבוצע.
 * `timed` מגיע מהמפרט הנוכחי, כי הרשומה הישנה לא ידעה להבחין.
 */
function upcastLegacySets(r: unknown, w: unknown, timed: boolean): LoggedSet[] {
  const value = weight(w);
  const sets = asArray(r)
    .slice(0, MAX_SETS)
    .map((v) => {
      const n = timed ? seconds(v) : count(v);
      return {
        weight: timed ? null : n === null ? null : value,
        reps: timed ? null : n,
        seconds: timed ? n : null,
      };
    });
  return trimTrailingEmpty(sets);
}

/** שיפוע / מהירות: מספר בטווח, או null. ערך שבור לא דוחה את הרשומה. */
function gauge(v: unknown, max: number): number | null {
  const n = num(v);
  return n !== null && n >= 0 && n <= max ? n : null;
}

const MAX_SEGMENTS = 50;
const MAX_STEPS = 100_000;

/**
 * מקטעי אירובי. מקטע בלי דקות חיוביות נשמט; אם לא נשאר כלום — כאילו
 * אין `segments`, והרשומה נקראת מ-minutes/incline/speed.
 */
function parseSegments(v: unknown): CardioSegment[] {
  const out: CardioSegment[] = [];
  for (const raw of asArray(v).slice(0, MAX_SEGMENTS)) {
    if (!isRecord(raw)) continue;
    const minutes = count(raw.minutes);
    if (minutes === null || minutes <= 0) continue;
    out.push({
      minutes: Math.min(minutes, MAX_CARDIO_MINUTES),
      incline: gauge(raw.incline, CARDIO_INCLINE_MAX),
      speed: gauge(raw.speed, CARDIO_SPEED_MAX),
    });
  }
  return out;
}

/** צעדי הליכון: מספר שלם 0–100,000, או null. */
function parseSteps(v: unknown): number | null {
  const n = num(v);
  return n !== null && n >= 0 && n <= MAX_STEPS ? Math.round(n) : null;
}

/**
 * מה שנגזר מהמקטעים כשיש: `minutes` = הסכום, שיפוע/מהירות = של המקטע
 * הארוך ביותר. זה האינווריאנט שכל הקוראים מסתמכים עליו.
 */
function fromSegments(segments: CardioSegment[]): {
  minutes: number;
  incline: number | null;
  speed: number | null;
} {
  const dom = dominantSegment(segments)!;
  return { minutes: totalMinutes(segments), incline: dom.incline, speed: dom.speed };
}

/**
 * חימום / אירובי: מצב ודקות. רשומה שנקלטה בלי `cardio` (או עם ערכים
 * שבורים) מקבלת "אופניים" והדקות נגזרות ממה שבוצע — לא נדחית.
 * שיפוע ומהירות נכנסים רק כשהם קיימים ותקינים — רשומה ישנה נשארת בלעדיהם.
 */
function parseCardio(v: unknown, sets: LoggedSet[]): CardioLog {
  const rec = isRecord(v) ? v : {};
  const mode = CARDIO_MODES.find((m) => m === rec.mode) ?? 'bike';
  const doneSeconds = sets[0]?.seconds ?? null;
  const minutes =
    count(rec.minutes) ?? (doneSeconds === null ? 0 : Math.round(doneSeconds / 60));
  const segments = parseSegments(rec.segments);
  const steps = parseSteps(rec.steps);
  const derived =
    segments.length > 0
      ? fromSegments(segments)
      : {
          minutes: Math.min(minutes, MAX_CARDIO_MINUTES),
          incline: gauge(rec.incline, CARDIO_INCLINE_MAX),
          speed: gauge(rec.speed, CARDIO_SPEED_MAX),
        };
  return {
    mode,
    minutes: derived.minutes,
    ...(derived.incline !== null ? { incline: derived.incline } : {}),
    ...(derived.speed !== null ? { speed: derived.speed } : {}),
    ...(segments.length > 0 ? { segments } : {}),
    ...(steps !== null ? { steps } : {}),
  };
}

/** ברירות מחדל לתרגיל שכבר לא קיים בתוכנית ולכן אין לו מפרט. */
const ORPHAN_DEFAULTS = { targetRepMin: 8, targetRepMax: 12 } as const;

/** תרגיל בלי שם ובלי מזהה. לא נזרק — הסטים שלו הם עדיין נתון שנרשם. */
const UNNAMED_EXERCISE = 'תרגיל ללא שם';

/**
 * תרגיל בודד, משני הפורמטים.
 *
 * חדש  — יש `sets`.
 * ישן  — יש `r` ו-`w`, ואין `sets`. מועלה כאן, ותוצאת ההעלאה נכתבת לדיסק
 *        פעם אחת ב-`loadDB` אחרי שהמקור גובה (ראה store.ts).
 */
const RIR_VALUES: readonly Rir[] = [0, 1, 2, 3, 4];

/**
 * RIR בסט האחרון. חסר/null = לא נרשם. ערך שאינו 0–4 אינו מאפס את
 * הרשומה: התרגיל נטען בלי RIR, והערך השבור נשלח להסגר דרך `reject`.
 */
function parseRir(v: unknown): { rir: Rir | undefined; bad: boolean } {
  if (v === undefined || v === null || v === '') return { rir: undefined, bad: false };
  const n = num(v);
  const rir = RIR_VALUES.find((x) => x === n);
  return rir === undefined ? { rir: undefined, bad: true } : { rir, bad: false };
}

/**
 * `swappedFrom` (שלב 4.1): חסר/null/ריק = לא הוחלף. מחרוזת = מזהה התרגיל
 * המקורי (מתורגם דרך הכינויים). ערך אחר לא מאפס את הרשומה: התרגיל נטען
 * בלי הסימון, והערך השבור נשלח להסגר דרך `reject`.
 */
function parseSwappedFrom(v: unknown): { swappedFrom: string | undefined; bad: boolean } {
  if (v === undefined || v === null || v === '') return { swappedFrom: undefined, bad: false };
  if (typeof v !== 'string' || v.trim() === '') return { swappedFrom: undefined, bad: true };
  return { swappedFrom: canonicalExerciseId(v.trim()), bad: false };
}

function parseExercise(e: Record<string, unknown>, reject?: (raw: unknown, reason: string) => void): LoggedExercise {
  const name = typeof e.n === 'string' ? e.n.trim() : '';
  const rawId = typeof e.exerciseId === 'string' ? e.exerciseId.trim() : '';
  // מזהה שאוחד למזהה אחר (אותה מכונה) מתורגם כאן, פעם אחת, בכניסה.
  const id = rawId !== '' ? canonicalExerciseId(rawId) : (name !== '' ? resolveExerciseId(name) : null);

  const spec = id !== null ? exerciseById(id) : undefined;
  const isNewFormat = Array.isArray(e.sets);
  const cardio = id !== null && isCardioId(id);
  const timed = cardio || (spec?.isTimed ?? false);
  const sets = isNewFormat ? parseLoggedSets(e.sets) : upcastLegacySets(e.r, e.w, timed);
  const { rir, bad: rirBad } = parseRir(e.rir);
  if (rirBad) reject?.(e, `RIR מחוץ לטווח 0–4 בתרגיל "${name !== '' ? name : id ?? UNNAMED_EXERCISE}" — נטען בלי RIR`);
  const { swappedFrom, bad: swapBad } = parseSwappedFrom(e.swappedFrom);
  if (swapBad) reject?.(e, `סימון החלפה (swappedFrom) לא תקין בתרגיל "${name !== '' ? name : id ?? UNNAMED_EXERCISE}" — נטען בלי הסימון`);

  // שורת חימום/אירובי מזוהה לפי המזהה בלבד — הסוג שנשמר לא יכול לסתור אותה.
  const type = cardio
    ? 'cardio'
    : (EXERCISE_TYPES.find((x) => x === e.type && x !== 'cardio') ??
      spec?.type ??
      'isolation');

  return {
    exerciseId: id ?? `legacy:${name !== '' ? name : UNNAMED_EXERCISE}`,
    n: name !== '' ? name : (spec?.name ?? id ?? UNNAMED_EXERCISE),
    sets,
    targetRepMin:
      count(e.targetRepMin) ?? spec?.repRangeMin ?? ORPHAN_DEFAULTS.targetRepMin,
    targetRepMax:
      count(e.targetRepMax) ?? spec?.repRangeMax ?? ORPHAN_DEFAULTS.targetRepMax,
    type,
    bodyweightOnly:
      typeof e.bodyweightOnly === 'boolean'
        ? e.bodyweightOnly
        : (spec?.bodyweightOnly ?? cardio),
    assisted: typeof e.assisted === 'boolean' ? e.assisted : (spec?.assisted ?? false),
    ...(cardio ? { cardio: parseCardio(e.cardio, sets) } : {}),
    ...(rir !== undefined && !cardio ? { rir } : {}),
    ...(swappedFrom !== undefined && !cardio ? { swappedFrom } : {}),
  };
}

export type WorkoutsParseResult = ParseResult<WorkoutEntry> & {
  /**
   * כל רשומה שנדחתה, גולמית. אותו מידע כמו `rejected`, אבל עם הרשומה עצמה —
   * כדי שהיא תישמר כמו שהיא ותוצג כ"אימון ישן" במקום להיעלם.
   */
  unparsed: LegacyWorkout[];
  /** כמה רשומות תקינות הגיעו בלי `schemaVersion` — כלומר הומרו כאן. */
  upgraded: number;
};

export function parseWorkouts(input: unknown): WorkoutsParseResult {
  const rejected: Rejection[] = [];
  const unparsed: LegacyWorkout[] = [];
  const byId = new Map<string, WorkoutEntry>();
  let generated = 0;
  let upgraded = 0;

  const reject = (raw: unknown, reason: string) => {
    rejected.push({ reason });
    unparsed.push({
      raw,
      d: isRecord(raw) && typeof raw.d === 'string' ? raw.d : null,
      reason,
    });
  };

  for (const raw of asArray(input)) {
    if (!isRecord(raw)) {
      reject(raw, 'רשומה שאינה אובייקט');
      continue;
    }
    if (!isValidISO(raw.d)) {
      reject(raw, 'תאריך לא תקין');
      continue;
    }
    const t = TYPES.find((x) => x === raw.t);
    if (!t) {
      reject(raw, 'סוג אימון שאינו A/B/C');
      continue;
    }

    // דחיית שדה (RIR שבור) נושאת raw ונכנסת להסגר; הרשומה עצמה נטענת.
    const ex = asArray(raw.ex)
      .filter(isRecord)
      .map((x) => parseExercise(x, (r, reason) => rejected.push({ raw: r, reason })));

    const id =
      typeof raw.id === 'string' && raw.id.trim() !== ''
        ? raw.id
        : `${raw.d}-${t}-imported-${generated++}`;

    if (raw.schemaVersion !== WORKOUT_SCHEMA_VERSION) upgraded++;

    byId.set(id, {
      schemaVersion: WORKOUT_SCHEMA_VERSION,
      id,
      d: raw.d,
      t,
      ex,
      knee: intInRange(raw.knee, 0, 10),
      shoulder: intInRange(raw.shoulder, 0, 10),
    });
  }

  const ok = [...byId.values()].sort(
    (a, b) => compareISO(a.d, b.d) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
  return { ok, rejected, unparsed, upgraded };
}

// ---------- צ'ק-אין ----------

export function parseCheckins(input: unknown): ParseResult<WeeklyCheckin> {
  const rejected: Rejection[] = [];
  const byWeek = new Map<ISODate, WeeklyCheckin>();

  for (const raw of asArray(input)) {
    if (!isRecord(raw)) {
      rejected.push({ raw, reason: 'רשומה שאינה אובייקט' });
      continue;
    }
    if (!isValidISO(raw.weekStart)) {
      rejected.push({ raw, reason: 'תאריך שבוע לא תקין' });
      continue;
    }
    // מנרמלים לראשון גם אם הגיע תאריך אחר בתוך השבוע
    const ws = weekStart(raw.weekStart);
    const sleepRaw = num(raw.sleepHours);
    const sleep =
      sleepRaw === null || sleepRaw < 0 || sleepRaw > 24
        ? null
        : Math.round(sleepRaw * 2) / 2;

    byWeek.set(ws, {
      weekStart: ws,
      adherence: intInRange(raw.adherence, 1, 10),
      hunger: intInRange(raw.hunger, 1, 10),
      energy: intInRange(raw.energy, 1, 10),
      sleepHours: sleep,
      unplannedSnackDays: intInRange(raw.unplannedSnackDays, 0, 7),
      note: typeof raw.note === 'string' ? raw.note.slice(0, NOTE_MAX) : '',
    });
  }

  const ok = [...byWeek.values()].sort((a, b) => compareISO(a.weekStart, b.weekStart));
  return { ok, rejected };
}

// ---------- אירובי עצמאי ----------

/**
 * אירובי עצמאי. נדחה רק מה שאי אפשר להציג: לא אובייקט, תאריך שבור,
 * או דקות שאינן מספר חיובי. מצב לא מוכר → הליכון; שיפוע/מהירות שבורים → null.
 */
export function parseStandaloneCardio(input: unknown): ParseResult<StandaloneCardio> {
  const rejected: Rejection[] = [];
  const byId = new Map<string, StandaloneCardio>();
  let generated = 0;

  for (const raw of asArray(input)) {
    if (!isRecord(raw)) {
      rejected.push({ raw, reason: 'רשומה שאינה אובייקט' });
      continue;
    }
    if (!isValidISO(raw.d)) {
      rejected.push({ raw, reason: 'תאריך לא תקין' });
      continue;
    }
    const minutes = count(raw.minutes);
    if (minutes === null || minutes <= 0) {
      rejected.push({ raw, reason: 'דקות שאינן מספר חיובי' });
      continue;
    }
    const id =
      typeof raw.id === 'string' && raw.id.trim() !== ''
        ? raw.id
        : `${raw.d}-imported-${generated++}-cardio`;
    const segments = parseSegments(raw.segments);
    const steps = parseSteps(raw.steps);
    const derived =
      segments.length > 0
        ? fromSegments(segments)
        : {
            minutes: Math.min(minutes, MAX_CARDIO_MINUTES),
            incline: gauge(raw.incline, CARDIO_INCLINE_MAX),
            speed: gauge(raw.speed, CARDIO_SPEED_MAX),
          };
    byId.set(id, {
      id,
      d: raw.d,
      mode: CARDIO_MODES.find((m) => m === raw.mode) ?? 'treadmill',
      ...derived,
      note: typeof raw.note === 'string' ? raw.note.slice(0, NOTE_MAX) : '',
      ...(segments.length > 0 ? { segments } : {}),
      ...(steps !== null ? { steps } : {}),
    });
  }

  return { ok: sortStandalone([...byId.values()]), rejected };
}

// ---------- הגדרות ----------

export function parseSettings(input: unknown): Settings {
  if (!isRecord(input)) return { ...DEFAULT_SETTINGS };
  const ps = input.programStart;
  return {
    programStart: isValidISO(ps) ? weekStart(ps) : null,
    soundEnabled:
      typeof input.soundEnabled === 'boolean'
        ? input.soundEnabled
        : DEFAULT_SETTINGS.soundEnabled,
    lastBackup: isValidISO(input.lastBackup) ? input.lastBackup : null,
  };
}

// ---------- תזונה ----------

/**
 * ערכים ל-100 גרם. קלוריות עד 900 (שמן טהור הוא 884), מאקרו עד 100 גרם.
 * מזון עם `unitFood` (יחידה = 1 ג') מחזיק ערכי יחידה ×100, והתקרה שלו
 * מוכפלת ב-`UNIT_FOOD_SCALE` — רק לו, במפורש.
 */
export const MAX_KCAL_PER_100G = 900;
export const MAX_MACRO_PER_100G = 100;
export const MIN_GRAMS = 0.1;
export const MAX_GRAMS = 5000;
export const MAX_PORTION_GRAMS = 5000;
export const FOOD_NAME_MAX = 120;
/** טווחי יעד. הרצפה של הקלוריות תופסת "0" שהוקלד בטעות. */
export const MIN_TARGET_KCAL = 800;
export const MAX_TARGET_KCAL = 6000;
export const MAX_TARGET_PROTEIN = 400;
export const MAX_TARGET_CARBS = 800;
export const MAX_TARGET_FAT = 800;

const MEALS: readonly MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];

/** מספר בטווח סגור, או null. */
function inRange(v: unknown, min: number, max: number): number | null {
  const n = num(v);
  return n !== null && n >= min && n <= max ? n : null;
}

/** ערך ל-100 גרם שיכול להיות חסר: null נשאר null; מספר מחוץ לטווח הוא שגיאה. */
function optionalPer100(v: unknown, max: number): { ok: true; value: number | null } | { ok: false } {
  if (v === null || v === undefined || v === '') return { ok: true, value: null };
  const n = inRange(v, 0, max);
  return n === null ? { ok: false } : { ok: true, value: n };
}

function cleanText(v: unknown, max: number): string {
  return typeof v === 'string' ? v.split(/\s+/).filter((w) => w !== '').join(' ').slice(0, max) : '';
}

/** יחידות מידה: תיאור לא ריק ומשקל חיובי. יחידה שבורה נשמטת בשקט — היא נוחות, לא נתון. */
function parsePortions(v: unknown): FoodPortion[] {
  const out: FoodPortion[] = [];
  for (const raw of asArray(v)) {
    if (!isRecord(raw)) continue;
    const u = cleanText(raw.u, 40);
    const g = inRange(raw.g, 0, MAX_PORTION_GRAMS);
    if (u === '' || g === null || g <= 0) continue;
    out.push({ u, g });
  }
  return out;
}

/**
 * ערכי מקור ל-100 גרם — משותף למזון custom ול-`ref` שברישום.
 * מחזיר את סיבת הדחייה או את הערכים.
 */
function parsePer100(
  raw: Record<string, unknown>,
  caps: { kcal: number; macro: number } = { kcal: MAX_KCAL_PER_100G, macro: MAX_MACRO_PER_100G },
): { error: string } | { ref: FoodRef } {
  const name = cleanText(raw.name, FOOD_NAME_MAX);
  if (name === '') return { error: 'מזון בלי שם' };
  const unitFood = raw.unitFood === true;
  const scale = unitFood ? UNIT_FOOD_SCALE : 1;
  const maxKcal = caps.kcal * scale;
  const maxMacro = caps.macro * scale;
  const unitNote = unitFood ? ' (ערכי יחידה ×100)' : '';
  const kcal = inRange(raw.kcal, 0, maxKcal);
  if (kcal === null) return { error: `קלוריות מחוץ לטווח 0–${maxKcal} ל-100 ג'${unitNote}` };
  const protein = inRange(raw.protein, 0, maxMacro);
  if (protein === null) return { error: `מאקרו מחוץ לטווח 0–${maxMacro} ל-100 ג'${unitNote}` };
  // פחמימה, שומן וסיבים יכולים להיות לא ידועים (תווית חלקית). null נשמר כ-null.
  const carbs = optionalPer100(raw.carbs, maxMacro);
  const fat = optionalPer100(raw.fat, maxMacro);
  const fiber = optionalPer100(raw.fiber, maxMacro);
  if (!carbs.ok || !fat.ok || !fiber.ok) return { error: `מאקרו מחוץ לטווח 0–${maxMacro} ל-100 ג'${unitNote}` };
  return {
    ref: {
      name,
      kcal,
      protein,
      carbs: carbs.value,
      fat: fat.value,
      fiber: fiber.value,
      ...(unitFood ? { unitFood: true as const } : {}),
    },
  };
}

/**
 * מתכון של מנה מורכבת. מרכיב שבור נשמט; בלי אף מרכיב תקין או בלי משקל
 * סופי חיובי — אין מתכון, והמזון נשאר עם הערכים ששמורים בו.
 */
function parseRecipe(v: unknown): Recipe | null {
  if (!isRecord(v)) return null;
  const items: Recipe['items'] = [];
  for (const raw of asArray(v.items)) {
    if (!isRecord(raw)) continue;
    const foodId = typeof raw.foodId === 'string' ? raw.foodId.trim() : '';
    const grams = inRange(raw.grams, MIN_GRAMS, MAX_GRAMS);
    if ((!isMohFoodId(foodId) && !isCustomFoodId(foodId)) || grams === null) continue;
    // תווית כמות לתצוגה ("כף מפולסת"). ריקה = מוצג בגרמים.
    const u = cleanText(raw.u, RECIPE_UNIT_MAX);
    const n = cleanText(raw.n, RECIPE_UNIT_MAX);
    items.push({ foodId, grams, ...(u === '' ? {} : { u }), ...(n === '' ? {} : { n }) });
  }
  const finalGrams = inRange(v.finalGrams, MIN_GRAMS, MAX_GRAMS * 10);
  if (items.length === 0 || finalGrams === null) return null;
  return { items, finalGrams };
}

export function parseCustomFoods(input: unknown): ParseResult<CustomFood> {
  const rejected: Rejection[] = [];
  const byId = new Map<string, CustomFood>();

  for (const raw of asArray(input)) {
    if (!isRecord(raw)) {
      rejected.push({ raw, reason: 'רשומה שאינה אובייקט' });
      continue;
    }
    const id = typeof raw.id === 'string' ? raw.id.trim() : '';
    if (!isCustomFoodId(id)) {
      rejected.push({ raw, reason: 'מזהה מזון שאינו "c:" + מזהה' });
      continue;
    }
    const per100 = parsePer100(raw);
    if ('error' in per100) {
      rejected.push({ raw, reason: per100.error });
      continue;
    }
    const cat = intInRange(raw.cat, 1, 9);
    const barcode = cleanText(raw.barcode, 64);
    const recipe = parseRecipe(raw.recipe);
    const note = cleanText(raw.note, FOOD_NOTE_MAX);
    const archived = raw.archived === true;
    byId.set(id, {
      id,
      ...per100.ref,
      cat,
      portions: parsePortions(raw.portions),
      barcode: barcode === '' ? null : barcode,
      ...(recipe ? { recipe } : {}),
      ...(note === '' ? {} : { note }),
      ...(archived ? { archived: true as const } : {}),
    });
  }

  // מנה בתוך מנה לא נתמכת. המתכון מוסר, הערכים השמורים נשארים — לא מאבדים מזון.
  for (const f of byId.values()) {
    if (!f.recipe) continue;
    const nested = f.recipe.items.some((i) => byId.get(i.foodId)?.recipe !== undefined);
    if (nested) {
      rejected.push({ reason: `מנה בתוך מנה לא נתמכת — המתכון של "${f.name}" הוסר, הערכים נשמרו` });
      delete f.recipe;
    }
  }

  const ok = [...byId.values()].sort((a, b) => a.name.localeCompare(b.name, 'he'));
  return { ok, rejected };
}

export function parseEntries(input: unknown): ParseResult<FoodEntry> {
  const rejected: Rejection[] = [];
  const byId = new Map<string, FoodEntry>();

  for (const raw of asArray(input)) {
    if (!isRecord(raw)) {
      rejected.push({ raw, reason: 'רשומה שאינה אובייקט' });
      continue;
    }
    const id = typeof raw.id === 'string' ? raw.id.trim() : '';
    if (id === '') {
      rejected.push({ raw, reason: 'רישום בלי מזהה' });
      continue;
    }
    const ts = num(raw.ts);
    // `d` מוקפא בכתיבה וגובר; חסר או שבור — נגזר מ-`ts` לפי אזור הזמן של המכשיר.
    const d: ISODate | null = isValidISO(raw.d)
      ? raw.d
      : ts !== null && ts > 0
        ? toLocalISO(new Date(ts))
        : null;
    if (d === null || ts === null || ts <= 0) {
      rejected.push({ raw, reason: 'תאריך או שעה לא תקינים' });
      continue;
    }
    const foodId = typeof raw.foodId === 'string' ? raw.foodId.trim() : '';
    if (!isMohFoodId(foodId) && !isCustomFoodId(foodId)) {
      rejected.push({ raw, reason: 'מזהה מזון לא תקין' });
      continue;
    }
    const grams = inRange(raw.grams, MIN_GRAMS, MAX_GRAMS);
    if (grams === null) {
      rejected.push({ raw, reason: `כמות מחוץ לטווח ${MIN_GRAMS}–${MAX_GRAMS} ג'` });
      continue;
    }
    if (!isRecord(raw.ref)) {
      rejected.push({ raw, reason: 'רישום בלי ערכי מזון' });
      continue;
    }
    // רישום ידני: השם והדגל מוקפאים ברישום, כמו `n` באימון. הפרסר חייב להכיר אותם.
    // התקרה שלו היא ארוחה שלמה (יחידה אחת), לא 900 קק"ל ל-100 ג'.
    const n = cleanText(raw.n, FOOD_NAME_MAX);
    const adhoc = raw.adhoc === true;
    const per100 = parsePer100(raw.ref, adhoc ? { kcal: ADHOC_MAX_KCAL, macro: ADHOC_MAX_MACRO } : undefined);
    if ('error' in per100) {
      rejected.push({ raw, reason: `ערכי מזון: ${per100.error}` });
      continue;
    }
    const meal = MEALS.find((m) => m === raw.meal) ?? 'snack';
    const note = cleanText(raw.note, ENTRY_NOTE_MAX);
    byId.set(id, {
      id,
      d,
      ts,
      meal,
      foodId,
      grams,
      ref: per100.ref,
      ...(n === '' ? {} : { n }),
      ...(adhoc ? { adhoc: true as const } : {}),
      ...(note === '' ? {} : { note }),
    });
  }

  const ok = [...byId.values()].sort(
    (a, b) => a.ts - b.ts || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
  return { ok, rejected };
}

export function parseTargets(input: unknown): ParseResult<NutritionTarget> {
  const rejected: Rejection[] = [];
  const byFrom = new Map<ISODate, NutritionTarget>();

  for (const raw of asArray(input)) {
    if (!isRecord(raw)) {
      rejected.push({ raw, reason: 'רשומה שאינה אובייקט' });
      continue;
    }
    if (!isValidISO(raw.from)) {
      rejected.push({ raw, reason: 'תאריך תחילת תוקף לא תקין' });
      continue;
    }
    const kcal = inRange(raw.kcal, MIN_TARGET_KCAL, MAX_TARGET_KCAL);
    if (kcal === null) {
      rejected.push({ raw, reason: `יעד קלוריות מחוץ לטווח ${MIN_TARGET_KCAL}–${MAX_TARGET_KCAL}` });
      continue;
    }
    const protein = inRange(raw.protein, 0, MAX_TARGET_PROTEIN);
    const carbs = inRange(raw.carbs, 0, MAX_TARGET_CARBS);
    const fat = inRange(raw.fat, 0, MAX_TARGET_FAT);
    if (protein === null || carbs === null || fat === null) {
      rejected.push({ raw, reason: 'יעד מאקרו מחוץ לטווח' });
      continue;
    }
    byFrom.set(raw.from, { from: raw.from, kcal, protein, carbs, fat });
  }

  const ok = [...byFrom.values()].sort((a, b) => compareISO(a.from, b.from));
  return { ok, rejected };
}

export function parseFavorites(input: unknown): ParseResult<Favorite> {
  const rejected: Rejection[] = [];
  const byFood = new Map<string, Favorite>();

  for (const raw of asArray(input)) {
    if (!isRecord(raw)) {
      rejected.push({ raw, reason: 'רשומה שאינה אובייקט' });
      continue;
    }
    const foodId = typeof raw.foodId === 'string' ? raw.foodId.trim() : '';
    if (!isMohFoodId(foodId) && !isCustomFoodId(foodId)) {
      rejected.push({ raw, reason: 'מזהה מזון לא תקין' });
      continue;
    }
    const grams = raw.grams === null || raw.grams === undefined ? null : inRange(raw.grams, MIN_GRAMS, MAX_GRAMS);
    // סדר ההוספה נשמר: מועדף שחוזר על עצמו מעדכן את הכמות במקומו.
    byFood.set(foodId, { foodId, grams });
  }

  return { ok: [...byFood.values()], rejected };
}

// ---------- ימים ----------

const FRIDAY_TIERS: readonly FridayTier[] = ['medium', 'regular', 'large'];

/** צעדים יומיים (שלב 6): שלם 0–100,000 — אותה תקרה כמו צעדי הליכון. */
export const MAX_DAY_STEPS = MAX_STEPS;

/**
 * צעדים יומיים: חסר/null = אין. שלם 0–100,000 = נשמר. ערך אחר לא מאפס
 * את היום: השדה נשמט לבדו והשורה הגולמית נשלחת להסגר דרך `rejected`
 * (סגירה/ארוחת שישי לעולם לא הולכות לאיבוד). בניגוד לצעדי הליכון — בלי עיגול.
 */
function parseDaySteps(v: unknown): { steps: number | undefined; bad: boolean } {
  if (v === undefined || v === null) return { steps: undefined, bad: false };
  const n = num(v);
  if (n === null || !Number.isInteger(n) || n < 0 || n > MAX_DAY_STEPS) return { steps: undefined, bad: true };
  return { steps: n, bad: false };
}

/**
 * מטא-נתונים של ימים. נדחה: לא אובייקט, תאריך שבור, `closed` שאינו בוליאני.
 * `closedAt` ו-`fridayTier` שבורים נשמטים בשקט — הם תוספת, לא הרשומה.
 * `steps` שבור נשמט, והשורה נשלחת להסגר (דחיית שדה — היום עצמו נטען).
 * כפילות תאריך: האחרונה גוברת.
 */
export function parseDays(input: unknown): ParseResult<DayMeta> {
  const rejected: Rejection[] = [];
  const byDate = new Map<ISODate, DayMeta>();

  for (const raw of asArray(input)) {
    if (!isRecord(raw)) {
      rejected.push({ raw, reason: 'רשומה שאינה אובייקט' });
      continue;
    }
    if (!isValidISO(raw.d)) {
      rejected.push({ raw, reason: 'תאריך לא תקין' });
      continue;
    }
    if (typeof raw.closed !== 'boolean') {
      rejected.push({ raw, reason: 'סטטוס סגירה שאינו כן/לא' });
      continue;
    }
    const closedAt =
      typeof raw.closedAt === 'string' && Number.isFinite(Date.parse(raw.closedAt)) ? raw.closedAt : null;
    const tier = FRIDAY_TIERS.find((t) => t === raw.fridayTier) ?? null;
    const { steps, bad: stepsBad } = parseDaySteps(raw.steps);
    if (stepsBad) rejected.push({ raw, reason: `steps — צעדים לא תקינים ב-${raw.d} (שלם 0–${MAX_DAY_STEPS.toLocaleString('en-US')}) — היום נטען בלי צעדים` });
    byDate.set(raw.d, {
      d: raw.d,
      closed: raw.closed,
      ...(closedAt !== null ? { closedAt } : {}),
      ...(tier !== null ? { fridayTier: tier } : {}),
      ...(steps !== undefined ? { steps } : {}),
    });
  }

  const ok = [...byDate.values()].sort((a, b) => compareISO(a.d, b.d));
  return { ok, rejected };
}

// ---------- קריאטין ----------

/**
 * סימוני קריאטין. נדחה: לא אובייקט, תאריך שבור, `taken` שאינו true, `at`
 * שאינו זמן, מינון שאינו מספר חיובי. כפילות תאריך: האחרונה גוברת.
 */
export function parseCreatine(input: unknown): ParseResult<CreatineDay> {
  const rejected: Rejection[] = [];
  const byDate = new Map<ISODate, CreatineDay>();
  for (const raw of asArray(input)) {
    if (!isRecord(raw)) {
      rejected.push({ raw, reason: 'רשומה שאינה אובייקט' });
      continue;
    }
    if (!isValidISO(raw.d)) {
      rejected.push({ raw, reason: 'תאריך לא תקין' });
      continue;
    }
    if (raw.taken !== true) {
      rejected.push({ raw, reason: 'סימון שאינו true' });
      continue;
    }
    if (typeof raw.at !== 'string' || !Number.isFinite(Date.parse(raw.at))) {
      rejected.push({ raw, reason: 'זמן הסימון לא תקין' });
      continue;
    }
    const dose = num(raw.dose_g);
    if (dose === null || dose <= 0) {
      rejected.push({ raw, reason: 'מינון לא תקין' });
      continue;
    }
    byDate.set(raw.d, { d: raw.d, taken: true, at: raw.at, dose_g: dose });
  }
  const ok = [...byDate.values()].sort((a, b) => compareISO(a.d, b.d));
  return { ok, rejected };
}

// ---------- הסגר ----------

/**
 * הסגר. מקסימום סלחנות ואפס דחיות: פריט שבור לא נזרק אלא נעטף כמו שהוא,
 * כי הסגר שמאבד פריטים מחטיא את המטרה שלו. `fp` חסר מחושב מ-`raw`.
 */
export function parseQuarantine(input: unknown): QuarantineItem[] {
  const out: QuarantineItem[] = [];
  for (const raw of asArray(input)) {
    if (!isRecord(raw)) {
      out.push({ key: 'unknown', raw, reason: 'פריט הסגר שאינו אובייקט', at: '', fp: fingerprint(raw) });
      continue;
    }
    const inner = 'raw' in raw ? raw.raw : raw;
    out.push({
      key: typeof raw.key === 'string' && raw.key !== '' ? raw.key : 'unknown',
      raw: inner,
      reason: typeof raw.reason === 'string' ? raw.reason : '',
      at: typeof raw.at === 'string' ? raw.at : '',
      fp: typeof raw.fp === 'string' && raw.fp !== '' ? raw.fp : fingerprint(inner),
    });
  }
  return out;
}

// ---------- בסיס נתונים שלם ----------

export type DbParseResult = {
  db: DB;
  counts: Record<
    | 'weights'
    | 'workouts'
    | 'waist'
    | 'checkins'
    | 'standaloneCardio'
    | 'customFoods'
    | 'entries'
    | 'targets'
    | 'favorites'
    | 'creatine',
    number
  >;
  rejected: { section: string; reason: string; count: number }[];
};

function tally(section: string, r: Rejection[]): { section: string; reason: string; count: number }[] {
  const m = new Map<string, number>();
  for (const x of r) m.set(x.reason, (m.get(x.reason) ?? 0) + 1);
  return [...m.entries()].map(([reason, count]) => ({ section, reason, count }));
}

/** מקבל אובייקט ייצוא (v1 של ה-HTML הישן או של האפליקציה הזו) ומחזיר DB נקי. */
export function parseDb(input: unknown): DbParseResult {
  const src = isRecord(input) ? input : {};
  const weights = parseWeights(src.weights);
  // גיבוי של האפליקציה הזו מכיל גם `legacyWorkouts` — רשומות גולמיות שלא
  // הומרו. הן נכנסות לאותו מסלול, ואם עדיין לא ניתן להמיר אותן הן נשארות ישנות.
  const legacyRaw = asArray(src.legacyWorkouts).map((l) => (isRecord(l) ? l.raw : l));
  const workouts = parseWorkouts([...asArray(src.workouts), ...legacyRaw]);
  const waist = parseWaist(src.waist);
  const checkins = parseCheckins(src.checkins);
  // גיבוי מלפני המפתח הזה פשוט לא מכיל אותו — ריק, בלי דחייה.
  const standaloneCardio = parseStandaloneCardio(src.standaloneCardio);
  const customFoods = parseCustomFoods(src.customFoods);
  const entries = parseEntries(src.entries);
  const targets = parseTargets(src.targets);
  const favorites = parseFavorites(src.favorites);
  // גיבוי מלפני שלב 3 פשוט לא מכיל `days` — ריק, בלי דחייה.
  const days = parseDays(src.days);
  // גיבוי מלפני מעקב הקריאטין פשוט לא מכיל `creatine` — ריק, בלי דחייה.
  const creatine = parseCreatine(src.creatine);
  // הסגר מהגיבוי (אופציונלי — גיבוי ישן פשוט לא מכיל אותו), ואחריו מה שנדחה
  // בייבוא הזה עצמו: גם רשומה שבורה בקובץ לא נעלמת.
  const at = new Date().toISOString();
  const quarantine = mergeQuarantine(parseQuarantine(src.quarantine), [
    ...quarantineFromRejections('workouts', workouts.rejected, at),
    ...quarantineFromRejections('weights', weights.rejected, at),
    ...quarantineFromRejections('waist', waist.rejected, at),
    ...quarantineFromRejections('checkins', checkins.rejected, at),
    ...quarantineFromRejections('standaloneCardio', standaloneCardio.rejected, at),
    ...quarantineFromRejections('customFoods', customFoods.rejected, at),
    ...quarantineFromRejections('entries', entries.rejected, at),
    ...quarantineFromRejections('targets', targets.rejected, at),
    ...quarantineFromRejections('favorites', favorites.rejected, at),
    ...quarantineFromRejections('days', days.rejected, at),
    ...quarantineFromRejections('creatine', creatine.rejected, at),
  ]);

  return {
    db: {
      weights: weights.ok,
      workouts: workouts.ok,
      // גם בייבוא רשומה שבורה לא נזרקת — היא נשמרת גולמית לצד השאר.
      legacyWorkouts: workouts.unparsed,
      waist: waist.ok,
      checkins: checkins.ok,
      standaloneCardio: standaloneCardio.ok,
      settings: parseSettings(src.settings),
      customFoods: customFoods.ok,
      entries: entries.ok,
      targets: targets.ok,
      favorites: favorites.ok,
      days: days.ok,
      creatine: creatine.ok,
      quarantine,
    },
    counts: {
      weights: weights.ok.length,
      workouts: workouts.ok.length,
      waist: waist.ok.length,
      checkins: checkins.ok.length,
      standaloneCardio: standaloneCardio.ok.length,
      customFoods: customFoods.ok.length,
      entries: entries.ok.length,
      targets: targets.ok.length,
      favorites: favorites.ok.length,
      creatine: creatine.ok.length,
    },
    rejected: [
      ...tally('משקל', weights.rejected),
      // רשומה שלמה שלא הומרה → "נשמר כאימון ישן"; דחיית שדה (raw) → הסגר.
      ...tally(
        'אימונים',
        workouts.rejected.map((r) =>
          Object.prototype.hasOwnProperty.call(r, 'raw') ? { reason: r.reason } : { reason: `${r.reason} — נשמר כאימון ישן` },
        ),
      ),
      ...tally('מותניים', waist.rejected),
      ...tally("צ'ק-אין", checkins.rejected),
      ...tally('אירובי עצמאי', standaloneCardio.rejected),
      ...tally('מזונות שלי', customFoods.rejected),
      ...tally('רישומי אכילה', entries.rejected),
      ...tally('יעדי תזונה', targets.rejected),
      ...tally('מועדפים', favorites.rejected),
      ...tally('ימים', days.rejected),
      ...tally('קריאטין', creatine.rejected),
    ],
  };
}
