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
 *  M   מצב שימור (`mode: "maintain"` בתוכנית, A8 פלאנק מ-3/10/2026): יעד
 *      קבוע — ההצעה היא תמיד "repRangeMax × sets · שימור", בלי R1–R6,
 *      בלי תלות ב-RIR ובלי תלות בזמנים שנרשמו (מעל או מתחת ליעד).
 *
 * שני סייגים לתרגיל בודד (6/10/2026), שלא נוגעים בשום תרגיל אחר:
 *
 *  חזרות בלבד (`mode: "reps"`, B8 הרמת רגליים): אין משקל ואין step. R6 ו-R5
 *      כרגיל; תנאי R1 (תקרה נקייה) → "תקרה — נשארים" בלי הצעת משקל (rule R1,
 *      action same); תנאי R3 (שני אימונים מתחת לרצפה) → אותן חזרות (הרצפה),
 *      בלי −10%, עם סימון "מתחת לרצפה פעמיים — לבדוק" (rule R3, action same —
 *      הסיכום השבועי מסמן R3 כירידה בביצועים). R4 לא רלוונטי (אין step).
 *  משקל גוף כפתיחה (`bodyweightStart`, A6 פשיטת ירך): שדה משקל ריק או 0
 *      הוא עומס 0 ק״ג, לא "לא ידוע". הקפיצה הראשונה (step מתוך 0 — אינסוף
 *      אחוז) היא תמיד קפיצה גדולה: R4 — קודם targetRepMax + 2 בכל הסטים
 *      במשקל גוף, ואז R1 מציע את step (2.5) והיעד חוזר ל-targetRepMin.
 *      R3 במשקל גוף לא יורד (אין לאן) — נשארים במשקל גוף. מעל 0 — R1–R6
 *      כרגיל, כולל R4 לפי היחס step/משקל. אין חלוקה ב-0 בשום מסלול.
 *
 * תרגיל זמן: השניות הן "החזרות" (פלאנק: 60 × 3 בשימור; חלופות זמן: 30–45).
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
  /**
   * `maintain` = מצב שימור (M); `reps` = חזרות בלבד (B8). חסר = `progress`
   * (R1–R6). `Exercise` מתאים כמו שהוא.
   */
  mode?: 'progress' | 'maintain' | 'reps';
  /** מספר הסטים — לטקסט "60 שנ׳ × 3" במצב שימור בלבד. חסר = בלי "× n". */
  sets?: number;
  /** מתחיל במשקל גוף (A6): שדה משקל ריק או 0 = עומס 0 ק״ג. חסר = false. */
  bodyweightStart?: boolean;
};

/** R1–R6 — כללי ההתקדמות; M — מצב שימור (בלי התקדמות). */
export type Rule = 'R1' | 'R3' | 'R4' | 'R5' | 'R6' | 'M';

/** שימור: היעד הקבוע של התרגיל. */
export const MAINTAIN_LABEL = 'שימור';

/** חזרות בלבד: תקרה נקייה — אין משקל להוסיף, נשארים בתקרה. */
export const CEILING_STAY_LABEL = 'תקרה — נשארים';

