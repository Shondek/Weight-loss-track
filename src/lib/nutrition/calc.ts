/**
 * לוגיקת החישוב של מודול התזונה. מודול טהור — בלי DOM, בלי אחסון, בלי
 * ידע על הממשק. זו הליבה, והבדיקות שלה הן החוזה.
 *
 * כללים:
 *  1. ערך רישום = ערך ל-100 גרם × גרמים / 100. הקלוריות מהמאגר, לא
 *     נגזרות מהמאקרו ולא להפך.
 *  2. המזון החי גובר; `ref` שברישום הוא הגיבוי כשהמזון נעלם.
 *  3. ערכי ביניים בדיוק מלא. העיגול הוא עניין של תצוגה בלבד (display.ts).
 *  4. בסיכום יומי `null` נספר כאפס, ובמקביל נספרים הגרמים שהפחמימה, השומן
 *     או הסיבים בהם לא ידועים — כדי שהממשק יוכל לומר "לפחות X" במקום מספר
 *     שנראה מדויק. שלושתם מתנהגים אותו דבר.
 *  5. הנותר יכול להיות שלילי. לא מעגלים לאפס.
 */

import type { FoodEntry, FoodRef, ISODate, NutritionTarget, WeightEntry } from '../../types';
import { diffDays } from '../date';
import { lastWeight } from '../weights';
import { refOf, type Food } from './foods';

export type Nutrients = {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
};

export const ZERO: Nutrients = { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 };

export type EntryNutrition = Nutrients & {
  /** הערכים הגיעו מ-`ref` כי המזון לא נמצא — הממשק מסמן "מהרישום". */
  fromRef: boolean;
  /** הפחמימה ל-100 ג' לא ידועה במקור; נספרה כאפס. */
  carbsUnknown: boolean;
  /** השומן ל-100 ג' לא ידוע במקור; נספר כאפס. */
  fatUnknown: boolean;
  /** הסיבים ל-100 ג' לא ידועים במקור; נספרו כאפס. */
  fiberUnknown: boolean;
};

/** ערכי המקור בפועל לרישום: המזון החי כשהוא קיים, אחרת ההקפאה שברישום. */
export function sourceOf(entry: FoodEntry, live: Food | null): { ref: FoodRef; fromRef: boolean } {
  if (live) return { ref: refOf(live), fromRef: false };
  return { ref: entry.ref, fromRef: true };
}

function scale(per100: number | null, grams: number): number {
  return per100 === null ? 0 : (per100 * grams) / 100;
}

export function entryNutrition(entry: FoodEntry, live: Food | null): EntryNutrition {
  const { ref, fromRef } = sourceOf(entry, live);
  return {
    kcal: scale(ref.kcal, entry.grams),
    protein: scale(ref.protein, entry.grams),
    carbs: scale(ref.carbs, entry.grams),
    fat: scale(ref.fat, entry.grams),
    fiber: scale(ref.fiber, entry.grams),
    fromRef,
    carbsUnknown: ref.carbs === null,
    fatUnknown: ref.fat === null,
    fiberUnknown: ref.fiber === null,
  };
}

export type DaySummary = Nutrients & {
  d: ISODate;
  /** כמה רישומים נסכמו. 0 = יום ריק. */
  count: number;
  /**
   * סך הגרמים מרישומים שהפחמימה בהם לא ידועה. כשגדול מאפס, `carbs` הוא
   * חסם תחתון ("לפחות X ג'"), לא ערך מדויק.
   */
  carbsUnknownGrams: number;
  /** כנ"ל לשומן. */
  fatUnknownGrams: number;
  /** כנ"ל לסיבים. */
  fiberUnknownGrams: number;
};

export type FoodResolver = (foodId: string) => Food | null;

/** סיכום יום: סכום כל הרישומים שה-`d` שלהם הוא התאריך. */
export function daySummary(
  entries: readonly FoodEntry[],
  d: ISODate,
  resolve: FoodResolver,
): DaySummary {
  const out: DaySummary = { ...ZERO, d, count: 0, carbsUnknownGrams: 0, fatUnknownGrams: 0, fiberUnknownGrams: 0 };
  for (const e of entries) {
    if (e.d !== d) continue;
    const n = entryNutrition(e, resolve(e.foodId));
    out.kcal += n.kcal;
    out.protein += n.protein;
    out.carbs += n.carbs;
    out.fat += n.fat;
    out.fiber += n.fiber;
    if (n.carbsUnknown) out.carbsUnknownGrams += e.grams;
    if (n.fatUnknown) out.fatUnknownGrams += e.grams;
    if (n.fiberUnknown) out.fiberUnknownGrams += e.grams;
    out.count++;
  }
  return out;
}

/** הנותר מול היעד. שלילי = חריגה, ומוצג כמו שהוא. null כשאין יעד. */
export function remaining(
  target: Pick<NutritionTarget, 'kcal' | 'protein' | 'carbs' | 'fat'> | null,
  consumed: Nutrients,
): { kcal: number; protein: number; carbs: number; fat: number } | null {
  if (!target) return null;
  return {
    kcal: target.kcal - consumed.kcal,
    protein: target.protein - consumed.protein,
    carbs: target.carbs - consumed.carbs,
    fat: target.fat - consumed.fat,
  };
}

/**
 * היעד האפקטיבי ליום. נקודת החיבור לאימונים (שלב 5): קלוריות שנשרפו
 * באימון באותו יום מגדילות את יעד הקלוריות. כרגע תמיד 0. המאקרו לא משתנה.
 */
export function effectiveTarget(target: NutritionTarget, workoutKcal = 0): NutritionTarget {
  return workoutKcal === 0 ? target : { ...target, kcal: target.kcal + workoutKcal };
}

/** רישום משקל ישן מזה נחשב לא עדכני, ואין לחשב לפיו. */
export const WEIGHT_MAX_AGE_DAYS = 14;

/**
 * חלבון לק"ג משקל גוף, לפי השקילה האחרונה מהמודול הקיים.
 * null בלי שקילה, או כשהשקילה האחרונה ישנה מ-`WEIGHT_MAX_AGE_DAYS` יום.
 * שקילה "מהעתיד" (שעון שהוזז) נחשבת עדכנית.
 */
export function proteinPerKg(
  proteinGrams: number,
  weights: readonly WeightEntry[],
  today: ISODate,
): number | null {
  const last = lastWeight(weights);
  if (!last || last.w <= 0) return null;
  if (diffDays(last.d, today) > WEIGHT_MAX_AGE_DAYS) return null;
  return proteinGrams / last.w;
}
