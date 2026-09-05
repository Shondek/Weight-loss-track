import { describe, it, expect } from 'vitest';
import {
  parseCustomFoods,
  parseEntries,
  parseFavorites,
  parseTargets,
  parseDb,
  MAX_GRAMS,
  MIN_GRAMS,
  MIN_TARGET_KCAL,
  MAX_TARGET_KCAL,
} from '../schema';
import { backupJson } from '../exportText';
import { mergeDb, recordCount, firstDataDate } from '../db';
import { emptyDb, type CustomFood, type DB, type FoodEntry } from '../../types';

const ref = { name: 'שמן זית', kcal: 884, protein: 0, carbs: 0, fat: 100, fiber: 0 };

const entry = (over: Partial<FoodEntry> = {}): FoodEntry => ({
  id: 'e1',
  d: '2026-09-05',
  ts: new Date(2026, 8, 5, 8, 0).getTime(),
  meal: 'breakfast',
  foodId: '82104000',
  grams: 10,
  ref,
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
  portions: [{ u: 'גביע', g: 150 }],
  barcode: null,
  ...over,
});

describe('parseCustomFoods', () => {
  it('מקבל מזון תקין, ממיין לפי שם, ומזהה כפול מתעדכן', () => {
    const r = parseCustomFoods([
      custom({ id: 'c:2', name: 'תפוח' }),
      custom({ id: 'c:1', name: 'אבוקדו' }),
      custom({ id: 'c:1', name: 'אבוקדו', kcal: 160 }),
    ]);
    expect(r.ok.map((f) => f.name)).toEqual(['אבוקדו', 'תפוח']);
    expect(r.ok[0]?.kcal).toBe(160);
    expect(r.rejected).toHaveLength(0);
  });

  it('דוחה מזהה שאינו "c:" — כולל 8 ספרות שנראות כמו המאגר', () => {
    const r = parseCustomFoods([custom({ id: '12345678' }), custom({ id: 'c:' }), custom({ id: '' })]);
    expect(r.ok).toHaveLength(0);
    expect(r.rejected.every((x) => x.reason.includes('c:'))).toBe(true);
  });

  it('דוחה ערכים מחוץ לטווח ל-100 ג׳, ומקבל carbs/fat/fiber כ-null', () => {
    // התקרות גבוהות בכוונה: מזון בקונבנציית "יחידה = 1 ג'" מחזיק ×100 ל-100 ג'.
    const r = parseCustomFoods([
      custom({ kcal: 90_001 }),
      custom({ protein: 10_001 }),
      custom({ fat: -1 }),
      custom({ carbs: null, fat: null, fiber: null }),
      custom({ id: 'c:x', carbs: 10_500 }),
      custom({ id: 'c:unit', kcal: 19_500, protein: 4_000 }),
    ]);
    expect(r.ok).toHaveLength(2);
    expect(r.ok[0]?.carbs).toBeNull();
    expect(r.ok[0]?.fat).toBeNull();
    expect(r.ok[0]?.fiber).toBeNull();
    expect(r.rejected.map((x) => x.reason)).toEqual([
      "קלוריות מחוץ לטווח 0–90000 ל-100 ג'",
      "מאקרו מחוץ לטווח 0–10000 ל-100 ג'",
      "מאקרו מחוץ לטווח 0–10000 ל-100 ג'",
      "מאקרו מחוץ לטווח 0–10000 ל-100 ג'",
    ]);
  });

  it('שם ריק נדחה; שם ארוך נחתך; רווחים מאוחדים', () => {
    expect(parseCustomFoods([custom({ name: '  ' })]).rejected[0]?.reason).toBe('מזון בלי שם');
    const long = parseCustomFoods([custom({ name: 'א'.repeat(200) })]).ok[0];
    expect(long?.name).toHaveLength(120);
    expect(parseCustomFoods([custom({ name: ' לחם   אחיד ' })]).ok[0]?.name).toBe('לחם אחיד');
  });

  it('יחידה שבורה נשמטת בשקט, המזון נשאר', () => {
    const r = parseCustomFoods([
      custom({ portions: [{ u: 'כף', g: 10 }, { u: '', g: 5 }, { u: 'כוס', g: 0 }, { u: 'x', g: -3 }] }),
    ]);
    expect(r.ok[0]?.portions).toEqual([{ u: 'כף', g: 10 }]);
  });

  it('קטגוריה מחוץ ל-1–9 הופכת ל-null; ברקוד ריק ל-null', () => {
    expect(parseCustomFoods([custom({ cat: 12 })]).ok[0]?.cat).toBeNull();
    expect(parseCustomFoods([custom({ barcode: '  ' })]).ok[0]?.barcode).toBeNull();
    expect(parseCustomFoods([custom({ barcode: '7290000000' })]).ok[0]?.barcode).toBe('7290000000');
  });

  it('קלט שאינו מערך מחזיר רשימה ריקה', () => {
    expect(parseCustomFoods(undefined).ok).toEqual([]);
  });
});

