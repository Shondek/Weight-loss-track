/**
 * סיכום שבועי מובנה — אותם נתונים שהדוח לצ'אט מדפיס, כאובייקט שהמסך
 * מרנדר. מודול טהור. `exportText.ts` בונה את הטקסט מאותן פונקציות, כך
 * שהמסך והדוח לא יכולים להיפרד זה מזה.
 */

import type { DB, ISODate, LoggedExercise, WeeklyCheckin, WorkoutEntry, WorkoutType } from '../types';
import { shortName, WORKOUTS_PER_WEEK } from '../data/program';
import { addDays, compareISO, formatDM, weekEnd, weekNumber } from './date';
import { programStartWeek } from './db';
import { clean, DASH } from './format';
import { getCheckin } from './checkins';
import {
  cardioMinutesDone,
  cardioModeLabel,
  cardioOf,
  hasData,
  isCardio,
  isTimedExercise,
  peakPain,
  setPerformed,
  setValue,
  skippedExercises,
  workoutsInWeek,
} from './workouts';
import {
  missingWeighDays,
  summarizeWeek,
  waistBeforeWeek,
  waistInWeek,
  weekChange,
  weeklyAverages,
  type WeekChange,
  type WeekSummary,
} from './weights';

const ORDINALS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי'] as const;

function n(v: number | null | undefined, digits = 0): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return DASH;
  return digits > 0 ? v.toFixed(digits) : String(v);
}

/**
 * המשקלים של תרגיל: מספר אחד כשכל הסטים זהים, ורשימה כשהם משתנים.
 * מוותר על "60,60,60" המיותר בלי להסתיר ירידת משקל באמצע תרגיל.
 */
function weightText(ex: LoggedExercise): string {
  const performed = ex.sets.filter(setPerformed);
  const weights = performed.map((s) => s.weight);
  if (weights.length === 0 || weights.every((w) => w === null)) return DASH;
  const distinct = new Set(weights.map((w) => (w === null ? DASH : clean(w))));
  if (distinct.size === 1) return [...distinct][0] ?? DASH;
  return weights.map((w) => (w === null ? DASH : clean(w))).join(',');
}

/** "חימום אופניים 10 דק׳" — בלי נקודות-אמצע, שהן המפריד בין תרגילים. */
function cardioText(e: LoggedExercise): string {
  return `${e.n} ${cardioModeLabel(cardioOf(e).mode)} ${n(cardioMinutesDone(e))} דק׳`;
}

/** תרגיל אחד כפי שהוא מופיע בדוח: "לג-פרס 60×12,12,10". */
export function exerciseText(e: LoggedExercise): string {
  if (isCardio(e)) return cardioText(e);
  const name = shortName(e.exerciseId, e.n);
  const values = e.sets
    .filter(setPerformed)
    .map((s) => {
      const v = setValue(s);
      return v === null ? DASH : String(v);
    })
    .join(',');
  if (isTimedExercise(e)) return `${name} ${values} שנ׳`;
  // תרגיל משקל גוף לא מקבל אסימון משקל — "—×10,10,10" הוא רעש, לא מידע.
  if (e.bodyweightOnly) return `${name} ${values}`;
  return `${name} ${weightText(e)}×${values}`;
}

/**
 * שורת האימון: חימום ראשון, תרגילים לפי סדרם (שם משקל×חזרות בכל סט),
 * אירובי סיום אחרון — שניהם רק אם בוצעו. תרגילים שדולגו נכתבים במפורש
 * בסוף, כדי שהניתוח יבדיל בין "לא בוצע" ל"לא נרשם". כשלא נרשם דבר —
 * כל התרגילים דולגו, ואין טעם לפרט.
 */
export function workoutText(entry: WorkoutEntry): string {
  const parts = entry.ex.filter(hasData).map(exerciseText);
  if (parts.length === 0) return 'לא נרשמו תרגילים';
  const skipped = skippedNames(entry);
  const done = parts.join(' · ');
  return skipped.length ? `${done} · דולגו: ${skipped.join(', ')}` : done;
}

