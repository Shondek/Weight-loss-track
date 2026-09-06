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
import { BLOCKS, buildMealLibrary, DISHES, LIB_PREFIX, libId, MOH, MOH_COPIES } from '../../../scripts/meal-library-v2';
import { MEAL_MENU } from '../../data/mealMenu';
import { resolveMenu } from '../nutrition/menu';

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
  it('נבנים 27 מזונות: 7 ממותגים + 9 עותקי מאגר + 11 מנות, כולם עם קידומת הספרייה', () => {
    expect(foods).toHaveLength(27);
    expect(foods.filter((f) => f.recipe)).toHaveLength(11);
    expect(foods.every((f) => f.id.startsWith(LIB_PREFIX))).toBe(true);
  });

  it('צ2 רוסטביף (2.1, בלי שקדים): 350 תווית + סלט + טחינה = 492.1 / 71.7 (מסמך 503 / 73)', () => {
    const n = dishNutrition('lunch-2-roastbeef');
    expect(n.kcal).toBeCloseTo(357 + 42.5 + 92.55, 1);
    expect(n.protein).toBeCloseTo(66.5 + 2 + 3.21, 1);
    expect(Math.abs(n.kcal - 503) / 503).toBeLessThan(0.05);
  });

  it('השקדים יצאו מכל ארוחות הצהריים; משקל הצלחת ירד ב-25 ג׳', () => {
    const weights: Record<string, number> = {
      'lunch-1-chicken': 515,
      'lunch-2-roastbeef': 615,
      'lunch-3-mixed': 565,
      'lunch-4-pastrami': 615,
      'lunch-5-tuna-eggs': 589,
    };
    for (const [slug, grams] of Object.entries(weights)) {
      const f = foods.find((x) => x.id === libId(slug))!;
      expect(f.recipe!.items.some((i) => i.foodId === MOH.almonds), slug).toBe(false);
      expect(f.recipe!.finalGrams, slug).toBe(grams);
    }
    // שום מנה לא מכילה אגוז כלשהו.
    const nutMoh = new Set(MOH_COPIES.filter((d) => d.nut).map((d) => d.mohId));
    for (const f of foods) {
      if (f.recipe) expect(f.recipe.items.some((i) => nutMoh.has(i.foodId)), f.name).toBe(false);
    }
  });

  it('תוויות כמות לתצוגה: כלי מטבח וספירה מסומנים, מה ששוקלים לא; הגרמים לא משתנים', () => {
    const labels = (slug: string) => {
      const f = foods.find((x) => x.id === libId(slug))!;
      return f.recipe!.items.map((i) => [resolveFood(index, i.foodId)!.name.split(',')[0], i.u ?? i.grams]);
    };
    expect(labels('lunch-1-chicken')).toEqual([
      ['בשר עוף', 250],
      ['סלט ירקות ישראלי ללא תוספת שמן', 250],
      ['טחינה גולמית', 'כף מפולסת'],
    ]);
    expect(labels('dinner-1-cottage-eggs')).toEqual([
      ['ביצה קשה שלמה', '2 ביצים'],
      ["גבינת קוטג' 5% שומן", 250],
      ['סלט ירקות ישראלי ללא תוספת שמן', 250],
      ['פריכיות אורז', '4 פריכיות'],
      ['טחינה גולמית', 'כף מפולסת'],
    ]);
    expect(labels('dinner-2-shakshuka').map((l) => l[1])).toEqual(['3 ביצים', 200, 100, 'כפית', 200]);
    expect(labels('dinner-3-eggs-cheese').map((l) => l[1])).toEqual(['2 ביצים', 'כף', 150, 250, 150]);
    expect(labels('dinner-4-broccoli-pie').map((l) => l[1])).toEqual(['4 ביצים', 500, 150, 200, 'כף']);
    expect(labels('dinner-5-no-cook').map((l) => l[1])).toEqual([250, 300, '5 פריכיות', 250]);
    // הגרמים במתכון עצמו לא השתנו.
    const eggs = foods.find((x) => x.id === libId('dinner-1-cottage-eggs'))!.recipe!.items[0]!;
    expect(eggs.grams).toBe(100);
    const tahini = foods.find((x) => x.id === libId('lunch-1-chicken'))!.recipe!.items[2]!;
    expect(tahini.grams).toBe(15);
  });

  it('עותקי מאגר (7 אגוזים, קוטג׳, חלבוני ביצה): ערכים זהים למאגר, ההערה נושאת את המזהה', () => {
    expect(MOH_COPIES).toHaveLength(9);
    expect(MOH_COPIES.filter((d) => d.nut).map((d) => d.mohId)).toEqual([
      '42101000', '42116000', '42107000', '42112000', '42111020', '42114000', '42104110',
    ]);
    for (const d of MOH_COPIES) {
      const copy = foods.find((f) => f.id === libId(d.slug))!;
      const src = resolveFood(mohIndex, d.mohId)!;
      expect(copy, d.slug).toBeDefined();
      expect([copy.kcal, copy.protein, copy.carbs, copy.fat, copy.fiber], d.slug).toEqual([src.kcal, src.protein, src.carbs, src.fat, src.fiber]);
      expect(copy.cat, d.slug).toBe(Number(d.mohId[0]));
      expect(copy.note, d.slug).toContain(d.mohId);
      expect(copy.recipe).toBeUndefined();
      expect(copy.unitFood).toBeUndefined();
      expect(copy.portions[0], d.slug).toEqual(d.portion);
    }
    // ל-25 ג': שקדים 144.8 / 5.3, פקאן 172.8 / 2.3.
    const almonds = foods.find((f) => f.id === libId('nut-almonds'))!;
    expect((almonds.kcal * 25) / 100).toBeCloseTo(144.75, 5);
    expect((almonds.protein * 25) / 100).toBeCloseTo(5.275, 5);
  });

  it('כל פריט ברובריקה "התפריט שלי" קיים בספרייה, עם כמות מוגדרת', () => {
    const byId = new Map(foods.map((f) => [f.id, f]));
    const groups = resolveMenu(
      MEAL_MENU,
      (id) => resolveFood(index, id),
      (id) => byId.get(id)?.recipe?.finalGrams ?? null,
    );
    expect(groups.map((g) => g.group.key)).toEqual(['lunch', 'dinner', 'blocks', 'extras']);
    for (const g of groups) expect(g.missing, g.group.key).toBe(0);
    expect(groups.map((g) => g.items.length)).toEqual([5, 5, 6, 10]);
    const lunch1 = groups[0]!.items[0]!;
    expect(lunch1.grams).toBe(515);
    expect(lunch1.kcal).toBeCloseTo(535, 0);
    const pro = groups[2]!.items.find((i) => i.item.slug === 'pro40-yotvata')!;
    expect(pro.grams).toBe(1);
    expect(pro.kcal).toBeCloseTo(195, 5);
    const nuts = groups[3]!.items.filter((i) => i.item.nut);
    expect(nuts).toHaveLength(7);
    for (const n of nuts) expect(n.grams).toBe(25);
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
    expect(dishNutrition('lunch-4-pastrami').kcal / 531 - 1).toBeCloseTo(-0.087, 2);
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
  const filePath = join(ROOT, 'public', 'library', 'meal-library-v2.json');
  const raw = readFileSync(filePath, 'utf8');
  const parsed = JSON.parse(raw) as { v: number; customFoods: CustomFood[] };

  it('הקובץ ב-public/library/ מעודכן מול הסקריפט (דטרמיניסטי)', () => {
    expect(parsed.customFoods).toEqual(foods);
    expect(buildMealLibrary(mohIndex)).toEqual(foods);
  });

  it('parseDb קולט את הקובץ כגיבוי: 27 מזונות, 11 מתכונים, בלי דחיות', () => {
    const r = parseDb(parsed);
    expect(r.counts.customFoods).toBe(27);
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
    expect(once.customFoods).toHaveLength(28);
    expect(twice.customFoods).toEqual(once.customFoods);
    expect(once.customFoods.find((f) => f.id === 'c:mine')).toEqual(mine);
    expect(once.customFoods.find((f) => f.id === stale.id)?.kcal).toBe(foods[0]!.kcal);
    // הרישום הישן לא נגע — ה-ref שלו נשאר עם הערך שהיה בזמן הרישום.
    expect(once.entries).toEqual(existing.entries);
    expect(once.entries[0]?.ref.kcal).toBe(999);
    expect(once.targets).toEqual(existing.targets);
  });
});
