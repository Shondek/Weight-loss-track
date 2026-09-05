import { describe, it, expect } from 'vitest';
import type { CustomFood, FoodEntry } from '../../types';
import { MEAL_HOURS } from '../../data/config';
import type { MohFood } from '../nutrition/foodDb';
import {
  fromCustom,
  fromMoh,
  isCustomFoodId,
  isMohFoodId,
  makeCustomFoodId,
  refOf,
  removeCustomFood,
  upsertCustomFood,
} from '../nutrition/foods';
import {
  defaultMeal,
  entriesOn,
  groupByMeal,
  makeEntryId,
  newEntry,
  removeEntry,
  setEntryGrams,
  upsertEntry,
} from '../nutrition/entries';
import { removeTarget, targetFor, upsertTarget } from '../nutrition/targets';
import { isFavorite, recentFoods, removeFavorite, upsertFavorite } from '../nutrition/favorites';
import { buildFoodIndex, emptyFoodIndex, resolveFood, searchFoods } from '../nutrition/index';

const moh = (over: Partial<MohFood> = {}): MohFood => ({
  id: '82104000',
  name: 'שמן זית',
  en: 'Oil, olive',
  cat: 8,
  kcal: 884,
  protein: 0,
  carbs: 0,
  fat: 100,
  fiber: 0,
  portions: [{ u: 'כף', g: 10 }],
  ...over,
});

const custom = (over: Partial<CustomFood> = {}): CustomFood => ({
  id: 'c:abc',
  name: 'יוגורט 5%',
  cat: 1,
  kcal: 80,
  protein: 5,
  carbs: 4,
  fat: 5,
  fiber: null,
  portions: [],
  barcode: null,
  ...over,
});

const olive = fromMoh(moh());

describe('מזהי מזון', () => {
  it('שני מרחבים שלא נפגשים', () => {
    expect(isMohFoodId('82104000')).toBe(true);
    expect(isMohFoodId('c:82104000')).toBe(false);
    expect(isCustomFoodId(makeCustomFoodId('uuid-1'))).toBe(true);
    expect(isCustomFoodId('c:')).toBe(false);
    expect(isCustomFoodId('82104000')).toBe(false);
  });
});

describe('fromMoh / fromCustom / refOf', () => {
  it('suspect עובר מהמאגר, ומזון שלי לעולם לא חשוד', () => {
    expect(fromMoh(moh({ suspect: true })).suspect).toBe(true);
    expect(olive.suspect).toBe(false);
    expect(fromCustom(custom()).suspect).toBe(false);
  });

  it('ref מכיל רק ערכי מקור — בלי suspect, בלי מזהה, בלי יחידות', () => {
    expect(refOf(fromMoh(moh({ suspect: true })))).toEqual({
      name: 'שמן זית',
      kcal: 884,
      protein: 0,
      carbs: 0,
      fat: 100,
      fiber: 0,
    });
  });
});

describe('מזונות שלי', () => {
  it('upsert מעדכן ולא מכפיל, ממוין לפי שם; remove מוחק', () => {
    let list = upsertCustomFood([], custom({ id: 'c:2', name: 'תפוח' }));
    list = upsertCustomFood(list, custom({ id: 'c:1', name: 'אבוקדו' }));
    list = upsertCustomFood(list, custom({ id: 'c:1', name: 'אבוקדו', kcal: 160 }));
    expect(list.map((f) => f.name)).toEqual(['אבוקדו', 'תפוח']);
    expect(list[0]?.kcal).toBe(160);
    expect(removeCustomFood(list, 'c:1').map((f) => f.id)).toEqual(['c:2']);
  });
});

