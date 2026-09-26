/** שלב 3: פריטים תכופים, כמות, ארוחה לפי שעה, ארוחת שישי, שמירת הזנה ידנית כמזון. */
import { describe, expect, it } from 'vitest';
import type { CustomFood, FoodEntry } from '../../types';
import { ADHOC_FOOD_ID } from '../../types';
import { entryNutrition } from '../nutrition/calc';
import {
  mealForLogging,
  mealForTime,
  newAdhocEntry,
  newEntry,
  normalizeName,
  relogAdhoc,
  tsForDay,
} from '../nutrition/entries';
import { fromCustom } from '../nutrition/foods';
import { frequentItems } from '../nutrition/frequent';
import {
  applyFridayTier,
  fridayEntryName,
  fridayEstimateOn,
  isFriday,
  isFridayEstimate,
  removeFridayEstimate,
} from '../nutrition/friday';
import { adhocOccurrences, canSaveAsFood, customFoodFromAdhoc, hasCustomFoodNamed } from '../nutrition/adhocSave';
import { parseCustomFoods } from '../schema';

const TODAY = '2026-09-25'; // שישי

/** חותמת זמן מקומית ביום נתון. */
function at(d: string, hour: number, minute = 0): number {
  const [y, m, dd] = d.split('-').map(Number) as [number, number, number];
  return new Date(y, m - 1, dd, hour, minute).getTime();
}

const CRACKER: CustomFood = {
  id: 'c:cracker',
  name: 'פריכית תירס',
  cat: null,
  kcal: 3100,
  protein: 70,
  carbs: null,
  fat: null,
  fiber: null,
  portions: [],
  barcode: null,
  unitFood: true,
};

const YOGURT: CustomFood = {
  id: 'c:yogurt',
  name: 'יוגורט',
  cat: null,
  kcal: 60,
  protein: 10,
  carbs: null,
  fat: null,
  fiber: null,
  portions: [],
  barcode: null,
};

function food(id: string, name: string, grams: number, d: string, hour: number, i: number): FoodEntry {
  const f = fromCustom({ ...YOGURT, id, name });
  return newEntry(f, grams, 'lunch', at(d, hour), `u${i}`);
}

function adhoc(name: string, d: string, hour: number, i: number, kcal = 150): FoodEntry {
  return newAdhocEntry({ name, kcal, protein: 20, carbs: null, fat: null }, 'snack', at(d, hour), `a${i}`);
}

