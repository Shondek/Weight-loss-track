/**
 * שלב 5 — "בטל" אחרי מחיקה מחזיר את הרשומה **בדיוק**: אותו מזהה, אותם שדות
 * (גם סדר המפתחות), אותו מיקום ברשימה. ההחזרה היא דרך פונקציות ההוספה
 * הקיימות בלבד (upsert*), על רשימה שכבר ממוינת — כפי שהאחסון תמיד ממוין
 * (schema.ts ממיין בקריאה, וכל upsert ממיין בכתיבה).
 *
 * ההשוואה ב-JSON.stringify, כמו בכלי השוויון של הייצוא: סדר מערכים וסדר
 * מפתחות נספרים.
 */

import { describe, expect, it } from 'vitest';
import type { CustomFood, DayMeta, FoodEntry, StandaloneCardio, WaistEntry, WeightEntry, WorkoutEntry } from '../../types';
import { removeWaist, removeWeight, upsertWaist, upsertWeight } from '../../lib/weights';
import { dayMeta, setDaySteps, upsertDay } from '../../lib/nutrition/days';
import { removeEntry, upsertEntry } from '../../lib/nutrition/entries';
import { removeWorkout, upsertWorkout } from '../../lib/workouts';
import { removeStandalone, upsertStandalone } from '../../lib/cardio';
import { removeCustomFood, upsertCustomFood } from '../../lib/nutrition/foods';
import { parseCustomFoods, parseDays, parseEntries, parseStandaloneCardio, parseWaist, parseWeights, parseWorkouts } from '../../lib/schema';
import { le } from '../../lib/__tests__/helpers';

const json = (x: unknown) => JSON.stringify(x);

/** מוחק את האיבר ה-i ומחזיר אותו — חייב לצאת זהה לרשימה המקורית. */
function roundTrip<T>(list: readonly T[], i: number, remove: (l: readonly T[]) => T[], add: (l: readonly T[], x: T) => T[]) {
  const original = list[i]!;
  const after = remove(list);
  expect(after).toHaveLength(list.length - 1);
  expect(json(after)).not.toBe(json(list));
  return add(after, original);
}