describe('רישומים', () => {
  const ts = new Date(2026, 8, 5, 8, 30).getTime();

  it('newEntry מקפיא ref ונוגזר d מקומי; הערה ריקה לא נשמרת', () => {
    const e = newEntry(olive, 10, 'breakfast', ts, 'u1');
    expect(e).toEqual({
      id: makeEntryId(ts, 'u1'),
      d: '2026-09-05',
      ts,
      meal: 'breakfast',
      foodId: '82104000',
      grams: 10,
      ref: { name: 'שמן זית', kcal: 884, protein: 0, carbs: 0, fat: 100, fiber: 0 },
    });
    expect(newEntry(olive, 10, 'snack', ts, 'u2', '  אומדן ').note).toBe('אומדן');
  });

  it('גבול חצות: 23:50 ו-00:10 הם ימים שונים', () => {
    const late = newEntry(olive, 10, 'dinner', new Date(2026, 8, 5, 23, 50).getTime(), 'a');
    const early = newEntry(olive, 10, 'snack', new Date(2026, 8, 6, 0, 10).getTime(), 'b');
    expect(late.d).toBe('2026-09-05');
    expect(early.d).toBe('2026-09-06');
    expect(entriesOn([early, late], '2026-09-05')).toEqual([late]);
    expect(entriesOn([early, late], '2026-09-06')).toEqual([early]);
  });

  it('מזהים ממוינים לפי זמן יצירה גם כמחרוזות', () => {
    const a = makeEntryId(1000, 'z');
    const b = makeEntryId(2000, 'a');
    expect(a < b).toBe(true);
  });

  it('upsert / remove / setEntryGrams לא נוגעים ב-ref', () => {
    const e = newEntry(olive, 10, 'lunch', ts, 'u');
    let list = upsertEntry([], e);
    list = upsertEntry(list, { ...e, grams: 15 });
    expect(list).toHaveLength(1);
    list = setEntryGrams(list, e.id, 20);
    expect(list[0]?.grams).toBe(20);
    expect(list[0]?.ref).toEqual(e.ref);
    expect(removeEntry(list, e.id)).toEqual([]);
  });

  it('groupByMeal בסדר בוקר/צהריים/ערב/ביניים, בלי ארוחות ריקות', () => {
    const mk = (meal: FoodEntry['meal'], h: number) =>
      newEntry(olive, 10, meal, new Date(2026, 8, 5, h).getTime(), meal + h);
    const groups = groupByMeal([mk('snack', 22), mk('breakfast', 8), mk('snack', 16), mk('dinner', 19)]);
    expect(groups.map((g) => [g.meal, g.entries.length])).toEqual([
      ['breakfast', 1],
      ['dinner', 1],
      ['snack', 2],
    ]);
    expect(groups[2]?.entries.map((e) => new Date(e.ts).getHours())).toEqual([16, 22]);
  });

  it('defaultMeal לפי שעה', () => {
    expect(defaultMeal(7, MEAL_HOURS)).toBe('breakfast');
    expect(defaultMeal(13, MEAL_HOURS)).toBe('lunch');
    expect(defaultMeal(19, MEAL_HOURS)).toBe('dinner');
    expect(defaultMeal(23, MEAL_HOURS)).toBe('snack');
  });
});

describe('יעדים', () => {
  const t1 = { from: '2026-09-01', kcal: 1800, protein: 150, carbs: 180, fat: 60 };
  const t2 = { from: '2026-09-15', kcal: 1700, protein: 150, carbs: 160, fat: 55 };

  it('targetFor מחזיר את היעד שבתוקף, null לפני הראשון', () => {
    const list = upsertTarget(upsertTarget([], t2), t1);
    expect(targetFor(list, '2026-08-31')).toBeNull();
    expect(targetFor(list, '2026-09-01')).toEqual(t1);
    expect(targetFor(list, '2026-09-14')).toEqual(t1);
    expect(targetFor(list, '2026-09-15')).toEqual(t2);
    expect(targetFor(list, '2027-01-01')).toEqual(t2);
  });

  it('אותו from מתעדכן, לא מוכפל; remove מוחק שכבה', () => {
    let list = upsertTarget([t1], { ...t1, kcal: 1900 });
    expect(list).toHaveLength(1);
    expect(list[0]?.kcal).toBe(1900);
    list = upsertTarget(list, t2);
    expect(removeTarget(list, '2026-09-15')).toEqual([{ ...t1, kcal: 1900 }]);
  });
});

