/** שלב 4.1B: "דלג ואחזור" — סידור מחדש, ביטול, והסדר שנשמר = הסדר שבוצע. */
import { describe, expect, it } from 'vitest';
import { blankCardio, exercisesFor, FINISHER_ID, moveToEnd, orderOf, prefilledExercises, reorderLike, WARMUP_ID } from '../workouts';
import { wk } from './helpers';

const ids = (list: { exerciseId: string }[]) => list.map((e) => e.exerciseId);

describe('דלג ואחזור', () => {
  const ex = prefilledExercises([], 'A');

  it('מזיז את התרגיל לסוף סדר הכוח; חימום ראשון, אירובי סיום אחרון', () => {
    expect(ids(ex)).toEqual([WARMUP_ID, 'leg-press', 'smith-bench-press', 'lat-pulldown', 'leg-extension', 'leg-curl', 'back-extension', 'db-lateral-raise-seated', 'plank', FINISHER_ID]);
    const moved = moveToEnd(ex, 'smith-bench-press');
    expect(ids(moved)).toEqual([WARMUP_ID, 'leg-press', 'lat-pulldown', 'leg-extension', 'leg-curl', 'back-extension', 'db-lateral-raise-seated', 'plank', 'smith-bench-press', FINISHER_ID]);
    // דילוג שני: לא משכפל, השורה עצמה (עם הנתונים) עוברת
    const twice = moveToEnd(moved, 'leg-press');
    expect(ids(twice)).toEqual([WARMUP_ID, 'lat-pulldown', 'leg-extension', 'leg-curl', 'back-extension', 'db-lateral-raise-seated', 'plank', 'smith-bench-press', 'leg-press', FINISHER_ID]);
    expect(twice).toHaveLength(ex.length);
    // אירובי לא זז; מזהה לא קיים — בלי שינוי
    expect(ids(moveToEnd(ex, WARMUP_ID))).toEqual(ids(ex));
    expect(ids(moveToEnd(ex, 'nope'))).toEqual(ids(ex));
  });

  it('ביטול משחזר את הסדר הקודם ושומר את הנתונים הנוכחיים', () => {
    const before = orderOf(ex);
    const moved = moveToEnd(ex, 'smith-bench-press');
    // נרשם נתון אחרי הדילוג
    const withData = moved.map((e) => (e.exerciseId === 'lat-pulldown' ? { ...e, sets: e.sets.map((s) => ({ ...s, weight: 40, reps: 12 })) } : e));
    const restored = reorderLike(withData, before);
    expect(ids(restored)).toEqual(before);
    expect(restored.find((e) => e.exerciseId === 'lat-pulldown')?.sets[0]).toEqual({ weight: 40, reps: 12, seconds: null });
  });

  it('הסדר שנשמר הוא הסדר שמוצג בעורך (exercisesFor לא מחזיר לסדר התוכנית)', () => {
    const entry = wk('w1', '2026-09-27', 'A', moveToEnd(ex, 'leg-press'));
    const rows = exercisesFor(entry, [entry]);
    expect(ids(rows)).toEqual([WARMUP_ID, 'smith-bench-press', 'lat-pulldown', 'leg-extension', 'leg-curl', 'back-extension', 'db-lateral-raise-seated', 'plank', 'leg-press', FINISHER_ID]);
    // רשומה ישנה בלי חימום/אירובי מקבלת שורות ריקות במקומן
    const bare = wk('w2', '2026-09-20', 'A', ex.filter((e) => e.exerciseId !== WARMUP_ID && e.exerciseId !== FINISHER_ID));
    expect(ids(exercisesFor(bare, [bare]))[0]).toBe(WARMUP_ID);
    expect(ids(exercisesFor(bare, [bare])).at(-1)).toBe(FINISHER_ID);
    expect(blankCardio(FINISHER_ID).exerciseId).toBe(FINISHER_ID);
  });
});
