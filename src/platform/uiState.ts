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

/** אימון פתוח שנשכח נחשב נטוש אחרי שש שעות. */
const EDITOR_TTL_MS = 6 * 60 * 60 * 1000;

export type TimerState = { deadline: number; totalSec: number; label: string };
export type EditorState = { openId: string; focus: number; at: number };

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

/** הטיימר השמור, רק אם עוד לא פג. */
export function readTimer(): TimerState | null {
  const v = read<TimerState>(TIMER_KEY);
  if (!v || typeof v.deadline !== 'number') return null;
  return v.deadline > Date.now() ? v : null;
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
