/**
 * סיכום שבועי לצ'אט (שלב 5). מודול טהור.
 *
 * טקסט אחד, עברית, קומפקטי, מוכן להדבקה — כדי שניתוח מוצאי שבת יתחיל
 * ממספרים מחושבים ולא משחזור ידני. נתונים בלבד: בלי החלטות ובלי עצות.
 *
 * הכללים שהטקסט צריך לשרת (וגם מסמן כשלא מתקיימים):
 *  - שבוע תקף = 7/7 שקילות. שבוע תקף מושווה לשבוע התקף האחרון שלפניו —
 *    לא בהכרח השבוע הקודם.
 *  - מותניים נמדדים ברביעי.
 *  - החלטות קלוריות רק מימים סגורים; רצפה 1,850; יעד חלבון 190.
 *
 * הדוח הישן (exportText.buildChatReport) נשאר כמו שהוא — זה מסמך אחר.
 */

import type { DB, FridayTier, ISODate, LoggedExercise, WorkoutEntry, WorkoutType } from '../types';
import { exerciseById, exerciseIn, shortName, WORKOUTS_PER_WEEK } from '../data/program';
import { addDays, compareISO, dayLetter, dayOfWeek, diffWeeks, formatDM, isSaturday, weekDays, weekEnd, weekNumber, weekStart } from './date';
import { programStartWeek } from './db';
import { clean, DASH, round2 } from './format';
import { getCheckin, isFilled } from './checkins';
import { cardioWeek, type CardioWeek } from './cardio';
import { daySummary } from './nutrition/calc';
import { isDayClosed } from './nutrition/days';
import { FRIDAY_TIERS } from './nutrition/friday';
import { KCAL_FLOOR } from './nutrition/targets';
import { suggestionLabel, suggestNext, type ProgressionSpec, type Suggestion } from './progression';
import { cardioLineText } from './weekSummary';
import { summarizeWeek, WAIST_DAY, WEEK_LENGTH, weeklyAverages, type WeekSummary } from './weights';
import {
  exerciseHistory,
  hasData,
  isCardio,
  isTimedExercise,
  peakPain,
  setPerformed,
  setValue,
  skippedExercises,
  workoutsInWeek,
} from './workouts';

export const MAX_SUMMARY_CHARS = 6000;
/** יעד חלבון יומי (ג׳) — הכלל של התוכנית, לא היעד שנשמר במסך. */
export const PROTEIN_TARGET_G = 190;
/** כמה מדידות רביעי קודמות מוצגות ליד מדידת השבוע. */
export const PREVIOUS_WEDNESDAYS = 3;
/** מספר ימים סגורים מתחת לרצפה שמדליק דגל. */
export const LOW_KCAL_FLAG_DAYS = 3;

export type ExerciseLine = {
  exerciseId: string;
  /** השם הקצר מהתוכנית. */
  name: string;
  /** "לג-פרס 60×12,12,10" — כמו בדוח. */
  text: string;
  rir: number | null;
  /** "הוחלף מ-X" כשהשורה הוחלפה, אחרת null. */
  swappedFrom: string | null;
  suggestion: Suggestion | null;
  /** "17.5 ק״ג · 8 חזרות" או null כשאין הצעה. */
  next: string | null;
};

