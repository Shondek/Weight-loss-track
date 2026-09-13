import type { CardioSession } from '../lib/cardioSession';

/**
 * מצב ממשק ארעי ששורד רענון ומעבר בין טאבים.
 *
 * זה **לא** נתוני משתמש: לא נכנס ל-IndexedDB, לא לגיבוי, ולא למפתחות של
 * store.ts. שכבת האחסון של הנתונים נשארת קובץ אחד; כאן רק מה מסך היה
 * פתוח ומתי הטיימר אמור להסתיים.
 *
 * localStorage ולא sessionStorage: ב-PWA שמותקן, iOS עשוי לסגור ולפתוח
 * מחדש את הדף ולאבד את ה-session. הדדליין נבדק מול השעון בכל קריאה,
 * ולכן ערך ישן פשוט מתעלמים ממנו.
 */

const TIMER_KEY = 'fatloss:ui:timer';
const EDITOR_KEY = 'fatloss:ui:editor';
const PREFS_KEY = 'fatloss:ui:prefs';
const CARDIO_SESSION_KEY = 'fatloss:ui:cardio-session';

/** אימון פתוח שנשכח נחשב נטוש אחרי שש שעות. */
const EDITOR_TTL_MS = 6 * 60 * 60 * 1000;

/**
 * `rest` — מנוחה (±15, דלג). `countdown` — חימום (השהה, אפס, דלג).
 * `cardio` — ריצת אירובי: תצוגה וצליל בלבד; אין השהיה, כי הרישום נגזר
 * מחותמות זמן (lib/cardioSession.ts) ו"סיים" נמצא במסך האימון.
 */
export type TimerKind = 'rest' | 'countdown' | 'cardio';

/**
 * `pausedMs` — כמה נשאר כשהטיימר מושהה; אז `deadline` לא רלוונטי.
 * `kind` — מנוחה (±15, דלג) או ספירה לאחור ידנית של חימום/אירובי (השהה, אפס, דלג).
 */
export type TimerState = {
  deadline: number;
  totalSec: number;
  label: string;
  kind: TimerKind;
  pausedMs: number | null;
};
export type EditorState = { openId: string; focus: number; at: number };

/**
 * העדפות תצוגה. `historyOpen` — האם "ביצועים קודמים" במסך האימון פתוח.
 * ברירת המחדל הראשונית סגורה; הבחירה האחרונה נשמרת בין פתיחות.
 */
export type Prefs = { historyOpen: boolean };

export const DEFAULT_PREFS: Prefs = { historyOpen: false };

function read<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key);
    return raw === null ? null : (JSON.parse(raw) as T);
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* אחסון חסום — מצב ממשק הוא נוחות, לא נתון. לא מדווחים. */
  }
}

/** הטיימר השמור, רק אם עוד לא פג — או שהוא מושהה, ואז הוא לא פג לעולם. */
export function readTimer(): TimerState | null {
  const v = read<Partial<TimerState>>(TIMER_KEY);
  if (!v || typeof v.deadline !== 'number') return null;
  const state: TimerState = {
    deadline: v.deadline,
    totalSec: typeof v.totalSec === 'number' ? v.totalSec : 0,
    label: typeof v.label === 'string' ? v.label : '',
    kind: v.kind === 'countdown' || v.kind === 'cardio' ? v.kind : 'rest',
    pausedMs: typeof v.pausedMs === 'number' ? v.pausedMs : null,
  };
  if (state.pausedMs !== null) return state;
  return state.deadline > Date.now() ? state : null;
}

export function writeTimer(v: TimerState | null): void {
  write(TIMER_KEY, v);
}

/** האימון שהיה פתוח, רק אם לא עברו שש שעות. */
export function readEditor(): EditorState | null {
  const v = read<EditorState>(EDITOR_KEY);
  if (!v || typeof v.openId !== 'string' || typeof v.at !== 'number') return null;
  return Date.now() - v.at < EDITOR_TTL_MS ? v : null;
}

export function writeEditor(v: { openId: string; focus: number } | null): void {
  write(EDITOR_KEY, v === null ? null : { ...v, at: Date.now() });
}

/** העדפות התצוגה. שדה חסר או שבור חוזר לברירת המחדל שלו. */
export function readPrefs(): Prefs {
  const v = read<Partial<Prefs>>(PREFS_KEY);
  return {
    historyOpen:
      typeof v?.historyOpen === 'boolean' ? v.historyOpen : DEFAULT_PREFS.historyOpen,
  };
}

export function writePrefs(v: Prefs): void {
  write(PREFS_KEY, v);
}

/**
 * ריצת אירובי שהתחילה ועוד לא נשמרה או בוטלה. חותמות זמן וערכים בלבד —
 * הרשומה עצמה נכתבת ל-IndexedDB רק בשמירה מהסיכום. לא נתון משתמש: לא
 * בגיבוי. מחיקת האפליקציה באמצע ריצה מאבדת אותה, במכוון.
 */
export function readCardioSession(): CardioSession | null {
  const v = read<Partial<CardioSession>>(CARDIO_SESSION_KEY);
  if (!v || typeof v.startedAt !== 'number' || !Array.isArray(v.events)) return null;
  if (typeof v.plannedMinutes !== 'number' || v.plannedMinutes <= 0) return null;
  if (v.mode !== 'bike' && v.mode !== 'treadmill') return null;
  const t = v.target;
  if (!t || typeof t !== 'object') return null;
  if (t.kind === 'finisher') {
    if (typeof t.workoutId !== 'string' || typeof t.d !== 'string') return null;
    if (t.t !== 'A' && t.t !== 'B' && t.t !== 'C') return null;
  } else if (t.kind === 'standalone') {
    if (typeof t.id !== 'string' || typeof t.d !== 'string') return null;
  } else return null;
  const events = v.events
    .filter(
      (e): e is CardioSession['events'][number] =>
        typeof e === 'object' && e !== null && typeof (e as { at?: unknown }).at === 'number',
    )
    .map((e) => ({
      at: e.at,
      incline: typeof e.incline === 'number' ? e.incline : null,
      speed: typeof e.speed === 'number' ? e.speed : null,
    }));
  if (events.length === 0) return null;
  return {
    target: t.kind === 'finisher'
      ? { kind: 'finisher', workoutId: t.workoutId, t: t.t, d: t.d }
      : { kind: 'standalone', id: t.id, d: t.d, note: typeof t.note === 'string' ? t.note : '' },
    mode: v.mode,
    plannedMinutes: v.plannedMinutes,
    startedAt: v.startedAt,
    events,
  };
}

export function writeCardioSession(v: CardioSession | null): void {
  write(CARDIO_SESSION_KEY, v);
}
