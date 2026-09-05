import { describe, it, expect } from 'vitest';
import type { CustomFood } from '../../types';
import { fromCustom, fromMoh, type Food } from '../nutrition/foods';
import { newEntry } from '../nutrition/entries';
import { entryNutrition } from '../nutrition/calc';
import {
  buildRecipeFood,
  concentration,
  recipePer100,
  recipeProblems,
  recipeTotals,
} from '../nutrition/recipe';
import { parseCustomFoods } from '../schema';

const mk = (id: string, name: string, kcal: number, p: number, c: number | null, f: number, fiber: number | null): Food =>
  fromMoh({ id, name, en: null, cat: 7, kcal, protein: p, carbs: c, fat: f, fiber, portions: [] });

// ערכים אמיתיים מהמאגר ל-100 ג'
const tomato = mk('74101000', 'עגבנייה', 18, 0.9, 3.9, 0.2, 1.2);
const cucumber = mk('72201000', 'מלפפון', 15, 0.7, 3.6, 0.1, 0.5);
const olive = mk('82104000', 'שמן זית', 884, 0, 0, 100, 0);
const rice = mk('56205000', 'אורז לבן, לא מבושל', 360, 6.6, 79, 0.6, 1.3);
const fish = mk('26102188', 'דג', 128, 24, null, 3.5, 0);
const cheese = mk('11412289', 'גבינה', 250, 20, 2, 18, null);

const foods = new Map([tomato, cucumber, olive, rice, fish, cheese].map((f) => [f.id, f]));
const resolve = (id: string) => foods.get(id) ?? null;

const base: Omit<CustomFood, 'kcal' | 'protein' | 'carbs' | 'fat' | 'fiber' | 'recipe'> = {
  id: 'c:salad',
  name: 'סלט ירקות',
  cat: 7,
  portions: [],
  barcode: null,
};

describe('סלט קר — finalGrams = סכום המרכיבים', () => {
  const items = [
    { foodId: tomato.id, grams: 200 },
    { foodId: cucumber.id, grams: 150 },
    { foodId: olive.id, grams: 10 },
  ];
  const totals = recipeTotals(items, resolve);

  it('סך הערכים = Σ (ל-100 ג׳ × גרמים) / 100', () => {
    expect(totals.sumGrams).toBe(360);
    expect(totals.kcal).toBeCloseTo(36 + 22.5 + 88.4, 10);
    expect(totals.protein).toBeCloseTo(1.8 + 1.05, 10);
    expect(totals.carbs).toBeCloseTo(7.8 + 5.4, 10);
    expect(totals.fat).toBeCloseTo(0.4 + 0.15 + 10, 10);
    expect(totals.fiber).toBeCloseTo(2.4 + 0.75, 10);
  });

  it('ל-100 ג׳ עם finalGrams = הסכום: יחס 1, הערכים הם הסכום / 3.6', () => {
    const per100 = recipePer100(totals, 360);
    expect(per100.kcal).toBeCloseTo(146.9 / 3.6, 10);
    expect(per100.protein).toBeCloseTo(2.85 / 3.6, 10);
    expect(per100.fat).toBeCloseTo(10.55 / 3.6, 10);
    expect(concentration(360, 360)).toBe(1);
  });

  it('buildRecipeFood שומר ערכים ומתכון, והמנה מתנהגת כמו כל מזון ברישום', () => {
    const food = buildRecipeFood(base, items, 360, resolve);
    expect(food.recipe).toEqual({ items, finalGrams: 360 });
    expect(food.recipe?.items).not.toBe(items); // עותק
    const asFood = fromCustom(food);
    expect(asFood.isRecipe).toBe(true);
    // צלחת של 180 ג' = חצי מהמנה
    const n = entryNutrition(newEntry(asFood, 180, 'lunch', 1, 'x'), asFood);
    expect(n.kcal).toBeCloseTo(146.9 / 2, 10);
    expect(n.fiber).toBeCloseTo(3.15 / 2, 10);
  });
});