export type WeeklySummaryData = {
  week: ISODate;
  saturday: ISODate;
  weekNo: number | null;
  weight: {
    current: WeekSummary;
    /** 7/7 שקילות. */
    valid: boolean;
    /**
     * ההשוואה לשבוע התקף האחרון שלפני השבוע הזה. null כשהשבוע הזה לא תקף
     * או כשאין שבוע תקף קודם. `delta` = ממוצע השבוע פחות ממוצע W (שלילי =
     * ירידה); `weeks` = המרחק בשבועות; `rate` = delta / weeks.
     */
    comparison: { week: ISODate; weekNo: number | null; avg: number; delta: number; weeks: number; rate: number } | null;
  };
  waist: {
    /** מדידת רביעי של השבוע, או null. */
    wednesday: { d: ISODate; cm: number } | null;
    /** מדידות רביעי קודמות, מהחדשה לישנה. */
    previous: { d: ISODate; cm: number }[];
  };
  workouts: {
    done: number;
    planned: number;
    items: { d: ISODate; t: WorkoutType; lines: ExerciseLine[]; skipped: string[] }[];
    knee: number | null;
    shoulder: number | null;
    /** תרגילים שההצעה להם היא R3 (ירידה בביצועים). */
    drops: string[];
  };
  cardio: CardioWeek;
  nutrition: {
    closedDays: ISODate[];
    /** ממוצעים על ימים סגורים בלבד; null כשאין. */
    avgKcal: number | null;
    avgProtein: number | null;
    proteinDays: number;
    lowKcalDays: number;
    estimateDays: number;
    fridayTier: FridayTier | null;
    /** ימים עם רישום שלא נסגרו. */
    openDays: number;
  };
  checkin: {
    adherence: number | null;
    hunger: number | null;
    energy: number | null;
    sleepHours: number | null;
    unplannedSnackDays: number | null;
    note: string;
  } | null;
  flags: string[];
};

/** ברירת המחדל לבורר השבוע: השבוע הנוכחי בשבת, אחרת השבוע השלם האחרון. */
export function defaultSummaryWeek(today: ISODate): ISODate {
  const ws = weekStart(today);
  return isSaturday(today) ? ws : addDays(ws, -7);
}

/** המפרט לכללי ההתקדמות: התא באימון הזה, ולשורה שהוחלפה — החלופה עם הטווח שנשמר. */
function progressionSpecFor(t: WorkoutType, row: LoggedExercise): ProgressionSpec {
  const alt = row.swappedFrom !== undefined ? exerciseById(row.exerciseId) : undefined;
  const spec = alt ?? exerciseIn(t, row.exerciseId) ?? exerciseById(row.exerciseId);
  if (spec && !alt) {
    return { step: spec.step, repRangeMin: spec.repRangeMin, repRangeMax: spec.repRangeMax, isTimed: spec.isTimed, bodyweightOnly: spec.bodyweightOnly };
  }
  return {
    step: spec?.step ?? null,
    repRangeMin: row.targetRepMin,
    repRangeMax: row.targetRepMax,
    isTimed: spec?.isTimed ?? isTimedExercise(row),
    bodyweightOnly: spec?.bodyweightOnly ?? row.bodyweightOnly,
  };
}

function weightText(ex: LoggedExercise): string {
  const weights = ex.sets.filter(setPerformed).map((s) => s.weight);
  if (weights.length === 0 || weights.every((w) => w === null)) return DASH;
  const distinct = new Set(weights.map((w) => (w === null ? DASH : clean(w))));
  if (distinct.size === 1) return [...distinct][0] ?? DASH;
  return weights.map((w) => (w === null ? DASH : clean(w))).join(',');
}

/** "לג-פרס 60×12,12,10" / "פלאנק 45,45,45 שנ׳" / "פלאנק 2.5×45,45,45 שנ׳". */
function exerciseText(e: LoggedExercise): string {
  const name = shortName(e.exerciseId, e.n);
  const values = e.sets
    .filter(setPerformed)
    .map((s) => {
      const v = setValue(s);
      return v === null ? DASH : String(v);
    })
    .join(',');
  if (isTimedExercise(e)) {
    const w = weightText(e);
    return w === DASH ? `${name} ${values} שנ׳` : `${name} ${w}×${values} שנ׳`;
  }
  if (e.bodyweightOnly) return `${name} ${values}`;
  return `${name} ${weightText(e)}×${values}`;
}

