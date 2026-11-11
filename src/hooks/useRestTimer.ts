/**
 * טיימר מנוחה, חימום ואירובי — ה-hook שמחבר את הליבה הטהורה (timerCore.ts)
 * לשעון, לאחסון ולצליל.
 *
 * העיקרון נשאר: **שומרים זמן סיום, לא מונה.** האינטרוול כאן רק שואל את
 * הליבה "מה המצב עכשיו"; אם הדפדפן הקפיא אותו לדקה (מסך כבוי, אפליקציה
 * אחרת), הקריאה הבאה מחזירה את הזמן הנכון. חזרה למסך מסנכרנת מיד.
 *
 * מה חדש בשלב 7:
 *  - סיום שקרה כשהדף היה ברקע מוצג כ"המנוחה נגמרה לפני X שניות" (בלי צליל
 *    מאוחר), וגם אחרי טעינה מחדש של הדף.
 *  - הצליל עבר ל-timerSound.ts (פתיחת נעילה בכל נגיעה, מתג השקט באייפון).
 *  - `next` — "מה הלאה" (התרגיל/הסט הבא), לחלון הצף ולקוראי מסך. בזיכרון בלבד.
 *
 * אותו מפתח (`fatloss:ui:timer`) ואותו מבנה כמו קודם. הוא מוחזק ברמת
 * האפליקציה ולא בתוך מסך האימון, כדי שמעבר טאב לא יהרוג אותו.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { readTimer, writeTimer, type TimerKind, type TimerState } from '../platform/uiState';
import {
  IDLE,
  addSeconds,
  fromStored,
  pauseTimer,
  resetTimer,
  resumeTimer,
  startTimer,
  tick,
  toStored,
  view,
  type TimerCore,
} from './timerCore';
import { installAudioUnlock, playAlert, primeAudio, releaseAudio, vibrateAlert } from './timerSound';

const TICK_MS = 250;
/** אותו מפתח של platform/uiState.ts — נקרא כאן רק כדי לדעת על טיימר שכבר פג. */
const TIMER_KEY = 'fatloss:ui:timer';

export type { TimerKind };

export type RestTimer = {
  /** שניות שנותרו, מעוגל כלפי מעלה. 0 כשלא רץ. */
  remainingSec: number;
  /** שניות שעברו מתחילת הספירה — לתצוגת סטופר. */
  elapsedSec: number;
  totalSec: number;
  /** רץ או מושהה — כל עוד יש ספירה להציג. */
  running: boolean;
  paused: boolean;
  kind: TimerKind;
  /** מה מחכה בסוף — "מנוחה" / "לפני התרגיל הבא" / "חימום". */
  label: string;
  /** הספירה הסתיימה והפס עדיין מציג "נגמר לפני X". */
  finished: boolean;
  /** שם ישן של `finished` — נשאר לקוד שקורא אותו. */
  justFinished: boolean;
  /** לפני כמה שניות הסתיים. */
  endedAgoSec: number;
  /** הסתיים כשהדף היה ברקע (זוהה באיחור). */
  endedInBackground: boolean;
  /** החלק שנשאר, 0–1. */
  fractionLeft: number;
  /** ריצת אירובי במצב סטופר — מציגים `elapsedSec`. */
  stopwatch: boolean;
  /** "מה הלאה": התרגיל או הסט הבא. ריק כשאין. */
  next: string;
  start: (seconds: number, label: string, kind?: TimerKind) => void;
  add: (seconds: number) => void;
  /** עוצר ומנקה — גם ספירה שרצה וגם מצב "הסתיים". */
  skip: () => void;
  pause: () => void;
  resume: () => void;
  /** חזרה למשך המלא, מושהה — כדי להתחיל מחדש בלחיצה. */
  reset: () => void;
  setNext: (text: string) => void;
  /** סנכרון מיידי מול השעון (לחלון הצף, שממשיך לפעום ברקע). */
  sync: () => void;
  /** המצב הגולמי ברגע הקריאה — לציור החלון הצף מחוץ ל-React. */
  peek: () => { core: TimerCore; next: string };
  /** מנגן את צליל הסיום עכשיו (נגיעה בכפתור הצליל) — גם בדיקה שהוא נשמע. */
  testSound: () => void;
};

/**
 * הטיימר השמור. `readTimer` (platform) מחזיר רק טיימר שרץ או מושהה; טיימר
 * שכבר פג נקרא כאן מאותו מפתח ובאותו מבנה, כדי שאחרי טעינה מחדש (iOS סגר
 * את הדף ברקע) אפשר יהיה להציג לפני כמה זמן המנוחה נגמרה.
 */
function readStoredTimer(): TimerState | null {
  const live = readTimer();
  if (live) return live;
  try {
    const raw = window.localStorage.getItem(TIMER_KEY);
    if (raw === null) return null;
    const v = JSON.parse(raw) as Partial<TimerState> | null;
    if (!v || typeof v.deadline !== 'number' || v.deadline <= 0 || typeof v.pausedMs === 'number') return null;
    return {
      deadline: v.deadline,
      totalSec: typeof v.totalSec === 'number' ? v.totalSec : 0,
      label: typeof v.label === 'string' ? v.label : '',
      kind: v.kind === 'countdown' || v.kind === 'cardio' ? v.kind : 'rest',
      pausedMs: null,
    };
  } catch {
    return null;
  }
}

