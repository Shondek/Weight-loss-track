/**
 * התאריך המקומי של עכשיו, מתעדכן בעצמו.
 *
 * "השבוע הנוכחי" נגזר תמיד מהתאריך בזמן ריצה ולעולם לא מנתון שמור. אם
 * האפליקציה נשארת פתוחה וחוצה חצות — הערך כאן משתנה והכותרות מתעדכנות.
 */

import { useEffect, useState } from 'react';
import { msUntilNextMidnight, today } from './lib/date';
import type { ISODate } from './types';

export function useToday(): ISODate {
  const [value, setValue] = useState<ISODate>(() => today());

  useEffect(() => {
    let timer: number | undefined;

    const sync = () => {
      setValue((prev) => {
        const now = today();
        return now === prev ? prev : now;
      });
      schedule();
    };

    const schedule = () => {
      if (timer !== undefined) window.clearTimeout(timer);
      timer = window.setTimeout(sync, msUntilNextMidnight());
    };

    const onVisible = () => {
      if (document.visibilityState === 'visible') sync();
    };

    schedule();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    window.addEventListener('pageshow', onVisible);

    return () => {
      if (timer !== undefined) window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
      window.removeEventListener('pageshow', onVisible);
    };
  }, []);

  return value;
}
