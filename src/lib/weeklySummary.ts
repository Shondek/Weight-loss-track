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
 *  - החלטות קלוריות רק מימים סגורים; הרצפה מ-targets.ts; היעדים (קק״ל,
 *    חלבון) הם היעד שבתוקף בשבת של השבוע (`targetFor`).
 *
 * הדוח הישן (exportText.buildChatReport) נשאר כמו שהוא — זה מסמך אחר.
 */

import type { DB, FridayTier, ISODate, LoggedExercise, WorkoutEntry, WorkoutType } from '../types';
import { exerciseById, exerciseIn, shortName, WORKOUTS_PER_WEEK } from '../data/program';
import { addDays, compareISO, dayLetter, diffWeeks, formatDM, isSaturday, weekDays, weekEnd, weekNumber, weekStart } from './date';
import { programStartWeek } from './db';
import { clean, DASH, round2 } from './format';
import { getCheckin, isFilled } from './checkins';
import { cardioWeek, type CardioWeek } from './cardio';
import { stepsWeek, type StepsWeek } from './steps';
import { creatineWeek, type CreatineWeek } from './creatine';
import { daySummary } from './nutrition/calc';
import { isDayClosed } from './nutrition/days';
import { FRIDAY_TIERS } from './nutrition/friday';
import { KCAL_FLOOR, targetFor } from './nutrition/targets';
import { suggestionText, suggestNext, type ProgressionSpec, type Suggestion } from './progression';
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
/** כמה מדידות מותניים קודמות (כל יום בשבוע) מוצגות ליד מדידת הרביעי. */
export const PREVIOUS_WAIST = 3;
/** מספר ימים סגורים מתחת לרצפה שמדליק דגל. */
export const LOW_KCAL_FLAG_DAYS = 3;
/** פחות מכך ימי צעדים שהוזנו בשבוע עם יעד → דגל. */
export const STEPS_MIN_DAYS = 5;

