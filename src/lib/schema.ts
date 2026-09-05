/**
 * אימות ונרמול של נתונים שנכנסים מבחוץ — מהאחסון או מקובץ ייבוא.
 * מודול טהור. לעולם לא זורק: מחזיר את מה שתקין ורשימת דחיות עם סיבה.
 */

import {
  type CardioLog,
  type CardioMode,
  type CustomFood,
  type DB,
  type ExerciseType,
  type Favorite,
  type FoodEntry,
  type FoodPortion,
  type FoodRef,
  type ISODate,
  type LegacyWorkout,
  type LoggedExercise,
  type LoggedSet,
  type MealType,
  type NutritionTarget,
  type Recipe,
  type Settings,
  type WaistEntry,
  type WeeklyCheckin,
  type WeightEntry,
  type WorkoutEntry,
  type WorkoutType,
  DEFAULT_SETTINGS,
  ENTRY_NOTE_MAX,
  NOTE_MAX,
  WORKOUT_SCHEMA_VERSION,
} from '../types';
import { canonicalExerciseId, exerciseById, resolveExerciseId } from '../data/program';
import { compareISO, isValidISO, toLocalISO, weekStart } from './date';
import { isCardioId } from './workouts';
import { isCustomFoodId, isMohFoodId } from './nutrition/foods';

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
const EXERCISE_TYPES: readonly ExerciseType[] = ['compound', 'isolation', 'core', 'cardio'];
const CARDIO_MODES: readonly CardioMode[] = ['bike', 'treadmill'];
const MAX_CARDIO_MINUTES = 1000;

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

/**
 * חימום / אירובי: מצב ודקות. רשומה שנקלטה בלי `cardio` (או עם ערכים
 * שבורים) מקבלת "אופניים" והדקות נגזרות ממה שבוצע — לא נדחית.
 */
function parseCardio(v: unknown, sets: LoggedSet[]): CardioLog {
  const rec = isRecord(v) ? v : {};
  const mode = CARDIO_MODES.find((m) => m === rec.mode) ?? 'bike';
  const doneSeconds = sets[0]?.seconds ?? null;
  const minutes =
    count(rec.minutes) ?? (doneSeconds === null ? 0 : Math.round(doneSeconds / 60));
  return { mode, minutes: Math.min(minutes, MAX_CARDIO_MINUTES) };
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
  // מזהה שאוחד למזהה אחר (אותה מכונה) מתורגם כאן, פעם אחת, בכניסה.
  const id = rawId !== '' ? canonicalExerciseId(rawId) : (name !== '' ? resolveExerciseId(name) : null);

  const spec = id !== null ? exerciseById(id) : undefined;
  const isNewFormat = Array.isArray(e.sets);
  const cardio = id !== null && isCardioId(id);
  const timed = cardio || (spec?.isTimed ?? false);
  const sets = isNewFormat ? parseLoggedSets(e.sets) : upcastLegacySets(e.r, e.w, timed);

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
    lastBackup: isValidISO(input.lastBackup) ? input.lastBackup : null,
  };
}

// ---------- תזונה ----------

