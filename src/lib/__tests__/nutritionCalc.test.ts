import { describe, it, expect } from 'vitest';
import type { FoodEntry, NutritionTarget, WeightEntry } from '../../types';
import { fromMoh, type Food } from '../nutrition/foods';
import { newEntry } from '../nutrition/entries';
import { targetFor } from '../nutrition/targets';
import {
  daySummary,
  effectiveTarget,
  entryNutrition,
  proteinPerKg,
  remaining,
  sourceOf,
  WEIGHT_MAX_AGE_DAYS,
  ZERO,
} from '../nutrition/calc';
import { fiberText, kcalText, macroText, perKgText } from '../nutrition/display';

// ערכים אמיתיים מהמאגר, ל-100 גרם.
const olive: Food = fromMoh({
  id: '82104000', name: 'שמן זית', en: 'Oil, olive', cat: 8,
  kcal: 884, protein: 0, carbs: 0, fat: 100, fiber: 0, portions: [],
});
const bread: Food = fromMoh({
  id: '52401009', name: 'לחם אחיד, כהה, פרוס', en: null, cat: 5,
  kcal: 237, protein: 8.9, carbs: 47, fat: 1.5, fiber: 4, portions: [],
});
const milk: Food = fromMoh({
  id: '11111009', name: 'חלב 3% שומן', en: null, cat: 1,
  kcal: 60, protein: 3.3, carbs: 4.6, fat: 3, fiber: 0, portions: [],
});
/** דג — במאגר הפחמימה חסרה (null), כמו בארבעת המזונות האמיתיים. */
const fish: Food = fromMoh({
  id: '26102188', name: 'דג דניס, מבושל', en: null, cat: 2,
  kcal: 128, protein: 24, carbs: null, fat: 3.5, fiber: 0, portions: [],
});
/** מזון שהסיבים בו לא ידועים (387 כאלה במאגר). */
const cheese: Food = fromMoh({
  id: '11412289', name: 'גבינה', en: null, cat: 1,
  kcal: 250, protein: 20, carbs: 2, fat: 18, fiber: null, portions: [],
});

const foods = new Map<string, Food>([olive, bread, milk, fish, cheese].map((f) => [f.id, f]));
const resolve = (id: string) => foods.get(id) ?? null;

const at = (y: number, m: number, d: number, h: number, min = 0) => new Date(y, m - 1, d, h, min).getTime();
let seq = 0;
const log = (food: Food, grams: number, ts: number, meal: FoodEntry['meal'] = 'snack') =>
  newEntry(food, grams, meal, ts, String(seq++));

const target: NutritionTarget = { from: '2026-09-01', kcal: 1800, protein: 150, carbs: 180, fat: 60 };