describe('1. מה שאני אוכל — דירוג לפי ימים ב-14 יום', () => {
  it('לפי מספר ימים, שוויון לפי אחרון; ידני מקובץ לפי שם מנורמל; מקסימום 8', () => {
    const entries: FoodEntry[] = [
      // מזון a: 3 ימים
      food('c:a', 'A', 100, '2026-09-25', 8, 1),
      food('c:a', 'A', 120, '2026-09-24', 8, 2),
      food('c:a', 'A', 100, '2026-09-24', 12, 3), // אותו יום — לא נספר פעמיים
      food('c:a', 'A', 100, '2026-09-20', 8, 4),
      // ידני "יוגורט פרו" ב-3 ימים בכתיבים שונים
      adhoc('יוגורט פרו  20 גרם', '2026-09-25', 9, 5),
      adhoc(' יוגורט פרו 20 גרם ', '2026-09-23', 9, 6),
      adhoc('יוגורט פרו 20 גרם', '2026-09-22', 9, 7, 160),
      // מזון b: 2 ימים, האחרון מאוחר מ-c
      food('c:b', 'B', 50, '2026-09-25', 20, 8),
      food('c:b', 'B', 50, '2026-09-19', 8, 9),
      // מזון c: 2 ימים
      food('c:c', 'C', 30, '2026-09-25', 10, 10),
      food('c:c', 'C', 30, '2026-09-18', 8, 11),
      // מחוץ לחלון (15 יום אחורה) — לא נספר
      food('c:old', 'OLD', 30, '2026-09-11', 8, 12),
      food('c:old', 'OLD', 30, '2026-09-10', 8, 13),
      // הערכת שישי — לא פריט
      applyFridayTier([], '2026-09-18', 'large', at('2026-09-18', 20), 'f1')[0]!,
    ];
    const items = frequentItems(entries, TODAY);
    // שוויון ב-3 ימים: הידני נרשם ב-09:00 היום, a ב-08:00 — הידני ראשון.
    expect(items.map((x) => [x.key, x.days])).toEqual([
      ['adhoc:יוגורט פרו 20 גרם', 3],
      ['food:c:a', 3],
      ['food:c:b', 2],
      ['food:c:c', 2],
    ]);
    // האחרון שנרשם קובע כמות ו-ref.
    expect(items[1]?.lastGrams).toBe(100);
    expect(items[0]?.ref.kcal).toBe(150 * 100);
    expect(items[0]?.kind).toBe('adhoc');

    // מקסימום 8
    const many: FoodEntry[] = [];
    for (let i = 0; i < 12; i++) many.push(food(`c:x${i}`, `X${i}`, 10, TODAY, 8, 100 + i));
    expect(frequentItems(many, TODAY)).toHaveLength(8);
  });

  it('רישום חוזר של פריט ידני משתמש באותם ערכי ref', () => {
    const src = adhoc('משקה פרו', TODAY, 9, 1, 120);
    const again = relogAdhoc(src.ref, 'משקה פרו', 'dinner', at(TODAY, 20), 'z');
    expect(again.ref).toEqual(src.ref);
    expect(again.adhoc).toBe(true);
    expect(again.foodId).toBe(ADHOC_FOOD_ID);
    expect(entryNutrition(again, null).kcal).toBe(120);
  });
});

describe('2. כמות — מזון-יחידה ×4 = רשומה אחת עם grams=4', () => {
  it('הערכים מוכפלים פי 4, רשומה אחת', () => {
    const e = newEntry(fromCustom(CRACKER), 4, 'snack', at(TODAY, 10), 'q');
    expect(e.grams).toBe(4);
    expect(e.ref.unitFood).toBe(true);
    const n = entryNutrition(e, fromCustom(CRACKER));
    expect(n.kcal).toBe(124);
    expect(n.protein).toBeCloseTo(2.8);
  });
});

describe('3. ארוחה לפי שעת הרישום', () => {
  it('גבולות: 10:59 בוקר · 11:00 צהריים · 15:59 צהריים · 16:00 ביניים · 19:29 ביניים · 19:30 ערב', () => {
    expect(mealForTime(10, 59)).toBe('breakfast');
    expect(mealForTime(11, 0)).toBe('lunch');
    expect(mealForTime(15, 59)).toBe('lunch');
    expect(mealForTime(16, 0)).toBe('snack');
    expect(mealForTime(19, 29)).toBe('snack');
    expect(mealForTime(19, 30)).toBe('dinner');
    expect(mealForTime(23, 59)).toBe('dinner');
    expect(mealForTime(0, 0)).toBe('breakfast');
  });

  it('יום שעבר — ערב, וחותמת הזמן נופלת בתוך אותו יום', () => {
    expect(mealForLogging('2026-09-20', TODAY, new Date(at(TODAY, 8)))).toBe('dinner');
    expect(mealForLogging(TODAY, TODAY, new Date(at(TODAY, 8)))).toBe('breakfast');
    const ts = tsForDay('2026-09-20', TODAY, at(TODAY, 8));
    const e = newAdhocEntry({ name: 'x', kcal: 1, protein: 0, carbs: null, fat: null }, 'dinner', ts, 'p');
    expect(e.d).toBe('2026-09-20');
    expect(tsForDay(TODAY, TODAY, 12345)).toBe(12345);
  });
});