/** "9,812" — צעדים עם מפריד אלפים. */
const thousands = (n: number) => n.toLocaleString('en-US');

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
  /** R1 שהוצע בלי RIR בסט האחרון — "אשר בעצמך". */
  rirUnknown: boolean;
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
    /** המדידות האחרונות שלפני רביעי של השבוע, בכל יום בשבוע, מהחדשה לישנה. */
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
  /** צעדים יומיים (שלב 6) — הזנה ידנית; צעדי הליכון מהאירובי לא נספרים. */
  steps: StepsWeek;
  /** קריאטין X/7 — null כשכל השבוע לפני תאריך ההתחלה (27/9/2026). */
  creatine: CreatineWeek | null;
  nutrition: {
    closedDays: ISODate[];
    /** היעד שבתוקף בשבת של השבוע. null = אין יעד שמור. */
    target: { kcal: number; protein: number } | null;
    /** ממוצעים על ימים סגורים בלבד; null כשאין. */
    avgKcal: number | null;
    avgProtein: number | null;
    /** ימים סגורים עם חלבון ≥ היעד. null כשאין יעד. */
    proteinDays: number | null;
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
    return {
      step: spec.step,
      repRangeMin: spec.repRangeMin,
      repRangeMax: spec.repRangeMax,
      isTimed: spec.isTimed,
      bodyweightOnly: spec.bodyweightOnly,
      mode: spec.mode,
      sets: spec.sets,
    };
  }
  // שורה שהוחלפה: הכללים של החלופה (התקדמות רגילה), לא מצב השימור של התא.
  return {
    step: spec?.step ?? null,
    repRangeMin: row.targetRepMin,
    repRangeMax: row.targetRepMax,
    isTimed: spec?.isTimed ?? isTimedExercise(row),
    bodyweightOnly: spec?.bodyweightOnly ?? row.bodyweightOnly,
    mode: 'progress',
    sets: row.sets.length,
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
  return {
    exerciseId: row.exerciseId,
    name: shortName(row.exerciseId, row.n),
    text: exerciseText(row),
    rir: row.rir ?? null,
    swappedFrom: row.swappedFrom === undefined ? null : `הוחלף מ-${shortName(row.swappedFrom, exerciseById(row.swappedFrom)?.name ?? row.swappedFrom)}`,
    suggestion,
    next: suggestion ? suggestionText(suggestion, spec) : null,
    rirUnknown: suggestion?.rirUnknown ?? false,
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

  // ---- מותניים: הערך של רביעי, וההיסטוריה שלפניו (כל יום) ----
  const wednesday = days[WAIST_DAY]!;
  const wedEntry = db.waist.find((e) => e.d === wednesday) ?? null;
  const previousWaist = db.waist
    .filter((e) => compareISO(e.d, wednesday) < 0)
    .sort((a, b) => compareISO(b.d, a.d))
    .slice(0, PREVIOUS_WAIST)
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
  const target = targetFor(db.targets, saturday);
  const creatineW = creatineWeek(db.creatine, ws);
  const creatine = creatineW.eligible > 0 ? creatineW : null;
  const nutrition = {
    closedDays,
    target: target ? { kcal: target.kcal, protein: target.protein } : null,
    avgKcal: avg(summaries.map((s) => s.kcal)),
    avgProtein: avg(summaries.map((s) => s.protein)),
    proteinDays: target ? summaries.filter((s) => s.protein >= target.protein).length : null,
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
  const steps = stepsWeek(db.days, ws);

  // ---- דגלים ----
  const flags: string[] = [];
  if (!valid) flags.push(`שבוע לא תקף (${current.count}/${WEEK_LENGTH})`);
  if (!wedEntry) flags.push('מותניים לא נמדדו ברביעי');
  if (cardio.over) flags.push(`אירובי מעל התקציב (${cardio.total}/${cardio.budget} דק׳)`);
  if (steps.goal !== null) {
    if (steps.avg !== null && steps.avg < steps.goal) flags.push(`ממוצע צעדים מתחת ליעד (${thousands(steps.avg)}/${thousands(steps.goal)})`);
    if (steps.entered < STEPS_MIN_DAYS) flags.push(`צעדים הוזנו בפחות מ-${STEPS_MIN_DAYS}/${WEEK_LENGTH} ימים (${steps.entered}/${WEEK_LENGTH})`);
  }
  if (nutrition.lowKcalDays >= LOW_KCAL_FLAG_DAYS) flags.push(`${nutrition.lowKcalDays} ימים סגורים מתחת ל-${KCAL_FLOOR}`);
  if (all.length < WORKOUTS_PER_WEEK) flags.push(`פחות מ-${WORKOUTS_PER_WEEK} אימונים (${all.length}/${WORKOUTS_PER_WEEK})`);
  if (!checkin) flags.push('צ׳ק-אין לא מולא');
  if (drops.length) flags.push(`ירידה בביצועים (R3): ${drops.join(', ')}`);

  return {
    week: ws,
    saturday,
    weekNo: start ? weekNumber(start, ws) : null,
    weight: { current, valid, comparison },
    waist: { wednesday: wedEntry ? { d: wedEntry.d, cm: wedEntry.cm } : null, previous: previousWaist },
    workouts: { done: all.length, planned: WORKOUTS_PER_WEEK, items, knee: peakPain(all, 'knee'), shoulder: peakPain(all, 'shoulder'), drops },
    cardio,
    steps,
    nutrition,
    creatine,
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

/** מסומן על R1 שהוצע בלי RIR — ההצעה עומדת, אבל הנתון שמאשר אותה חסר. */
export const RIR_UNKNOWN_NOTE = 'RIR לא נרשם — אשר בעצמך';

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
  L.push(data.waist.wednesday ? `רביעי ${formatDM(data.waist.wednesday.d)}: ${num(data.waist.wednesday.cm, 1)} ס״מ` : 'לא נמדד ברביעי');
  L.push(
    `אחרונות לפני: ${data.waist.previous.length ? data.waist.previous.map((e) => `${formatDM(e.d)} ${num(e.cm, 1)}`).join(' · ') : DASH}`,
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
      // מצב שימור (M) — "הבא: 60 שנ׳ × 3 · שימור", בלי תג כלל.
      parts.push(
        line.suggestion && line.next
          ? `הבא: ${line.next}${line.suggestion.rule === 'M' ? '' : ` (${line.suggestion.rule})`}`
          : `הבא: ${DASH}`,
      );
      if (line.rirUnknown) parts.push(RIR_UNKNOWN_NOTE);
      L.push(`  ${parts.join(' · ')}`);
    }
    if (it.skipped.length) L.push(`  דולגו: ${it.skipped.join(', ')}`);
  }
  L.push(`כאב: ברך ${num(wk.knee)} · כתף ${num(wk.shoulder)}`);
  L.push('');

  // 5. אירובי
  L.push(`${cardioLineText(data.cardio)}${data.cardio.over ? ' · מעל התקציב' : ''}`);
  L.push('');

  // 5ב. צעדים — ערכי היום, ואז הוזנו/ממוצע (ויעד כשיש)
  const st = data.steps;
  L.push(`צעדים: ${weekDays(data.week).map((d, i) => `${dayLetter(d)} ${st.days[i] === null || st.days[i] === undefined ? DASH : thousands(st.days[i]!)}`).join(' · ')}`);
  L.push(
    `הוזנו ${st.entered}/${WEEK_LENGTH} · ממוצע ${st.avg === null ? DASH : thousands(st.avg)} (על ימים שהוזנו)${
      st.goal !== null ? ` · ימים ≥ ${thousands(st.goal)}: ${st.atGoal}/${st.entered}` : ''
    }`,
  );
  L.push('');

  // 6. תזונה
  const nu = data.nutrition;
  L.push('תזונה');
  L.push(
    `ימים סגורים ${nu.closedDays.length}/${WEEK_LENGTH}${nu.closedDays.length ? ` (${nu.closedDays.map(dayLetter).join(' ')})` : ''}`,
  );
  if (nu.closedDays.length) {
    const n = nu.closedDays.length;
    const t = nu.target;
    L.push(
      `ימים סגורים: ממוצע ${num(nu.avgKcal)} קק״ל · ${num(nu.avgProtein)} ג׳ חלבון · יעד ${t ? `${t.kcal}/${t.protein}` : DASH} · חלבון ≥${
        t ? t.protein : 'יעד'
      }: ${nu.proteinDays === null ? DASH : `${nu.proteinDays}/${n}`} · מתחת ל-${KCAL_FLOOR}: ${nu.lowKcalDays}/${n} · עם הערכה: ${nu.estimateDays}/${n}${
        nu.fridayTier ? ` · ארוחת שישי: ${FRIDAY_TIERS[nu.fridayTier].label}` : ''
      }`,
    );
  }
  L.push(`נרשמו ולא נסגרו: ${nu.openDays}`);
  if (data.creatine) L.push(`קריאטין ${data.creatine.taken}/${data.creatine.eligible}`);
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