describe('entryNutrition — רישום בודד', () => {
  it('ערך ל-100 ג׳ × גרמים / 100, בדיוק מלא, קלוריות מהמאגר ולא מהמאקרו', () => {
    const e = log(bread, 30, at(2026, 9, 5, 8));
    const n = entryNutrition(e, bread);
    expect(n.kcal).toBeCloseTo(71.1, 10);
    expect(n.protein).toBeCloseTo(2.67, 10);
    expect(n.carbs).toBeCloseTo(14.1, 10);
    expect(n.fat).toBeCloseTo(0.45, 10);
    expect(n.fiber).toBeCloseTo(1.2, 10);
    // 4P + 4C + 9F = 71.13 ≠ 71.1 — לא נגזר, נלקח מהמאגר.
    expect(n.kcal).not.toBeCloseTo(4 * 2.67 + 4 * 14.1 + 9 * 0.45, 3);
    expect(n).toMatchObject({ fromRef: false, carbsUnknown: false, fiberUnknown: false });
  });

  it('לא מעוגל בשכבת החישוב', () => {
    const n = entryNutrition(log(olive, 7, at(2026, 9, 5, 8)), olive);
    expect(n.kcal).toBeCloseTo(61.88, 10);
    expect(n.fat).toBeCloseTo(7, 10);
  });

  it('המזון החי גובר על ref; בלי מזון חי — ref, ומסומן', () => {
    const e = log(bread, 100, at(2026, 9, 5, 8));
    const updated: Food = { ...bread, kcal: 250 };
    expect(entryNutrition(e, updated).kcal).toBe(250);
    expect(entryNutrition(e, updated).fromRef).toBe(false);
    const gone = entryNutrition(e, null);
    expect(gone.kcal).toBe(237);
    expect(gone.fromRef).toBe(true);
    expect(sourceOf(e, null).ref.name).toBe('לחם אחיד, כהה, פרוס');
  });

  it('פחמימה null: נספרת כאפס ומסומנת', () => {
    const n = entryNutrition(log(fish, 150, at(2026, 9, 5, 13)), fish);
    expect(n.carbs).toBe(0);
    expect(n.carbsUnknown).toBe(true);
    expect(n.kcal).toBeCloseTo(192, 10);
    expect(n.protein).toBeCloseTo(36, 10);
  });

  it('סיבים null: נספרים כאפס ומסומנים', () => {
    const n = entryNutrition(log(cheese, 50, at(2026, 9, 5, 8)), cheese);
    expect(n.fiber).toBe(0);
    expect(n.fiberUnknown).toBe(true);
    expect(n.fatUnknown).toBe(false);
    expect(n.carbs).toBeCloseTo(1, 10);
  });

  it('שומן null (תווית חלקית): נספר כאפס ומסומן; הקלוריות מהתווית לא משתנות', () => {
    const roastbeef: Food = { ...bread, id: 'c:rb', name: 'רוסטביף', source: 'custom', kcal: 102, protein: 19, carbs: null, fat: null, fiber: null };
    const n = entryNutrition(log(roastbeef, 350, at(2026, 9, 5, 14)), roastbeef);
    expect(n.kcal).toBeCloseTo(357, 10);
    expect(n.fat).toBe(0);
    expect(n.fatUnknown).toBe(true);
    expect(n.carbsUnknown).toBe(true);
  });
});