describe('parseEntries', () => {
  it('מקבל רישום תקין וממיין לפי זמן', () => {
    const r = parseEntries([entry({ id: 'b', ts: 2000 }), entry({ id: 'a', ts: 1000 })]);
    expect(r.ok.map((e) => e.id)).toEqual(['a', 'b']);
    expect(r.rejected).toHaveLength(0);
  });

  it('`d` שנשמר גובר גם אם ts מצביע על יום אחר', () => {
    // d מוקפא בכתיבה; אם אזור הזמן של המכשיר השתנה מאז, הרישום לא זז.
    const ts = new Date(2026, 8, 6, 0, 10).getTime();
    const r = parseEntries([entry({ d: '2026-09-05', ts })]);
    expect(r.ok[0]?.d).toBe('2026-09-05');
  });

  it('`d` חסר או שבור נגזר מ-ts לפי אזור הזמן המקומי', () => {
    const late = new Date(2026, 8, 5, 23, 50).getTime();
    const early = new Date(2026, 8, 6, 0, 10).getTime();
    const r = parseEntries([
      { ...entry({ id: 'x', ts: late }), d: undefined },
      entry({ id: 'y', ts: early, d: 'nope' }),
    ]);
    expect(r.ok.map((e) => e.d)).toEqual(['2026-09-05', '2026-09-06']);
  });

  it('גם d וגם ts שבורים — נדחה', () => {
    const r = parseEntries([{ ...entry(), d: 'nope', ts: 'abc' }, { ...entry(), d: 'nope', ts: 0 }]);
    expect(r.ok).toHaveLength(0);
    expect(r.rejected.map((x) => x.reason)).toEqual(['תאריך או שעה לא תקינים', 'תאריך או שעה לא תקינים']);
  });

  it('דוחה מזהה מזון שאינו 8 ספרות ואינו c:', () => {
    const r = parseEntries([entry({ foodId: '1234' }), entry({ foodId: 'x:1' }), entry({ id: 'ok', foodId: 'c:z' })]);
    expect(r.ok).toHaveLength(1);
    expect(r.rejected).toHaveLength(2);
  });

  it('כמות מחוץ לטווח נדחית', () => {
    const r = parseEntries([entry({ grams: 0 }), entry({ grams: MAX_GRAMS + 1 }), entry({ id: 'ok', grams: MIN_GRAMS })]);
    expect(r.ok).toHaveLength(1);
    expect(r.rejected[0]?.reason).toBe("כמות מחוץ לטווח 0.1–5000 ג'");
  });

  it('רישום בלי ref או עם ref שבור נדחה — הוא לא היה שורד מחיקת מזון', () => {
    const r = parseEntries([
      { ...entry(), ref: undefined },
      entry({ ref: { ...ref, kcal: 100_000 } }),
      entry({ ref: { ...ref, name: '' } }),
    ]);
    expect(r.ok).toHaveLength(0);
    expect(r.rejected.map((x) => x.reason)).toEqual([
      'רישום בלי ערכי מזון',
      "ערכי מזון: קלוריות מחוץ לטווח 0–90000 ל-100 ג'",
      'ערכי מזון: מזון בלי שם',
    ]);
  });

  it('ref עם carbs/fat/fiber null נשמר כ-null, לא כאפס', () => {
    const r = parseEntries([entry({ ref: { ...ref, carbs: null, fat: null, fiber: null } })]);
    expect(r.ok[0]?.ref.carbs).toBeNull();
    expect(r.ok[0]?.ref.fat).toBeNull();
    expect(r.ok[0]?.ref.fiber).toBeNull();
  });

  it('ארוחה לא מוכרת הופכת לביניים', () => {
    expect(parseEntries([{ ...entry(), meal: 'brunch' }]).ok[0]?.meal).toBe('snack');
  });

  it('הערה: נחתכת ל-200, ריקה לא נשמרת כשדה', () => {
    const r = parseEntries([entry({ note: 'א'.repeat(300) }), entry({ id: 'e2', note: '  ' }), entry({ id: 'e3' })]);
    expect(r.ok[0]?.note).toHaveLength(200);
    expect('note' in (r.ok[1] ?? {})).toBe(false);
    expect('note' in (r.ok[2] ?? {})).toBe(false);
  });

  it('מזהה כפול — האחרון גובר', () => {
    const r = parseEntries([entry({ grams: 10 }), entry({ grams: 20 })]);
    expect(r.ok).toHaveLength(1);
    expect(r.ok[0]?.grams).toBe(20);
  });
});