/** ההצעה לאימון הבא אחרי האימון הזה: ההיסטוריה לפי מזהה עד האימון הזה ועד בכלל. */
function exerciseLine(db: DB, w: WorkoutEntry, row: LoggedExercise): ExerciseLine {
  const spec = progressionSpecFor(w.t, row);
  const history = exerciseHistory(db.workouts, row.exerciseId).filter(
    (h) => compareISO(h.d, w.d) < 0 || (h.d === w.d && h.workoutId <= w.id),
  );
  const suggestion = suggestNext(history, spec);
  const label = suggestion ? suggestionLabel(suggestion, spec) : null;
  return {
    exerciseId: row.exerciseId,
    name: shortName(row.exerciseId, row.n),
    text: exerciseText(row),
    rir: row.rir ?? null,
    swappedFrom: row.swappedFrom === undefined ? null : `הוחלף מ-${shortName(row.swappedFrom, exerciseById(row.swappedFrom)?.name ?? row.swappedFrom)}`,
    suggestion,
    next: label ? `${label.weight} · ${label.reps}` : null,
  };
}

export function buildWeeklySummaryData(db: DB, week: ISODate): WeeklySummaryData {
  const ws = weekStart(week);
  const saturday = weekEnd(ws);
  const days = weekDays(ws);
  const start = programStartWeek(db);

  // ---- משקל ----
  const current = summarizeWeek(db.weights, ws);
  const valid = current.complete;
  let comparison: WeeklySummaryData['weight']['comparison'] = null;
  if (valid && current.avg !== null) {
    const earlier = weeklyAverages(db.weights).filter((x) => compareISO(x.weekStart, ws) < 0 && x.complete && x.avg !== null);
    const prev = earlier[earlier.length - 1];
    if (prev && prev.avg !== null) {
      const weeks = diffWeeks(prev.weekStart, ws);
      const delta = round2(current.avg - prev.avg);
      comparison = {
        week: prev.weekStart,
        weekNo: start ? weekNumber(start, prev.weekStart) : null,
        avg: prev.avg,
        delta,
        weeks,
        rate: round2(delta / weeks),
      };
    }
  }

  // ---- מותניים: רביעי בלבד ----
  const wednesday = days[WAIST_DAY]!;
  const wedEntry = db.waist.find((e) => e.d === wednesday) ?? null;
  const previousWednesdays = db.waist
    .filter((e) => dayOfWeek(e.d) === WAIST_DAY && compareISO(e.d, wednesday) < 0)
    .sort((a, b) => compareISO(b.d, a.d))
    .slice(0, PREVIOUS_WEDNESDAYS)
    .map((e) => ({ d: e.d, cm: e.cm }));

  // ---- אימונים ----
  const all = workoutsInWeek(db.workouts, ws);
  const items = all.map((w) => ({
    d: w.d,
    t: w.t,
    lines: w.ex.filter((e) => !isCardio(e) && hasData(e)).map((row) => exerciseLine(db, w, row)),
    skipped: skippedExercises(w).map((e) => shortName(e.exerciseId, e.n)),
  }));
  const drops = [...new Set(items.flatMap((it) => it.lines.filter((l) => l.suggestion?.rule === 'R3').map((l) => l.name)))];

  // ---- תזונה: ימים סגורים בלבד ----
  const loggedDays = new Set(db.entries.filter((e) => days.includes(e.d)).map((e) => e.d));
  const closedDays = days.filter((d) => isDayClosed(db.days, d));
  const summaries = closedDays.map((d) => daySummary(db.entries, d, () => null));
  const avg = (vals: number[]) => (vals.length ? Math.round(vals.reduce((s, v) => s + v, 0) / vals.length) : null);
  const fridayTier = db.days.find((m) => days.includes(m.d) && m.fridayTier !== undefined)?.fridayTier ?? null;
  const nutrition = {
    closedDays,
    avgKcal: avg(summaries.map((s) => s.kcal)),
    avgProtein: avg(summaries.map((s) => s.protein)),
    proteinDays: summaries.filter((s) => s.protein >= PROTEIN_TARGET_G).length,
    lowKcalDays: summaries.filter((s) => s.kcal < KCAL_FLOOR).length,
    estimateDays: summaries.filter((s) => s.adhocCount > 0).length,
    fridayTier,
    openDays: [...loggedDays].filter((d) => !isDayClosed(db.days, d)).length,
  };

  // ---- צ'ק-אין ----
  const c = getCheckin(db.checkins, ws);
  const checkin = isFilled(c) && c
    ? { adherence: c.adherence, hunger: c.hunger, energy: c.energy, sleepHours: c.sleepHours, unplannedSnackDays: c.unplannedSnackDays, note: c.note.trim() }
    : null;

  const cardio = cardioWeek(db, ws);

  // ---- דגלים ----
  const flags: string[] = [];
  if (!valid) flags.push(`שבוע לא תקף (${current.count}/${WEEK_LENGTH})`);
  if (!wedEntry) flags.push('מותניים לא נמדדו ברביעי');
  if (cardio.over) flags.push(`אירובי מעל התקציב (${cardio.total}/${cardio.budget} דק׳)`);
  if (nutrition.lowKcalDays >= LOW_KCAL_FLAG_DAYS) flags.push(`${nutrition.lowKcalDays} ימים סגורים מתחת ל-${KCAL_FLOOR}`);
  if (all.length < WORKOUTS_PER_WEEK) flags.push(`פחות מ-${WORKOUTS_PER_WEEK} אימונים (${all.length}/${WORKOUTS_PER_WEEK})`);
  if (!checkin) flags.push('צ׳ק-אין לא מולא');
  if (drops.length) flags.push(`ירידה בביצועים (R3): ${drops.join(', ')}`);

  return {
    week: ws,
    saturday,
    weekNo: start ? weekNumber(start, ws) : null,
    weight: { current, valid, comparison },
    waist: { wednesday: wedEntry ? { d: wedEntry.d, cm: wedEntry.cm } : null, previous: previousWednesdays },
    workouts: { done: all.length, planned: WORKOUTS_PER_WEEK, items, knee: peakPain(all, 'knee'), shoulder: peakPain(all, 'shoulder'), drops },
    cardio,
    nutrition,
    checkin,
    flags,
  };
}