describe('daySummary', () => {
  it('יום ריק — אפסים, count 0, fiberUnknownGrams 0', () => {
    expect(daySummary([], '2026-09-05', resolve)).toEqual({ ...ZERO, d: '2026-09-05', count: 0, carbsUnknownGrams: 0, fatUnknownGrams: 0, fiberUnknownGrams: 0 });
    const other = log(bread, 30, at(2026, 9, 4, 8));
    expect(daySummary([other], '2026-09-05', resolve).count).toBe(0);
  });

  it('יום מרובה רישומים — סכום מדויק, רק של אותו יום', () => {
    const entries = [
      log(bread, 60, at(2026, 9, 5, 8), 'breakfast'),
      log(milk, 240, at(2026, 9, 5, 8, 5), 'breakfast'),
      log(olive, 10, at(2026, 9, 5, 13), 'lunch'),
      log(bread, 30, at(2026, 9, 6, 8)), // מחר
    ];
    const s = daySummary(entries, '2026-09-05', resolve);
    expect(s.count).toBe(3);
    expect(s.kcal).toBeCloseTo(142.2 + 144 + 88.4, 10);
    expect(s.protein).toBeCloseTo(5.34 + 7.92, 10);
    expect(s.carbs).toBeCloseTo(28.2 + 11.04, 10);
    expect(s.fat).toBeCloseTo(0.9 + 7.2 + 10, 10);
    expect(s.fiber).toBeCloseTo(2.4, 10);
    expect(s.fiberUnknownGrams).toBe(0);
  });

  it('יום מעורב: מזון עם סיבים ידועים ומזון בלי — הסכום הוא חסם תחתון', () => {
    const entries = [
      log(bread, 60, at(2026, 9, 5, 8)),   // 2.4 ג' סיבים
      log(cheese, 50, at(2026, 9, 5, 8)),  // סיבים לא ידועים
      log(cheese, 30, at(2026, 9, 5, 19)), // סיבים לא ידועים
      log(fish, 150, at(2026, 9, 5, 13)),  // פחמימה לא ידועה, סיבים 0 ידועים
    ];
    const s = daySummary(entries, '2026-09-05', resolve);
    expect(s.fiber).toBeCloseTo(2.4, 10);
    expect(s.fiberUnknownGrams).toBe(80);
    expect(s.fatUnknownGrams).toBe(0);
    expect(s.carbsUnknownGrams).toBe(150); // הדג
    expect(s.carbs).toBeCloseTo(28.2 + 1 + 0.6, 10);
    expect(s.kcal).toBeCloseTo(142.2 + 125 + 75 + 192, 10);
    expect(s.count).toBe(4);
  });

  it('יום עם רוסטביף (שומן לא ידוע) ולחם: fat הוא חסם תחתון, fatUnknownGrams = גרמי הרוסטביף', () => {
    const roastbeef: Food = { ...bread, id: 'c:rb', name: 'רוסטביף', source: 'custom', kcal: 102, protein: 19, carbs: null, fat: null, fiber: null };
    const entries = [log(roastbeef, 350, at(2026, 9, 5, 14)), log(bread, 60, at(2026, 9, 5, 20))];
    const s = daySummary(entries, '2026-09-05', (id) => (id === 'c:rb' ? roastbeef : resolve(id)));
    expect(s.fat).toBeCloseTo(0.9, 10);
    expect(s.fatUnknownGrams).toBe(350);
    expect(s.carbsUnknownGrams).toBe(350);
    expect(s.kcal).toBeCloseTo(357 + 142.2, 10);
  });

  it('מזון שנעלם מהמאגר נספר מ-ref ולא נופל', () => {
    const e = log(bread, 100, at(2026, 9, 5, 8));
    const s = daySummary([e], '2026-09-05', () => null);
    expect(s.kcal).toBe(237);
    expect(s.count).toBe(1);
  });

  it('גבול אזור זמן: 23:50 ו-00:10 נופלים לימים שונים', () => {
    const late = log(bread, 30, at(2026, 9, 5, 23, 50));
    const early = log(bread, 30, at(2026, 9, 6, 0, 10));
    expect(daySummary([late, early], '2026-09-05', resolve)).toMatchObject({ count: 1, kcal: 71.1 });
    expect(daySummary([late, early], '2026-09-06', resolve)).toMatchObject({ count: 1, kcal: 71.1 });
  });

  it('ליל מעבר שעון (Asia/Jerusalem) לא מזיז רישום ליום שכן', () => {
    // 27/03/2026 02:00 → 03:00. רישום ב-23:50 לפני ואחרי.
    const before = log(bread, 30, at(2026, 3, 26, 23, 50));
    const after = log(bread, 30, at(2026, 3, 27, 23, 50));
    expect(before.d).toBe('2026-03-26');
    expect(after.d).toBe('2026-03-27');
    expect(daySummary([before, after], '2026-03-27', resolve).count).toBe(1);
  });
});

describe('remaining', () => {
  it('יעד פחות נצרך; בלי יעד — null', () => {
    const consumed = { kcal: 1200.5, protein: 90.25, carbs: 100, fat: 40, fiber: 10 };
    expect(remaining(target, consumed)).toEqual({ kcal: 599.5, protein: 59.75, carbs: 80, fat: 20 });
    expect(remaining(null, consumed)).toBeNull();
  });

  it('חריגה מהיעד — שלילי, לא מעוגל לאפס', () => {
    const consumed = { kcal: 2100, protein: 170, carbs: 150, fat: 75, fiber: 0 };
    expect(remaining(target, consumed)).toEqual({ kcal: -300, protein: -20, carbs: 30, fat: -15 });
  });

  it('יום ריק — הנותר הוא היעד כולו', () => {
    const s = daySummary([], '2026-09-05', resolve);
    expect(remaining(target, s)).toEqual({ kcal: 1800, protein: 150, carbs: 180, fat: 60 });
  });
});

