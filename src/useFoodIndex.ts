/**
 * אינדקס המזונות לחיפוש ולפתרון מזהה. טוען את קובץ משרד הבריאות פעם
 * אחת, ובונה את המפה פעם אחת — מחדש רק כשרשימת המזונות שלי משתנה.
 * לא בכל הקלדה.
 *
 * שלב 4: כישלון טעינה מסווג. `offline` = אין חיבור והקובץ עוד לא במטמון
 * של ה-service worker — זה המצב שעד עכשיו נראה כמו "המאגר לא נטען" סתמי.
 * הטעינה מנסה שוב מעצמה כשהחיבור חוזר (`online`), ואפשר לבקש ניסיון ידני.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { CustomFood } from './types';
import type { MohFood } from './lib/nutrition/foodDb';
import { buildFoodIndex, emptyFoodIndex, type FoodIndex } from './lib/nutrition/index';
import { loadMohFoods } from './platform/mohFoods';

export type FoodIndexState = {
  index: FoodIndex;
  /** `offline` — אין חיבור וקובץ המזון עוד לא נשמר במכשיר. `error` — כל כישלון אחר. */
  status: 'loading' | 'ready' | 'error' | 'offline';
  error: string | null;
  /** מתי הקובץ נמשך מ-data.gov.il. להצגה בלבד. */
  fetchedAt: string | null;
  /** ניסיון טעינה נוסף (אחרי כישלון). */
  retry: () => void;
};

/** אין חיבור כרגע — לפי הדפדפן. `undefined` (סביבה בלי navigator) = יש חיבור. */
function isOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

export function useFoodIndex(customFoods: readonly CustomFood[]): FoodIndexState {
  const [moh, setMoh] = useState<{ foods: MohFood[]; fetchedAt: string } | null>(null);
  const [failure, setFailure] = useState<{ message: string; offline: boolean } | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    setFailure(null);
    loadMohFoods().then(
      (file) => {
        if (alive) setMoh({ foods: file.foods, fetchedAt: file.fetchedAt });
      },
      (err: unknown) => {
        if (!alive) return;
        // fetch שנכשל ברשת זורק TypeError; בלי חיבור זה "המאגר עוד לא במכשיר", לא תקלה.
        const network = err instanceof TypeError;
        setFailure({ message: err instanceof Error ? err.message : String(err), offline: isOffline() || network });
      },
    );
    return () => {
      alive = false;
    };
  }, [attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  // החיבור חזר: מנסים שוב מעצמנו, בלי שהמשתמש יצטרך לדעת שיש כפתור.
  useEffect(() => {
    if (moh || !failure) return;
    const onOnline = () => retry();
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [moh, failure, retry]);

  const index = useMemo(
    () => (moh ? buildFoodIndex(moh.foods, customFoods) : buildFoodIndex([], customFoods)),
    [moh, customFoods],
  );

  if (!moh && !failure) return { index: emptyFoodIndex(), status: 'loading', error: null, fetchedAt: null, retry };
  return {
    index,
    status: failure ? (failure.offline ? 'offline' : 'error') : 'ready',
    error: failure?.message ?? null,
    fetchedAt: moh?.fetchedAt ?? null,
    retry,
  };
}
