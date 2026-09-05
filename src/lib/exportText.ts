/**
 * דוח הצ'ק-אין לצ'אט. מודול טהור.
 *
 * המבנה כאן קבוע ובלתי משתנה — הטקסט מודבק לשיחה שמנתחת אותו, ושינוי סדר
 * שורות או ניסוח שובר את הצד השני. שינויים כאן דורשים עדכון של בדיקת
 * ה-snapshot.
 *
 * שלושה כללים שמקודדים בפונקציה:
 *  1. שבוע חלקי מסומן תמיד, ושורת "שינוי" פשוט לא קיימת בו.
 *  2. שדה שלא מולא נכתב "—". לא מושמט ולא מנוחש.
 *  3. סעיף "חסר" בסוף מפרט מה לא נרשם, כדי שהניתוח לא יתבסס על חורים.
 */

import type { DB, ISODate } from '../types';
import { WORKOUTS_PER_WEEK } from '../data/program';
import { addDays, compareISO, dayLetter, formatDM, formatDMY, weekDays, weekEnd, weekNumber } from './date';
import { programStartWeek } from './db';
import { DASH } from './format';
import { getCheckin } from './checkins';
import { peakPain, workoutsInWeek } from './workouts';
import {
  summarizeWeek,
  waistBeforeWeek,
  waistInWeek,
  weekChange,
  weeklyAverages,
  WEEK_LENGTH,
  type WeekSummary,
} from './weights';
import { weekGaps, workoutText } from './weekSummary';

function n(v: number | null | undefined, digits = 0): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return DASH;
  return digits > 0 ? v.toFixed(digits) : String(v);
}

function weekTag(s: WeekSummary): string {
  return s.complete ? `(${s.count}/${WEEK_LENGTH})` : `(חלקי ${s.count}/${WEEK_LENGTH})`;
}

export const MAX_CHARS = 2500;
const MAX_WEEKS = 8;
const MAX_WORKOUTS = 3;

type Options = { maxWeeks: number; maxWorkouts: number };

function build(db: DB, week: ISODate, today: ISODate, opts: Options): string {
  const saturday = weekEnd(week);
  const start = programStartWeek(db);
  const current = summarizeWeek(db.weights, week);
  const previous = summarizeWeek(db.weights, addDays(week, -7));
  const change = weekChange(current, previous);

  const L: string[] = [];

  const weekNo = start ? weekNumber(start, week) : null;
  L.push(
    `צ'ק-אין — שבת ${formatDMY(saturday)} · שבוע ${weekNo ?? DASH} · ${formatDM(week)}–${formatDM(saturday)}`,
  );
  L.push('');

  // ---- משקל ----
  L.push('משקל');
  L.push(`ממוצע השבוע: ${n(current.avg, 2)} ${weekTag(current)}`);
  L.push(`שבוע קודם: ${n(previous.avg, 2)} ${weekTag(previous)}`);

  if (!current.complete) {
    L.push(`השבוע חלקי (${current.count}/${WEEK_LENGTH}) — אין השוואה`);
  } else if (!change) {
    L.push(`השבוע הקודם חלקי (${previous.count}/${WEEK_LENGTH}) — אין השוואה`);
  } else if (change.direction === 'same') {
    L.push('שינוי: ללא שינוי');
  } else {
    const word = change.direction === 'down' ? 'ירידה' : 'עלייה';
    L.push(`שינוי: ${word} ${change.drop.toFixed(2)} ק"ג (${change.pct.toFixed(2)}%)`);
  }

  L.push(
    'יומי: ' +
      weekDays(week)
        .map((d, i) => `${dayLetter(d)} ${n(current.days[i] ?? null, 1)}`)
        .join(' · '),
  );

  const waistNow = waistInWeek(db.waist, week);
  const waistPrev = waistBeforeWeek(db.waist, week);
  L.push(`מותניים: ${n(waistNow?.cm ?? null, 1)} (קודם ${n(waistPrev?.cm ?? null, 1)})`);
  L.push('');

  // ---- אימונים ----
  const all = workoutsInWeek(db.workouts, week);
  const shown = all.slice(-opts.maxWorkouts);
  L.push(`אימונים: ${all.length}/${WORKOUTS_PER_WEEK}`);
  if (shown.length < all.length) {
    L.push(`(מוצגים ${shown.length} האחרונים)`);
  }
  if (shown.length === 0) {
    L.push(DASH);
  } else {
    for (const w of shown) {
      L.push(`${formatDM(w.d)} ${w.t} — ${workoutText(w)}`);
    }
  }
  L.push(`כאב: ברך ${n(peakPain(all, 'knee'))} · כתף ${n(peakPain(all, 'shoulder'))}`);
  L.push('');

  // ---- צ'ק-אין ----
  const c = getCheckin(db.checkins, week);
  L.push("צ'ק-אין");
  L.push(
    `היצמדות ${n(c?.adherence ?? null)} · רעב ${n(c?.hunger ?? null)} · אנרגיה ${n(
      c?.energy ?? null,
    )} · שינה ${n(c?.sleepHours ?? null, 1)} שעות · נשנוש בלתי מתוכנן ${n(
      c?.unplannedSnackDays ?? null,
    )} ימים`,
  );
  L.push(`הערה: ${c?.note.trim() ? c.note.trim() : DASH}`);
  L.push('');

  // ---- ממוצעים שבועיים ----
  const history = weeklyAverages(db.weights)
    .filter((w) => compareISO(w.weekStart, week) <= 0)
    .slice(-opts.maxWeeks);
  L.push('ממוצעים שבועיים אחרונים');
  L.push(
    history.length
      ? history.map((w) => `${formatDM(w.weekStart)} ${n(w.avg, 2)} ${weekTag(w)}`).join(' · ')
      : DASH,
  );
  L.push('');

  // ---- חסר ----
  const gaps = weekGaps(db, week, today);
  L.push(`חסר: ${gaps.length ? gaps.join(' · ') : DASH}`);

  return L.join('\n');
}