/** ערכים ל-100 גרם. קלוריות עד 900 (שמן טהור הוא 884), מאקרו עד 100 גרם. */
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
function parsePer100(raw: Record<string, unknown>): { error: string } | { ref: FoodRef } {
  const name = cleanText(raw.name, FOOD_NAME_MAX);
  if (name === '') return { error: 'מזון בלי שם' };
  const kcal = inRange(raw.kcal, 0, MAX_KCAL_PER_100G);
  if (kcal === null) return { error: `קלוריות מחוץ לטווח 0–${MAX_KCAL_PER_100G} ל-100 ג'` };
  const protein = inRange(raw.protein, 0, MAX_MACRO_PER_100G);
  const fat = inRange(raw.fat, 0, MAX_MACRO_PER_100G);
  if (protein === null || fat === null) return { error: `מאקרו מחוץ לטווח 0–${MAX_MACRO_PER_100G} ל-100 ג'` };
  const carbs = optionalPer100(raw.carbs, MAX_MACRO_PER_100G);
  const fiber = optionalPer100(raw.fiber, MAX_MACRO_PER_100G);
  if (!carbs.ok || !fiber.ok) return { error: `מאקרו מחוץ לטווח 0–${MAX_MACRO_PER_100G} ל-100 ג'` };
  return { ref: { name, kcal, protein, carbs: carbs.value, fat, fiber: fiber.value } };
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
    items.push({ foodId, grams });
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
      rejected.push({ reason: 'רשומה שאינה אובייקט' });
      continue;
    }
    const id = typeof raw.id === 'string' ? raw.id.trim() : '';
    if (!isCustomFoodId(id)) {
      rejected.push({ reason: 'מזהה מזון שאינו "c:" + מזהה' });
      continue;
    }
    const per100 = parsePer100(raw);
    if ('error' in per100) {
      rejected.push({ reason: per100.error });
      continue;
    }
    const cat = intInRange(raw.cat, 1, 9);
    const barcode = cleanText(raw.barcode, 64);
    const recipe = parseRecipe(raw.recipe);
    byId.set(id, {
      id,
      ...per100.ref,
      cat,
      portions: parsePortions(raw.portions),
      barcode: barcode === '' ? null : barcode,
      ...(recipe ? { recipe } : {}),
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
      rejected.push({ reason: 'רשומה שאינה אובייקט' });
      continue;
    }
    const id = typeof raw.id === 'string' ? raw.id.trim() : '';
    if (id === '') {
      rejected.push({ reason: 'רישום בלי מזהה' });
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
      rejected.push({ reason: 'תאריך או שעה לא תקינים' });
      continue;
    }
    const foodId = typeof raw.foodId === 'string' ? raw.foodId.trim() : '';
    if (!isMohFoodId(foodId) && !isCustomFoodId(foodId)) {
      rejected.push({ reason: 'מזהה מזון לא תקין' });
      continue;
    }
    const grams = inRange(raw.grams, MIN_GRAMS, MAX_GRAMS);
    if (grams === null) {
      rejected.push({ reason: `כמות מחוץ לטווח ${MIN_GRAMS}–${MAX_GRAMS} ג'` });
      continue;
    }
    if (!isRecord(raw.ref)) {
      rejected.push({ reason: 'רישום בלי ערכי מזון' });
      continue;
    }
    const per100 = parsePer100(raw.ref);
    if ('error' in per100) {
      rejected.push({ reason: `ערכי מזון: ${per100.error}` });
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
      rejected.push({ reason: 'רשומה שאינה אובייקט' });
      continue;
    }
    if (!isValidISO(raw.from)) {
      rejected.push({ reason: 'תאריך תחילת תוקף לא תקין' });
      continue;
    }
    const kcal = inRange(raw.kcal, MIN_TARGET_KCAL, MAX_TARGET_KCAL);
    if (kcal === null) {
      rejected.push({ reason: `יעד קלוריות מחוץ לטווח ${MIN_TARGET_KCAL}–${MAX_TARGET_KCAL}` });
      continue;
    }
    const protein = inRange(raw.protein, 0, MAX_TARGET_PROTEIN);
    const carbs = inRange(raw.carbs, 0, MAX_TARGET_CARBS);
    const fat = inRange(raw.fat, 0, MAX_TARGET_FAT);
    if (protein === null || carbs === null || fat === null) {
      rejected.push({ reason: 'יעד מאקרו מחוץ לטווח' });
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
      rejected.push({ reason: 'רשומה שאינה אובייקט' });
      continue;
    }
    const foodId = typeof raw.foodId === 'string' ? raw.foodId.trim() : '';
    if (!isMohFoodId(foodId) && !isCustomFoodId(foodId)) {
      rejected.push({ reason: 'מזהה מזון לא תקין' });
      continue;
    }
    const grams = raw.grams === null || raw.grams === undefined ? null : inRange(raw.grams, MIN_GRAMS, MAX_GRAMS);
    // סדר ההוספה נשמר: מועדף שחוזר על עצמו מעדכן את הכמות במקומו.
    byFood.set(foodId, { foodId, grams });
  }

  return { ok: [...byFood.values()], rejected };
}

// ---------- בסיס נתונים שלם ----------

export type DbParseResult = {
  db: DB;
  counts: Record<
    'weights' | 'workouts' | 'waist' | 'checkins' | 'customFoods' | 'entries' | 'targets' | 'favorites',
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
  const customFoods = parseCustomFoods(src.customFoods);
  const entries = parseEntries(src.entries);
  const targets = parseTargets(src.targets);
  const favorites = parseFavorites(src.favorites);

  return {
    db: {
      weights: weights.ok,
      workouts: workouts.ok,
      // גם בייבוא רשומה שבורה לא נזרקת — היא נשמרת גולמית לצד השאר.
      legacyWorkouts: workouts.unparsed,
      waist: waist.ok,
      checkins: checkins.ok,
      settings: parseSettings(src.settings),
      customFoods: customFoods.ok,
      entries: entries.ok,
      targets: targets.ok,
      favorites: favorites.ok,
    },
    counts: {
      weights: weights.ok.length,
      workouts: workouts.ok.length,
      waist: waist.ok.length,
      checkins: checkins.ok.length,
      customFoods: customFoods.ok.length,
      entries: entries.ok.length,
      targets: targets.ok.length,
      favorites: favorites.ok.length,
    },
    rejected: [
      ...tally('משקל', weights.rejected),
      ...tally(
        'אימונים',
        workouts.rejected.map((r) => ({ reason: `${r.reason} — נשמר כאימון ישן` })),
      ),
      ...tally('מותניים', waist.rejected),
      ...tally("צ'ק-אין", checkins.rejected),
      ...tally('מזונות שלי', customFoods.rejected),
      ...tally('רישומי אכילה', entries.rejected),
      ...tally('יעדי תזונה', targets.rejected),
      ...tally('מועדפים', favorites.rejected),
    ],
  };
}
