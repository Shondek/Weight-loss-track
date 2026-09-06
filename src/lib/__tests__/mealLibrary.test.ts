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
import { ingredientsLine, resolveMenu } from '../nutrition/menu';
import { libraryFoodId } from '../nutrition/library';

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
  it('נבנים 32 מזונות: 9 ממותגים + 10 עותקי מאגר + 13 מנות, אף אחת בארכיון, כולם עם קידומת הספרייה', () => {
    expect(foods).toHaveLength(32);
    expect(foods.filter((f) => f.recipe)).toHaveLength(13);
    expect(foods.filter((f) => f.archived)).toHaveLength(0);
    expect(foods.every((f) => f.id.startsWith(LIB_PREFIX))).toBe(true);
  });

  it('צ2 רוסטביף וסלט (2.4, חזרה מהארכיון): אותו מזהה, רוסטביף 300 + סלט 250 = 348.5 / 59.0, 550 ג׳', () => {
    const n = dishNutrition('lunch-2-roastbeef');
    expect(n.kcal).toBeCloseTo(306 + 42.5, 1);
    expect(n.protein).toBeCloseTo(57 + 2, 1);
    const f = foods.find((x) => x.id === libId('lunch-2-roastbeef'))!;
    expect(f.archived).toBeUndefined();
    expect(f.name).toBe('צ2 — רוסטביף וסלט');
    expect(f.recipe!.items.map((i) => [i.foodId, i.grams])).toEqual([[libId('roastbeef-hod-maadan'), 300], [MOH.salad, 250]]);
    expect(f.recipe!.finalGrams).toBe(550);
    expect(f.note).toContain('2,400');
  });

  it('2.3: צ3 = מעורב א׳ (שם בלבד השתנה, slug נשאר); צ3ב = מעורב ב׳ ממרכיבים בלבד; בלי שקדים', () => {
    const a = foods.find((x) => x.id === libId('lunch-3-mixed'))!;
    expect(a.name).toBe("צ3 — מעורב א', עוף מוביל");
    expect(a.recipe!.items.map((i) => i.grams)).toEqual([150, 150, 250]);
    const b = foods.find((x) => x.id === libId('lunch-3b-mixed-beef'))!;
    expect(b.name).toBe("צ3ב — מעורב ב', רוסטביף מוביל");
    expect(b.recipe!.items.map((i) => [i.foodId, i.grams])).toEqual([
      [libId('roastbeef-hod-maadan'), 250],
      [MOH.chickenBreast, 100],
      [MOH.salad, 250],
    ]);
    expect(b.recipe!.finalGrams).toBe(600);
    expect(b.archived).toBeUndefined();
    // המתכון מחשב: 250 × 1.02 + 100 × 1.60 + 42.5 = 457.5 · 47.5 + 30.1 + 2 = 79.6
    const n = dishNutrition('lunch-3b-mixed-beef');
    expect(n.kcal).toBeCloseTo(255 + 160 + 42.5, 1);
    expect(n.protein).toBeCloseTo(47.5 + 30.1 + 2, 1);
    // טחינה וסלט מהמאגר, לא מזון תווית.
    expect(resolveFood(mohIndex, MOH.tahini)!.source).toBe('moh');
    expect(resolveFood(mohIndex, MOH.salad)!.source).toBe('moh');
  });

  it('השקדים יצאו מכל ארוחות הצהריים; משקל הצלחת ירד ב-25 ג׳', () => {
    const weights: Record<string, number> = {
      'lunch-1-chicken': 500,
      'lunch-2-roastbeef': 550,
      'lunch-3-mixed': 550,
      'lunch-4-pastrami': 600,
      'lunch-5-tuna-eggs': 574,
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
    ]);
    expect(labels('dinner-1-cottage-eggs')).toEqual([
      ['ביצה קשה שלמה', '2 ביצים'],
      ["גבינת קוטג' 5% שומן", 250],
      ['סלט ירקות ישראלי ללא תוספת שמן', 250],
    ]);
    expect(labels('dinner-2-shakshuka').map((l) => l[1])).toEqual(['3 ביצים', 200, 100, 'כפית', 200]);
    expect(labels('dinner-3-eggs-cheese').map((l) => l[1])).toEqual(['2 ביצים', 'כף', 150, 250, 150]);
    expect(labels('dinner-4-broccoli-pie').map((l) => l[1])).toEqual(['4 ביצים', 500, 150, 200, 'כף']);
    expect(labels('dinner-5-no-cook').map((l) => l[1])).toEqual([250, 300, 250]);
    expect(labels('lunch-6-tuna-cottage').map((l) => l[1])).toEqual(['2 קופסאות', 250]);
    // שורת המרכיבים ברובריקה — הפורמט המדויק שנדרש.
    const line = (slug: string) => ingredientsLine(foods.find((x) => x.id === libId(slug))!.recipe!, (id) => resolveFood(index, id));
    expect(line('lunch-1-chicken')).toBe('חזה עוף 250 · סלט 250');
    expect(line('lunch-2-roastbeef')).toBe('רוסטביף 300 · סלט 250');
    expect(line('dinner-1-cottage-eggs')).toBe("2 ביצים · קוטג' 250 · ירקות 250");
    expect(line('lunch-6-tuna-cottage')).toBe("2 קופסאות · קוטג' 250");
    expect(line('lunch-3-mixed')).toBe('חזה עוף 150 · רוסטביף 150 · סלט 250');
    expect(line('lunch-5-tuna-eggs')).toBe('2 קופסאות · 2 ביצים · סלט 250');
    expect(line('dinner-2-shakshuka')).toBe('3 ביצים · עגבניות 200 · בולגרית 100 · שמן כפית · יוגורט 200');
    expect(line('dinner-3-eggs-cheese')).toBe('2 ביצים · שמן זית כף · בולגרית 150 · ירקות 250 · יוגורט 150');
    expect(line('dinner-4-broccoli-pie')).toBe("4 ביצים · ברוקולי 500 · בולגרית 150 · קוטג' 200 · שמן זית כף");
    expect(line('dinner-5-no-cook')).toBe("קוטג' 250 · יוגורט 300 · ירקות 250");
    // הגרמים במתכון עצמו לא השתנו.
    const eggs = foods.find((x) => x.id === libId('dinner-1-cottage-eggs'))!.recipe!.items[0]!;
    expect(eggs.grams).toBe(100);
    const oil = foods.find((x) => x.id === libId('dinner-3-eggs-cheese'))!.recipe!.items[1]!;
    expect(oil.u).toBe('כף');
    expect(oil.grams).toBe(13.6);
  });

  it('עותקי מאגר (7 אגוזים, קוטג׳, חלבוני ביצה): ערכים זהים למאגר, ההערה נושאת את המזהה', () => {
    expect(MOH_COPIES).toHaveLength(10);
    // 2.4: טחינה — עותק מאגר, כף מפולסת 15 ג׳ = 92.6 / 3.2; לא בשום מנה.
    const tahini = foods.find((f) => f.id === libId('tahini-raw'))!;
    expect(tahini.portions[0]).toEqual({ u: 'כף מפולסת', g: 15 });
    expect((tahini.kcal * 15) / 100).toBeCloseTo(92.55, 5);
    for (const f of foods) if (f.recipe) expect(f.recipe.items.some((i) => i.foodId === MOH.tahini || i.foodId === tahini.id), f.name).toBe(false);
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

  it('צ6 — טונה וקוטג׳ (2.4, בלי פריכיות): 2 קופסאות + גביע = 469.5 / 83.5, משקל 474', () => {
    const n = dishNutrition('lunch-6-tuna-cottage');
    expect(n.kcal).toBeCloseTo(232 + 237.5, 1);
    expect(n.protein).toBeCloseTo(56 + 27.5, 1);
    expect(foods.find((f) => f.id === libId('lunch-6-tuna-cottage'))!.recipe!.finalGrams).toBe(224 + 250);
  });

  it('פריכיות תירס: שני מותגים כיחידה = 1, קלוריות בלבד; מ-2.4 לא בשום מנה; אין פריכית אורז', () => {
    const slim = foods.find((f) => f.id === libId('corn-cake-slim-delis'))!;
    const aus = foods.find((f) => f.id === libId('corn-cake-australian'))!;
    for (const [f, kcal] of [[slim, 31], [aus, 23]] as const) {
      expect(f.unitFood).toBe(true);
      expect(f.kcal).toBe(kcal * 100);
      expect([f.protein, f.carbs, f.fat, f.fiber]).toEqual([0, null, null, null]);
      expect(f.note).toContain('ערכי אריזה חלקיים — קלוריות בלבד מהתווית. לעדכן.');
    }
    // 2.4: הפריכיות לא בשום מנה — תוסף נפרד. אין פריכית אורז בספרייה ולא במנות.
    for (const f of foods) {
      if (f.recipe) expect(f.recipe.items.some((i) => i.foodId === slim.id || i.foodId === aus.id || i.foodId === '54319039'), f.name).toBe(false);
    }
    expect(foods.some((f) => /אורז/.test(f.name))).toBe(false);
    // ע1 אחרי שני התיקונים (בלי פריכיות ובלי טחינה): 434.0 / 42.0, 600 ג׳; ע5: 460.0 / 59.5, 800 ג׳.
    expect(dishNutrition('dinner-1-cottage-eggs').kcal).toBeCloseTo(434.0, 1);
    expect(dishNutrition('dinner-1-cottage-eggs').protein).toBeCloseTo(42.0, 1);
    expect(dishNutrition('dinner-5-no-cook').kcal).toBeCloseTo(460.0, 1);
    expect(foods.find((f) => f.id === libId('dinner-1-cottage-eggs'))!.recipe!.finalGrams).toBe(600);
    expect(foods.find((f) => f.id === libId('dinner-5-no-cook'))!.recipe!.finalGrams).toBe(800);
  });

  it('כל פריט ברובריקה "התפריט שלי" קיים בספרייה, עם כמות מוגדרת', () => {
    const byId = new Map(foods.map((f) => [f.id, f]));
    const groups = resolveMenu(
      MEAL_MENU,
      (id) => resolveFood(index, id),
      (id) => byId.get(id)?.recipe ?? null,
    );
    expect(groups[0]!.items[0]!.ingredients).toBe('חזה עוף 250 · סלט 250');
    expect(groups[2]!.items[0]!.ingredients).toBeNull(); // בלוק — לא מנה
    expect(groups.map((g) => g.group.key)).toEqual(['lunch', 'dinner', 'blocks', 'extras']);
    for (const g of groups) expect(g.missing, g.group.key).toBe(0);
    expect(groups.map((g) => g.items.length)).toEqual([7, 5, 6, 13]);
    expect(groups[0]!.items.map((i) => i.item.slug)).toContain('lunch-2-roastbeef');
    const tahini = groups[3]!.items.find((i) => i.item.slug === 'tahini-raw')!;
    expect(tahini.grams).toBe(15);
    expect(tahini.kcal).toBeCloseTo(92.55, 5);
    // כל ברירת מחדל מצביעה על פריט ספרייה קיים, שאינו מנה.
    for (const g of MEAL_MENU) for (const i of g.items) for (const d of i.defaults ?? []) {
      const food = resolveFood(index, libraryFoodId(d.slug));
      expect(food, `${i.slug} → ${d.slug}`).not.toBeNull();
      expect(food!.isRecipe, d.slug).toBe(false);
    }
    // צ1 + טחינה + שקדים = 442.5 + 92.55 + 144.75 = 679.8 — הטוסט מציג 680.
    expect(groups[0]!.items[0]!.kcal + (92.55 + 144.75)).toBeCloseTo(679.8, 1);
    expect(groups[0]!.items.map((i) => i.item.slug)).toContain('lunch-3b-mixed-beef');
    const corn = groups[3]!.items.filter((i) => i.item.slug.startsWith('corn-cake-'));
    expect(corn.map((i) => [i.grams, Math.round(i.kcal)])).toEqual([[1, 31], [1, 23]]);
    const lunch1 = groups[0]!.items[0]!;
    expect(lunch1.grams).toBe(500);
    expect(lunch1.kcal).toBeCloseTo(442.5, 0);
    const pro = groups[2]!.items.find((i) => i.item.slug === 'pro40-yotvata')!;
    expect(pro.grams).toBe(1);
    expect(pro.kcal).toBeCloseTo(195, 5);
    const nuts = groups[3]!.items.filter((i) => i.item.nut);
    expect(nuts).toHaveLength(7);
    for (const n of nuts) expect(n.grams).toBe(25);
  });

  it("ע1 קוטג' וביצים (2.4, בלי פריכיות ובלי טחינה): 434.0 / 42.0 (אומדן מסמך 450 / 43.9)", () => {
    const n = dishNutrition('dinner-1-cottage-eggs');
    expect(n.kcal).toBeCloseTo(154 + 237.5 + 42.5, 0);
    expect(n.protein).toBeCloseTo(12.5 + 27.5 + 2, 0);
    expect(Math.abs(n.kcal - 450) / 450).toBeLessThan(0.05);
  });

  it('ע5 בלי בישול (2.4, בלי פריכיות): 460.0 / 59.5 (אומדן מסמך 474 / 61.2)', () => {
    const n = dishNutrition('dinner-5-no-cook');
    expect(n.kcal).toBeCloseTo(237.5 + 180 + 42.5, 0);
    expect(n.protein).toBeCloseTo(27.5 + 30 + 2, 0);
    expect(Math.abs(n.kcal - 474) / 474).toBeLessThan(0.05);
  });

  it('הפערים שדווחו נשארים כפי שהם — לא מתוקנים בשקט', () => {
    // הסלט מהמאגר (42.5) מול 56 במסמך, וכדור התמר בלי חלבון — פערים מוכרים.
    expect(dishNutrition('lunch-4-pastrami').kcal / 441 - 1).toBeCloseTo(-0.11, 2);
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

  it('unitFood: הזנת 1 נותנת פיתה / כדור / בקבוק / פריכית שלמים; רק חמשתם מסומנים', () => {
    for (const [slug, kcal, protein] of [['pita-light', 120, 4], ['date-ball', 130, 0], ['pro40-yotvata', 195, 40], ['corn-cake-slim-delis', 31, 0], ['corn-cake-australian', 23, 0]] as const) {
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
    expect(foods.filter((f) => f.unitFood)).toHaveLength(5);
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

  it('parseDb קולט את הקובץ כגיבוי: 32 מזונות, 13 מתכונים, בלי דחיות', () => {
    const r = parseDb(parsed);
    expect(r.counts.customFoods).toBe(32);
    expect(r.db.customFoods.find((f) => f.id === 'c:lib2:lunch-2-roastbeef')?.archived).toBeUndefined();
    expect(r.db.customFoods.filter((f) => f.recipe)).toHaveLength(13);
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
    expect(once.customFoods).toHaveLength(33);
    expect(twice.customFoods).toEqual(once.customFoods);
    expect(once.customFoods.find((f) => f.id === 'c:mine')).toEqual(mine);
    expect(once.customFoods.find((f) => f.id === stale.id)?.kcal).toBe(foods[0]!.kcal);
    // הרישום הישן לא נגע — ה-ref שלו נשאר עם הערך שהיה בזמן הרישום.
    expect(once.entries).toEqual(existing.entries);
    expect(once.entries[0]?.ref.kcal).toBe(999);
    expect(once.targets).toEqual(existing.targets);
  });
});
