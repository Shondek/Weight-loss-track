import { describe, it, expect } from 'vitest';
import { ADHOC_FOOD_ID, UNIT_FOOD_SCALE } from '../../types';
import { parseCustomFoods, parseEntries } from '../schema';
import { daySummary, entryNutrition } from './calc';
import { entryName, MACRO_GAP_WARN, macroKcalGap, newAdhocEntry, newEntry } from './entries';
import { buildFoodIndex, resolveFood, searchFoods } from './index';
import { fromCustom, type Food } from './foods';
import type { CustomFood } from '../../types';

const noon = new Date(2026, 8, 6, 13).getTime();

describe('הזנה ידנית — רישום שה-ref שלו הוזן ביד', () => {
  const burger = newAdhocEntry({ name: ' המבורגר, מסעדה ', kcal: 1150, protein: 48, carbs: 70, fat: 62 }, 'lunch', noon, 'a');

  it('foodId קבוע, יחידה אחת, השם ב-n וב-ref.name; החישוב מחזיר בדיוק מה שהוזן', () => {
    expect(burger.foodId).toBe(ADHOC_FOOD_ID);
    expect(burger.adhoc).toBe(true);
    expect(burger.n).toBe('המבורגר, מסעדה');
    expect(burger.ref.name).toBe('המבורגר, מסעדה');
    expect(burger.grams).toBe(1);
    expect(burger.ref.unitFood).toBe(true);
    expect(burger.ref.kcal).toBe(1150 * UNIT_FOOD_SCALE);
    const n = entryNutrition(burger, null);
    expect([n.kcal, n.protein, n.carbs, n.fat, n.fiber]).toEqual([1150, 48, 70, 62, 0]);
    expect(n.adhoc).toBe(true);
    expect(n.fiberUnknown).toBe(true);
    expect(n.carbsUnknown).toBe(false);
  });

  it('פחמימה ושומן לא חובה — null נשאר null ומסומן "לפחות"', () => {
    const e = newAdhocEntry({ name: 'אירוע', kcal: 800, protein: 40, carbs: null, fat: null }, 'dinner', noon, 'b');
    const n = entryNutrition(e, null);
    expect([n.kcal, n.protein, n.carbs, n.fat]).toEqual([800, 40, 0, 0]);
    expect(n.carbsUnknown && n.fatUnknown).toBe(true);
  });

  it('שורד את הפרסר: 1,150 קק"ל לא נדחות, n ו-adhoc נשמרים', () => {
    const r = parseEntries(JSON.parse(JSON.stringify([burger])));
    expect(r.rejected).toHaveLength(0);
    expect(r.ok[0]).toEqual(burger);
    // בלי הדגל adhoc, אותם ערכים נדחים בתקרת 900 קק"ל — התקרה הרחבה שמורה לרישום ידני בלבד.
    expect(parseEntries([{ ...burger, adhoc: undefined }]).rejected).toHaveLength(1);
    // ומעל תקרת הארוחה גם רישום ידני נדחה.
    const huge = newAdhocEntry({ name: 'x', kcal: 5001, protein: 1, carbs: null, fat: null }, 'lunch', noon, 'z');
    expect(parseEntries([huge]).rejected).toHaveLength(1);
  });

  it('n ו-adhoc לא נזרקים; n מנוקה; adhoc שאינו true נשמט', () => {
    const plain = newEntry(
      { id: '31103000', name: 'ביצה', source: 'moh', kcal: 154, protein: 12.5, carbs: 1, fat: 11, fiber: 0, portions: [], suspect: false, isRecipe: false, unitFood: false, archived: false },
      100, 'breakfast', noon, 'c',
    );
    const r = parseEntries([{ ...plain, n: '  ביצה  קשה ', adhoc: 'yes' }]);
    expect(r.ok[0]!.n).toBe('ביצה קשה');
    expect(r.ok[0]!.adhoc).toBeUndefined();
  });

  it('הסיכום היומי סופר הזנות ידניות בנפרד', () => {
    const egg: Food = { id: '31103000', name: 'ביצה', source: 'moh', kcal: 154, protein: 12.5, carbs: 1, fat: 11, fiber: 0, portions: [], suspect: false, isRecipe: false, unitFood: false, archived: false };
    const entries = [newEntry(egg, 100, 'breakfast', noon - 3600_000, 'd'), burger];
    const s = daySummary(entries, '2026-09-06', (id) => (id === egg.id ? egg : null));
    expect(s.kcal).toBeCloseTo(154 + 1150, 6);
    expect(s.adhocKcal).toBe(1150);
    expect(s.adhocCount).toBe(1);
    expect(s.count).toBe(2);
  });

  it('השם להצגה: n גובר, אחר כך המזון החי, אחר כך ref', () => {
    expect(entryName(burger, 'משהו')).toBe('המבורגר, מסעדה');
    const { n: _n, ...plain } = burger;
    void _n;
    expect(entryName(plain, 'חי')).toBe('חי');
    expect(entryName(plain, null)).toBe('המבורגר, מסעדה');
  });

  it('c:adhoc לא נפתר לאף מזון ולא מופיע בחיפוש', () => {
    const index = buildFoodIndex([], []);
    expect(resolveFood(index, ADHOC_FOOD_ID)).toBeNull();
    expect(searchFoods(index, 'adhoc', 5)).toEqual([]);
  });
});

describe('בדיקת שפיות: מאקרו מול קלוריות — אזהרה בלבד', () => {
  it('רצה רק כששלושת המאקרו מולאו; פער יחסי', () => {
    expect(macroKcalGap(1000, 50, 100, 40)).toBeCloseTo(0.04, 6); // 200+400+360 = 960
    expect(macroKcalGap(500, 50, 100, 40)).toBeCloseTo(0.92, 6);
    expect(macroKcalGap(1000, 50, null, 40)).toBeNull();
    expect(macroKcalGap(1000, 50, 100, null)).toBeNull();
    expect(macroKcalGap(0, 50, 100, 40)).toBeNull();
    expect(MACRO_GAP_WARN).toBe(0.2);
  });
});

describe('ארכוב מזון', () => {
  const food = (id: string, extra: Partial<CustomFood> = {}): CustomFood => ({
    id, name: `מזון ${id}`, cat: null, kcal: 100, protein: 10, carbs: null, fat: null, fiber: null, portions: [], barcode: null, ...extra,
  });

  it('archived שורד את הפרסר רק כ-true', () => {
    const r = parseCustomFoods([food('c:a', { archived: true }), { ...food('c:b'), archived: 'yes' }]);
    expect(r.ok.find((f) => f.id === 'c:a')?.archived).toBe(true);
    expect(r.ok.find((f) => f.id === 'c:b')?.archived).toBeUndefined();
  });

  it('נפתר לפי מזהה (ההיסטוריה מציגה שם), לא מוצע בחיפוש', () => {
    const index = buildFoodIndex([], [food('c:old', { name: 'רוסטביף ישן', archived: true }), food('c:new', { name: 'רוסטביף חדש' })]);
    expect(resolveFood(index, 'c:old')?.archived).toBe(true);
    expect(searchFoods(index, 'רוסטביף', 10).map((f) => f.id)).toEqual(['c:new']);
    expect(fromCustom(food('c:x')).archived).toBe(false);
  });
});
