/** שלב 3.1: תכולת מנה ויחידות מנה — תצוגה וקלט בלבד. */
import { describe, expect, it } from 'vitest';
import type { CustomFood, FoodEntry } from '../../types';
import { newEntry } from '../nutrition/entries';
import { fromCustom } from '../nutrition/foods';
import {
  deriveUnit,
  gramsFor,
  qtyFor,
  qtyText,
  quantityLabel,
  unitFor,
} from '../nutrition/portions';

const base: Omit<CustomFood, 'id' | 'name'> = {
  cat: null,
  kcal: 100,
  protein: 10,
  carbs: null,
  fat: null,
  fiber: null,
  portions: [],
  barcode: null,
};

const TAHINI: CustomFood = {
  ...base,
  id: 'c:lib2:tahini-raw',
  name: 'טחינה גולמית',
  portions: [
    { u: 'כף מפולסת', g: 15 },
    { u: 'כף', g: 15 },
    { u: 'כפית', g: 5 },
  ],
};
const WALNUTS: CustomFood = {
  ...base,
  id: 'c:lib2:nut-walnuts',
  name: 'אגוזי מלך',
  portions: [
    { u: 'מנה', g: 25 },
    { u: 'כוס', g: 100 },
    { u: 'יחידה', g: 5.5 },
  ],
};
const DINNER1: CustomFood = {
  ...base,
  id: 'c:lib2:dinner-1-cottage-eggs',
  name: "ע1 — קוטג' וביצים",
  note: '4 פריכיות תירס וטחינה כף מפולסת נרשמות בנפרד (תוספות)',
  recipe: {
    items: [
      { foodId: '31101010', grams: 120, u: '2 ביצים' },
      { foodId: 'c:lib2:block-cottage-5', grams: 250, n: "קוטג'" },
      { foodId: '75000000', grams: 230 },
    ],
    finalGrams: 600,
  },
};
const CRACKER: CustomFood = { ...base, id: 'c:cracker', name: 'פריכית', unitFood: true, kcal: 3100, portions: [{ u: 'יחידה', g: 1 }] };
const ADHOC_SAVED: CustomFood = { ...base, id: 'c:yopro', name: 'יוגורט פרו', unitFood: true, kcal: 15000 };
const PLAIN: CustomFood = { ...base, id: 'c:plain', name: 'חזה עוף' };

describe('2. גזירת יחידה מגרמים שמורים', () => {
  it('טחינה 15 / 30 / 20', () => {
    expect(deriveUnit(TAHINI, 15)).toEqual({ label: 'כף מפולסת', qty: 1 });
    expect(deriveUnit(TAHINI, 30)).toEqual({ label: 'כף מפולסת', qty: 2 });
    expect(deriveUnit(TAHINI, 7.5)).toEqual({ label: 'כף מפולסת', qty: 0.5 });
    expect(quantityLabel(TAHINI, 15)).toBe('כף מפולסת ×1');
    expect(quantityLabel(TAHINI, 30)).toBe('כף מפולסת ×2');
  });

  it('20 ג׳ טחינה → "20 ג׳": רק היחידה הראשית (כף מפולסת) נגזרת, לא כפית 5 ג׳', () => {
    expect(deriveUnit(TAHINI, 20)).toBeNull();
    expect(quantityLabel(TAHINI, 20)).toBe('20 ג׳');
    expect(quantityLabel(TAHINI, 22)).toBe('22 ג׳');
    expect(deriveUnit(TAHINI, 22)).toBeNull();
  });

  it('אגוזי מלך 25 / 50 / 12.5 — "מנה" קודמת ל"יחידה" בשוויון', () => {
    expect(quantityLabel(WALNUTS, 25)).toBe('מנה ×1');
    expect(quantityLabel(WALNUTS, 50)).toBe('מנה ×2');
    expect(quantityLabel(WALNUTS, 12.5)).toBe('מנה ×½');
  });

  it('ע1 600 / 300 / 450 / 900', () => {
    expect(quantityLabel(DINNER1, 600)).toBe('מנה ×1');
    expect(quantityLabel(DINNER1, 300)).toBe('מנה ×½');
    expect(quantityLabel(DINNER1, 450)).toBe('450 ג׳');
    expect(quantityLabel(DINNER1, 900)).toBe('מנה ×1½');
  });

  it('מזון בלי יחידות → גרמים; מזון-יחידה בלי portions → ×N; מזון חסר → גרמים', () => {
    expect(quantityLabel(PLAIN, 150)).toBe('150 ג׳');
    expect(quantityLabel(ADHOC_SAVED, 3)).toBe('×3');
    expect(quantityLabel(null, 112)).toBe('112 ג׳');
    expect(quantityLabel(CRACKER, 4)).toBe('יחידה ×4');
  });

  it('qtyText — בלי ספרות עשרוניות', () => {
    expect([0.5, 1, 1.5, 2, 10].map(qtyText)).toEqual(['½', '1', '1½', '2', '10']);
  });
});

