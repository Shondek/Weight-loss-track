/**
 * אחסון קבוע (סיכון #5). נוגע ב-navigator, ולכן מחוץ ל-src/lib.
 *
 * `navigator.storage.persist()` מבקש מהדפדפן לא לפנות את נתוני האתר
 * (IndexedDB, localStorage, cache) בלחץ אחסון. התוצאה נשמרת בזיכרון
 * בלבד — היא תכונה של הדפדפן, לא נתון — ומוצגת במסך "נתונים".
 *
 * 'unsupported' — אין navigator.storage (Safari ישן, WebView). 'no' — הדפדפן
 * סירב; ב-iOS זה תלוי בהתקנה למסך הבית ובשימוש חוזר, ואין מה לעשות מלבד גיבוי.
 */

import { useEffect, useState } from 'react';

export type PersistStatus = 'pending' | 'yes' | 'no' | 'unsupported';

let status: PersistStatus = 'pending';
let requested: Promise<PersistStatus> | null = null;
const listeners = new Set<(s: PersistStatus) => void>();

function set(next: PersistStatus): PersistStatus {
  status = next;
  for (const fn of listeners) fn(next);
  return next;
}

export function persistStatus(): PersistStatus {
  return status;
}

/**
 * מבקש אחסון קבוע פעם אחת לחיי הדף, ואז שואל מה המצב בפועל
 * (`persisted()`), כי `persist()` יכול להחזיר true בלי לשנות דבר.
 */
export function requestPersistentStorage(): Promise<PersistStatus> {
  if (requested) return requested;
  requested = (async () => {
    const storage = typeof navigator !== 'undefined' ? navigator.storage : undefined;
    if (!storage || typeof storage.persist !== 'function') return set('unsupported');
    try {
      await storage.persist();
      const persisted =
        typeof storage.persisted === 'function' ? await storage.persisted() : false;
      return set(persisted ? 'yes' : 'no');
    } catch {
      return set('no');
    }
  })();
  return requested;
}

/** המצב הנוכחי, מתעדכן כשהבקשה נענית. */
export function usePersistStatus(): PersistStatus {
  const [value, setValue] = useState<PersistStatus>(status);
  useEffect(() => {
    listeners.add(setValue);
    setValue(status);
    return () => {
      listeners.delete(setValue);
    };
  }, []);
  return value;
}

export const PERSIST_LABEL: Record<PersistStatus, string> = {
  pending: '…',
  yes: 'כן',
  no: 'לא',
  unsupported: 'לא נתמך',
};