describe('שינוי יעד באמצע התקופה', () => {
  const targets: NutritionTarget[] = [target, { from: '2026-09-10', kcal: 1600, protein: 160, carbs: 140, fat: 55 }];
  const same = (d: string) => daySummary([log(bread, 200, new Date(`${d}T12:00`).getTime())], d, resolve);

  it('אותה אכילה, נותר שונה לפני ואחרי — הסיכום הישן נשאר נכון', () => {
    expect(remaining(targetFor(targets, '2026-09-09'), same('2026-09-09'))?.kcal).toBeCloseTo(1800 - 474, 10);
    expect(remaining(targetFor(targets, '2026-09-10'), same('2026-09-10'))?.kcal).toBeCloseTo(1600 - 474, 10);
    expect(remaining(targetFor(targets, '2026-08-31'), same('2026-08-31'))).toBeNull();
  });
});

describe('effectiveTarget — נקודת החיבור לאימונים', () => {
  it('בלי אימון — אותו אובייקט; עם קלוריות אימון — רק הקלוריות גדלות', () => {
    expect(effectiveTarget(target)).toBe(target);
    expect(effectiveTarget(target, 0)).toBe(target);
    expect(effectiveTarget(target, 300)).toEqual({ ...target, kcal: 2100 });
  });
});

describe('proteinPerKg — לפי השקילה האחרונה', () => {
  const w = (d: string, kg: number): WeightEntry => ({ d, w: kg });

  it('בלי שקילה — null', () => {
    expect(proteinPerKg(150, [], '2026-09-05')).toBeNull();
  });

  it('שקילה עדכנית — חלבון חלקי משקל, מהשקילה האחרונה לפי תאריך', () => {
    expect(proteinPerKg(150, [w('2026-09-01', 82), w('2026-09-04', 80)], '2026-09-05')).toBeCloseTo(1.875, 10);
  });

  it('גבול 14 יום: בדיוק 14 עדיין תקף, 15 כבר לא', () => {
    expect(WEIGHT_MAX_AGE_DAYS).toBe(14);
    expect(proteinPerKg(150, [w('2026-08-22', 80)], '2026-09-05')).toBeCloseTo(1.875, 10); // 14
    expect(proteinPerKg(150, [w('2026-08-21', 80)], '2026-09-05')).toBeNull(); // 15
  });

  it('שקילה "מהעתיד" (שעון שהוזז) נחשבת עדכנית', () => {
    expect(proteinPerKg(80, [w('2026-09-10', 80)], '2026-09-05')).toBe(1);
  });
});

describe('display — העיגול קורה רק כאן', () => {
  it('קלוריות למספר שלם, כולל שלילי, בלי "-0"', () => {
    expect(kcalText(599.5)).toBe('600');
    expect(kcalText(71.1)).toBe('71');
    expect(kcalText(-300.4)).toBe('-300');
    expect(kcalText(-0.4)).toBe('0');
    expect(kcalText(null)).toBe('—');
  });

  it('מאקרו לספרה אחת, גם כשהחישוב הותיר רעש נקודה צפה', () => {
    expect(macroText(5.34 + 7.92)).toBe('13.3');
    expect(macroText(0.1 + 0.2)).toBe('0.3');
    expect(macroText(-20)).toBe('-20.0');
    expect(macroText(-0.04)).toBe('0.0');
    expect(macroText(2.45)).toBe('2.5');
  });

  it('סיבים: "לפחות" רק כשיש גרמים לא ידועים', () => {
    expect(fiberText(2.4, 0)).toBe('2.4');
    expect(fiberText(2.4, 80)).toBe('לפחות 2.4');
  });

  it('חלבון לק"ג — שתי ספרות או מקף', () => {
    expect(perKgText(1.875)).toBe('1.88');
    expect(perKgText(null)).toBe('—');
  });
});
