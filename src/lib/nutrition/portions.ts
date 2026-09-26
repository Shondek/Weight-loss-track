/**
 * יחידות מנה ותכולת מנות — תצוגה וקלט בלבד (שלב 3.1). מודול טהור.
 *
 * הרישום עצמו נשאר בגרמים (`FoodEntry.grams`); כאן רק מתרגמים גרמים
 * ליחידה טבעית של המזון ובחזרה: טחינה ב"כף מפולסת" (15 ג'), מנה מורכבת
 * ב"מנה" (finalGrams), אגוזים ב"מנה" (25 ג').
 *
 * סדר הכללים ליחידת הכמות של מזון:
 *  1. מנה מורכבת → "מנה", ×0.5…×3 בקפיצות 0.5; גרמים = מנות × finalGrams.
 *  2. יש portions[] → היחידה שהייתה בשימוש לאחרונה, ואם אין — portions[0];
 *     ×0.5…×10 בקפיצות 0.5; גרמים = כמות × portion.g. אפשר לעבור לגרמים.
 *  3. מזון-יחידה (unitFood) → ×1…×10 בשלמים, כמו קודם.
 *  4. אחרת → שדה גרמים.
 */

import type { FoodPortion, Recipe } from '../../types';
import { gramsText } from './composition';

/** מה שצריך ממזון כדי לקבוע יחידה: יחידות המידה, המתכון (אם מנה), ודגל יחידה. */
export type PortionSource = {
  portions: readonly FoodPortion[];
  recipe?: Recipe | null | undefined;
  unitFood?: boolean | undefined;
};

export type UnitSpec =
  | { kind: 'serving'; label: string; g: number; min: number; max: number; step: number }
  | { kind: 'portion'; label: string; g: number; min: number; max: number; step: number }
  | { kind: 'unit'; min: number; max: number; step: number }
  | { kind: 'grams' };

export const SERVING_LABEL = 'מנה';

const SERVING = { min: 0.5, max: 3, step: 0.5 } as const;
const PORTION = { min: 0.5, max: 10, step: 0.5 } as const;
const UNIT = { min: 1, max: 10, step: 1 } as const;

const EPS = 1e-6;

function servingUnit(finalGrams: number): UnitSpec {
  return { kind: 'serving', label: SERVING_LABEL, g: finalGrams, ...SERVING };
}

function portionUnit(p: FoodPortion): UnitSpec {
  return { kind: 'portion', label: p.u, g: p.g, ...PORTION };
}

/** האם `grams` הוא כפולה של חצי יחידה (חיובית). */
function isHalfMultiple(grams: number, g: number): boolean {
  if (!(g > 0) || !(grams > 0)) return false;
  const q = grams / (g / 2);
  return Math.abs(q - Math.round(q)) < EPS;
}

/**
 * היחידה והכמות להצגה של רשומה קיימת, לפי הגרמים השמורים. סדר הכללים:
 * מנה (finalGrams) → היחידה הראשית בלבד, portions[0] (החלטת שלב 3.1: לא
 * סורקים יחידות משניות, אחרת 20 ג׳ טחינה היה "כפית ×4") → מזון-יחידה
 * (×N שלם) → null = מציגים גרמים.
 */
export function deriveUnit(food: PortionSource, grams: number): { label: string | null; qty: number } | null {
  if (food.recipe && food.recipe.finalGrams > 0 && isHalfMultiple(grams, food.recipe.finalGrams)) {
    return { label: SERVING_LABEL, qty: grams / food.recipe.finalGrams };
  }
  const primary = food.portions[0];
  if (primary && isHalfMultiple(grams, primary.g)) return { label: primary.u, qty: grams / primary.g };
  if (food.unitFood && grams > 0 && Math.abs(grams - Math.round(grams)) < EPS) {
    return { label: null, qty: Math.round(grams) };
  }
  return null;
}

/** היחידה שהייתה בשימוש לפי הגרמים האחרונים — לסטפר בלבד: כל יחידות המידה לפי סדרן. */
function lastUsedPortion(food: PortionSource, grams: number): FoodPortion | null {
  for (const p of food.portions) if (isHalfMultiple(grams, p.g)) return p;
  return null;
}

/**
 * יחידת הקלט של מזון. `lastGrams` — הכמות האחרונה שנרשמה למזון הזה, ממנה
 * נגזרת היחידה שהייתה בשימוש; בלי התאמה — portions[0].
 */
export function unitFor(food: PortionSource, lastGrams: number | null = null): UnitSpec {
  if (food.recipe && food.recipe.finalGrams > 0) return servingUnit(food.recipe.finalGrams);
  if (food.portions.length > 0) {
    const first = food.portions[0]!;
    if (lastGrams !== null) {
      const match = lastUsedPortion(food, lastGrams);
      if (match) return portionUnit(match);
    }
    return portionUnit(first);
  }
  if (food.unitFood) return { kind: 'unit', ...UNIT };
  return { kind: 'grams' };
}

/** גרמים מכמות ביחידה. ביחידת "גרמים" הכמות היא הגרמים. */
export function gramsFor(unit: UnitSpec, qty: number): number {
  if (unit.kind === 'grams') return qty;
  if (unit.kind === 'unit') return Math.round(qty);
  return Math.round(qty * unit.g * 10) / 10;
}

/** כמות ביחידה מגרמים, מעוגלת לקפיצת היחידה. */
export function qtyFor(unit: UnitSpec, grams: number): number {
  if (unit.kind === 'grams') return grams;
  if (unit.kind === 'unit') return Math.max(1, Math.round(grams));
  const q = grams / unit.g;
  return Math.round(q / unit.step) * unit.step;
}

/** "½", "1", "1½", "2" — כמות ביחידה, בלי ספרות עשרוניות. */
export function qtyText(qty: number): string {
  const whole = Math.floor(qty + EPS);
  const half = qty - whole >= 0.5 - EPS;
  if (whole === 0) return half ? '½' : '0';
  return half ? `${whole}½` : String(whole);
}

/** "כף מפולסת ×2", "מנה ×½", "×4" (מזון-יחידה), או "20 ג׳". */
export function quantityLabel(food: PortionSource | null, grams: number): string {
  const d = food ? deriveUnit(food, grams) : null;
  if (!d) return `${gramsText(grams)} ג׳`;
  return d.label === null ? `×${qtyText(d.qty)}` : `${d.label} ×${qtyText(d.qty)}`;
}
