import { describe, it, expect } from 'vitest';
import { MEAL_HOURS } from '../../data/config';
import { MEAL_MENU, NUT_GRAMS } from '../../data/mealMenu';
import type { Food } from './foods';
import { newEntry } from './entries';
import { libraryFoodId } from './library';
import { menuGroupForHour, menuItemGrams, nutEntriesOn, nutFoodIds, resolveMenu, type MenuGroup } from './menu';

const food = (id: string, extra: Partial<Food> = {}): Food => ({
  id,
  name: id,
  source: 'custom',
  kcal: 200,
  protein: 20,
  carbs: null,
  fat: null,
  fiber: null,
  portions: [],
  suspect: false,
  isRecipe: false,
  unitFood: false,
  ...extra,
});

describe('הקבוצה הפתוחה לפי השעה', () => {
  it('לפני 11 → בלוקים, 11–17 → צהריים, 17–22 → ערב, אחרי 22 → בלוקים', () => {
    expect(menuGroupForHour(0, MEAL_HOURS)).toBe('blocks');
    expect(menuGroupForHour(10, MEAL_HOURS)).toBe('blocks');
    expect(menuGroupForHour(11, MEAL_HOURS)).toBe('lunch');
    expect(menuGroupForHour(16, MEAL_HOURS)).toBe('lunch');
    expect(menuGroupForHour(17, MEAL_HOURS)).toBe('dinner');
    expect(menuGroupForHour(21, MEAL_HOURS)).toBe('dinner');
    expect(menuGroupForHour(22, MEAL_HOURS)).toBe('blocks');
    expect(menuGroupForHour(23, MEAL_HOURS)).toBe('blocks');
  });
});

describe('הגדרת התפריט', () => {
  it('ארבע קבוצות בסדר קבוע, כל ה-slugs ייחודיים, 7 אגוזים ב-25 ג׳', () => {
    expect(MEAL_MENU.map((g) => g.key)).toEqual(['lunch', 'dinner', 'blocks', 'extras']);
    expect(MEAL_MENU.map((g) => g.label)).toEqual(['צהריים', 'ערב', 'בלוקים', 'תוספות']);
    const slugs = MEAL_MENU.flatMap((g) => g.items.map((i) => i.slug));
    expect(new Set(slugs).size).toBe(slugs.length);
    const nuts = MEAL_MENU.flatMap((g) => g.items.filter((i) => i.nut));
    expect(nuts).toHaveLength(7);
    expect(nuts.every((n) => n.grams === NUT_GRAMS)).toBe(true);
    expect(NUT_GRAMS).toBe(25);
    expect(nutFoodIds(MEAL_MENU).size).toBe(7);
    expect(nutFoodIds(MEAL_MENU).has('c:lib2:nut-cashews')).toBe(true);
  });
});

describe('כמות הפריט', () => {
  it('כמות מוגדרת גוברת; מנה בלי כמות = משקל המנה; מזון רגיל בלי כמות = null', () => {
    const plain = food('c:lib2:x');
    const dish = food('c:lib2:d', { isRecipe: true });
    expect(menuItemGrams({ slug: 'x', label: 'x', grams: 112 }, plain, null)).toBe(112);
    expect(menuItemGrams({ slug: 'd', label: 'd' }, dish, 515)).toBe(515);
    expect(menuItemGrams({ slug: 'd', label: 'd', grams: 100 }, dish, 515)).toBe(100);
    expect(menuItemGrams({ slug: 'x', label: 'x' }, plain, null)).toBeNull();
  });
});

describe('resolveMenu', () => {
  const groups: MenuGroup[] = [
    {
      key: 'lunch',
      label: 'צהריים',
      items: [
        { slug: 'dish', label: 'צ1' },
        { slug: 'missing', label: 'אין' },
      ],
    },
    { key: 'extras', label: 'תוספות', items: [{ slug: 'nut', label: 'שקדים', grams: 25, nut: true }] },
  ];
  const foods = new Map<string, Food>([
    [libraryFoodId('dish'), food(libraryFoodId('dish'), { isRecipe: true, kcal: 103.9, protein: 15.6 })],
    [libraryFoodId('nut'), food(libraryFoodId('nut'), { kcal: 579, protein: 21.1 })],
  ]);
  const resolved = resolveMenu(
    groups,
    (id) => foods.get(id) ?? null,
    (id) => (id === libraryFoodId('dish') ? 515 : null),
  );

  it('פריט חסר מדולג ונספר; הערכים לפי הכמות', () => {
    expect(resolved[0]!.items.map((i) => i.item.slug)).toEqual(['dish']);
    expect(resolved[0]!.missing).toBe(1);
    expect(resolved[0]!.items[0]!.grams).toBe(515);
    expect(resolved[0]!.items[0]!.kcal).toBeCloseTo(535.1, 1);
    expect(resolved[1]!.items[0]!.grams).toBe(25);
    expect(resolved[1]!.items[0]!.kcal).toBeCloseTo(144.75, 5);
    expect(resolved[1]!.items[0]!.protein).toBeCloseTo(5.275, 5);
  });

  it('ספרייה שלא נטענה: הכול חסר, בלי שגיאה', () => {
    const empty = resolveMenu(groups, () => null, () => null);
    expect(empty.map((g) => g.items.length)).toEqual([0, 0]);
    expect(empty.map((g) => g.missing)).toEqual([2, 1]);
  });
});

describe('אגוז אחד ביום', () => {
  const nutIds = new Set([libraryFoodId('nut-almonds'), libraryFoodId('nut-cashews')]);
  const almonds = food(libraryFoodId('nut-almonds'));
  const cashews = food(libraryFoodId('nut-cashews'));
  const other = food(libraryFoodId('pita-light'));
  const noon = new Date(2026, 8, 6, 12).getTime();

  it('סופר רק אגוזים, רק באותו יום', () => {
    const entries = [
      newEntry(almonds, 25, 'lunch', noon, 'a'),
      newEntry(other, 1, 'dinner', noon + 1000, 'b'),
      newEntry(cashews, 25, 'snack', noon - 24 * 3600 * 1000, 'c'), // אתמול
    ];
    expect(nutEntriesOn(entries, '2026-09-06', nutIds).map((e) => e.id)).toEqual([entries[0]!.id]);
    expect(nutEntriesOn(entries, '2026-09-05', nutIds)).toHaveLength(1);
    expect(nutEntriesOn([], '2026-09-06', nutIds)).toHaveLength(0);
  });
});