describe('parseTargets', () => {
  const t = { from: '2026-09-01', kcal: 1800, protein: 150, carbs: 180, fat: 60 };

  it('מקבל יעד תקין וממיין לפי תאריך; אותו תאריך מתעדכן', () => {
    const r = parseTargets([{ ...t, from: '2026-09-08' }, t, { ...t, kcal: 1900 }]);
    expect(r.ok.map((x) => x.from)).toEqual(['2026-09-01', '2026-09-08']);
    expect(r.ok[0]?.kcal).toBe(1900);
  });

  it('הרצפה תופסת אפס שהוקלד בטעות', () => {
    const r = parseTargets([{ ...t, kcal: 0 }, { ...t, kcal: MIN_TARGET_KCAL - 1 }, { ...t, kcal: MAX_TARGET_KCAL + 1 }]);
    expect(r.ok).toHaveLength(0);
    expect(r.rejected[0]?.reason).toBe('יעד קלוריות מחוץ לטווח 800–6000');
  });

  it('מאקרו מחוץ לטווח נדחה', () => {
    const r = parseTargets([{ ...t, protein: 401 }, { ...t, carbs: 801 }, { ...t, fat: -1 }, { ...t, protein: 400, carbs: 800, fat: 800 }]);
    expect(r.ok).toHaveLength(1);
    expect(r.rejected).toHaveLength(3);
  });

  it('תאריך שבור נדחה', () => {
    expect(parseTargets([{ ...t, from: '2026-9-1' }]).rejected[0]?.reason).toBe('תאריך תחילת תוקף לא תקין');
  });
});

describe('parseFavorites', () => {
  it('שומר סדר הוספה; מזון חוזר מעדכן כמות במקומו', () => {
    const r = parseFavorites([
      { foodId: '82104000', grams: 10 },
      { foodId: 'c:a', grams: null },
      { foodId: '82104000', grams: 15 },
    ]);
    expect(r.ok).toEqual([
      { foodId: '82104000', grams: 15 },
      { foodId: 'c:a', grams: null },
    ]);
  });

  it('כמות לא תקינה הופכת ל-null, לא דוחה את המועדף', () => {
    expect(parseFavorites([{ foodId: 'c:a', grams: 0 }]).ok[0]?.grams).toBeNull();
    expect(parseFavorites([{ foodId: 'c:a' }]).ok[0]?.grams).toBeNull();
  });

  it('מזהה שבור נדחה', () => {
    expect(parseFavorites([{ foodId: '12' }, 5]).rejected).toHaveLength(2);
  });
});