function num(v: number | null | undefined, digits = 0): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return DASH;
  return digits > 0 ? v.toFixed(digits) : String(v);
}

/** "−0.36" / "+0.12" / "0.00" — סימן מינוס אמיתי, כדי שלא ייקרא כמקף. */
function signed(v: number): string {
  const s = Math.abs(v).toFixed(2);
  return v < 0 ? `−${s}` : v > 0 ? `+${s}` : s;
}

const weekTag = (s: WeekSummary) => `${s.count}/${WEEK_LENGTH}`;

export function weeklySummaryText(data: WeeklySummaryData): string {
  const L: string[] = [];
  const w = data.weight;

  // 1. כותרת
  L.push(`שבוע ${data.weekNo ?? DASH} · ${formatDM(data.week)}–${formatDM(data.saturday)}`);
  L.push('');

  // 2. משקל
  L.push('משקל');
  L.push(weekDays(data.week).map((d, i) => `${dayLetter(d)} ${num(w.current.days[i] ?? null, 1)}`).join(' · '));
  L.push(`שקילות ${weekTag(w.current)} · ממוצע ${num(w.current.avg, 2)} · תקף: ${w.valid ? 'כן' : 'לא'}`);
  if (w.valid) {
    const c = w.comparison;
    if (!c) L.push('אין שבוע תקף קודם להשוואה');
    else {
      const which = c.weekNo !== null ? String(c.weekNo) : `${formatDM(c.week)}–${formatDM(addDays(c.week, 6))}`;
      L.push(`השוואה לשבוע ${which} (ממוצע ${num(c.avg, 2)}) · שינוי ${signed(c.delta)} · ${c.weeks} שבועות · קצב ${signed(c.rate)} לשבוע`);
    }
  }
  L.push('');

  // 3. מותניים
  L.push('מותניים');
  L.push(data.waist.wednesday ? `רביעי ${formatDM(data.waist.wednesday.d)}: ${num(data.waist.wednesday.cm, 1)} ס״מ` : 'רביעי: לא נמדד');
  L.push(
    `רביעי קודמים: ${data.waist.previous.length ? data.waist.previous.map((e) => `${formatDM(e.d)} ${num(e.cm, 1)}`).join(' · ') : DASH}`,
  );
  L.push('');

  // 4. אימונים
  const wk = data.workouts;
  L.push(`אימונים ${wk.done}/${wk.planned}${wk.items.length ? ' · ' + wk.items.map((it) => `${formatDM(it.d)} ${it.t}`).join(' · ') : ''}`);
  for (const it of wk.items) {
    L.push(`${formatDM(it.d)} ${it.t}`);
    if (it.lines.length === 0) L.push('  לא נרשמו תרגילים');
    for (const line of it.lines) {
      const parts = [line.text];
      if (line.swappedFrom) parts.push(`(${line.swappedFrom})`);
      parts.push(`RIR ${line.rir === null ? DASH : line.rir}`);
      parts.push(line.suggestion && line.next ? `הבא: ${line.next} (${line.suggestion.rule})` : `הבא: ${DASH}`);
      L.push(`  ${parts.join(' · ')}`);
    }
    if (it.skipped.length) L.push(`  דולגו: ${it.skipped.join(', ')}`);
  }
  L.push(`כאב: ברך ${num(wk.knee)} · כתף ${num(wk.shoulder)}`);
  L.push('');

  // 5. אירובי
  L.push(`${cardioLineText(data.cardio)}${data.cardio.over ? ' · מעל התקציב' : ''}`);
  L.push('');

  // 6. תזונה
  const nu = data.nutrition;
  L.push('תזונה');
  L.push(
    `ימים סגורים ${nu.closedDays.length}/${WEEK_LENGTH}${nu.closedDays.length ? ` (${nu.closedDays.map(dayLetter).join(' ')})` : ''}`,
  );
  if (nu.closedDays.length) {
    const n = nu.closedDays.length;
    L.push(
      `ימים סגורים: ממוצע ${num(nu.avgKcal)} קק״ל · ${num(nu.avgProtein)} ג׳ חלבון · חלבון ≥${PROTEIN_TARGET_G}: ${nu.proteinDays}/${n} · מתחת ל-${KCAL_FLOOR}: ${nu.lowKcalDays}/${n} · עם הערכה: ${nu.estimateDays}/${n}${
        nu.fridayTier ? ` · ארוחת שישי: ${FRIDAY_TIERS[nu.fridayTier].label}` : ''
      }`,
    );
  }
  L.push(`נרשמו ולא נסגרו: ${nu.openDays}`);
  L.push('');

  // 7. צ'ק-אין
  const c = data.checkin;
  L.push('צ׳ק-אין');
  if (!c) L.push('לא מולא');
  else {
    L.push(
      `היצמדות ${num(c.adherence)} · רעב ${num(c.hunger)} · אנרגיה ${num(c.energy)} · שינה ${num(c.sleepHours, 1)} · נשנוש ${num(c.unplannedSnackDays)} ימים`,
    );
    L.push(`הערה: ${c.note || DASH}`);
  }
  L.push('');

  // 8. דגלים
  L.push('דגלים');
  if (data.flags.length === 0) L.push(DASH);
  for (const f of data.flags) L.push(`· ${f}`);

  return L.join('\n');
}

/** הסיכום השבועי, עד `MAX_SUMMARY_CHARS`. חריגה (שמות חריגים) נחתכת בסוף בלבד. */
export function buildWeeklySummary(db: DB, week: ISODate): string {
  const text = weeklySummaryText(buildWeeklySummaryData(db, week));
  return text.length <= MAX_SUMMARY_CHARS ? text : `${text.slice(0, MAX_SUMMARY_CHARS - 1)}…`;
}