describe('מועדפים ואחרונים', () => {
  it('upsert שומר מקום, remove מוחק, isFavorite', () => {
    let list = upsertFavorite([], { foodId: 'c:a', grams: 100 });
    list = upsertFavorite(list, { foodId: '82104000', grams: 10 });
    list = upsertFavorite(list, { foodId: 'c:a', grams: 150 });
    expect(list).toEqual([
      { foodId: 'c:a', grams: 150 },
      { foodId: '82104000', grams: 10 },
    ]);
    expect(isFavorite(list, 'c:a')).toBe(true);
    expect(removeFavorite(list, 'c:a')).toEqual([{ foodId: '82104000', grams: 10 }]);
  });

  it('recentFoods: מהחדש לישן, בלי כפילויות, בלי מועדפים, עם הכמות האחרונה', () => {
    const e = (id: string, foodId: string, grams: number, ts: number): FoodEntry => ({
      id,
      d: '2026-09-05',
      ts,
      meal: 'snack',
      foodId,
      grams,
      ref: { name: 'x', kcal: 1, protein: 0, carbs: null, fat: 0, fiber: null },
    });
    const entries = [e('1', 'A', 10, 1), e('2', 'B', 20, 2), e('3', 'A', 30, 3), e('4', 'C', 40, 4)];
    expect(recentFoods(entries, [], 10)).toEqual([
      { foodId: 'C', grams: 40 },
      { foodId: 'A', grams: 30 },
      { foodId: 'B', grams: 20 },
    ]);
    expect(recentFoods(entries, [{ foodId: 'A', grams: null }], 1)).toEqual([{ foodId: 'C', grams: 40 }]);
  });
});

describe('אינדקס מזונות', () => {
  const index = buildFoodIndex(
    [
      moh(),
      moh({ id: '52401009', name: 'לחם אחיד, כהה, פרוס', en: 'Bread, semi-whole wheat' }),
      moh({ id: '11111009', name: 'חלב 3% שומן, תנובה', en: 'Milk, cow, 3% fat' }),
      moh({ id: '11111010', name: 'שוקו חלב 3%', en: null }),
    ],
    [custom({ id: 'c:x', name: 'לחם שלי' })],
  );

  it('resolveFood מוצא מזון מהמאגר ומזון שלי, null לחסר', () => {
    expect(resolveFood(index, '82104000')?.name).toBe('שמן זית');
    expect(resolveFood(index, 'c:x')?.source).toBe('custom');
    expect(resolveFood(index, 'c:gone')).toBeNull();
    expect(resolveFood(emptyFoodIndex(), '82104000')).toBeNull();
  });

  it('חיפוש: כל המילים, בכל סדר, בעברית ובאנגלית, לא תלוי רישיות ופסיקים', () => {
    expect(searchFoods(index, 'לחם', 10).map((f) => f.name)).toEqual(['לחם שלי', 'לחם אחיד, כהה, פרוס']);
    expect(searchFoods(index, 'פרוס לחם', 10).map((f) => f.id)).toEqual(['52401009']);
    expect(searchFoods(index, 'BREAD wheat', 10).map((f) => f.id)).toEqual(['52401009']);
    expect(searchFoods(index, 'לחם לבן', 10)).toEqual([]);
  });

  it('דירוג: התאמה בתחילת השם לפני התאמה באמצע; קצר לפני ארוך', () => {
    expect(searchFoods(index, 'חלב', 10).map((f) => f.id)).toEqual(['11111009', '11111010']);
  });

  it('שאילתה ריקה — כלום; limit נאכף', () => {
    expect(searchFoods(index, '  ', 10)).toEqual([]);
    expect(searchFoods(index, 'ל', 1)).toHaveLength(1);
  });
});