describe('גיבוי וייבוא של מפתחות התזונה', () => {
  const full: DB = {
    ...emptyDb(),
    customFoods: [custom()],
    entries: [entry({ foodId: 'c:abc', ref: { ...ref, name: 'יוגורט 5%' } })],
    targets: [{ from: '2026-09-01', kcal: 1800, protein: 150, carbs: 180, fat: 60 }],
    favorites: [{ foodId: 'c:abc', grams: 150 }],
  };

  it('backupJson → parseDb מחזיר את ארבעת המפתחות בדיוק', () => {
    const r = parseDb(JSON.parse(backupJson(full, '2026-09-05T05:00:00.000Z')));
    expect(r.db.customFoods).toEqual(full.customFoods);
    expect(r.db.entries).toEqual(full.entries);
    expect(r.db.targets).toEqual(full.targets);
    expect(r.db.favorites).toEqual(full.favorites);
    expect(r.counts).toMatchObject({ customFoods: 1, entries: 1, targets: 1, favorites: 1 });
    expect(r.rejected).toHaveLength(0);
  });

  it('גיבוי ישן בלי מפתחות תזונה נקלט עם רשימות ריקות', () => {
    const r = parseDb({ v: 2, weights: [{ d: '2026-09-01', w: 80 }] });
    expect(r.db.entries).toEqual([]);
    expect(r.db.customFoods).toEqual([]);
    expect(r.db.targets).toEqual([]);
    expect(r.db.favorites).toEqual([]);
  });

  it('דחיות מדווחות תחת הסעיף הנכון', () => {
    const r = parseDb({ entries: [{ id: 'x' }], targets: [{ from: 'nope' }] });
    expect(r.rejected).toContainEqual({ section: 'רישומי אכילה', reason: 'תאריך או שעה לא תקינים', count: 1 });
    expect(r.rejected).toContainEqual({ section: 'יעדי תזונה', reason: 'תאריך תחילת תוקף לא תקין', count: 1 });
  });

  it('mergeDb: רישומים לפי מזהה, יעדים לפי from, מועדפים לפי מזון, מזונות לפי מזהה — שום דבר לא נמחק', () => {
    const incoming: DB = {
      ...emptyDb(),
      customFoods: [custom({ kcal: 90 }), custom({ id: 'c:new', name: 'אגוזים' })],
      entries: [entry({ id: 'e1', foodId: 'c:abc', grams: 200, ref: { ...ref, name: 'יוגורט 5%' } }), entry({ id: 'e9' })],
      targets: [{ from: '2026-09-01', kcal: 2000, protein: 150, carbs: 180, fat: 60 }, { from: '2026-10-01', kcal: 1700, protein: 150, carbs: 150, fat: 55 }],
      favorites: [{ foodId: 'c:abc', grams: 100 }, { foodId: '82104000', grams: 10 }],
    };
    const m = mergeDb(full, incoming);
    expect(m.customFoods.map((f) => f.id).sort()).toEqual(['c:abc', 'c:new']);
    expect(m.customFoods.find((f) => f.id === 'c:abc')?.kcal).toBe(90);
    expect(m.entries.map((e) => e.id)).toEqual(['e1', 'e9']);
    expect(m.entries[0]?.grams).toBe(200);
    expect(m.targets.map((t) => [t.from, t.kcal])).toEqual([['2026-09-01', 2000], ['2026-10-01', 1700]]);
    expect(m.favorites).toEqual([{ foodId: 'c:abc', grams: 100 }, { foodId: '82104000', grams: 10 }]);
    expect(mergeDb(full, emptyDb())).toEqual(full);
  });

  it('recordCount סופר רישומים ומזונות שלי (שווים גיבוי), לא יעדים ומועדפים', () => {
    expect(recordCount(full)).toBe(2);
    expect(recordCount({ ...emptyDb(), targets: full.targets, favorites: full.favorites })).toBe(0);
  });

  it('firstDataDate רואה רישומי אכילה', () => {
    expect(firstDataDate({ ...emptyDb(), entries: [entry({ d: '2026-08-01' })] })).toBe('2026-08-01');
  });
});
