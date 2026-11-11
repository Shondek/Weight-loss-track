import { useCallback, useEffect, useState } from 'react';
import { floatingSupported, floatingTimer } from './floatingTimer';
import type { RestTimer } from './useRestTimer';

export type FloatingControls = {
  /** הדפדפן תומך, והפתיחה לא נכשלה בסשן הזה — אחרת הכפתור לא מוצג. */
  available: boolean;
  /** החלון הצף פתוח כרגע. */
  open: boolean;
  /** פותח או סוגר. חייב להיקרא מתוך נגיעה. מחזיר false אם הדפדפן סירב לפתוח. */
  toggle: () => Promise<boolean>;
};

/**
 * מחבר את הטיימר לחלון הצף (floatingTimer.ts). הווידאו מוכן מראש כל עוד
 * פס הטיימר מוצג או שהחלון פתוח, ומשתחרר כשאין צורך. מצב בזיכרון בלבד.
 */
export function useFloatingTimer(timer: RestTimer, visible: boolean): FloatingControls {
  const [supported] = useState(() => floatingSupported());
  const [open, setOpen] = useState(() => floatingTimer.isOpen);
  const [failed, setFailed] = useState(false);
  const { peek, sync } = timer;

  useEffect(() => floatingTimer.onChange(setOpen), []);

  useEffect(() => {
    if (!supported || failed) return;
    if (visible || open) floatingTimer.prepare(peek, sync);
    else floatingTimer.dispose();
  }, [supported, failed, visible, open, peek, sync]);

  const toggle = useCallback(async () => {
    if (floatingTimer.isOpen) {
      floatingTimer.close();
      return true;
    }
    const ok = await floatingTimer.open();
    if (!ok) {
      // הדפדפן סירב: הכפתור נעלם עד הטעינה הבאה, והווידאו המוכן משתחרר.
      setFailed(true);
      floatingTimer.dispose();
    }
    return ok;
  }, []);

  return { available: supported && !failed, open, toggle };
}