describe('שלב 5 — מחיקה ואז "בטל" מחזירים את הרשומה בדיוק', () => {
  it('שקילה: באמצע, בהתחלה ובסוף', () => {
    const list: WeightEntry[] = parseWeights([
      { d: '2026-10-01', w: 96.4 },
      { d: '2026-10-02', w: 96.1 },
      { d: '2026-10-03', w: 96.3 },
      { d: '2026-10-05', w: 95.9 },
    ]).ok;
    for (const i of [0, 1, 3]) {
      const restored = roundTrip(list, i, (l) => removeWeight(l, list[i]!.d), upsertWeight);
      expect(json(restored)).toBe(json(list));
    }
  });

  it('מותניים', () => {
    const list: WaistEntry[] = parseWaist([
      { d: '2026-09-09', cm: 99 },
      { d: '2026-09-16', cm: 98.5 },
      { d: '2026-09-23', cm: 98 },
    ]).ok;
    for (const i of [0, 1, 2]) {
      const restored = roundTrip(list, i, (l) => removeWaist(l, list[i]!.d), upsertWaist);
      expect(json(restored)).toBe(json(list));
    }
  });

  it('צעדים: setDaySteps(null) משאיר את רשומת היום; upsertDay מחזיר את האובייקט המקורי כולל סדר המפתחות', () => {
    const list: DayMeta[] = parseDays([
      { d: '2026-10-27', closed: true, closedAt: '2026-10-27T21:30:00.000Z', steps: 7200 },
      { d: '2026-10-28', closed: false, steps: 8100 },
      { d: '2026-10-29', closed: true, closedAt: '2026-10-29T21:30:00.000Z', fridayTier: 'regular', steps: 9000 },
    ]).ok;
    for (const d of ['2026-10-27', '2026-10-28', '2026-10-29']) {
      const original = dayMeta(list, d)!;
      const deleted = setDaySteps(list, d, null);
      expect(deleted).toHaveLength(list.length); // היום נשאר, בלי צעדים
      expect(dayMeta(deleted, d)!.steps).toBeUndefined();
      expect(json(deleted)).not.toBe(json(list));
      // ההחזרה דרך setDaySteps(steps) הייתה מזיזה את `steps` לסוף האובייקט
      // (28/10, 29/10) — ולכן "בטל" מחזיר את רשומת היום עצמה דרך upsertDay.
      expect(json(upsertDay(deleted, original))).toBe(json(list));
    }
  });

  it('רישום מזון: מזהה ייחודי, מיון לפי ts ואז id', () => {
    const ref = { name: 'קוטג׳', kcal: 100, protein: 11, carbs: 3, fat: 5, fiber: 0 };
    const raw: FoodEntry[] = [
      { id: '000000a-x1', d: '2026-10-30', ts: 1_000, meal: 'breakfast', foodId: '14201019', grams: 250, ref },
      { id: '000000b-x2', d: '2026-10-30', ts: 2_000, meal: 'breakfast', foodId: 'c:seed-pro40', grams: 1, ref: { ...ref, unitFood: true } },
      { id: '000000c-x3', d: '2026-10-30', ts: 2_000, meal: 'lunch', foodId: '42101000', grams: 150, ref },
      { id: '000000d-x4', d: '2026-10-30', ts: 3_000, meal: 'dinner', foodId: 'c:adhoc', grams: 1, ref: { ...ref, unitFood: true }, n: 'המבורגר', adhoc: true },
    ];
    const list = parseEntries(raw).ok;
    expect(list).toHaveLength(4);
    for (let i = 0; i < list.length; i++) {
      const restored = roundTrip(list, i, (l) => removeEntry(l, list[i]!.id), upsertEntry);
      expect(json(restored)).toBe(json(list));
    }
  });

  it('אימון שלם', () => {
    const w = (id: string, d: string, t: WorkoutEntry['t']): WorkoutEntry => ({
      schemaVersion: 2,
      id,
      d,
      t,
      ex: [le('leg-press', 120, [12, 12, 12])],
      knee: 0,
      shoulder: null,
    });
    const list = parseWorkouts([w('2026-10-26-a', '2026-10-26', 'A'), w('2026-10-28-b', '2026-10-28', 'B'), w('2026-10-28-c', '2026-10-28', 'C')]).ok;
    expect(list).toHaveLength(3);
    for (let i = 0; i < list.length; i++) {
      const restored = roundTrip(list, i, (l) => removeWorkout(l, list[i]!.id), upsertWorkout);
      expect(json(restored)).toBe(json(list));
    }
  });

  it('אירובי עצמאי', () => {
    const c = (id: string, d: string): StandaloneCardio => ({ id, d, mode: 'treadmill', minutes: 45, incline: 2.5, speed: 5, note: '', segments: [{ minutes: 45, incline: 2.5, speed: 5 }], steps: 5200 });
    const list = parseStandaloneCardio([c('2026-10-25-a-cardio', '2026-10-25'), c('2026-10-28-b-cardio', '2026-10-28'), c('2026-10-28-c-cardio', '2026-10-28')]).ok;
    expect(list).toHaveLength(3);
    for (let i = 0; i < list.length; i++) {
      const restored = roundTrip(list, i, (l) => removeStandalone(l, list[i]!.id), upsertStandalone);
      expect(json(restored)).toBe(json(list));
    }
  });

  it('מזון שלי: שמות שונים — מיקום זהה; רישומים שמפנים אליו לא נוגעים ברשימה', () => {
    const f = (id: string, name: string): CustomFood => ({ id, name, cat: null, kcal: 350, protein: 30, carbs: 10, fat: 12, fiber: null, portions: [], barcode: null, note: 'מהתווית' });
    const list = parseCustomFoods([f('c:seed-a', 'טחינה גולמית'), f('c:seed-b', 'PRO 40'), f('c:seed-c', 'סלט ירקות')]).ok;
    expect(list).toHaveLength(3);
    for (let i = 0; i < list.length; i++) {
      const restored = roundTrip(list, i, (l) => removeCustomFood(l, list[i]!.id), upsertCustomFood);
      expect(json(restored)).toBe(json(list));
    }
  });

  it('מזון שלי: שני מזונות באותו שם בדיוק — ההחזרה מחליפה את הסדר ביניהם (מגבלה מתועדת, קיימת גם בעריכה)', () => {
    const f = (id: string, name: string): CustomFood => ({ id, name, cat: null, kcal: 350, protein: 30, carbs: 10, fat: 12, fiber: null, portions: [], barcode: null });
    const list = parseCustomFoods([f('c:seed-1', 'חטיף'), f('c:seed-2', 'חטיף')]).ok;
    const restored = upsertCustomFood(removeCustomFood(list, 'c:seed-1'), list[0]!);
    expect(restored.map((x) => x.id)).toEqual(['c:seed-2', 'c:seed-1']);
    // אותו דבר קורה בעריכה רגילה של המזון הראשון (upsert בלי מחיקה) — תכונה של המיון, לא של "בטל".
    expect(upsertCustomFood(list, list[0]!).map((x) => x.id)).toEqual(['c:seed-2', 'c:seed-1']);
  });
});