describe('3. סטפר → גרמים', () => {
  it('טחינה ×2 → 30; ע1 ×1.5 → 900; אגוזי מלך ×0.5 → 12.5', () => {
    expect(gramsFor(unitFor(TAHINI), 2)).toBe(30);
    expect(gramsFor(unitFor(DINNER1), 1.5)).toBe(900);
    expect(gramsFor(unitFor(WALNUTS), 0.5)).toBe(12.5);
    expect(gramsFor({ kind: 'grams' }, 37)).toBe(37);
    expect(gramsFor(unitFor(ADHOC_SAVED), 3)).toBe(3);
  });

  it('טווחי הסטפר לפי הכלל', () => {
    expect(unitFor(DINNER1)).toMatchObject({ kind: 'serving', label: 'מנה', g: 600, min: 0.5, max: 3, step: 0.5 });
    expect(unitFor(TAHINI)).toMatchObject({ kind: 'portion', label: 'כף מפולסת', g: 15, min: 0.5, max: 10, step: 0.5 });
    expect(unitFor(ADHOC_SAVED)).toEqual({ kind: 'unit', min: 1, max: 10, step: 1 });
    expect(unitFor(PLAIN)).toEqual({ kind: 'grams' });
    // מזון-יחידה עם portions — לפי סדר הכללים, portions קודם.
    expect(unitFor(CRACKER)).toMatchObject({ kind: 'portion', label: 'יחידה', g: 1 });
  });

  it('הרשומה שנשמרת היא בגרמים — טחינה ×1 עדיין שומרת grams: 15', () => {
    const e: FoodEntry = newEntry(fromCustom(TAHINI), gramsFor(unitFor(TAHINI), 1), 'lunch', 1, 'x');
    expect(e.grams).toBe(15);
    expect(Object.keys(e)).not.toContain('unit');
  });
});

describe('4. היחידה האחרונה בשימוש', () => {
  it('הגרמים האחרונים קובעים את היחידה של הסטפר (כל היחידות): כפית ×2 → "כפית"; בלי התאמה → portions[0]', () => {
    // התצוגה גוזרת רק מ-portions[0] (10 ג׳ → "10 ג׳"), אבל כלל היחידה האחרונה של הסטפר לא השתנה.
    expect(quantityLabel(TAHINI, 10)).toBe('10 ג׳');
    expect(unitFor(TAHINI, 10)).toMatchObject({ kind: 'portion', label: 'כפית', g: 5 });
    expect(qtyFor(unitFor(TAHINI, 10), 10)).toBe(2);
    expect(unitFor(TAHINI, 30)).toMatchObject({ label: 'כף מפולסת' });
    expect(unitFor(TAHINI, 22)).toMatchObject({ label: 'כף מפולסת' });
    expect(unitFor(WALNUTS, 100)).toMatchObject({ label: 'מנה' }); // 100 = מנה ×4 קודם ל"כוס" ×1
    expect(unitFor(TAHINI, null)).toMatchObject({ label: 'כף מפולסת' });
  });

  it('qtyFor מעגל לקפיצת היחידה; מעבר לגרמים שומר את הערך', () => {
    const u = unitFor(TAHINI);
    expect(qtyFor(u, 30)).toBe(2);
    expect(qtyFor(u, 22)).toBe(1.5);
    expect(qtyFor({ kind: 'grams' }, 22)).toBe(22);
    expect(gramsFor({ kind: 'grams' }, qtyFor({ kind: 'grams' }, 22))).toBe(22);
  });
});