describe('4. ארוחת שישי לפי הערכה', () => {
  it('קביעה → רשומה אחת; החלפה → עדיין אחת עם ערכים חדשים; הסרה', () => {
    let list: FoodEntry[] = [food('c:a', 'A', 100, TODAY, 8, 1)];
    list = applyFridayTier(list, TODAY, 'medium', at(TODAY, 20), 'f1');
    expect(list.filter(isFridayEstimate)).toHaveLength(1);
    let fe = fridayEstimateOn(list, TODAY)!;
    expect(fe.n).toBe(fridayEntryName('medium'));
    expect(fe.meal).toBe('dinner');
    expect(entryNutrition(fe, null)).toMatchObject({ kcal: 700, protein: 45, adhoc: true });

    list = applyFridayTier(list, TODAY, 'large', at(TODAY, 21), 'f2');
    expect(list.filter(isFridayEstimate)).toHaveLength(1);
    fe = fridayEstimateOn(list, TODAY)!;
    expect(entryNutrition(fe, null)).toMatchObject({ kcal: 1400, protein: 65 });
    expect(list).toHaveLength(2); // המזון הרגיל נשאר

    list = removeFridayEstimate(list, TODAY);
    expect(fridayEstimateOn(list, TODAY)).toBeNull();
    expect(list).toHaveLength(1);
  });

  it('רק שישי: הכפתורים מוסתרים בימים אחרים', () => {
    expect(isFriday('2026-09-25')).toBe(true);
    expect(isFriday('2026-09-24')).toBe(false);
    expect(isFriday('2026-09-26')).toBe(false);
  });
});

describe('5. "לשמור כמזון קבוע?"', () => {
  const entries: FoodEntry[] = [adhoc('יוגורט פרו 20 גרם חלבון', '2026-09-24', 9, 1), adhoc('יוגורט  פרו 20 גרם חלבון', '2026-09-20', 9, 2)];

  it('מוצע מ-2 מופעים ב-14 יום (שם מנורמל), לא כשכבר קיים מזון בשם הזה', () => {
    expect(adhocOccurrences(entries, 'יוגורט פרו 20 גרם חלבון', TODAY)).toBe(2);
    expect(adhocOccurrences(entries, 'משהו אחר', TODAY)).toBe(0);
    // מחוץ לחלון לא נספר
    expect(adhocOccurrences(entries, 'יוגורט פרו 20 גרם חלבון', '2026-10-20')).toBe(0);
    expect(hasCustomFoodNamed([{ ...CRACKER, name: ' יוגורט פרו 20 גרם  חלבון ' }], 'יוגורט פרו 20 גרם חלבון')).toBe(true);
    expect(normalizeName('  a   b ')).toBe('a b');
  });

  it('יוצר מזון-יחידה מה-ref האחרון, עובר את הפרסר, והרישומים הישנים לא משתנים', () => {
    const before = JSON.stringify(entries);
    const src = entries[0]!;
    expect(canSaveAsFood(src.ref)).toBe(true);
    const f = customFoodFromAdhoc(src.ref, 'יוגורט פרו 20 גרם חלבון', 'abc');
    expect(f).toMatchObject({ id: 'c:abc', name: 'יוגורט פרו 20 גרם חלבון', unitFood: true, kcal: 15000, protein: 2000 });
    const parsed = parseCustomFoods([f]);
    expect(parsed.rejected).toEqual([]);
    expect(parsed.ok[0]?.unitFood).toBe(true);
    // רישום של יחידה אחת מהמזון החדש נותן בדיוק את ההערכה המקורית.
    const e = newEntry(fromCustom(parsed.ok[0]!), 1, 'snack', at(TODAY, 10), 'n');
    expect(entryNutrition(e, null).kcal).toBe(150);
    expect(JSON.stringify(entries)).toBe(before);
  });

  it('ארוחה גדולה מ-900 קק"ל לא יכולה להישמר כמזון (תקרת הפרסר) — לא מוצע', () => {
    const big = adhoc('מסעדה', TODAY, 20, 9, 1200);
    expect(canSaveAsFood(big.ref)).toBe(false);
  });
});
