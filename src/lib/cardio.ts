/**
 * אירובי — שני מקורות, מונה אחד. מודול טהור.
 *
 * 1. אירובי סיום: שורת `finisher-cardio` בתוך רשומת האימון (lib/workouts.ts).
 * 2. אירובי עצמאי: `StandaloneCardio` במפתח משלו. **אינו אימון** — לא
 *    נכנס ל-`workouts`, ולכן `workoutsInWeek` ו-"אימונים השבוע" לא
 *    יודעים עליו. זה מכוון: 3/3 חייב להישאר כוח בלבד.
 *
 * המונה השבועי סוכם דקות משני המקורות מול תקציב בדקות (config.ts).
 */

import type { CardioMode, DB, ISODate, StandaloneCardio, WorkoutEntry } from '../types';
import {
  CARDIO_BUDGET_SCHEDULE,
  CARDIO_WEEKLY_BUDGET_MIN,
  STANDALONE_CARDIO,
} from '../data/config';
import { compareISO, weekDays } from './date';
import {
  cardioGaugeText,
  cardioMinutesDone,
  cardioModeLabel,
  FINISHER_ID,
  workoutsInWeek,
} from './workouts';

// ---------- אירובי עצמאי ----------

export function sortStandalone(list: readonly StandaloneCardio[]): StandaloneCardio[] {
  return [...list].sort(
    (a, b) => compareISO(a.d, b.d) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
}

export function upsertStandalone(
  list: readonly StandaloneCardio[],
  entry: StandaloneCardio,
): StandaloneCardio[] {
  const rest = list.filter((e) => e.id !== entry.id);
  return sortStandalone([...rest, entry]);
}

export function removeStandalone(
  list: readonly StandaloneCardio[],
  id: string,
): StandaloneCardio[] {
  return list.filter((e) => e.id !== id);
}

export function standaloneInWeek(
  list: readonly StandaloneCardio[],
  ws: ISODate,
): StandaloneCardio[] {
  const days = new Set(weekDays(ws));
  return sortStandalone(list.filter((e) => days.has(e.d)));
}

/** הרשומה האחרונה, ואם ניתן `mode` — האחרונה באותו מכשיר. null כשאין. */
export function lastStandalone(
  list: readonly StandaloneCardio[],
  mode?: CardioMode,
): StandaloneCardio | null {
  const sorted = sortStandalone(list.filter((e) => mode === undefined || e.mode === mode));
  return sorted[sorted.length - 1] ?? null;
}

/**
 * מזהה אירובי עצמאי. `unique` מגיע מבחוץ (חותמת זמן + אקראיות), כמו
 * `makeWorkoutId`. הסיומת מבדילה אותו ממזהי אימון בעין.
 */
export function makeStandaloneId(d: ISODate, unique: string): string {
  return `${d}-${unique}-cardio`;
}

/**
 * רשומה חדשה לכרטיס "אירובי — עצמאי": מה שנרשם באחרון של אותו מכשיר,
 * ואם אין — ברירות המחדל מ-config.ts (הליכון, 60 דק׳, 2.5%, 5 קמ״ש).
 */
export function blankStandalone(
  list: readonly StandaloneCardio[],
  d: ISODate,
  id: string,
  mode: CardioMode = STANDALONE_CARDIO.defaultMode,
): StandaloneCardio {
  const last = lastStandalone(list, mode);
  return {
    id,
    d,
    mode,
    minutes: last?.minutes ?? STANDALONE_CARDIO.defaultMinutes,
    incline: last ? last.incline : STANDALONE_CARDIO.defaultIncline,
    speed: last ? last.speed : STANDALONE_CARDIO.defaultSpeed,
    note: '',
  };
}

/** "הליכון · 60 דק׳ · שיפוע 2.5% · 5 קמ״ש" — השורה ברשימה ובדוח. */
export function standaloneLine(e: StandaloneCardio): string {
  const gauges = cardioGaugeText(e.incline, e.speed);
  return `${cardioModeLabel(e.mode)} · ${e.minutes} דק׳${gauges ? ` · ${gauges}` : ''}`;
}

// ---------- מונה שבועי ----------

/** התקציב השבועי בדקות לשבוע שמתחיל ב-`ws`: הבסיס, או השלב שכבר נכנס לתוקף. */
export function cardioBudgetFor(ws: ISODate): number {
  let budget = CARDIO_WEEKLY_BUDGET_MIN;
  let bestFrom: ISODate | null = null;
  for (const step of CARDIO_BUDGET_SCHEDULE) {
    if (compareISO(step.from, ws) > 0) continue;
    if (bestFrom === null || compareISO(step.from, bestFrom) > 0) {
      bestFrom = step.from;
      budget = step.minutes;
    }
  }
  return budget;
}

/** דקות אירובי סיום שבוצעו (נלחץ "התחל") באימוני השבוע. */
export function finisherMinutesInWeek(list: readonly WorkoutEntry[], ws: ISODate): number {
  let total = 0;
  for (const w of workoutsInWeek(list, ws)) {
    for (const ex of w.ex) {
      if (ex.exerciseId !== FINISHER_ID) continue;
      total += cardioMinutesDone(ex) ?? 0;
    }
  }
  return total;
}

export function standaloneMinutesInWeek(
  list: readonly StandaloneCardio[],
  ws: ISODate,
): number {
  return standaloneInWeek(list, ws).reduce((sum, e) => sum + e.minutes, 0);
}

export type CardioWeek = {
  /** דקות אירובי סיום, מתוך רשומות האימון. */
  finisher: number;
  /** דקות אירובי עצמאי. */
  standalone: number;
  total: number;
  budget: number;
};

/** "X / 60 דק׳ · סיום: __ · עצמאי: __" — המספרים מאחורי המונה. */
export function cardioWeek(db: DB, ws: ISODate): CardioWeek {
  const finisher = finisherMinutesInWeek(db.workouts, ws);
  const standalone = standaloneMinutesInWeek(db.standaloneCardio, ws);
  return { finisher, standalone, total: finisher + standalone, budget: cardioBudgetFor(ws) };
}
