/**
 * הצעת משקל לאימון הבא — כללי ההתקדמות של התוכנית. מודול טהור.
 *
 * הקלט: היסטוריית התרגיל לפי מזהה, מכל האימונים (A/B/C), סטי עבודה בלבד.
 * הפלט: הצעה אחת עם הכלל שהופעל ושורת הסבר. האפליקציה מציעה בלבד —
 * השדה מתמלא רק בלחיצה על "השתמש".
 *
 *  R1  התקדמות כפולה: אותו משקל בכל הסטים; כשכל סט מגיע ל-targetRepMax
 *      ו-RIR בסט האחרון ≥ 2 → +step, היעד חוזר ל-targetRepMin.
 *  R2  לא משנים משקל בין סטים באותו אימון (ההצעה תמיד משקל אחד).
 *  R3  שני אימונים רצופים שבהם סט כלשהו מתחת ל-targetRepMin באותו משקל
 *      → −10%, מעוגל למטה ל-step.
 *  R4  קפיצה גדולה: step / משקל > 20% → לא קופצים ב-targetRepMax; קודם
 *      targetRepMax + 2 בכל הסטים, ואז קופצים.
 *  R5  ב-targetRepMax עם RIR 0–1 → נשארים (עוד לא נקי).
 *  R6  אחרת → אותו משקל, +1 חזרה בסט הנמוך.
 *
 * תרגיל זמן (פלאנק): השניות הן "החזרות", והטווח הוא 30–45.
 */

import type { ISODate, LoggedExercise, Rir } from '../types';
import { compareISO } from './date';
import { clean } from './format';
import { setPerformed } from './workouts';

export const LARGE_JUMP_RATIO = 0.2;
export const DROP_RATIO = 0.9;

export type ProgressionSpec = {
  step: number | null;
  repRangeMin: number;
  repRangeMax: number;
  isTimed: boolean;
  bodyweightOnly: boolean;
};

export type Rule = 'R1' | 'R3' | 'R4' | 'R5' | 'R6';

export type Suggestion = {
  action: 'up' | 'down' | 'same';
  /** המשקל המוצע. null: אין מספר (step null → "דרגה אחת"; משקל גוף). */
  weight: number | null;
  repTarget: number;
  rule: Rule;
  /** שורה קצרה בעברית. */
  reason: string;
  /** R1 הוצע בלי RIR רשום — "אשר בעצמך". */
  rirUnknown: boolean;
  mixedWeights: boolean;
  /** המשקל שעליו מבוססת ההצעה (הנפוץ ביותר באימון האחרון). */
  basisWeight: number | null;
  lastDate: ISODate;
};

export type Session = { d: ISODate; ex: LoggedExercise };

type Analysis = { weight: number | null; mixed: boolean; values: number[]; rir: Rir | undefined; d: ISODate };

/** מעגל למטה ל-step, עם הגנה מפני שגיאת נקודה צפה (11.25/2.5 = 4.5 → 4 → 10). */
export function roundDownToStep(weight: number, step: number): number {
  const q = Math.floor(weight / step + 1e-9);
  return Math.round(q * step * 100) / 100;
}

/**
 * ניתוח אימון אחד: המשקל הנפוץ ביותר (שוויון → זה שבסט המאוחר), האם היו
 * משקלים שונים, וערכי הסטים באותו משקל (חזרות, או שניות בתרגיל זמן).
 */
function analyze(s: Session, timed: boolean): Analysis | null {
  const performed = s.ex.sets.filter(setPerformed);
  if (performed.length === 0) return null;
  const counts = new Map<number, { n: number; last: number }>();
  performed.forEach((set, i) => {
    if (set.weight === null) return;
    const c = counts.get(set.weight) ?? { n: 0, last: -1 };
    counts.set(set.weight, { n: c.n + 1, last: i });
  });
  let weight: number | null = null;
  let best = { n: 0, last: -1 };
  for (const [w, c] of counts) {
    if (c.n > best.n || (c.n === best.n && c.last > best.last)) {
      best = c;
      weight = w;
    }
  }
  const mixed = counts.size > 1;
  const atBasis = weight === null ? performed : performed.filter((set) => set.weight === weight);
  const values = atBasis.map((set) => (timed ? set.seconds : set.reps)).filter((v): v is number => v !== null);
  if (values.length === 0) return null;
  return { weight, mixed, values, rir: s.ex.rir, d: s.d };
}

const unitWord = (timed: boolean) => (timed ? 'שנ׳' : 'חזרות');

/**
 * ההצעה לאימון הבא. null כשאין אף ביצוע. `history` בכל סדר — ממוין כאן
 * לפי תאריך (שוויון: סדר הקלט).
 */
