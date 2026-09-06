import { describe, it, expect } from 'vitest';
import { MEAL_HOURS } from '../../data/config';
import { MEAL_MENU, NUT_GRAMS } from '../../data/mealMenu';
import type { Food } from './foods';
import { newEntry } from './entries';
import { libraryFoodId } from './library';
import {
  addonFoodIds,
  dishLoggedOn,
  expectedAddonCount,
  ingredientText,
  menuGroupForHour,
  menuItemGrams,
  nutEntriesOn,
  nutFoodIds,
  resolveMenu,
  type MenuGroup,
} from './menu';
import { daySummary } from './calc';

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
  archived: false,
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
    (id) => (id === libraryFoodId('dish') ? { items: [{ foodId: '24122120', grams: 250, n: 'חזה עוף' }, { foodId: '43103119', grams: 15, u: 'כף מפולסת', n: 'טחינה' }], finalGrams: 515 } : null),
  );

  it('פריט חסר מדולג ונספר; הערכים לפי הכמות', () => {
    expect(resolved[0]!.items.map((i) => i.item.slug)).toEqual(['dish']);
    expect(resolved[0]!.missing).toBe(1);
    expect(resolved[0]!.items[0]!.grams).toBe(515);
    expect(resolved[0]!.items[0]!.ingredients).toBe('חזה עוף 250 · טחינה כף מפולסת');
    expect(resolved[1]!.items[0]!.ingredients).toBeNull();
    expect(resolved[0]!.items[0]!.kcal).toBeCloseTo(535.1, 1);
    expect(resolved[1]!.items[0]!.grams).toBe(25);
    expect(resolved[1]!.items[0]!.kcal).toBeCloseTo(144.75, 5);
    expect(resolved[1]!.items[0]!.protein).toBeCloseTo(5.275, 5);
  });

  it('פריט בארכיון לא מוצע ברובריקה, גם אם מוגדר בתפריט', () => {
    const archived = resolveMenu(
      groups,
      (id) => (id === libraryFoodId('nut') ? food(id, { archived: true }) : (foods.get(id) ?? null)),
      () => null,
    );
    expect(archived[1]!.items).toHaveLength(0);
    expect(archived[1]!.missing).toBe(1);
  });

  it('ספרייה שלא נטענה: הכול חסר, בלי שגיאה', () => {
    const empty = resolveMenu(groups, () => null, () => null);
    expect(empty.map((g) => g.items.length)).toEqual([0, 0]);
    expect(empty.map((g) => g.missing)).toEqual([2, 1]);
  });
});

describe('ingredientText — הכלל: כלי מטבח = יחידה, ספירה = התווית, שקילה = גרמים', () => {
  it('שם קצר + יחידה / שם קצר + גרמים / תווית ספירה לבדה / שם המזון + גרמים', () => {
    expect(ingredientText({ foodId: '1', grams: 15, u: 'כף מפולסת', n: 'טחינה' }, 'טחינה גולמית, שומשום מלא')).toBe('טחינה כף מפולסת');
    expect(ingredientText({ foodId: '1', grams: 250, n: 'חזה עוף' }, 'בשר עוף, חזה')).toBe('חזה עוף 250');
    expect(ingredientText({ foodId: '1', grams: 100, u: '2 ביצים' }, 'ביצה קשה שלמה')).toBe('2 ביצים');
    expect(ingredientText({ foodId: '1', grams: 13.6 }, 'שמן זית')).toBe('שמן זית 13.6');
    expect(ingredientText({ foodId: '1', grams: 37.04 }, 'פריכיות')).toBe('פריכיות 37');
  });
});

