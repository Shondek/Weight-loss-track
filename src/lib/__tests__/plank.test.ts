/** שלב 4B: פלאנק עם פלטה — סט זמן עם משקל נשמר; סטים ישנים בלי משקל תקינים ומוצגים כמשקל גוף. */
import { describe, expect, it } from 'vitest';
import { parseWorkouts } from '../schema';
import { blankLoggedExercise } from '../workouts';
import { exerciseText } from '../weekSummary';
import { exerciseById } from '../../data/program';
import { le, wk } from './helpers';

describe('פלאנק עם משקל', () => {
  it('סט זמן עם משקל נשמר כמו שהוא', () => {
    const weighted = { ...le('plank', 5, [45, 45, 45]) };
    expect(weighted.sets[0]).toEqual({ weight: null, reps: null, seconds: 45 }); // העזר הישן: זמן בלי משקל
    const ex = { ...weighted, sets: weighted.sets.map((s) => ({ ...s, weight: 5 })) };
    const r = parseWorkouts([wk('w1', '2026-09-20', 'A', [ex])]);
    expect(r.rejected).toEqual([]);
    expect(r.ok[0]?.ex[0]?.sets).toEqual([
      { weight: 5, reps: null, seconds: 45 },
      { weight: 5, reps: null, seconds: 45 },
      { weight: 5, reps: null, seconds: 45 },
    ]);
    expect(exerciseText(r.ok[0]!.ex[0]!)).toBe('פלאנק 5×45,45,45 שנ׳');
  });

  it('סט ישן בלי משקל נשאר תקין ומוצג כמו קודם', () => {
    const old = le('plank', null, [45, 40, 40]);
    const r = parseWorkouts([wk('w0', '2026-09-01', 'A', [old])]);
    expect(r.ok[0]?.ex[0]?.sets).toEqual(old.sets);
    expect(exerciseText(r.ok[0]!.ex[0]!)).toBe('פלאנק 45,40,40 שנ׳');
    // רשומה ישנה בפורמט v1 (r/w) — זמן בלי משקל
    const legacy = parseWorkouts([{ id: 'l', d: '2026-08-30', t: 'A', ex: [{ n: 'פלאנק', w: null, r: [45, 40] }] }]);
    expect(legacy.ok[0]?.ex[0]?.sets).toEqual([
      { weight: null, reps: null, seconds: 45 },
      { weight: null, reps: null, seconds: 40 },
    ]);
  });

  it('שורה חדשה: משקל הפתיחה נכנס לסטים; בלי משקל = משקל גוף', () => {
    const spec = exerciseById('plank')!;
    expect(blankLoggedExercise(spec, 5).sets.map((s) => s.weight)).toEqual([5, 5, 5]);
    expect(blankLoggedExercise(spec).sets.map((s) => s.weight)).toEqual([null, null, null]);
  });
});