describe('מנה מבושלת — finalGrams קטן מהסכום = ריכוז', () => {
  // 100 ג' אורז יבש + 200 ג' מים (מזון 0) → 250 ג' מבושל
  const water = mk('94000000', 'מים', 0, 0, 0, 0, 0);
  const resolveW = (id: string) => (id === water.id ? water : resolve(id));
  const items = [
    { foodId: rice.id, grams: 100 },
    { foodId: water.id, grams: 200 },
  ];

  it('הערכים ל-100 ג׳ מתרכזים לפי סכום/סופי', () => {
    const totals = recipeTotals(items, resolveW);
    expect(totals.sumGrams).toBe(300);
    const per100 = recipePer100(totals, 250);
    expect(per100.kcal).toBeCloseTo(360 * 100 / 250, 10); // 144
    expect(per100.carbs).toBeCloseTo(79 * 100 / 250, 10);
    expect(concentration(300, 250)).toBeCloseTo(1.2, 10);
  });

  it('finalGrams גדול מהסכום = דילול, לא נחסם', () => {
    expect(recipeProblems(items, 400, resolveW)).toEqual([]);
    expect(concentration(300, 400)).toBeCloseTo(0.75, 10);
    expect(recipePer100(recipeTotals(items, resolveW), 400).kcal).toBeCloseTo(90, 10);
  });
});

describe('מרכיב אחד', () => {
  it('מנה ממרכיב אחד עם finalGrams = הגרמים שלו זהה למזון עצמו', () => {
    const per100 = recipePer100(recipeTotals([{ foodId: tomato.id, grams: 250 }], resolve), 250);
    // דיוק מלא בחישוב — רעש נקודה צפה נשאר ומתעגל רק בתצוגה.
    expect(per100.kcal).toBeCloseTo(18, 10);
    expect(per100.protein).toBeCloseTo(0.9, 10);
    expect(per100.carbs ?? NaN).toBeCloseTo(3.9, 10);
    expect(per100.fat).toBeCloseTo(0.2, 10);
    expect(per100.fiber ?? NaN).toBeCloseTo(1.2, 10);
  });
});

describe('מרכיב עם ערך לא ידוע', () => {
  it('carbs=null במרכיב אחד → carbs=null במנה; השאר מחושב', () => {
    const items = [
      { foodId: fish.id, grams: 150 },
      { foodId: tomato.id, grams: 100 },
    ];
    const per100 = recipePer100(recipeTotals(items, resolve), 250);
    expect(per100.carbs).toBeNull();
    expect(per100.kcal).toBeCloseTo((192 + 18) / 2.5, 10);
    expect(per100.protein).toBeCloseTo((36 + 0.9) / 2.5, 10);
    expect(per100.fiber).toBeCloseTo(1.2 / 2.5, 10);
  });

  it('fat=null במרכיב אחד → fat=null במנה; השאר מחושב', () => {
    const partial: Food = { ...tomato, id: 'c:p', name: 'תווית חלקית', source: 'custom', kcal: 100, protein: 10, carbs: 5, fat: null, fiber: 0 };
    const r = (id: string) => (id === 'c:p' ? partial : resolve(id));
    const per100 = recipePer100(recipeTotals([{ foodId: 'c:p', grams: 100 }, { foodId: olive.id, grams: 10 }], r), 110);
    expect(per100.fat).toBeNull();
    expect(per100.kcal).toBeCloseTo((100 + 88.4) / 1.1, 10);
    expect(per100.carbs).toBeCloseTo(5 / 1.1, 10);
  });

  it('fiber=null במרכיב אחד → fiber=null במנה', () => {
    const per100 = recipePer100(recipeTotals([{ foodId: cheese.id, grams: 50 }, { foodId: tomato.id, grams: 100 }], resolve), 150);
    expect(per100.fiber).toBeNull();
    expect(per100.carbs).toBeCloseTo((1 + 3.9) / 1.5, 10);
  });
});

describe('recipeProblems', () => {
  it('ריק, מרכיב חסר, משקל סופי לא תקין', () => {
    expect(recipeProblems([], 100, resolve)).toEqual([{ kind: 'no-items' }, ]);
    expect(recipeProblems([{ foodId: 'c:gone', grams: 10 }], 10, resolve)).toEqual([{ kind: 'missing', foodId: 'c:gone' }]);
    expect(recipeProblems([{ foodId: tomato.id, grams: 10 }], 0, resolve)).toEqual([{ kind: 'bad-final' }]);
    expect(recipeProblems([{ foodId: tomato.id, grams: 10 }], null, resolve)).toEqual([{ kind: 'bad-final' }]);
  });

  it('מנה בתוך מנה חסומה', () => {
    const salad = fromCustom(buildRecipeFood(base, [{ foodId: tomato.id, grams: 100 }], 100, resolve));
    const r = (id: string) => (id === salad.id ? salad : resolve(id));
    expect(recipeProblems([{ foodId: salad.id, grams: 50 }], 50, r)).toEqual([
      { kind: 'nested', foodId: 'c:salad', name: 'סלט ירקות' },
    ]);
  });
});

