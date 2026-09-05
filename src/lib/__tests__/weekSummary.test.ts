import { describe, it, expect } from 'vitest';
import { emptyDb } from '../../types';
import { buildWeekSummary, weekGaps, workoutText } from '../weekSummary';
import { buildChatReport } from '../exportText';
import { le, wk } from './helpers';

const WEEK = '2026-08-30'; // ראשון
const TODAY = '2026-09-05'; // שבת

function sampleDb() {
  const db = emptyDb();
  db.weights = [
    { d: '2026-08-23', w: 90 },
    { d: '2026-08-24', w: 90 },
    { d: '2026-08-25', w: 90 },
    { d: '2026-08-26', w: 90 },
    { d: '2026-08-27', w: 90 },
    { d: '2026-08-28', w: 90 },
    { d: '2026-08-29', w: 90 },
    { d: '2026-08-30', w: 89.5 },
    { d: '2026-08-31', w: 89.4 },
    { d: '2026-09-01', w: 89.6 },
    { d: '2026-09-02', w: 89.2 },
    { d: '2026-09-03', w: 89.1 },
    { d: '2026-09-04', w: 89.0 },
    { d: '2026-09-05', w: 88.9 },
  ];
  db.waist = [
    { d: '2026-08-29', cm: 100 },
    { d: '2026-09-05', cm: 99 },
  ];
  db.workouts = [
    wk('w1', '2026-08-31', 'A', [le('leg-press', 60, [12, 12, 10]), le('lat-pulldown', 45, [10, 10, 9]), le('db-bench-press', 20, [])], 2, 0),
    wk('w2', '2026-09-03', 'B', [le('db-rdl', 24, [10, 10, 10])], 0, 3),
  ];
  return db;
}

describe('buildWeekSummary', () => {
  it('משקל: ממוצע, שבוע קודם, ושינוי רק כששני השבועות מלאים', () => {
    const r = buildWeekSummary(sampleDb(), WEEK, TODAY);
    expect(r.weekNo).toBe(2);
    expect(r.saturday).toBe('2026-09-05');
    expect(r.weight.current).toMatchObject({ avg: 89.24, count: 7, complete: true });
    expect(r.weight.previous).toMatchObject({ avg: 90, complete: true });
    expect(r.weight.change).toMatchObject({ direction: 'down', drop: 0.76 });
    expect(r.weight.noComparison).toBeNull();
  });

  it('שבוע חלקי — אין השוואה, והסיבה נאמרת', () => {
    const db = sampleDb();
    db.weights = db.weights.filter((e) => e.d !== '2026-09-02');
    const r = buildWeekSummary(db, WEEK, TODAY);
    expect(r.weight.change).toBeNull();
    expect(r.weight.noComparison).toBe('current-partial');
    expect(r.gaps).toContain('שקילה של 02/09');

    const db2 = sampleDb();
    db2.weights = db2.weights.filter((e) => e.d !== '2026-08-25');
    expect(buildWeekSummary(db2, WEEK, TODAY).weight.noComparison).toBe('previous-partial');
  });

  it('אימונים: ספירה, שורת תרגילים, דולגו וכאב מקסימלי', () => {
    const r = buildWeekSummary(sampleDb(), WEEK, TODAY);
    expect(r.workouts.done).toBe(2);
    expect(r.workouts.planned).toBe(3);
    expect(r.workouts.items.map((w) => w.t)).toEqual(['A', 'B']);
    expect(r.workouts.items[0]?.text).toBe('לג-פרס 60×12,12,10 · פולי עליון 45×10,10,9');
    expect(r.workouts.items[0]?.skipped).toEqual(["בנץ' פרס"]);
    expect(r.workouts.knee).toBe(2);
    expect(r.workouts.shoulder).toBe(3);
    expect(r.waist).toEqual({ now: 99, previous: 100 });
    expect(r.gaps).toEqual(['אימון שלישי']);
    expect(r.recentWeeks.map((w) => w.weekStart)).toEqual(['2026-08-23', '2026-08-30']);
  });

  it('שבוע ריק: הכול חסר, בלי לזרוק', () => {
    const r = buildWeekSummary(emptyDb(), WEEK, TODAY);
    expect(r.weight.current.avg).toBeNull();
    expect(r.workouts.items).toEqual([]);
    expect(r.checkin).toBeNull();
    expect(r.gaps).toEqual([
      'אימון ראשון',
      'אימון שני',
      'אימון שלישי',
      'שקילות של 30/08, 31/08, 01/09, 02/09, 03/09, 04/09, 05/09',
      'מדידת מותניים',
    ]);
  });

  it('הדוח לצ\'אט משתמש באותן שורות — "חסר" ושורת האימון זהים', () => {
    const db = sampleDb();
    const text = buildChatReport(db, WEEK, TODAY);
    expect(text).toContain(`חסר: ${weekGaps(db, WEEK, TODAY).join(' · ')}`);
    expect(text).toContain(`31/08 A — ${workoutText(db.workouts[0]!)}`);
    expect(workoutText(db.workouts[0]!)).toContain("· דולגו: בנץ' פרס");
  });
});
