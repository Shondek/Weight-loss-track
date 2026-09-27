/** שייקי חלבון: 16 השילובים מול הטבלה המאושרת (±1 קק״ל, ±0.5 ג׳), והרשומות. */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { MohFoodFile } from './foodDb';
import { buildFoodIndex, resolveFood } from './index';
import { buildMealLibrary } from '../../../scripts/meal-library-v2';
import { PROTEIN_SHAKES, SHAKE_MILK, shakesOpenByDefault } from '../../data/proteinShakes';
import { resolveShakes, shakeEntries } from './shakes';
import { entryNutrition } from './calc';
import { removeEntry, upsertEntry } from './entries';
import type { FoodEntry } from '../../types';

const ROOT = join(__dirname, '..', '..', '..');
const moh = JSON.parse(readFileSync(join(ROOT, 'public', 'nutrition', 'moh-foods.json'), 'utf8')) as MohFoodFile;
const mohIndex = buildFoodIndex(moh.foods, []);
const foods = buildMealLibrary(mohIndex);
const index = buildFoodIndex(moh.foods, foods);
const resolve = (id: string) => resolveFood(index, id);

/** הטבלה המאושרת (שלב 0): [קק״ל, חלבון, פחמימה, שומן] לכל מוצר: 1·מים, 2·מים, 1·חלב, 2·חלב. */
const APPROVED: Record<string, [number, number, number, number][]> = {
  'impact-whey-vanilla': [[114, 21.6, 2.7, 1.8], [227, 43.2, 5.3, 3.5], [264, 29.9, 14.2, 9.3], [377, 51.5, 16.8, 11.0]],
  'impact-whey-chocolate': [[113, 21.9, 1.9, 1.9], [226, 43.8, 3.9, 3.7], [263, 30.1, 13.4, 9.4], [376, 52.0, 15.4, 11.2]],
  'impact-milkshake-fudge': [[105, 20.0, 2.1, 1.5], [210, 40.0, 4.3, 3.0], [255, 28.3, 13.6, 9.0], [360, 48.3, 15.8, 10.5]],
  'impact-milkshake-caramel': [[106, 19.7, 4.1, 1.2], [213, 39.4, 8.1, 2.4], [256, 28.0, 15.6, 8.7], [363, 47.7, 19.6, 9.9]],
};

describe('16 השילובים', () => {
  const products = resolveShakes(resolve);

  it('ארבעה מוצרים × ארבעה שילובים, בסדר 1·מים, 2·מים, 1·חלב, 2·חלב, מול הטבלה המאושרת', () => {
    expect(products).toHaveLength(4);
    expect(products.map((p) => p.shake.slug)).toEqual(PROTEIN_SHAKES.map((s) => s.slug));
    let n = 0;
    for (const p of products) {
      expect(p.powder).not.toBeNull();
      expect(p.combos.map((c) => c.label)).toEqual(['1 סקופ · מים', '2 סקופים · מים', '1 סקופ · חלב', '2 סקופים · חלב']);
      const rows = APPROVED[p.shake.slug]!;
      p.combos.forEach((c, i) => {
        const [kcal, protein, carbs, fat] = rows[i]!;
        expect(Math.abs(c.kcal - kcal), `${p.shake.slug} ${c.label} kcal`).toBeLessThanOrEqual(1);
        expect(Math.abs(c.protein - protein), `${p.shake.slug} ${c.label} protein`).toBeLessThanOrEqual(0.5);
        expect(Math.abs(c.carbs - carbs), `${p.shake.slug} ${c.label} carbs`).toBeLessThanOrEqual(0.5);
        expect(Math.abs(c.fat - fat), `${p.shake.slug} ${c.label} fat`).toBeLessThanOrEqual(0.5);
        n++;
      });
    }
    expect(n).toBe(16);
  });

  it('מים: שורה אחת (סקופים × משקל סקופ); חלב: שתי שורות, החלב 250 ג׳ מהמאגר', () => {
    const vanilla = products[0]!;
    const water2 = vanilla.combos[1]!;
    expect(water2.lines).toHaveLength(1);
    expect(water2.lines[0]).toMatchObject({ grams: 60 });
    expect(water2.lines[0]!.food.id).toBe('c:lib2:impact-whey-vanilla');
    const milk1 = vanilla.combos[2]!;
    expect(milk1.lines.map((l) => [l.food.id, l.grams])).toEqual([['c:lib2:impact-whey-vanilla', 30], [SHAKE_MILK.foodId, 250]]);
    expect(milk1.lines[1]!.food.name).toContain('חלב 3%');
  });

  it('בלי ספרייה: המוצר בלי שילובים; בלי חלב במאגר: רק שילובי מים', () => {
    const noLib = resolveShakes((id) => (id.startsWith('c:lib2:') ? null : resolve(id)));
    expect(noLib.every((p) => p.powder === null && p.combos.length === 0)).toBe(true);
    const noMilk = resolveShakes((id) => (id === SHAKE_MILK.foodId ? null : resolve(id)));
    expect(noMilk[0]!.combos.map((c) => c.label)).toEqual(['1 סקופ · מים', '2 סקופים · מים']);
  });
});

describe('רישום ו"בטל"', () => {
  const products = resolveShakes(resolve);
  const unique = (i: number) => `u${i}`;

  it('מים → רשומה אחת; חלב → שתיים; הערכים של הרשומות = ערכי הכפתור; "בטל" מסיר את כולן', () => {
    const water = shakeEntries(products[0]!.combos[0]!, 'snack', 1_000_000, unique);
    expect(water).toHaveLength(1);
    const milk = shakeEntries(products[0]!.combos[2]!, 'snack', 1_000_000, unique);
    expect(milk).toHaveLength(2);
    expect(new Set(milk.map((e) => e.id)).size).toBe(2);
    expect(milk.every((e) => e.meal === 'snack')).toBe(true);
    const total = milk.map((e) => entryNutrition(e, resolve(e.foodId))).reduce((a, b) => ({ kcal: a.kcal + b.kcal, protein: a.protein + b.protein }), { kcal: 0, protein: 0 });
    expect(Math.abs(total.kcal - 264)).toBeLessThanOrEqual(1);
    expect(Math.abs(total.protein - 29.9)).toBeLessThanOrEqual(0.5);

    let list: FoodEntry[] = [];
    for (const e of milk) list = upsertEntry(list, e);
    expect(list).toHaveLength(2);
    for (const id of milk.map((e) => e.id)) list = removeEntry(list, id);
    expect(list).toEqual([]);
  });
});

describe('קיפול לפי שעה — כמו "בלוקים"', () => {
  it('פתוח לפני 11:00 ואחרי 22:00, סגור באמצע', () => {
    const b = { lunchFrom: 11, snackFrom: 22 };
    expect(shakesOpenByDefault(7, b)).toBe(true);
    expect(shakesOpenByDefault(10, b)).toBe(true);
    expect(shakesOpenByDefault(11, b)).toBe(false);
    expect(shakesOpenByDefault(18, b)).toBe(false);
    expect(shakesOpenByDefault(22, b)).toBe(true);
    expect(shakesOpenByDefault(23, b)).toBe(true);
  });
});