/** חזרות בלבד: שני אימונים מתחת לרצפה — אין −10% להציע, רק סימון לבדיקה. */
export const BELOW_FLOOR_REVIEW_LABEL = 'מתחת לרצפה פעמיים — לבדוק';

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
  const repsOnly = spec.mode === 'reps';
  // משקל גוף כפתיחה: 0 שנרשם במפורש = משקל גוף, כמו שדה ריק. לכל תרגיל אחר
  // העומס הוא בדיוק מה שנרשם (null = לא ידוע), כמו תמיד.
  const loadOf = (a: Analysis): number | null => (spec.bodyweightStart === true && a.weight === 0 ? null : a.weight);
  const w = loadOf(L);
  const fromBodyweight = spec.bodyweightStart === true && w === null;
  const mixedNote = L.mixed ? ' · משקלים שונים בין סטים' : '';
  const base = { mixedWeights: L.mixed, basisWeight: w, lastDate: L.d, rirUnknown: false };

  // M — מצב שימור: לפני כל כלל אחר. לא קורא RIR ולא את הערכים שנרשמו.
  if (spec.mode === 'maintain') {
    return {
      ...base,
      action: 'same',
      weight: null,
      repTarget: max,
      rule: 'M',
      reason: `${MAINTAIN_LABEL} — יעד קבוע ${max} ${unit}${spec.sets !== undefined ? ` × ${spec.sets}` : ''}, בלי התקדמות ובלי תלות ב-RIR`,
    };
  }

  const lowest = Math.min(...L.values);
  const allTop = L.values.every((v) => v >= max);
  const anyBelow = L.values.some((v) => v < min);
  // ממשקל גוף (bodyweightStart) כל step הוא קפיצה גדולה; אחרת היחס step/משקל, ורק כשיש משקל חיובי.
  const largeJump = step !== null && (fromBodyweight || (w !== null && w > 0 && step / w > LARGE_JUMP_RATIO));

  if (allTop) {
    if (largeJump && !L.values.every((v) => v >= max + 2)) {
      return {
        ...base,
        action: 'same',
        weight: w,
        repTarget: max + 2,
        rule: 'R4',
        reason: fromBodyweight
          ? `הקפיצה הראשונה ממשקל גוף (+${clean(step!)} ק״ג) היא קפיצה גדולה — קודם ${max + 2} ${unit} בכל הסטים במשקל גוף, ואז לקפוץ${mixedNote}`
          : `קפיצה גדולה (${clean(step!)} מתוך ${clean(w!)} ק״ג) — קודם ${max + 2} ${unit} בכל הסטים, ואז לקפוץ${mixedNote}`,
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
    if (repsOnly) {
      // חזרות בלבד: אין משקל להוסיף — נשארים בתקרה. RIR לא נדרש לאישור (אין קפיצה).
      return {
        ...base,
        action: 'same',
        weight: null,
        repTarget: max,
        rule: 'R1',
        reason: `${CEILING_STAY_LABEL} — ${max} ${unit} בכל הסטים${L.rir === undefined ? '' : ` עם RIR ${L.rir}`}; התקדמות בחזרות בלבד, בלי משקל${mixedNote}`,
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

  if (anyBelow && P && loadOf(P) === w && P.values.some((v) => v < min)) {
    if (repsOnly) {
      // חזרות בלבד: אין −10% להציע. אותן חזרות (הרצפה), וסימון לבדיקה.
      return {
        ...base,
        action: 'same',
        weight: null,
        repTarget: min,
        rule: 'R3',
        reason: `${BELOW_FLOOR_REVIEW_LABEL}: שני אימונים רצופים מתחת ל-${min} ${unit} — אותן חזרות, בלי הורדה${mixedNote}`,
      };
    }
    if (fromBodyweight) {
      // משקל גוף כפתיחה: אין לאן לרדת. נשארים במשקל גוף, היעד הרצפה.
      return {
        ...base,
        action: 'same',
        weight: null,
        repTarget: min,
        rule: 'R3',
        reason: `שני אימונים רצופים מתחת ל-${min} ${unit} במשקל גוף — אין לאן לרדת, נשארים במשקל גוף${mixedNote}`,
      };
    }
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

/**
 * שורת ההצעה המלאה, למסך ולסיכום השבועי: "17.5 ק״ג · 8 חזרות", ובמצב
 * שימור "60 שנ׳ × 3 · שימור" (בלי משקל — היעד הוא משקל גוף).
 */
export function suggestionText(s: Suggestion, spec: Pick<ProgressionSpec, 'isTimed' | 'sets'>): string {
  if (s.rule === 'M') {
    const times = spec.sets !== undefined ? ` × ${spec.sets}` : '';
    return `${s.repTarget} ${unitWord(spec.isTimed)}${times} · ${MAINTAIN_LABEL}`;
  }
  const label = suggestionLabel(s, spec);
  return `${label.weight} · ${label.reps}`;
}

/**
 * הטקסט למסך: "17.5 ק״ג" / "דרגה אחת למעלה" / "אותו משקל" / "משקל גוף", ו-"8 חזרות".
 * חזרות בלבד בתקרה (R1 עם action same — צירוף שקיים רק שם): "תקרה — נשארים".
 */
export function suggestionLabel(s: Suggestion, spec: Pick<ProgressionSpec, 'isTimed'>): { weight: string; reps: string } {
  const reps = `${s.repTarget} ${unitWord(spec.isTimed)}`;
  if (s.rule === 'R1' && s.action === 'same') return { weight: CEILING_STAY_LABEL, reps };
  if (s.action === 'same') return { weight: s.weight === null ? 'משקל גוף' : `${clean(s.weight)} ק״ג`, reps };
  if (s.weight !== null) return { weight: `${clean(s.weight)} ק״ג`, reps };
  return { weight: s.action === 'up' ? 'דרגה אחת למעלה' : 'דרגה אחת למטה', reps };
}
