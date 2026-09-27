/**
 * שייקי חלבון — השילובים לרישום בלחיצה אחת. מודול טהור.
 *
 * לכל אבקה: {1, 2} סקופים × {מים, חלב}. מים = שורת רישום אחת (האבקה,
 * גרמים = סקופים × משקל סקופ). חלב = שתי שורות: האבקה + פריט החלב מהמאגר
 * (250 ג׳). הערכים מחושבים מהמזון החי (הספרייה / המאגר) — אותה נוסחה כמו
 * entryNutrition: ל-100 ג׳ × גרמים / 100.
 */

import type { FoodEntry, MealType } from '../../types.ts';
import { PROTEIN_SHAKES, SHAKE_MILK, SHAKE_SCOOPS, type ProteinShake } from '../../data/proteinShakes.ts';
import { newEntry } from './entries.ts';
import type { Food } from './foods.ts';
import { libraryFoodId } from './library.ts';

export type ShakeLiquid = 'water' | 'milk';

/** שורה שתירשם: מזון חי וכמות. */
export type ShakeLine = { food: Food; grams: number };

export type ShakeCombo = {
  shake: ProteinShake;
  scoops: number;
  liquid: ShakeLiquid;
  /** "1 סקופ · מים" / "2 סקופים · חלב". */
  label: string;
  lines: ShakeLine[];
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
};

export type ShakeProduct = {
  shake: ProteinShake;
  /** האבקה בספרייה, או null כשהספרייה טרם נטענה. */
  powder: Food | null;
  combos: ShakeCombo[];
};

export function scoopsLabel(n: number): string {
  return n === 1 ? '1 סקופ' : `${n} סקופים`;
}

export function liquidLabel(l: ShakeLiquid): string {
  return l === 'water' ? 'מים' : 'חלב';
}

function scaled(f: Food, grams: number) {
  const k = grams / 100;
  return { kcal: f.kcal * k, protein: f.protein * k, carbs: (f.carbs ?? 0) * k, fat: (f.fat ?? 0) * k };
}

/**
 * כל השילובים לכל אבקה. אבקה שאינה בספרייה (או בארכיון) → בלי שילובים;
 * חלב שאינו במאגר → בלי שילובי חלב. הסדר: 1·מים, 2·מים, 1·חלב, 2·חלב.
 */
export function resolveShakes(resolve: (id: string) => Food | null): ShakeProduct[] {
  const milk = resolve(SHAKE_MILK.foodId);
  return PROTEIN_SHAKES.map((shake) => {
    const powder = resolve(libraryFoodId(shake.slug));
    if (!powder || powder.archived) return { shake, powder: null, combos: [] };
    const combos: ShakeCombo[] = [];
    for (const liquid of ['water', 'milk'] as const) {
      if (liquid === 'milk' && !milk) continue;
      for (const scoops of SHAKE_SCOOPS) {
        const lines: ShakeLine[] = [{ food: powder, grams: scoops * shake.scoopGrams }];
        if (liquid === 'milk' && milk) lines.push({ food: milk, grams: SHAKE_MILK.grams });
        const sum = lines.map((l) => scaled(l.food, l.grams)).reduce(
          (a, b) => ({ kcal: a.kcal + b.kcal, protein: a.protein + b.protein, carbs: a.carbs + b.carbs, fat: a.fat + b.fat }),
          { kcal: 0, protein: 0, carbs: 0, fat: 0 },
        );
        combos.push({ shake, scoops, liquid, label: `${scoopsLabel(scoops)} · ${liquidLabel(liquid)}`, lines, ...sum });
      }
    }
    return { shake, powder, combos };
  });
}

/**
 * הרשומות של שילוב: אחת למים, שתיים לחלב — כל אחת עם ה-ref שלה, ומזהה
 * ייחודי משלה (`unique(i)`), באותה חותמת זמן ואותה ארוחה. "בטל" מסיר את כולן.
 */
export function shakeEntries(combo: ShakeCombo, meal: MealType, ts: number, unique: (i: number) => string): FoodEntry[] {
  return combo.lines.map((l, i) => newEntry(l.food, l.grams, meal, ts + i, unique(i)));
}
