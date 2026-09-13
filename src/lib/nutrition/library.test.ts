import { describe, it, expect } from 'vitest';
import type { CustomFood } from '../../types';
import { isLibraryFoodId, libraryFoodId, LIB_PREFIX, mergeLibrary } from './library';

const food = (id: string, kcal = 100): CustomFood => ({
  id,
  name: id,
  cat: null,
  kcal,
  protein: 10,
  carbs: null,
  fat: null,
  fiber: null,
  portions: [],
  barcode: null,
});

describe('מזהי ספרייה', () => {
  it('c:lib2:<slug>', () => {
    expect(libraryFoodId('nut-almonds')).toBe('c:lib2:nut-almonds');
    expect(isLibraryFoodId('c:lib2:nut-almonds')).toBe(true);
    expect(isLibraryFoodId(LIB_PREFIX)).toBe(false);
    expect(isLibraryFoodId('c:abc')).toBe(false);
    expect(isLibraryFoodId('42101000')).toBe(false);
  });
});

describe('mergeLibrary — מיזוג בלבד, אידמפוטנטי', () => {
  const mine = food('c:mine', 50);
  const lib = [food('c:lib2:a', 100), food('c:lib2:b', 200)];

  it('ספרייה חדשה: הכול נוסף, המזונות שלי נשארים', () => {
    const r = mergeLibrary([mine], lib);
    expect(r.added).toBe(2);
    expect(r.updated).toBe(0);
    expect(r.unchanged).toBe(0);
    expect(r.list).toHaveLength(3);
    expect(r.list.find((f) => f.id === 'c:mine')).toEqual(mine);
  });

  it('ריצה חוזרת: 0 נוספו, 0 עודכנו, הרשימה זהה', () => {
    const once = mergeLibrary([mine], lib);
    const twice = mergeLibrary(once.list, lib);
    expect(twice.added).toBe(0);
    expect(twice.updated).toBe(0);
    expect(twice.unchanged).toBe(2);
    expect(twice.list).toEqual(once.list);
  });

  it('גרסה ישנה של פריט ספרייה מתעדכנת; מזהה זהה בתוכן שונה = עודכן', () => {
    const stale = { ...food('c:lib2:a', 999), name: 'ישן' };
    const r = mergeLibrary([mine, stale], lib);
    expect(r.added).toBe(1);
    expect(r.updated).toBe(1);
    expect(r.unchanged).toBe(0);
    expect(r.list.find((f) => f.id === 'c:lib2:a')?.kcal).toBe(100);
    expect(r.list).toHaveLength(3);
  });

  it('שינוי בהערה או בדגל יחידה נחשב שינוי; סדר מפתחות לא', () => {
    const a = food('c:lib2:a');
    const { id, name, ...rest } = a;
    const reordered: CustomFood = { ...rest, name, id };
    expect(Object.keys(reordered)).not.toEqual(Object.keys(a));
    expect(mergeLibrary([a], [reordered]).unchanged).toBe(1);
    expect(mergeLibrary([a], [{ ...a, note: 'x' }]).updated).toBe(1);
    expect(mergeLibrary([a], [{ ...a, unitFood: true }]).updated).toBe(1);
    expect(mergeLibrary([a], [{ ...a, recipe: { items: [{ foodId: '1', grams: 1 }], finalGrams: 1 } }]).updated).toBe(1);
  });

  it('לא מוחק דבר: פריט ספרייה שאינו בקובץ החדש נשאר', () => {
    const r = mergeLibrary([food('c:lib2:gone')], lib);
    expect(r.list.map((f) => f.id).sort()).toEqual(['c:lib2:a', 'c:lib2:b', 'c:lib2:gone']);
  });
});
