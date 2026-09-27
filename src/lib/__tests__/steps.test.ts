/** שלב 6: צעדים יומיים — יעד לפי תאריך, ברירת המחדל לכרטיס, שבוע. */
import { describe, expect, it } from 'vitest';
import type { DayMeta } from '../../types';
import { emptyDb } from '../../types';
import { addCardioSteps, canStepForward, cardioStepsOn, defaultStepsDate, recentSteps, stepsGoalFor, stepsStatus, stepsWeek } from '../steps';
import { blankCardio, FINISHER_ID, markCardioDone, WARMUP_ID } from '../workouts';
import { le, wk } from './helpers';

describe('יעד צעדים לפי תאריך', () => {
  it('null עד 31/10/2026, 8,000 מ-1/11/2026', () => {
    expect(stepsGoalFor('2026-09-26')).toBeNull();
    expect(stepsGoalFor('2026-10-31')).toBeNull();
    expect(stepsGoalFor('2026-11-01')).toBe(8000);
    expect(stepsGoalFor('2027-01-15')).toBe(8000);
  });

  it('סטטוס מול היעד של אותו יום: לפני 1/11 אין; אחרי — ok/low', () => {
    expect(stepsStatus(12000, '2026-10-31')).toBeNull();
    expect(stepsStatus(8000, '2026-11-01')).toBe('ok');
    expect(stepsStatus(7999, '2026-11-01')).toBe('low');
  });
});

describe('כרטיס הצעדים', () => {
  it('ברירת המחדל: אתמול; קדימה רק עד היום', () => {
    expect(defaultStepsDate('2026-09-26')).toBe('2026-09-25');
    expect(defaultStepsDate('2026-10-01')).toBe('2026-09-30');
    expect(canStepForward('2026-09-25', '2026-09-26')).toBe(true);
    expect(canStepForward('2026-09-26', '2026-09-26')).toBe(false);
    expect(canStepForward('2026-09-27', '2026-09-26')).toBe(false);
  });

  it('שבעת הימים האחרונים עד התאריך, — לחסר', () => {
    const list: DayMeta[] = [
      { d: '2026-09-25', closed: false, steps: 9812 },
      { d: '2026-09-20', closed: true, steps: 4000 },
      { d: '2026-09-18', closed: true, steps: 5000 }, // מחוץ לחלון
    ];
    const r = recentSteps(list, '2026-09-25');
    expect(r.map((x) => x.d)).toEqual(['2026-09-19', '2026-09-20', '2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24', '2026-09-25']);
    expect(r.map((x) => x.steps)).toEqual([null, 4000, null, null, null, null, 9812]);
  });
});

describe('שבוע צעדים', () => {
  const week = (ws: string, vals: (number | null)[]): DayMeta[] =>
    vals.flatMap((v, i) => (v === null ? [] : [{ d: `${ws.slice(0, 8)}${String(Number(ws.slice(8)) + i).padStart(2, '0')}`, closed: false, steps: v }]));

  it('לפני 1/11: ערכים וממוצע על הימים שהוזנו, בלי יעד', () => {
    const s = stepsWeek(week('2026-10-18', [9812, null, 8100, 7000, null, 6500, 10200]), '2026-10-18');
    expect(s).toEqual({ days: [9812, null, 8100, 7000, null, 6500, 10200], entered: 5, avg: 8322, goal: null, atGoal: null });
  });

  it('מ-1/11: יעד 8,000 וימים ביעד; השבוע 25–31/10 עדיין בלי יעד', () => {
    const s = stepsWeek(week('2026-11-01', [9812, null, 8100, 7000, null, 6500, 10200]), '2026-11-01');
    expect(s).toMatchObject({ entered: 5, avg: 8322, goal: 8000, atGoal: 3 });
    expect(stepsWeek([], '2026-10-25').goal).toBeNull();
    expect(stepsWeek([], '2026-11-01')).toEqual({ days: [null, null, null, null, null, null, null], entered: 0, avg: null, goal: 8000, atGoal: 0 });
  });
});

describe('צעדי הליכון מהאירובי (שלב 7.1)', () => {
  const D = '2026-09-26';
  const finisher = (steps: number | undefined, done = true) => {
    const row = done ? markCardioDone(blankCardio(FINISHER_ID), 30) : blankCardio(FINISHER_ID);
    return { ...row, cardio: { ...row.cardio!, mode: 'treadmill' as const, ...(steps === undefined ? {} : { steps }) } };
  };
  const standalone = (d: string, steps: number | undefined) => ({ id: `s-${d}-${steps}`, d, mode: 'treadmill' as const, minutes: 60, incline: 2.5, speed: 5, note: '', ...(steps === undefined ? {} : { steps }) });

  it('סכום סיום + עצמאי של אותו יום; בלי steps לא נספר; חימום וימים אחרים לא נספרים', () => {
    const db = emptyDb();
    db.workouts = [
      wk('a', D, 'A', [le('leg-press', 60, [12, 12, 12]), { ...blankCardio(WARMUP_ID), cardio: { mode: 'treadmill', minutes: 10, steps: 999 } }, finisher(3200)]),
      wk('b', '2026-09-24', 'B', [finisher(5000)]),
    ];
    db.standaloneCardio = [standalone(D, 4100), standalone(D, undefined), standalone('2026-09-25', 7000)];
    expect(cardioStepsOn(db, D)).toBe(7300);
    expect(cardioStepsOn(db, '2026-09-24')).toBe(5000);
    expect(cardioStepsOn(db, '2026-09-25')).toBe(7000);
    expect(cardioStepsOn(db, '2026-09-23')).toBe(0);
    // אירובי סיום שלא בוצע (לא נלחץ "התחל") לא נספר גם אם יש בו steps
    db.workouts = [wk('c', D, 'C', [finisher(2000, false)])];
    db.standaloneCardio = [];
    expect(cardioStepsOn(db, D)).toBe(0);
  });

  it('"הוסף לספירה": הנוכחי + X, ריק = 0 + X, מוגבל לתקרה; הרשימה לא משתנה', () => {
    expect(addCardioSteps(null, 7300)).toBe(7300);
    expect(addCardioSteps(1500, 7300)).toBe(8800);
    expect(addCardioSteps(99000, 7300)).toBe(100000);
    const list = [{ d: D, closed: false, steps: 1500 }];
    const before = JSON.stringify(list);
    addCardioSteps(1500, 7300);
    expect(JSON.stringify(list)).toBe(before);
  });
});