describe('ברירות מחדל ותוספים (2.5)', () => {
  const byLabel = Object.fromEntries(MEAL_MENU.flatMap((g) => g.items.map((i) => [i.slug, i])));
  const noon = new Date(2026, 8, 6, 13).getTime();
  const f = (slug: string, extra: Partial<Food> = {}) => food(libraryFoodId(slug), extra);

  it('הטבלה: צהריים = טחינה + שקדים; צ6 = 3 פריכיות; ע1 = טחינה + 4; ע4 = 3 + יוגורט 100; ע5 = 5; ע2, ע3, קפה — אין', () => {
    const d = (slug: string) => byLabel[slug]!.defaults?.map((x) => `${x.slug}:${x.grams}`) ?? [];
    for (const s of ['lunch-1-chicken', 'lunch-2-roastbeef', 'lunch-3-mixed', 'lunch-3b-mixed-beef', 'lunch-4-pastrami', 'lunch-5-tuna-eggs']) {
      expect(d(s), s).toEqual(['tahini-raw:15', 'nut-almonds:25']);
    }
    expect(d('lunch-6-tuna-cottage')).toEqual(['corn-cake-slim-delis:3']);
    expect(d('dinner-1-cottage-eggs')).toEqual(['tahini-raw:15', 'corn-cake-slim-delis:4']);
    expect(d('dinner-4-broccoli-pie')).toEqual(['corn-cake-slim-delis:3', 'greek-yogurt-0:100']);
    expect(d('dinner-5-no-cook')).toEqual(['corn-cake-slim-delis:5']);
    for (const s of ['dinner-2-shakshuka', 'dinner-3-eggs-cheese', 'coffee-milk']) expect(d(s), s).toEqual([]);
    // ברירת המחדל: שקדים וסלים דליס בלבד; אוסטרלית ואגוזים אחרים — ידני.
    const all = MEAL_MENU.flatMap((g) => g.items.flatMap((i) => i.defaults ?? []));
    expect(new Set(all.map((x) => x.slug))).toEqual(new Set(['tahini-raw', 'nut-almonds', 'corn-cake-slim-delis', 'greek-yogurt-0']));
  });

  it('תוספים נספרים: 7 אגוזים, טחינה, שתי הפריכיות. לא פיתה, כדור תמר, קפה, יוגורט', () => {
    const ids = addonFoodIds(MEAL_MENU);
    expect(ids.size).toBe(10);
    expect(ids.has(libraryFoodId('tahini-raw'))).toBe(true);
    expect(ids.has(libraryFoodId('corn-cake-australian'))).toBe(true);
    expect(ids.has(libraryFoodId('pita-light'))).toBe(false);
    expect(ids.has(libraryFoodId('greek-yogurt-0'))).toBe(false);
  });

  it('צפויים = ברירות המחדל הנספרות של המנות שנרשמו היום, פעם אחת לכל מנה; מנה בלי תוספים = 0', () => {
    const e = (slug: string, unique: string) => newEntry(f(slug), 100, 'lunch', noon, unique);
    expect(expectedAddonCount([], '2026-09-06', MEAL_MENU)).toBe(0);
    expect(expectedAddonCount([e('lunch-1-chicken', 'a')], '2026-09-06', MEAL_MENU)).toBe(2);
    // לחיצה שנייה על אותה מנה לא מגדילה את הצפוי.
    expect(expectedAddonCount([e('lunch-1-chicken', 'a'), e('lunch-1-chicken', 'b')], '2026-09-06', MEAL_MENU)).toBe(2);
    expect(expectedAddonCount([e('lunch-1-chicken', 'a'), e('dinner-1-cottage-eggs', 'c')], '2026-09-06', MEAL_MENU)).toBe(4);
    // ע4: יוגורט 100 הוא ברירת מחדל אבל לא "תוסף" נספר — צפוי 1 (הפריכיות).
    expect(expectedAddonCount([e('dinner-4-broccoli-pie', 'd')], '2026-09-06', MEAL_MENU)).toBe(1);
    expect(expectedAddonCount([e('dinner-2-shakshuka', 'e')], '2026-09-06', MEAL_MENU)).toBe(0);
    // יום אחר לא נספר.
    expect(expectedAddonCount([e('lunch-1-chicken', 'a')], '2026-09-07', MEAL_MENU)).toBe(0);
  });

  it('daySummary סופר תוספים שנרשמו וקלוריות שלהם', () => {
    const tahini = f('tahini-raw', { kcal: 617, protein: 21.4 });
    const dish = f('lunch-1-chicken', { kcal: 88.5, protein: 15.5 });
    const entries = [newEntry(dish, 500, 'lunch', noon, 'a'), newEntry(tahini, 15, 'lunch', noon, 'b')];
    const s = daySummary(entries, '2026-09-06', () => null, addonFoodIds(MEAL_MENU));
    expect(s.addonCount).toBe(1);
    expect(s.addonKcal).toBeCloseTo(92.55, 5);
    expect(s.count).toBe(2);
    // בלי רשימת תוספים — 0, תאימות לאחור.
    expect(daySummary(entries, '2026-09-06', () => null).addonCount).toBe(0);
  });

  it('dishLoggedOn: המנה נרשמה היום — ברירות המחדל לא נוצרות שוב', () => {
    const e = newEntry(f('lunch-1-chicken'), 500, 'lunch', noon, 'a');
    expect(dishLoggedOn([e], '2026-09-06', libraryFoodId('lunch-1-chicken'))).toBe(true);
    expect(dishLoggedOn([e], '2026-09-07', libraryFoodId('lunch-1-chicken'))).toBe(false);
    expect(dishLoggedOn([e], '2026-09-06', libraryFoodId('lunch-2-roastbeef'))).toBe(false);
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
