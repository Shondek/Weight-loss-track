import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { CustomFood, DB } from '../../types';
import { emptyDb } from '../../types';
import type { MohFoodFile } from '../nutrition/foodDb';
import { buildFoodIndex, resolveFood } from '../nutrition/index';
import { entryNutrition } from '../nutrition/calc';
import { newEntry } from '../nutrition/entries';
import { parseDb } from '../schema';
import { mergeDb } from '../db';
import { BLOCKS, buildMealLibrary, DISHES, LIB_PREFIX, libId } from '../../../scripts/meal-library-v2';

const ROOT = join(__dirname, '..', '..', '..');
const moh = JSON.parse(readFileSync(join(ROOT, 'public', 'nutrition', 'moh-foods.json'), 'utf8')) as MohFoodFile;
const mohIndex = buildFoodIndex(moh.foods, []);
const foods = buildMealLibrary(mohIndex);
const index = buildFoodIndex(moh.foods, foods);

/** כל המנה, כפי שהוגדרה: סכום גרמי המרכיבים. */
function dishNutrition(slug: string) {
  const d = DISHES.find((x) => x.slug === slug)!;
  const food = resolveFood(index, libId(slug))!;
  const grams = d.items.reduce((n, i) => n + i.grams, 0);
  return entryNutrition(newEntry(food, grams, 'lunch', 1, 't'), food);
}

describe('ספריית המנות v2 — חישוב מול המסמך', () => {
  it('נבנים 18 מזונות: 7 ממותגים + 11 מנות, כולם עם קידומת הספרייה', () => {
    expect(foods).toHaveLength(18);
    expect(foods.filter((f) => f.recipe)).toHaveLength(11);
    expect(foods.every((f) => f.id.startsWith(LIB_PREFIX))).toBe(true);
  });

  it('צ2 רוסטביף: 350 תווית + סלט + שקדים + טחינה = 636.8 / 77.0 (מסמך 648 / 78)', () => {
    const n = dishNutrition('lunch-2-roastbeef');
    expect(n.kcal).toBeCloseTo(357 + 42.5 + 144.75 + 92.55, 1);
    expect(n.protein).toBeCloseTo(66.5 + 2 + 5.275 + 3.21, 1);
    expect(Math.abs(n.kcal - 648) / 648).toBeLessThan(0.05);
  });

  it("ע1 קוטג' וביצים: 666.6 / 48.3 (מסמך 685 / 50)", () => {
    const n = dishNutrition('dinner-1-cottage-eggs');
    expect(n.kcal).toBeCloseTo(154 + 237.5 + 42.5 + 4 * 9.26 * 3.78 + 92.55, 0);
    expect(n.protein).toBeCloseTo(12.5 + 27.5 + 2 + 4 * 9.26 * 0.083 + 3.21, 0);
    expect(Math.abs(n.kcal - 685) / 685).toBeLessThan(0.05);
  });

  it('ע5 בלי בישול: 635.0 / 63.3 (מסמך 649 / 65)', () => {
    const n = dishNutrition('dinner-5-no-cook');
    expect(n.kcal).toBeCloseTo(237.5 + 180 + 5 * 9.26 * 3.78 + 42.5, 0);
    expect(n.protein).toBeCloseTo(27.5 + 30 + 5 * 9.26 * 0.083 + 2, 0);
    expect(Math.abs(n.kcal - 649) / 649).toBeLessThan(0.05);
  });

  it('הפערים שדווחו נשארים כפי שהם — לא מתוקנים בשקט', () => {
    // הסלט מהמאגר (42.5) מול 56 במסמך, וכדור התמר בלי חלבון — פערים מוכרים.
    expect(dishNutrition('lunch-4-pastrami').kcal / 676 - 1).toBeCloseTo(-0.068, 2);
    expect(dishNutrition('dinner-2-shakshuka').kcal / (682 - 120) - 1).toBeCloseTo(-0.074, 2);
    expect(dishNutrition('dinner-4-broccoli-pie').kcal / 978 - 1).toBeCloseTo(-0.063, 2);
    expect(dishNutrition('coffee-milk').protein / 4 - 1).toBeCloseTo(-0.138, 2);
  });

  it('בלוקים: פריט × גרמים מול המסמך, כולם בתוך 2%', () => {
    for (const b of BLOCKS) {
      const food = resolveFood(index, b.foodId)!;
      const n = entryNutrition(newEntry(food, b.grams, 'snack', 1, 't'), food);
      expect(Math.abs(n.kcal - b.doc.kcal) / b.doc.kcal, b.label).toBeLessThan(0.02);
      expect(Math.abs(n.protein - b.doc.protein) / b.doc.protein, b.label).toBeLessThan(0.02);
    }
  });

  it('אין מנה בתוך מנה, וכל מרכיב נפתר', () => {
    for (const f of foods) {
      if (!f.recipe) continue;
      for (const i of f.recipe.items) {
        const ing = resolveFood(index, i.foodId);
        expect(ing, `${f.name}: ${i.foodId}`).not.toBeNull();
        expect(ing!.isRecipe, `${f.name}: ${i.foodId}`).toBe(false);
      }
      expect(f.recipe.finalGrams).toBeCloseTo(f.recipe.items.reduce((n, i) => n + i.grams, 0), 10);
    }
  });

  it('שומן לא ידוע = null (לא אפס), עם הערה; פחמימה null נשמרת', () => {
    const rb = foods.find((f) => f.id === libId('roastbeef-hod-maadan'))!;
    expect(rb.fat).toBeNull();
    expect(rb.carbs).toBeNull();
    expect(rb.note).toContain('שומן לא ידועים');
    // יוגורט 0% ובולגרית 5%: השומן ידוע מהשם.
    expect(foods.find((f) => f.id === libId('greek-yogurt-0'))?.fat).toBe(0);
    expect(foods.find((f) => f.id === libId('bulgarit-5'))?.fat).toBe(5);
  });

  it('unitFood: הזנת 1 נותנת פיתה / כדור / בקבוק שלמים; רק שלושתם מסומנים', () => {
    for (const [slug, kcal, protein] of [['pita-light', 120, 4], ['date-ball', 130, 0], ['pro40-yotvata', 195, 40]] as const) {
      const food = resolveFood(index, libId(slug))!;
      expect(food.unitFood, slug).toBe(true);
      const e = newEntry(food, 1, 'snack', 1, 't');
      expect(e.ref.unitFood).toBe(true);
      const n = entryNutrition(e, food);
      expect(n.kcal, slug).toBeCloseTo(kcal, 6);
      expect(n.protein, slug).toBeCloseTo(protein, 6);
      expect(n.fatUnknown, slug).toBe(true);
      expect(food.portions).toEqual([{ u: expect.any(String), g: 1 }]);
      expect(foods.find((f) => f.id === food.id)?.note).toContain('= 1');
    }
    expect(foods.filter((f) => f.unitFood)).toHaveLength(3);
  });

  it('פיתה וכדור תמר לא בתוך מנות — משקל המנה = משקל הצלחת', () => {
    const pita = libId('pita-light');
    const ball = libId('date-ball');
    for (const f of foods) {
      if (!f.recipe) continue;
      expect(f.recipe.items.some((i) => i.foodId === pita || i.foodId === ball), f.name).toBe(false);
    }
    expect(foods.find((f) => f.id === libId('coffee-milk'))?.recipe?.items).toHaveLength(2);
  });

  it('מנה עם מרכיב שהשומן בו לא ידוע → שומן המנה null; ביום — fatUnknownGrams', () => {
    const shak = resolveFood(index, libId('dinner-2-shakshuka'))!;
    expect(shak.fat).not.toBeNull(); // בלי פיתה — כל המרכיבים עם שומן ידוע
    expect(shak.carbs).toBeNull(); // בולגרית ויוגורט בלי פחמימה ידועה
    const rb = resolveFood(index, libId('lunch-2-roastbeef'))!;
    expect(rb.fat).toBeNull(); // רוסטביף בלי שומן ידוע
    const chicken = resolveFood(index, libId('lunch-1-chicken'))!;
    expect(chicken.fat).not.toBeNull(); // כל המרכיבים מהמאגר
  });
});

