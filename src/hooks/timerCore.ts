/**
 * ליבת הטיימר — מודול טהור, בלי DOM, בלי אחסון ובלי שעון משלו.
 *
 * העיקרון: **שומרים זמן סיום (timestamp), לא מונה.** כל פונקציה מקבלת את
 * `now` מבחוץ, ולכן מה שנשאר הוא תמיד `deadline - now` — גם אם הדף היה
 * ברקע דקה, המסך היה כבוי, או שהדפדפן הקפיא את הטיימרים. שום "טיק" לא
 * נספר ולכן שום טיק לא יכול ללכת לאיבוד.
 *
 * שלושה מצבים: רץ (`deadline`), מושהה (`pausedMs`), הסתיים (`endedAt`).
 * "הסתיים" נשאר מוצג זמן קצר — כך שמי שחוזר לאפליקציה רואה "המנוחה נגמרה
 * לפני X שניות" במקום פס שנעלם בלי זכר.
 *
 * המבנה שנשמר ב-`fatloss:ui:timer` (`TimerState` ב-platform/uiState.ts) לא
 * השתנה: `toStored`/`fromStored` ממפים אליו וממנו. טיימר שהסתיים נשמר עם
 * ה-deadline שלו (שכבר עבר) עד שהוא נסגר — הגרסה הקודמת פשוט מתעלמת מערך
 * כזה, כמו תמיד.
 */

import type { TimerKind, TimerState } from '../platform/uiState';
import { CARDIO_MAX_MINUTES } from '../data/config';

export type { TimerKind };

export type TimerCore = {
  kind: TimerKind;
  label: string;
  totalSec: number;
  /** זמן הסיום ב-epoch ms. null כשהטיימר מושהה, הסתיים או לא קיים. */
  deadline: number | null;
  /** כמה נשאר (ms) כשהטיימר מושהה. */
  pausedMs: number | null;
  /** מתי הספירה הגיעה לאפס (ה-deadline שעבר). null = לא הסתיים. */
  endedAt: number | null;
  /** מתי הסיום זוהה בפועל — הרגע שבו המשתמש יכול היה לראות אותו. */
  seenAt: number | null;
};

/** זיהוי סיום באיחור גדול מזה = הטיימר הסתיים כשהדף היה ברקע: בלי צליל, עם "לפני X". */
export const LATE_MS = 3000;
/** כמה זמן מצב "הסתיים" נשאר מוצג מרגע שזוהה. */
export const FINISHED_SHOW_MS = 30_000;
/** טיימר שהסתיים לפני יותר מזה לא משוחזר אחרי טעינה מחדש. */
export const RESTORE_MAX_MS = 10 * 60_000;
/** ריצת אירובי במשך המרבי = סטופר: מציגים זמן שעבר, לא זמן שנשאר. */
export const STOPWATCH_SEC = CARDIO_MAX_MINUTES * 60;

export const IDLE: TimerCore = {
  kind: 'rest',
  label: '',
  totalSec: 0,
  deadline: null,
  pausedMs: null,
  endedAt: null,
  seenAt: null,
};

export function startTimer(now: number, seconds: number, label: string, kind: TimerKind = 'rest'): TimerCore {
  if (!(seconds > 0)) return IDLE;
  return { kind, label, totalSec: seconds, deadline: now + seconds * 1000, pausedMs: null, endedAt: null, seenAt: null };
}

/** ±שניות לטיימר שרץ. לא מקצרים אל מתחת לעכשיו — "−15" בסוף פשוט מסיים. */
export function addSeconds(t: TimerCore, now: number, seconds: number): TimerCore {
  if (t.deadline === null) return t;
  return { ...t, deadline: Math.max(t.deadline + seconds * 1000, now), totalSec: Math.max(0, t.totalSec + seconds) };
}

/** השהיה שומרת את מה שנשאר במקום זמן סיום — טיימר מושהה לא פג לעולם. */
export function pauseTimer(t: TimerCore, now: number): TimerCore {
  if (t.deadline === null) return t;
  return { ...t, deadline: null, pausedMs: Math.max(0, t.deadline - now) };
}

export function resumeTimer(t: TimerCore, now: number): TimerCore {
  if (t.pausedMs === null) return t;
  return { ...t, deadline: now + t.pausedMs, pausedMs: null };
}

/** חזרה למשך המלא, מושהה — כדי להתחיל מחדש בלחיצה. */
export function resetTimer(t: TimerCore): TimerCore {
  if (t.deadline === null && t.pausedMs === null) return t;
  return { ...t, deadline: null, pausedMs: t.totalSec * 1000, endedAt: null, seenAt: null };
}

export type TickResult = {
  timer: TimerCore;
  /**
   * true רק ברגע הסיום עצמו, וכשהוא זוהה בזמן (עד `LATE_MS` אחרי ה-deadline):
   * זה הרגע לצליל ולרטט. סיום שזוהה באיחור (הדף היה ברקע) לא מצפצף —
   * המשתמש כבר מסתכל על המסך, והפס אומר לפני כמה זמן זה נגמר.
   */
  alert: boolean;
};

/**
 * סנכרון מול השעון. נקרא מאינטרוול, מ-visibilitychange ומכל מקום אחר —
 * התוצאה תלויה רק ב-`now`, לא במספר הקריאות.
 */
