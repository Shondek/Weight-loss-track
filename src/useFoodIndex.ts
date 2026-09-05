/**
 * אינדקס המזונות לחיפוש ולפתרון מזהה. טוען את קובץ משרד הבריאות פעם
 * אחת, ובונה את המפה פעם אחת — מחדש רק כשרשימת המזונות שלי משתנה.
 * לא בכל הקלדה.
 */

import { useEffect, useMemo, useState } from 'react';
import type { CustomFood } from './types';
import type { MohFood } from './lib/nutrition/foodDb';
import { buildFoodIndex, emptyFoodIndex, type FoodIndex } from './lib/nutrition/index';
import { loadMohFoods } from './platform/mohFoods';

export type FoodIndexState = {
  index: FoodIndex;
  status: 'loading' | 'ready' | 'error';
  error: string | null;
  /** מתי הקובץ נמשך מ-data.gov.il. להצגה בלבד. */
  fetchedAt: string | null;
};

export function useFoodIndex(customFoods: readonly CustomFood[]): FoodIndexState {
  const [moh, setMoh] = useState<{ foods: MohFood[]; fetchedAt: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    loadMohFoods().then(
      (file) => {
        if (alive) setMoh({ foods: file.foods, fetchedAt: file.fetchedAt });
      },
      (err: unknown) => {
        if (alive) setError(err instanceof Error ? err.message : String(err));
      },
    );
    return () => {
      alive = false;
    };
  }, []);

  const index = useMemo(
    () => (moh ? buildFoodIndex(moh.foods, customFoods) : buildFoodIndex([], customFoods)),
    [moh, customFoods],
  );

  if (!moh && !error) return { index: emptyFoodIndex(), status: 'loading', error: null, fetchedAt: null };
  return {
    index,
    status: error ? 'error' : 'ready',
    error,
    fetchedAt: moh?.fetchedAt ?? null,
  };
}
