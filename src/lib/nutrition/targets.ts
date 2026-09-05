/** יעדי תזונה עם היסטוריה. מודול טהור. */

import type { ISODate, NutritionTarget } from '../../types';
import { compareISO } from '../date';

export function sortTargets(list: readonly NutritionTarget[]): NutritionTarget[] {
  return [...list].sort((a, b) => compareISO(a.from, b.from));
}

/** יעד לאותו תאריך תחילת תוקף מתעדכן; תאריך אחר מוסיף שכבה להיסטוריה. */
export function upsertTarget(list: readonly NutritionTarget[], t: NutritionTarget): NutritionTarget[] {
  const rest = list.filter((x) => x.from !== t.from);
  return sortTargets([...rest, t]);
}

export function removeTarget(list: readonly NutritionTarget[], from: ISODate): NutritionTarget[] {
  return list.filter((x) => x.from !== from);
}

/**
 * היעד שבתוקף בתאריך: האחרון שתאריך התחילה שלו אינו מאוחר מ-`d`.
 * null לפני היעד הראשון — אין יעד, לא אפס.
 */
export function targetFor(list: readonly NutritionTarget[], d: ISODate): NutritionTarget | null {
  let best: NutritionTarget | null = null;
  for (const t of list) {
    if (compareISO(t.from, d) > 0) continue;
    if (!best || compareISO(t.from, best.from) > 0) best = t;
  }
  return best;
}
