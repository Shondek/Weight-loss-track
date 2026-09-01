/**
 * טיימר מנוחה.
 *
 * העיקרון: **שומרים דדליין, לא מונה.** `setInterval` מצטבר נסחף — הדפדפן
 * מאט או מקפיא טיימרים כשהמסך כבוי, וכל טיק שהוחמץ אובד לתמיד. כאן
 * האינטרוול רק מחשב מחדש `deadline - Date.now()`, ולכן שלוש דקות עם מסך
 * כבוי מחזירות את הזמן הנכון בדיוק. אותו דפוס כמו ב-src/useToday.ts.
 *
 * אותו דדליין נשמר גם ב-localStorage, ולכן הטיימר שורד רענון דף. הוא
 * מוחזק ברמת האפליקציה ולא בתוך מסך האימון, כדי שמעבר טאב לא יהרוג אותו.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { readTimer, writeTimer } from '../platform/uiState';

const TICK_MS = 250;

export type RestTimer = {
  /** שניות שנותרו, מעוגל כלפי מעלה. 0 כשלא רץ. */
  remainingSec: number;
  totalSec: number;
  running: boolean;
  /** מה מחכה בסוף — "מנוחה בין סטים" / "מנוחה לפני התרגיל הבא". */
  label: string;
  /** true בשלוש שניות שאחרי הסיום, לחיווי במסך. */
  justFinished: boolean;
  start: (seconds: number, label: string) => void;
  add: (seconds: number) => void;
  skip: () => void;
};

/**
 * צליל קצר דרך WebAudio. בלי קובץ שמע — עובד אופליין, לא מוסיף תלות,
 * ולא דורש הורדה בפעם הראשונה.
 *
 * iOS דורש שה-AudioContext ייווצר או יופעל מתוך מחווה של המשתמש; הוא
 * נוצר בהפעלת הטיימר הראשונה, שהיא תמיד תוצאה של הקלדה.
 */
let audioCtx: AudioContext | null = null;

function ensureAudio(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  try {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctor) return null;
    audioCtx ??= new Ctor();
    if (audioCtx.state === 'suspended') void audioCtx.resume();
    return audioCtx;
  } catch {
    return null;
  }
}

function beep(): void {
  const ctx = ensureAudio();
  if (!ctx) return;
  try {
    const now = ctx.currentTime;
    // שני צלילים קצרים — נשמע כמו התראה, לא כמו קליק אקראי
    for (const [at, freq] of [
      [0, 880],
      [0.18, 1175],
    ] as const) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, now + at);
      gain.gain.exponentialRampToValueAtTime(0.25, now + at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + at + 0.15);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + at);
      osc.stop(now + at + 0.18);
    }
  } catch {
    /* צליל הוא תוספת; הוויברציה היא מה שחייב לעבוד */
  }
}

function vibrate(): void {
  try {
    navigator.vibrate?.([200, 100, 200]);
  } catch {
    /* לא נתמך — לא קריטי */
  }
}

export function useRestTimer(soundEnabled: boolean): RestTimer {
  // אתחול מהאחסון: טיימר שעדיין לא פג ממשיך לרוץ אחרי רענון.
  const restored = typeof window === 'undefined' ? null : readTimer();
  const [deadline, setDeadline] = useState<number | null>(restored?.deadline ?? null);
  const [totalSec, setTotalSec] = useState(restored?.totalSec ?? 0);
  const [label, setLabel] = useState(restored?.label ?? '');
  const [remainingMs, setRemainingMs] = useState(
    restored ? Math.max(0, restored.deadline - Date.now()) : 0,
  );
  const [justFinished, setJustFinished] = useState(false);
  const fired = useRef(false);
  const sound = useRef(soundEnabled);
  sound.current = soundEnabled;

  const finish = useCallback(() => {
    if (fired.current) return;
    fired.current = true;
    vibrate();
    if (sound.current) beep();
    setJustFinished(true);
    window.setTimeout(() => setJustFinished(false), 3000);
  }, []);

  useEffect(() => {
    if (deadline === null) return;

    const sync = () => {
      const left = deadline - Date.now();
      setRemainingMs(Math.max(0, left));
      if (left <= 0) {
        finish();
        setDeadline(null);
        writeTimer(null);
      }
    };

    sync();
    const id = window.setInterval(sync, TICK_MS);
    // חזרה למסך אחרי שהיה כבוי: מסנכרנים מיד ולא מחכים לטיק הבא
    const onVisible = () => {
      if (document.visibilityState === 'visible') sync();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);

    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, [deadline, finish]);

  const start = useCallback((seconds: number, nextLabel: string) => {
    if (seconds <= 0) return;
    fired.current = false;
    setJustFinished(false);
    setTotalSec(seconds);
    setLabel(nextLabel);
    const next = Date.now() + seconds * 1000;
    setRemainingMs(seconds * 1000);
    setDeadline(next);
    writeTimer({ deadline: next, totalSec: seconds, label: nextLabel });
    // פותחים את ה-AudioContext בתוך המחווה, כדי ש-iOS ירשה צליל בסיום
    ensureAudio();
  }, []);

  const add = useCallback(
    (seconds: number) => {
      setDeadline((prev) => {
        if (prev === null) return prev;
        // לא מקצרים אל מתחת לעכשיו — "-15" בסוף פשוט מסיים
        const next = Math.max(prev + seconds * 1000, Date.now());
        writeTimer({ deadline: next, totalSec: totalSec + seconds, label });
        return next;
      });
      setTotalSec((t) => Math.max(0, t + seconds));
    },
    [totalSec, label],
  );

  const skip = useCallback(() => {
    fired.current = true;
    setDeadline(null);
    setRemainingMs(0);
    setJustFinished(false);
    writeTimer(null);
  }, []);

  return {
    remainingSec: Math.ceil(remainingMs / 1000),
    totalSec,
    running: deadline !== null,
    label,
    justFinished,
    start,
    add,
    skip,
  };
}
