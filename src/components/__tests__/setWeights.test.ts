/**
 * משקל שונה לסט — לוגיקת המסך (setWeights.ts). אין שדה חדש: המשקל נשמר לכל
 * סט כמו תמיד; כאן רק מי עוקב אחרי ה-stepper הראשי ומי לא.
 */
import { describe, expect, it } from 'vitest';
import type { LoggedSet } from '../../types';
import { applyExerciseWeight, applySetWeight, applyToPerformed, differingPerformed, exerciseWeight, initialOwn, logSetAt } from '../setWeights';

const done = (weight: number | null, reps: number): LoggedSet => ({ weight, reps, seconds: null });
const todo = (weight: number | null): LoggedSet => ({ weight, reps: null, seconds: null });
const NONE: ReadonlySet<number> = new Set();
const weights = (sets: readonly LoggedSet[]) => sets.map((s) => s.weight);

describe('exerciseWeight — משקל התרגיל נגזר מהסטים (אין שדה)', () => {
  it('סשן חדש: המשקל שמולא מראש בכל הסטים', () => {
    expect(exerciseWeight([todo(130), todo(130), todo(130)])).toBe(130);
    expect(exerciseWeight([todo(null), todo(null)])).toBeNull();
    expect(exerciseWeight([])).toBeNull();
  });

  it('באמצע סשן: המשקל של הסטים שעוד לא נרשמו', () => {
    expect(exerciseWeight([done(85, 10), todo(80), todo(80)])).toBe(80);
    expect(exerciseWeight([done(135, 10), todo(135), todo(135)])).toBe(135);
  });

  it('סט שעוד לא נרשם עם משקל משלו לא מחליף את משקל התרגיל', () => {
    // סט 2 קיבל 130 משלו, סט 3 עוקב אחרי 135 — ולהפך.
    expect(exerciseWeight([done(135, 10), todo(130), todo(135)])).toBe(135);
    expect(exerciseWeight([done(135, 10), todo(135), todo(130)])).toBe(135);
  });

  it('כל הסטים נרשמו: המשקל הנפוץ; בשוויון — של הסט האחרון', () => {
    expect(exerciseWeight([done(85, 10), done(80, 11), done(80, 10)])).toBe(80);
    expect(exerciseWeight([done(80, 12), done(80, 12), done(75, 12)])).toBe(80);
    expect(exerciseWeight([done(80, 12), done(85, 10), done(80, 12)])).toBe(80);
    expect(exerciseWeight([done(80, 12), done(75, 12)])).toBe(75);
    // רשומה ישנה עם משקל עולה בכל סט — כמו קודם (המשקל האחרון).
    expect(exerciseWeight([done(60, 12), done(62.5, 10), done(65, 8)])).toBe(65);
  });

  it('אימון ישן שנשמרו בו פחות סטים מהמפרט: הסט הריק שהושלם לתצוגה לא משתתף', () => {
    const sets = [done(60, 12), done(60, 11), todo(null)];
    expect(exerciseWeight(sets)).toBe(60);
    expect([...initialOwn(sets)]).toEqual([]);
  });
});

describe('רישום רגיל — בדיוק כמו קודם', () => {
  it('שלושה סטים בלי משקל אחר: כולם במשקל התרגיל, גם כשהוא מולא מההצעה', () => {
    // שמור 130 (הפעם הקודמת), ההצעה 135 — נכתבת ב"רשום" הראשון, לכל הסטים.
    let sets: LoggedSet[] = [todo(130), todo(130), todo(130)];
    sets = logSetAt(sets, 0, { reps: 10 }, 135, NONE, true);
    expect(sets).toEqual([done(135, 10), todo(135), todo(135)]);
    sets = logSetAt(sets, 1, { reps: 10 }, 135, NONE, true);
    sets = logSetAt(sets, 2, { reps: 9 }, 135, NONE, true);
    expect(sets).toEqual([done(135, 10), done(135, 10), done(135, 9)]);
  });

  it('שינוי משקל התרגיל לפני הסט הראשון: כל הסטים, כמו קודם', () => {
    expect(weights(applyExerciseWeight([todo(130), todo(130), todo(130)], NONE, 50))).toEqual([50, 50, 50]);
  });

  it('תרגיל משקל גוף: המשקל לא נכתב', () => {
    const sets = logSetAt([todo(null), todo(null)], 0, { reps: 17 }, null, NONE, false);
    expect(sets).toEqual([done(null, 17), todo(null)]);
  });

  it('תרגיל זמן: שניות, לא חזרות', () => {
    expect(logSetAt([todo(null)], 0, { seconds: 60 }, null, NONE, false)).toEqual([{ weight: null, reps: null, seconds: 60 }]);
  });
});