export function suggestNext(history: readonly Session[], spec: ProgressionSpec): Suggestion | null {
  const sorted = [...history].sort((a, b) => compareISO(a.d, b.d));
  const analyses = sorted.map((s) => analyze(s, spec.isTimed)).filter((a): a is Analysis => a !== null);
  const L = analyses[analyses.length - 1];
  if (!L) return null;
  const P = analyses[analyses.length - 2] ?? null;

  const { repRangeMin: min, repRangeMax: max, step, isTimed: timed } = spec;
  const unit = unitWord(timed);
  const w = L.weight;
  const lowest = Math.min(...L.values);
  const allTop = L.values.every((v) => v >= max);
  const anyBelow = L.values.some((v) => v < min);
  const largeJump = step !== null && w !== null && w > 0 && step / w > LARGE_JUMP_RATIO;
  const mixedNote = L.mixed ? ' · משקלים שונים בין סטים' : '';
  const base = { mixedWeights: L.mixed, basisWeight: w, lastDate: L.d, rirUnknown: false };

  if (allTop) {
    if (largeJump && !L.values.every((v) => v >= max + 2)) {
      return {
        ...base,
        action: 'same',
        weight: w,
        repTarget: max + 2,
        rule: 'R4',
        reason: `קפיצה גדולה (${clean(step!)} מתוך ${clean(w!)} ק״ג) — קודם ${max + 2} ${unit} בכל הסטים, ואז לקפוץ${mixedNote}`,
      };
    }
    if (L.rir === 0 || L.rir === 1) {
      return {
        ...base,
        action: 'same',
        weight: w,
        repTarget: max,
        rule: 'R5',
        reason: `הגעת ל-${max} בכל הסטים, אבל RIR ${L.rir} — עוד לא נקי. אותו משקל${mixedNote}`,
      };
    }
    const rirUnknown = L.rir === undefined;
    const next = step === null ? null : w === null ? step : Math.round((w + step) * 100) / 100;
    const jump = step === null ? 'דרגה אחת למעלה' : `+${clean(step)} ק״ג`;
    return {
      ...base,
      action: 'up',
      weight: next,
      repTarget: min,
      rule: 'R1',
      rirUnknown,
      reason: `${max} ${unit} בכל הסטים${rirUnknown ? '' : ` עם RIR ${L.rir}`} → ${jump}, היעד חוזר ל-${min}${mixedNote}`,
    };
  }

  if (anyBelow && P && P.weight === w && P.values.some((v) => v < min)) {
    const next = step === null || w === null ? null : roundDownToStep(w * DROP_RATIO, step);
    return {
      ...base,
      action: 'down',
      weight: next,
      repTarget: min,
      rule: 'R3',
      reason: `שני אימונים רצופים מתחת ל-${min} ${unit}${w !== null ? ` ב-${clean(w)} ק״ג` : ''} → ${
        next !== null ? `−10% מעוגל ל-${clean(next)} ק״ג` : 'דרגה אחת למטה'
      }${mixedNote}`,
    };
  }

  const target = Math.min(lowest + 1, max);
  return {
    ...base,
    action: 'same',
    weight: w,
    repTarget: target,
    rule: 'R6',
    reason: `${anyBelow ? `סט מתחת ל-${min} פעם אחת — ` : ''}אותו משקל, +1 בסט הנמוך (${lowest} → ${target})${mixedNote}`,
  };
}

/** חלופה (שלב 4.1) בלי היסטוריה משלה — אין כלל להפעיל, רק הנחיה. */
export const NO_HISTORY_HINT = 'אין היסטוריה — התחל קל, 2–3 חזרות ברזרבה';

/**
 * ההנחיה לשורה שהוחלפה: כשאין הצעה (אין היסטוריה לחלופה) — `NO_HISTORY_HINT`;
 * כשיש היסטוריה — הכללים הרגילים חלים (ההצעה מוצגת, וכאן null).
 * לשורה רגילה תמיד null.
 */
export function alternateHint(s: Suggestion | null, swapped: boolean): string | null {
  return swapped && s === null ? NO_HISTORY_HINT : null;
}

/** הטקסט למסך: "17.5 ק״ג" / "דרגה אחת למעלה" / "אותו משקל" / "משקל גוף", ו-"8 חזרות". */
export function suggestionLabel(s: Suggestion, spec: Pick<ProgressionSpec, 'isTimed'>): { weight: string; reps: string } {
  const reps = `${s.repTarget} ${unitWord(spec.isTimed)}`;
  if (s.action === 'same') return { weight: s.weight === null ? 'משקל גוף' : `${clean(s.weight)} ק״ג`, reps };
  if (s.weight !== null) return { weight: `${clean(s.weight)} ק״ג`, reps };
  return { weight: s.action === 'up' ? 'דרגה אחת למעלה' : 'דרגה אחת למטה', reps };
}
