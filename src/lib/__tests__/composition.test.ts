/** שלב 3.1: שורת תכולה של מנה מורכבת. */
import { describe, expect, it } from 'vitest';
import type { CustomFood } from '../../types';
import { compositionLine } from '../nutrition/composition';

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

const names: Record<string, string> = { '31101010': 'ביצה', 'c:lib2:block-cottage-5': "גבינת קוטג' 5%", '75000000': 'סלט ירקות' };
const resolveName = (id: string) => names[id] ?? null;

describe('1. שורת תכולה', () => {
  it('u כשיש, אחרת n או שם המזון עם גרמים; מזהה לא ידוע נשאר כמו שהוא', () => {
    expect(compositionLine(DINNER1.recipe, resolveName)).toBe("2 ביצים · קוטג' 250 ג׳ · סלט ירקות 230 ג׳");
    expect(compositionLine({ items: [{ foodId: 'x', grams: 12.5 }], finalGrams: 12.5 }, resolveName)).toBe('x 12.5 ג׳');
  });

  it('מזון חסר / בלי מתכון — אין שורה', () => {
    expect(compositionLine(null, resolveName)).toBeNull();
    expect(compositionLine(undefined, resolveName)).toBeNull();
    expect(compositionLine({ items: [], finalGrams: 100 }, resolveName)).toBeNull();
  });
});