describe('קובץ הייבוא', () => {
  const filePath = join(ROOT, 'library', 'meal-library-v2.json');
  const raw = readFileSync(filePath, 'utf8');
  const parsed = JSON.parse(raw) as { v: number; customFoods: CustomFood[] };

  it('הקובץ ב-library/ מעודכן מול הסקריפט (דטרמיניסטי)', () => {
    expect(parsed.customFoods).toEqual(foods);
    expect(buildMealLibrary(mohIndex)).toEqual(foods);
  });

  it('parseDb קולט את הקובץ כגיבוי: 18 מזונות, 11 מתכונים, בלי דחיות', () => {
    const r = parseDb(parsed);
    expect(r.counts.customFoods).toBe(18);
    expect(r.db.customFoods.filter((f) => f.recipe)).toHaveLength(11);
    expect(r.rejected).toEqual([]);
    expect(r.counts.entries).toBe(0);
    expect(r.counts.targets).toBe(0);
  });

  it('ייבוא חוזר במיזוג לא משכפל ולא דורס מזונות אחרים', () => {
    const mine: CustomFood = { id: 'c:mine', name: 'שלי', cat: null, kcal: 50, protein: 5, carbs: null, fat: 1, fiber: null, portions: [], barcode: null };
    const stale = { ...foods[0]!, kcal: 999, name: 'גרסה ישנה' };
    const existing: DB = {
      ...emptyDb(),
      customFoods: [mine, stale],
      entries: [newEntry({ ...resolveFood(index, stale.id)!, kcal: 999 }, 100, 'lunch', 1, 'e')],
      targets: [{ from: '2026-09-01', kcal: 1890, protein: 190, carbs: 150, fat: 60 }],
    };
    const once = mergeDb(existing, parseDb(parsed).db);
    const twice = mergeDb(once, parseDb(parsed).db);
    expect(once.customFoods).toHaveLength(19);
    expect(twice.customFoods).toEqual(once.customFoods);
    expect(once.customFoods.find((f) => f.id === 'c:mine')).toEqual(mine);
    expect(once.customFoods.find((f) => f.id === stale.id)?.kcal).toBe(foods[0]!.kcal);
    // הרישום הישן לא נגע — ה-ref שלו נשאר עם הערך שהיה בזמן הרישום.
    expect(once.entries).toEqual(existing.entries);
    expect(once.entries[0]?.ref.kcal).toBe(999);
    expect(once.targets).toEqual(existing.targets);
  });
});