export function useRestTimer(soundEnabled: boolean): RestTimer {
  // אתחול מהאחסון: טיימר שרץ, מושהה, או שהסתיים לא מזמן — ממשיך אחרי רענון.
  const [core, setCore] = useState<TimerCore>(() =>
    typeof window === 'undefined' ? IDLE : fromStored(readStoredTimer(), Date.now()),
  );
  /** השעון שלפיו מחושבת התצוגה. מתעדכן רק כשמשהו שנראה במסך משתנה (פעם בשנייה). */
  const [clock, setClock] = useState(() => Date.now());
  const [next, setNextState] = useState('');
  const coreRef = useRef(core);
  const nextRef = useRef(next);
  const shownRef = useRef('');
  const sound = useRef(soundEnabled);
  sound.current = soundEnabled;

  const commit = useCallback((t: TimerCore) => {
    coreRef.current = t;
    setCore(t);
    writeTimer(toStored(t));
  }, []);

  const sync = useCallback(() => {
    const now = Date.now();
    const before = coreRef.current;
    const r = tick(before, now);
    if (r.timer !== before) commit(r.timer);
    if (r.alert) {
      // הרטט תמיד (אנדרואיד); הצליל לפי המתג.
      vibrateAlert();
      if (sound.current) void playAlert();
      else releaseAudio();
    }
    const v = view(r.timer, now);
    const shown = `${v.remainingSec}|${v.endedAgoSec}|${v.running}|${v.paused}|${v.finished}`;
    if (shown !== shownRef.current) {
      shownRef.current = shown;
      setClock(now);
    }
  }, [commit]);

  /** יש מה לסנכרן: ספירה שרצה, או מצב "הסתיים" שסופר "לפני X". */
  const active = core.deadline !== null || core.endedAt !== null;

  useEffect(() => {
    if (!active) return;
    sync();
    const id = window.setInterval(sync, TICK_MS);
    // חזרה למסך אחרי שהיה כבוי או ברקע: מסנכרנים מיד ולא מחכים לטיק הבא.
    const onVisible = () => {
      if (document.visibilityState === 'visible') sync();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    window.addEventListener('pageshow', onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
      window.removeEventListener('pageshow', onVisible);
    };
  }, [active, sync]);

  /**
   * כל עוד ספירה רצה: כל נגיעה פותחת את השמע. מכסה טיימר ששוחזר אחרי
   * טעינה מחדש, שלא עבר "התחל" בדף הזה ולכן ה-AudioContext שלו נעול.
   */
  const counting = core.deadline !== null;
  useEffect(() => {
    if (!counting) return;
    return installAudioUnlock(() => sound.current);
  }, [counting]);

  const start = useCallback(
    (seconds: number, nextLabel: string, nextKind: TimerKind = 'rest') => {
      if (seconds <= 0) return;
      const now = Date.now();
      commit(startTimer(now, seconds, nextLabel, nextKind));
      shownRef.current = '';
      setClock(now);
      // פותחים את השמע בתוך המחווה, כדי שהצליל בסיום לא יהיה תלוי בדפדפן.
      if (sound.current) primeAudio();
    },
    [commit],
  );

  const add = useCallback(
    (seconds: number) => {
      const now = Date.now();
      const t = addSeconds(coreRef.current, now, seconds);
      if (t === coreRef.current) return;
      commit(t);
      sync();
    },
    [commit, sync],
  );

  const skip = useCallback(() => {
    if (coreRef.current !== IDLE) commit(IDLE);
    shownRef.current = '';
    setClock(Date.now());
    releaseAudio();
  }, [commit]);

  const pause = useCallback(() => {
    const now = Date.now();
    const t = pauseTimer(coreRef.current, now);
    if (t === coreRef.current) return;
    commit(t);
    setClock(now);
    releaseAudio();
  }, [commit]);

  const resume = useCallback(() => {
    const now = Date.now();
    const t = resumeTimer(coreRef.current, now);
    if (t === coreRef.current) return;
    commit(t);
    setClock(now);
    if (sound.current) primeAudio();
  }, [commit]);

  const reset = useCallback(() => {
    const t = resetTimer(coreRef.current);
    if (t === coreRef.current) return;
    commit(t);
    setClock(Date.now());
    releaseAudio();
  }, [commit]);

  const setNext = useCallback((text: string) => {
    nextRef.current = text;
    setNextState(text);
  }, []);

  const peek = useCallback(() => ({ core: coreRef.current, next: nextRef.current }), []);

  const testSound = useCallback(() => {
    primeAudio();
    void playAlert(coreRef.current.deadline !== null);
  }, []);

  return useMemo(() => {
    const v = view(core, Math.max(clock, Date.now()));
    return {
      remainingSec: v.remainingSec,
      elapsedSec: v.elapsedSec,
      totalSec: core.totalSec,
      running: v.running,
      paused: v.paused,
      kind: core.kind,
      label: core.label,
      finished: v.finished,
      justFinished: v.finished,
      endedAgoSec: v.endedAgoSec,
      endedInBackground: v.endedInBackground,
      fractionLeft: v.fractionLeft,
      stopwatch: v.stopwatch,
      next,
      start,
      add,
      skip,
      pause,
      resume,
      reset,
      setNext,
      sync,
      peek,
      testSound,
    };
  }, [core, clock, next, start, add, skip, pause, resume, reset, setNext, sync, peek, testSound]);
}