/**
 * הדוח לצ'אט. אם הוא חורג מ-2,500 תווים, ההיסטוריה מצטמצמת בהדרגה —
 * הנתונים של השבוע הנוכחי לעולם לא נחתכים.
 */
export function buildChatReport(db: DB, week: ISODate, today: ISODate): string {
  const attempts: Options[] = [
    { maxWeeks: MAX_WEEKS, maxWorkouts: MAX_WORKOUTS },
    { maxWeeks: 6, maxWorkouts: MAX_WORKOUTS },
    { maxWeeks: 4, maxWorkouts: MAX_WORKOUTS },
    { maxWeeks: 2, maxWorkouts: MAX_WORKOUTS },
    { maxWeeks: 1, maxWorkouts: 2 },
    { maxWeeks: 1, maxWorkouts: 1 },
  ];

  let text = '';
  for (const opts of attempts) {
    text = build(db, week, today, opts);
    if (text.length <= MAX_CHARS) return text;
  }
  // מקרה קצה: גם המינימום ארוך מדי (שמות תרגילים חריגים).
  return `${text.slice(0, MAX_CHARS - 1)}…`;
}

// ---------- גיבוי JSON ----------

export type BackupFile = {
  /** 2 = סטים באורך משתנה עם משקל לכל סט. 1 = הפורמט הישן, עדיין נקלט בייבוא. */
  v: 2;
  exported: string;
  weights: DB['weights'];
  workouts: DB['workouts'];
  /** אימונים שלא הומרו, גולמיים. גם הגיבוי לא מאבד אותם. */
  legacyWorkouts: DB['legacyWorkouts'];
  waist: DB['waist'];
  checkins: DB['checkins'];
  settings: DB['settings'];
};

/** גיבוי מלא. `exportedAt` מגיע מבחוץ כדי שהמודול יישאר טהור. */
export function buildBackup(db: DB, exportedAt: string): BackupFile {
  return {
    v: 2,
    exported: exportedAt,
    weights: db.weights,
    workouts: db.workouts,
    legacyWorkouts: db.legacyWorkouts,
    waist: db.waist,
    checkins: db.checkins,
    settings: db.settings,
  };
}

export function backupJson(db: DB, exportedAt: string): string {
  return JSON.stringify(buildBackup(db, exportedAt), null, 2);
}