describe('ירדתי או עליתי באמצע', () => {
  it('שינוי ה-stepper הראשי אחרי סט 1: רק הסטים שעוד לא נרשמו — 85/80/80', () => {
    let sets: LoggedSet[] = logSetAt([todo(85), todo(85), todo(85)], 0, { reps: 10 }, 85, NONE, true);
    sets = applyExerciseWeight(sets, NONE, 80);
    expect(weights(sets)).toEqual([85, 80, 80]);
    sets = logSetAt(sets, 1, { reps: 11 }, 80, NONE, true);
    sets = logSetAt(sets, 2, { reps: 10 }, 80, NONE, true);
    expect(sets).toEqual([done(85, 10), done(80, 11), done(80, 10)]);
    // סט 1 הוא זה שמסומן "משקל אחר".
    expect(differingPerformed(sets, 80)).toEqual([0]);
  });

  it('משקל אחר לסט האחרון בלבד — 80/80/75', () => {
    let sets: LoggedSet[] = [done(80, 12), done(80, 12), todo(80)];
    sets = applySetWeight(sets, 2, 75);
    const own = new Set([2]);
    sets = logSetAt(sets, 2, { reps: 12 }, 80, own, true);
    expect(sets).toEqual([done(80, 12), done(80, 12), done(75, 12)]);
    expect(differingPerformed(sets, 80)).toEqual([2]);
  });

  it('משקל אחר לסט האמצעי — 80/85/80; ה-stepper הראשי לא דורס אותו', () => {
    let sets: LoggedSet[] = [done(80, 12), todo(80), todo(80)];
    sets = applySetWeight(sets, 1, 85);
    const own = new Set([1]);
    // שינוי ב-stepper הראשי: סט 2 (משקל משלו) וסט 1 (נרשם) לא משתנים.
    expect(weights(applyExerciseWeight(sets, own, 82.5))).toEqual([80, 85, 82.5]);
    sets = logSetAt(sets, 1, { reps: 10 }, 80, own, true);
    sets = logSetAt(sets, 2, { reps: 12 }, 80, own, true);
    expect(sets).toEqual([done(80, 12), done(85, 10), done(80, 12)]);
  });

  it('"חזור למשקל התרגיל" = אותו משקל כמו שאר הסטים, והסט חוזר לעקוב', () => {
    const sets = applySetWeight([done(80, 12), todo(85), todo(80)], 1, 80);
    expect(weights(sets)).toEqual([80, 80, 80]);
    expect([...initialOwn(sets)]).toEqual([]);
    expect(weights(applyExerciseWeight(sets, NONE, 77.5))).toEqual([80, 77.5, 77.5]);
  });

  it('אחרי כניסה מחדש לתרגיל: מי שיש לו משקל משלו מזוהה מהסטים השמורים', () => {
    expect([...initialOwn([done(80, 12), todo(85), todo(80)])]).toEqual([1]);
    expect([...initialOwn([done(85, 10), todo(80), todo(80)])]).toEqual([]);
    expect([...initialOwn([todo(130), todo(130), todo(130)])]).toEqual([]);
  });
});

describe('עריכת אימון ישן', () => {
  it('ה-stepper הראשי לא נוגע בסטים שנרשמו; "החל גם עליהם" מעדכן את כולם', () => {
    const sets = [done(85, 10), done(85, 10), done(85, 9)];
    expect(applyExerciseWeight(sets, NONE, 80)).toEqual(sets);
    expect(differingPerformed(sets, 80)).toEqual([0, 1, 2]);
    expect(applyToPerformed(sets, 80)).toEqual([done(80, 10), done(80, 10), done(80, 9)]);
  });

  it('משקל לסט בודד באימון ישן: רק הסט הזה', () => {
    expect(applySetWeight([done(85, 10), done(85, 10), done(85, 9)], 0, 90)).toEqual([done(90, 10), done(85, 10), done(85, 9)]);
  });
});
