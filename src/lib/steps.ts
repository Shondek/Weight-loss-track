/**
 * צעדים יומיים (שלב 6). מודול טהור.
 *
 * הזנה ידנית (PWA לא קורא Apple Health): הערך נשמר על DayMeta.steps
 * (`fatloss:days`). צעדי הליכון מרשומות האירובי אינם נספרים כאן
 * אוטומטית — הטלפון לא תמיד על ההליכון. הם מוצעים בלבד (`cardioStepsOn`),
 * והמשתמש מוסיף אותם לשדה בלחיצה מפורשת.
 */

import type { DayMeta, DB, ISODate } from '../types';
import { STEPS_GOAL_SCHEDULE } from '../data/config';
import { addDays, compareISO, weekDays } from './date';
import { stepsOn } from './nutrition/days';
import { cardioMinutesDone, FINISHER_ID } from './workouts';
import { MAX_DAY_STEPS } from './schema';

/** יעד הצעדים בתאריך: השלב האחרון שכבר נכנס לתוקף, או null כשאין יעד. */
export function stepsGoalFor(d: ISODate): number | null {
  let goal: number | null = null;
  let bestFrom: ISODate | null = null;
  for (const step of STEPS_GOAL_SCHEDULE) {
    if (compareISO(step.from, d) > 0) continue;
    if (bestFrom === null || compareISO(step.from, bestFrom) > 0) {
      bestFrom = step.from;
      goal = step.steps;
    }
  }
  return goal;
}

/** ברירת המחדל לכרטיס: אתמול — הצעדים מוזנים בבוקר, יחד עם השקילה. */
export function defaultStepsDate(today: ISODate): ISODate {
  return addDays(today, -1);
}

/** אפשר לדפדף קדימה רק עד היום — לא אל העתיד. */
export function canStepForward(d: ISODate, today: ISODate): boolean {
  return compareISO(d, today) < 0;
}

/** "מעל" / "מתחת" ליעד של אותו יום, או null כשאין יעד. */
export function stepsStatus(steps: number, d: ISODate): 'ok' | 'low' | null {
  const goal = stepsGoalFor(d);
  if (goal === null) return null;
  return steps >= goal ? 'ok' : 'low';
}

/** שבעת הימים שמסתיימים ב-`end` (כולל), מהישן לחדש, עם הצעדים או null. */
export function recentSteps(list: readonly DayMeta[], end: ISODate, count = 7): { d: ISODate; steps: number | null }[] {
  const out: { d: ISODate; steps: number | null }[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = addDays(end, -i);
    out.push({ d, steps: stepsOn(list, d) });
  }
  return out;
}

export type StepsWeek = {
  /** שבעה ערכים, מראשון לשבת. null = לא הוזן. */
  days: (number | null)[];
  entered: number;
  /** ממוצע על הימים שהוזנו, מעוגל לשלם; null כשאין. */
  avg: number | null;
  /** היעד שבתוקף בשבת של השבוע; null = אין יעד לשבוע הזה. */
  goal: number | null;
  /** ימים שהוזנו ועמדו ביעד; null כשאין יעד. */
  atGoal: number | null;
};

/** הסיכום השבועי של הצעדים. היעד לשבוע הוא היעד שבתוקף בשבת שלו. */
export function stepsWeek(list: readonly DayMeta[], ws: ISODate): StepsWeek {
  const days = weekDays(ws).map((d) => stepsOn(list, d));
  const present = days.filter((v): v is number => v !== null);
  const goal = stepsGoalFor(addDays(ws, 6));
  return {
    days,
    entered: present.length,
    avg: present.length ? Math.round(present.reduce((s, v) => s + v, 0) / present.length) : null,
    goal,
    atGoal: goal === null ? null : present.filter((v) => v >= goal).length,
  };
}

/**
 * צעדי הליכון שנרשמו באירובי של היום: אירובי סיום (שבוצע) + עצמאי.
 * רשומה בלי `steps` לא נספרת. לעולם לא נוסף לספירה היומית מעצמו.
 */
export function cardioStepsOn(db: Pick<DB, 'workouts' | 'standaloneCardio'>, d: ISODate): number {
  let sum = 0;
  for (const w of db.workouts) {
    if (w.d !== d) continue;
    for (const ex of w.ex) {
      if (ex.exerciseId !== FINISHER_ID || cardioMinutesDone(ex) === null) continue;
      if (ex.cardio?.steps !== undefined) sum += ex.cardio.steps;
    }
  }
  for (const e of db.standaloneCardio) {
    if (e.d === d && e.steps !== undefined) sum += e.steps;
  }
  return sum;
}

/** הערך בשדה אחרי "הוסף לספירה": הנוכחי (או 0) + צעדי האירובי, עד התקרה. לא נשמר כאן. */
export function addCardioSteps(current: number | null, cardioSteps: number): number {
  return Math.min(MAX_DAY_STEPS, (current ?? 0) + cardioSteps);
}