export function skippedNames(entry: WorkoutEntry): string[] {
  return skippedExercises(entry).map((e) => shortName(e.exerciseId, e.n));
}

export function missingWorkoutText(done: number): string[] {
  const out: string[] = [];
  for (let i = done; i < WORKOUTS_PER_WEEK; i++) {
    out.push(`אימון ${ORDINALS[i] ?? String(i + 1)}`);
  }
  return out;
}

/** מה לא נרשם השבוע: אימונים חסרים, שקילות שדולגו (עד היום), מותניים. */
export function weekGaps(db: DB, week: ISODate, today: ISODate): string[] {
  const saturday = weekEnd(week);
  // עד סוף השבוע, אבל לא אל תוך העתיד — יום שעוד לא הגיע אינו "חסר".
  const upto = compareISO(today, saturday) < 0 ? today : saturday;
  const all = workoutsInWeek(db.workouts, week);
  const gaps: string[] = [...missingWorkoutText(all.length)];
  const missedDays = missingWeighDays(db.weights, week, upto);
  if (missedDays.length === 1) gaps.push(`שקילה של ${formatDM(missedDays[0]!)}`);
  else if (missedDays.length > 1) {
    gaps.push(`שקילות של ${missedDays.map(formatDM).join(', ')}`);
  }
  if (!waistInWeek(db.waist, week)) gaps.push('מדידת מותניים');
  return gaps;
}

export type WeekReport = {
  week: ISODate;
  saturday: ISODate;
  weekNo: number | null;
  weight: {
    current: WeekSummary;
    previous: WeekSummary;
    /** null כשאחד השבועות חלקי — אין השוואה. */
    change: WeekChange | null;
    /** למה אין השוואה, כשאין. */
    noComparison: 'current-partial' | 'previous-partial' | null;
  };
  waist: { now: number | null; previous: number | null };
  workouts: {
    done: number;
    planned: number;
    items: { id: string; d: ISODate; t: WorkoutType; text: string; skipped: string[] }[];
    knee: number | null;
    shoulder: number | null;
  };
  checkin: WeeklyCheckin | null;
  /** ממוצעים שבועיים עד השבוע הזה ועד בכלל, מהישן לחדש. */
  recentWeeks: WeekSummary[];
  gaps: string[];
};

export const RECENT_WEEKS = 8;

export function buildWeekSummary(db: DB, week: ISODate, today: ISODate): WeekReport {
  const start = programStartWeek(db);
  const current = summarizeWeek(db.weights, week);
  const previous = summarizeWeek(db.weights, addDays(week, -7));
  const change = weekChange(current, previous);
  const all = workoutsInWeek(db.workouts, week);

  return {
    week,
    saturday: weekEnd(week),
    weekNo: start ? weekNumber(start, week) : null,
    weight: {
      current,
      previous,
      change,
      noComparison: !current.complete
        ? 'current-partial'
        : !change
          ? 'previous-partial'
          : null,
    },
    waist: {
      now: waistInWeek(db.waist, week)?.cm ?? null,
      previous: waistBeforeWeek(db.waist, week)?.cm ?? null,
    },
    workouts: {
      done: all.length,
      planned: WORKOUTS_PER_WEEK,
      items: all.map((w) => ({
        id: w.id,
        d: w.d,
        t: w.t,
        text: entryLine(w),
        skipped: skippedNames(w),
      })),
      knee: peakPain(all, 'knee'),
      shoulder: peakPain(all, 'shoulder'),
    },
    checkin: getCheckin(db.checkins, week),
    recentWeeks: weeklyAverages(db.weights)
      .filter((w) => compareISO(w.weekStart, week) <= 0)
      .slice(-RECENT_WEEKS),
    gaps: weekGaps(db, week, today),
  };
}

/** התרגילים שבוצעו, בלי סעיף "דולגו" — הוא מוצג בנפרד במסך. */
function entryLine(entry: WorkoutEntry): string {
  const parts = entry.ex.filter(hasData).map(exerciseText);
  return parts.length ? parts.join(' · ') : 'לא נרשמו תרגילים';
}
