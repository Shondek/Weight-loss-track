/** issue #13 (שלב 7): שורת החלב בשייק — "250 ג׳" במקום "כף ×25". תצוגה בלבד. */
import { describe, expect, it } from 'vitest';
import { quantityLabel, type PortionSource } from '../../lib/nutrition/portions';
import { displayQuantity } from '../nutritionView';

/** חלב 3% מהמאגר (11111009): היחידה הראשית היא כף של 10 ג׳. */
const MILK: PortionSource = { portions: [{ u: 'כף', g: 10 }, { u: 'כפית', g: 2.4 }, { u: 'כוס', g: 240 }] };
const TAHINI: PortionSource = { portions: [{ u: 'כף מפולסת', g: 15 }] };
const RECIPE: PortionSource = { portions: [], recipe: { items: [], finalGrams: 349 } };
const UNIT_FOOD: PortionSource = { portions: [], unitFood: true };

describe('displayQuantity', () => {
  it('250 ג׳ חלב (שייק): "250 ג׳", לא "כף ×25"', () => {
    expect(quantityLabel(MILK, 250)).toBe('כף ×25');
    expect(displayQuantity(MILK, 250)).toBe('250 ג׳');
  });

  it('עד ×10 היחידה נשארת; מעבר לזה — גרמים', () => {
    expect(displayQuantity(MILK, 20)).toBe('כף ×2');
    expect(displayQuantity(MILK, 100)).toBe('כף ×10');
    expect(displayQuantity(MILK, 105)).toBe('105 ג׳');
  });

  it('כלל שלב 3.1 לא השתנה: טחינה 15 → "כף מפולסת ×1", 20 → "20 ג׳"', () => {
    for (const g of [7.5, 15, 20, 30, 45]) expect(displayQuantity(TAHINI, g)).toBe(quantityLabel(TAHINI, g));
    expect(displayQuantity(TAHINI, 15)).toBe('כף מפולסת ×1');
    expect(displayQuantity(TAHINI, 20)).toBe('20 ג׳');
  });

  it('מנה מורכבת, מזון-יחידה ומזון בלי יחידות — כמו quantityLabel', () => {
    expect(displayQuantity(RECIPE, 349)).toBe('מנה ×1');
    expect(displayQuantity(RECIPE, 174.5)).toBe('מנה ×½');
    expect(displayQuantity(UNIT_FOOD, 12)).toBe('×12');
    expect(displayQuantity({ portions: [] }, 150)).toBe('150 ג׳');
    expect(displayQuantity(null, 150)).toBe('150 ג׳');
  });
});
