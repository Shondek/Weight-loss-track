import { useEffect } from 'react';

/**
 * מסך שנשאר דולק בזמן סשן אימון פעיל (Screen Wake Lock API).
 *
 * זיהוי יכולת בלבד: בדפדפן בלי `navigator.wakeLock` לא קורה כלום. הנעילה
 * משתחררת לבד כשהטאב יורד לרקע, ולכן מבקשים אותה מחדש בחזרה למסך.
 * משחררים בסיום הסשן או ביציאה מהמסך. כישלון (סוללה חלשה, מדיניות
 * דפדפן) נבלע בשקט — זו נוחות, לא נתון.
 */
export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    const nav = navigator as Navigator & {
      wakeLock?: { request: (type: 'screen') => Promise<{ release: () => Promise<void>; addEventListener?: unknown }> };
    };
    if (!nav.wakeLock || typeof nav.wakeLock.request !== 'function') return;

    let lock: { release: () => Promise<void> } | null = null;
    let cancelled = false;

    const request = async () => {
      if (cancelled || document.visibilityState !== 'visible') return;
      try {
        const l = await nav.wakeLock!.request('screen');
        if (cancelled) {
          void l.release().catch(() => undefined);
          return;
        }
        lock = l;
      } catch {
        /* לא ניתן לנעול — האפליקציה מתנהגת כרגיל */
      }
    };

    const onVisible = () => {
      if (document.visibilityState === 'visible') void request();
    };

    void request();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      if (lock) {
        void lock.release().catch(() => undefined);
        lock = null;
      }
    };
  }, [active]);
}
