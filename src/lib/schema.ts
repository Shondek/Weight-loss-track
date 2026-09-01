/**
 * אימות ונרמול של נתונים שנכנסים מבחוץ — מהאחסון או מקובץ ייבוא.
 * מודול טהור. לעולם לא זורק: מחזיר את מה שתקין ורשימת דחיות עם סיבה.
 */

import {
  type DB,
  type ExerciseType,
  type ISODate,
  type LegacyWorkout,
  type LoggedExercise,
  type LoggedSet,
  type Settings,
  type WaistEntry,
  type WeeklyCheckin,
  type WeightEntry,
  type WorkoutEntry,
  type WorkoutType,
  DEFAULT_SETTINGS,
  NOTE_MAX,
  WORKOUT_SCHEMA_VERSION,
} from '../types';
import { exerciseById, resolveExerciseId } from '../data/program';
import { compareISO, isValidISO, weekStart } from './date';

export type Rejection = { reason: string };

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
      rejected.push({ reason: 'רשומה שאינה אובייקט' });
      continue;
    }
    if (!isValidISO(raw.d)) {
      rejected.push({ reason: 'תאריך לא תקין' });
      continue;
    }
    const w = num(raw.w);
    if (w === null) {
      rejected.push({ reason: 'משקל שאינו מספר' });
      continue;
    }
    if (w < MIN_WEIGHT || w > MAX_WEIGHT) {
      rejected.push({ reason: `משקל מחוץ לטווח ${MIN_WEIGHT}–${MAX_WEIGHT} ק"ג` });
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
      rejected.push({ reason: 'רשומה שאינה אובייקט' });
      continue;
    }
    if (!isValidISO(raw.d)) {
      rejected.push({ reason: 'תאריך לא תקין' });
      continue;
    }
    const cm = num(raw.cm);
    if (cm === null) {
      rejected.push({ reason: 'היקף מותניים שאינו מספר' });
      continue;
    }
    if (cm < MIN_WAIST || cm > MAX_WAIST) {
      rejected.push({ reason: `היקף מותניים מחוץ לטווח ${MIN_WAIST}–${MAX_WAIST} ס"מ` });
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
const EXERCISE_TYPES: readonly ExerciseType[] = ['compound', 'isolation', 'core'];

/** מספר חזרות/שניות תקין, או null. */
function count(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = num(v);
  return n === null || n < 0 || n > 1000 ? null : Math.round(n);
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
      seconds: count(raw.seconds),
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
      const n = count(v);
      return {
        weight: timed ? null : n === null ? null : value,
        reps: timed ? null : n,
        seconds: timed ? n : null,
      };
    });
  return trimTrailingEmpty(sets);
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
function parseExercise(e: Record<string, unknown>): LoggedExercise {
  const name = typeof e.n === 'string' ? e.n.trim() : '';
  const rawId = typeof e.exerciseId === 'string' ? e.exerciseId.trim() : '';
  const id = rawId !== '' ? rawId : (name !== '' ? resolveExerciseId(name) : null);

  const spec = id !== null ? exerciseById(id) : undefined;
  const isNewFormat = Array.isArray(e.sets);
  const timed = spec?.isTimed ?? false;

  const type =
    EXERCISE_TYPES.find((x) => x === e.type) ?? spec?.type ?? 'isolation';

  return {
    exerciseId: id ?? `legacy:${name !== '' ? name : UNNAMED_EXERCISE}`,
    n: name !== '' ? name : (spec?.name ?? id ?? UNNAMED_EXERCISE),
    sets: isNewFormat ? parseLoggedSets(e.sets) : upcastLegacySets(e.r, e.w, timed),
    targetRepMin:
      count(e.targetRepMin) ?? spec?.repRangeMin ?? ORPHAN_DEFAULTS.targetRepMin,
    targetRepMax:
      count(e.targetRepMax) ?? spec?.repRangeMax ?? ORPHAN_DEFAULTS.targetRepMax,
    type,
    bodyweightOnly:
      typeof e.bodyweightOnly === 'boolean'
        ? e.bodyweightOnly
        : (spec?.bodyweightOnly ?? false),
    assisted: typeof e.assisted === 'boolean' ? e.assisted : (spec?.assisted ?? false),
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

    const ex = asArray(raw.ex).filter(isRecord).map(parseExercise);

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
      rejected.push({ reason: 'רשומה שאינה אובייקט' });
      continue;
    }
    if (!isValidISO(raw.weekStart)) {
      rejected.push({ reason: 'תאריך שבוע לא תקין' });
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
  };
}

// ---------- בסיס נתונים שלם ----------

export type DbParseResult = {
  db: DB;
  counts: Record<'weights' | 'workouts' | 'waist' | 'checkins', number>;
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

  return {
    db: {
      weights: weights.ok,
      workouts: workouts.ok,
      // גם בייבוא רשומה שבורה לא נזרקת — היא נשמרת גולמית לצד השאר.
      legacyWorkouts: workouts.unparsed,
      waist: waist.ok,
      checkins: checkins.ok,
      settings: parseSettings(src.settings),
    },
    counts: {
      weights: weights.ok.length,
      workouts: workouts.ok.length,
      waist: waist.ok.length,
      checkins: checkins.ok.length,
    },
    rejected: [
      ...tally('משקל', weights.rejected),
      ...tally(
        'אימונים',
        workouts.rejected.map((r) => ({ reason: `${r.reason} — נשמר כאימון ישן` })),
      ),
      ...tally('מותניים', waist.rejected),
      ...tally("צ'ק-אין", checkins.rejected),
    ],
  };
}
