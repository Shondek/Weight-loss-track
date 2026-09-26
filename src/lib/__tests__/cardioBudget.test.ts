/** שלב 4E: תקציב אירובי שבועי — מעבר תאריך, חימום לא נספר, דגל "מעל התקציב", דקות שנשארו. */
import { describe, expect, it } from 'vitest';
import { emptyDb } from '../../types';
import { cardioBudgetFor, cardioWeek, remainingMinutes } from '../cardio';
import { blankCardio, FINISHER_ID, markCardioDone, WARMUP_ID } from '../workouts';
import { le, wk } from './helpers';

describe('תקציב אירובי שבועי', () => {
  it('60 דק׳ עד השבוע של 31/10/2026, 120 מהשבוע של 1/11/2026', () => {
    expect(cardioBudgetFor('2026-10-25')).toBe(60); // השבוע 25–31/10
    expect(cardioBudgetFor('2026-11-01')).toBe(120); // ראשון 1/11
    expect(cardioBudgetFor('2026-12-06')).toBe(120);
    expect(cardioWeek(emptyDb(), '2026-10-25').budget).toBe(60);
    expect(cardioWeek(emptyDb(), '2026-11-01').budget).toBe(120);
  });

  it('נספרים: אירובי סיום שבוצע + עצמאי. חימום לא נספר', () => {
    const d = emptyDb();
    d.workouts = [
      wk('w1', '2026-09-21', 'A', [markCardioDone(blankCardio(WARMUP_ID), 10), le('leg-press', 60, [12, 12, 12]), markCardioDone(blankCardio(FINISHER_ID), 20)]),
      wk('w2', '2026-09-23', 'B', [markCardioDone(blankCardio(WARMUP_ID), 10), blankCardio(FINISHER_ID)]),
    ];
    d.standaloneCardio = [{ id: 's1', d: '2026-09-22', mode: 'treadmill', minutes: 30, incline: null, speed: null, note: '' }];
    const c = cardioWeek(d, '2026-09-20');
    expect(c).toMatchObject({ finisher: 20, standalone: 30, total: 50, budget: 60, over: false });
    expect(remainingMinutes(c)).toBe(10);
  });

  it('מעל התקציב: over=true ו-0 דקות שנשארו', () => {
    const d = emptyDb();
    d.standaloneCardio = [
      { id: 's1', d: '2026-09-22', mode: 'treadmill', minutes: 45, incline: null, speed: null, note: '' },
      { id: 's2', d: '2026-09-24', mode: 'treadmill', minutes: 30, incline: null, speed: null, note: '' },
    ];
    const c = cardioWeek(d, '2026-09-20');
    expect(c).toMatchObject({ total: 75, budget: 60, over: true });
    expect(remainingMinutes(c)).toBe(0);
    // בדיוק על התקציב — לא "מעל"
    d.standaloneCardio = [{ id: 's1', d: '2026-09-22', mode: 'treadmill', minutes: 60, incline: null, speed: null, note: '' }];
    expect(cardioWeek(d, '2026-09-20').over).toBe(false);
    // אותם 75 דק׳ בשבוע של נובמבר — בתוך 120
    d.standaloneCardio = [{ id: 's3', d: '2026-11-03', mode: 'treadmill', minutes: 75, incline: null, speed: null, note: '' }];
    expect(cardioWeek(d, '2026-11-01')).toMatchObject({ total: 75, budget: 120, over: false });
  });
});
