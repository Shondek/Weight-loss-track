/**
 * אימות ונרמול של נתונים שנכנסים מבחוץ — מהאחסון או מקובץ ייבוא.
 * מודול טהור. לעולם לא זורק: מחזיר את מה שתקין ורשימת דחיות עם סיבה.
 */

import {
  type DB,
  type ISODate,
  type Settings,
  type WaistEntry,
  type WeeklyCheckin,
  type WeightEntry,
  type WorkoutEntry,
  type WorkoutType,
  DEFAULT_SETTINGS,
  NOTE_MAX,
} from '../types';
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
    if (w === null || w < MIN_WEIGHT || w > MAX_WEIGHT) {
      rejected.push({ reason: 'משקל מחוץ לטווח הסביר' });
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
    if (cm === null || cm < MIN_WAIST || cm > MAX_WAIST) {
      rejected.push({ reason: 'היקף מותניים מחוץ לטווח הסביר' });
      continue;
    }
    byDate.set(raw.d, { d: raw.d, cm });
  }

  const ok = [...byDate.values()].sort((a, b) => compareISO(a.d, b.d));
  return { ok, rejected };
}

// ---------- אימונים ----------

const TYPES: readonly WorkoutType[] = ['A', 'B', 'C'];

function parseSets(input: unknown): (number | null)[] {
  const arr = asArray(input).slice(0, 3);
  const out: (number | null)[] = [];
  for (let i = 0; i < 3; i++) {
    const v = arr[i];
    if (v === null || v === undefined || v === '') {
      out.push(null);
      continue;
    }
    const n = num(v);
    out.push(n === null || n < 0 || n > 1000 ? null : Math.round(n));
  }
  return out;
}

export function parseWorkouts(input: unknown): ParseResult<WorkoutEntry> {
  const rejected: Rejection[] = [];
  const byId = new Map<string, WorkoutEntry>();
  let generated = 0;

  for (const raw of asArray(input)) {
    if (!isRecord(raw)) {
      rejected.push({ reason: 'רשומה שאינה אובייקט' });
      continue;
    }
    if (!isValidISO(raw.d)) {
      rejected.push({ reason: 'תאריך לא תקין' });
      continue;
    }
    const t = TYPES.find((x) => x === raw.t);
    if (!t) {
      rejected.push({ reason: 'סוג אימון שאינו A/B/C' });
      continue;
    }

    const ex = asArray(raw.ex)
      .filter(isRecord)
      .filter((e) => typeof e.n === 'string' && e.n.trim() !== '')
      .map((e) => {
        const w = num(e.w);
        return {
          n: String(e.n).trim(),
          w: w !== null && w >= 0 && w <= 1000 ? w : null,
          r: parseSets(e.r),
        };
      });

    const id =
      typeof raw.id === 'string' && raw.id.trim() !== ''
        ? raw.id
        : `${raw.d}-${t}-imported-${generated++}`;

    byId.set(id, {
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
  return { ok, rejected };
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
  return { programStart: isValidISO(ps) ? weekStart(ps) : null };
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
  const workouts = parseWorkouts(src.workouts);
  const waist = parseWaist(src.waist);
  const checkins = parseCheckins(src.checkins);

  return {
    db: {
      weights: weights.ok,
      workouts: workouts.ok,
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
      ...tally('אימונים', workouts.rejected),
      ...tally('מותניים', waist.rejected),
      ...tally("צ'ק-אין", checkins.rejected),
    ],
  };
}