export function tick(t: TimerCore, now: number): TickResult {
  if (t.deadline !== null && now >= t.deadline) {
    const endedAt = t.deadline;
    return {
      timer: { ...t, deadline: null, pausedMs: null, endedAt, seenAt: now },
      alert: now - endedAt <= LATE_MS,
    };
  }
  if (t.endedAt !== null && t.seenAt !== null && now - t.seenAt >= FINISHED_SHOW_MS) {
    return { timer: IDLE, alert: false };
  }
  return { timer: t, alert: false };
}

export type TimerView = {
  /** שניות שנותרו, מעוגל כלפי מעלה. 0 כשלא רץ. */
  remainingSec: number;
  /** שניות שעברו מתחילת הספירה (לתצוגת סטופר). */
  elapsedSec: number;
  /** רץ או מושהה — יש ספירה להציג. */
  running: boolean;
  paused: boolean;
  /** הספירה הסתיימה והמצב עדיין מוצג. */
  finished: boolean;
  /** לפני כמה שניות הסתיים (0 כשלא הסתיים). */
  endedAgoSec: number;
  /** הסיום זוהה באיחור — הטיימר נגמר כשהדף היה ברקע. */
  endedInBackground: boolean;
  /** החלק שנשאר, 0–1 (לפס ההתקדמות). */
  fractionLeft: number;
  /** ריצת אירובי במצב סטופר — מציגים `elapsedSec`. */
  stopwatch: boolean;
};

export function isStopwatch(kind: TimerKind, totalSec: number): boolean {
  return kind === 'cardio' && totalSec >= STOPWATCH_SEC;
}

export function view(t: TimerCore, now: number): TimerView {
  const paused = t.pausedMs !== null;
  const leftMs = paused ? (t.pausedMs ?? 0) : t.deadline !== null ? Math.max(0, t.deadline - now) : 0;
  const running = t.deadline !== null || paused;
  const remainingSec = Math.ceil(leftMs / 1000);
  const finished = t.endedAt !== null;
  return {
    remainingSec,
    elapsedSec: running ? Math.max(0, t.totalSec - remainingSec) : 0,
    running,
    paused,
    finished,
    endedAgoSec: finished ? Math.max(0, Math.floor((now - (t.endedAt ?? now)) / 1000)) : 0,
    endedInBackground: finished && t.seenAt !== null && t.seenAt - (t.endedAt ?? 0) > LATE_MS,
    fractionLeft: running && t.totalSec > 0 ? Math.min(1, leftMs / (t.totalSec * 1000)) : 0,
    stopwatch: running && isStopwatch(t.kind, t.totalSec),
  };
}

// ---------- מיפוי למבנה השמור (ללא שינוי במבנה) ----------

/** מה שנכתב ל-`fatloss:ui:timer`. null = אין טיימר (המפתח נמחק). */
export function toStored(t: TimerCore): TimerState | null {
  if (t.pausedMs !== null) return { deadline: 0, totalSec: t.totalSec, label: t.label, kind: t.kind, pausedMs: t.pausedMs };
  if (t.deadline !== null) return { deadline: t.deadline, totalSec: t.totalSec, label: t.label, kind: t.kind, pausedMs: null };
  // הסתיים ועדיין מוצג: ה-deadline שעבר נשאר, כדי שטעינה מחדש תדע לפני כמה זמן.
  if (t.endedAt !== null) return { deadline: t.endedAt, totalSec: t.totalSec, label: t.label, kind: t.kind, pausedMs: null };
  return null;
}

/**
 * שחזור מהערך השמור. טיימר שה-deadline שלו עבר חוזר כ"רץ" עם deadline
 * בעבר — ה-`tick` הראשון יסמן אותו כהסתיים (ובאיחור, כלומר בלי צליל).
 * ישן מ-`RESTORE_MAX_MS` — מתעלמים.
 */
export function fromStored(v: TimerState | null, now: number): TimerCore {
  if (!v) return IDLE;
  const base = { kind: v.kind, label: v.label, totalSec: v.totalSec, endedAt: null, seenAt: null };
  if (v.pausedMs !== null) return { ...base, deadline: null, pausedMs: v.pausedMs };
  if (v.deadline > now || now - v.deadline <= RESTORE_MAX_MS) return { ...base, deadline: v.deadline, pausedMs: null };
  return IDLE;
}

// ---------- טקסט ----------

/** "1:05" */
export function mmss(total: number): string {
  const s = Math.max(0, Math.floor(total));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** שם הטיימר לפי סוג — לחלון הצף ולקוראי מסך. */
export function kindLabel(kind: TimerKind): string {
  return kind === 'rest' ? 'מנוחה' : kind === 'countdown' ? 'חימום' : 'אירובי';
}

/** "המנוחה נגמרה" / "החימום נגמר" / "האירובי נגמר". */
export function finishedTitle(kind: TimerKind): string {
  return kind === 'rest' ? 'המנוחה נגמרה' : kind === 'countdown' ? 'החימום נגמר' : 'האירובי נגמר';
}

/** "לפני 12 שניות" / "לפני שנייה" / "לפני 1:05 דק׳" / "עכשיו". */
export function agoText(sec: number): string {
  if (sec <= 0) return 'עכשיו';
  if (sec === 1) return 'לפני שנייה';
  if (sec < 60) return `לפני ${sec} שניות`;
  return `לפני ${mmss(sec)} דק׳`;
}
