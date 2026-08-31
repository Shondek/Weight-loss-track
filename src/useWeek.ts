import { useCallback, useState } from 'react';
import { weekStart } from './lib/date';
import type { ISODate } from './types';

/**
 * השבוע המוצג.
 *
 * ברירת המחדל נגזרת מהשעון בזמן ריצה, ולכן אם האפליקציה נשארת פתוחה
 * וחוצה חצות אל שבוע חדש — הכותרת עוברת איתו. ברגע שהמשתמש ניווט
 * לשבוע אחר, הבחירה שלו "ננעצת" והשעון כבר לא מזיז אותו.
 *
 * מחזירים לשבוע הנוכחי מנקה את הנעיצה.
 */
export function useWeek(today: ISODate): [ISODate, (ws: ISODate) => void] {
  const current = weekStart(today);
  const [pinned, setPinned] = useState<ISODate | null>(null);

  // נעיצה שהשעון הדביק חוזרת להיות "השבוע הנוכחי" ולא נשארת תקועה.
  const week = pinned !== null && pinned !== current ? pinned : current;

  const setWeek = useCallback(
    (ws: ISODate) => setPinned(ws === weekStart(today) ? null : ws),
    [today],
  );

  return [week, setWeek];
}