describe('עריכת מנה לא משנה רישום ישן', () => {
  it('ה-ref שהוקפא ברישום נשאר; רק רישום חדש רואה את הערכים החדשים', () => {
    const v1 = buildRecipeFood(base, [{ foodId: tomato.id, grams: 200 }, { foodId: olive.id, grams: 10 }], 210, resolve);
    const entry = newEntry(fromCustom(v1), 100, 'lunch', 1, 'a');
    const kcalV1 = entryNutrition(entry, fromCustom(v1)).kcal;

    // עריכה: יותר שמן
    const v2 = buildRecipeFood(base, [{ foodId: tomato.id, grams: 200 }, { foodId: olive.id, grams: 30 }], 230, resolve);
    expect(v2.kcal).toBeGreaterThan(v1.kcal);

    // המזון החי גובר (v2), ולכן הרישום הישן מוצג לפי v2 כל עוד המזון קיים —
    expect(entryNutrition(entry, fromCustom(v2)).kcal).toBeCloseTo(v2.kcal, 10);
    // — אבל ה-ref שהוקפא ברישום לא השתנה, ואם המזון יימחק הוא יחזור ל-v1.
    expect(entry.ref.kcal).toBeCloseTo(v1.kcal, 10);
    expect(entryNutrition(entry, null).kcal).toBeCloseTo(kcalV1, 10);
    expect(entryNutrition(entry, null).fromRef).toBe(true);
  });
});

describe('parseCustomFoods עם recipe', () => {
  const plain = { id: 'c:a', name: 'עגבנייה שלי', kcal: 18, protein: 0.9, carbs: 3.9, fat: 0.2, fiber: 1.2, portions: [], barcode: null, cat: null };

  it('מתכון תקין נשמר; מרכיב שבור נשמט; בלי מרכיבים תקינים — בלי מתכון', () => {
    const r = parseCustomFoods([
      { ...plain, id: 'c:s', name: 'סלט', recipe: { items: [{ foodId: '74101000', grams: 200 }, { foodId: 'bad', grams: 1 }, { foodId: '82104000', grams: 0 }], finalGrams: 200 } },
      { ...plain, id: 'c:e', name: 'ריק', recipe: { items: [{ foodId: 'bad', grams: 1 }], finalGrams: 1 } },
      { ...plain, id: 'c:f', name: 'בלי סופי', recipe: { items: [{ foodId: '74101000', grams: 200 }], finalGrams: 0 } },
    ]);
    const byId = new Map(r.ok.map((f) => [f.id, f]));
    expect(byId.get('c:s')?.recipe).toEqual({ items: [{ foodId: '74101000', grams: 200 }], finalGrams: 200 });
    expect(byId.get('c:e')?.recipe).toBeUndefined();
    expect(byId.get('c:f')?.recipe).toBeUndefined();
    expect(r.rejected).toHaveLength(0);
  });

  it('מנה בתוך מנה: המתכון מוסר עם סיבה, הערכים והמזון נשארים', () => {
    const r = parseCustomFoods([
      { ...plain, id: 'c:inner', name: 'פנימי', recipe: { items: [{ foodId: '74101000', grams: 100 }], finalGrams: 100 } },
      { ...plain, id: 'c:outer', name: 'חיצוני', kcal: 50, recipe: { items: [{ foodId: 'c:inner', grams: 100 }], finalGrams: 100 } },
    ]);
    const outer = r.ok.find((f) => f.id === 'c:outer');
    expect(outer?.recipe).toBeUndefined();
    expect(outer?.kcal).toBe(50);
    expect(r.ok.find((f) => f.id === 'c:inner')?.recipe).toBeDefined();
    expect(r.rejected[0]?.reason).toContain('מנה בתוך מנה');
  });

  it('גיבוי הלוך-ושוב שומר את המתכון', () => {
    const food = buildRecipeFood(base, [{ foodId: tomato.id, grams: 200 }], 200, resolve);
    const r = parseCustomFoods(JSON.parse(JSON.stringify([food])));
    expect(r.ok[0]).toEqual(food);
  });
});
