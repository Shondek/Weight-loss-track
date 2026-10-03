/**
 * 3/10/2026: C2 הוחלף לחתירה- מכונה ייעודית (machine-row). החתירה עם משקולת יד
 * (db-single-arm-row) נשארת עם המזהה, השם וההיסטוריה שלה, כחלופה של C2.
 */
import { describe, expect, it } from 'vitest';
import { emptyDb, type DB } from '../../types';
import { exerciseById, exerciseIn } from '../../data/program';
import { parseWorkouts } from '../schema';
import { buildWeeklySummaryData, weeklySummaryText } from '../weeklySummary';
import { exerciseHistory, exercisesFor, hasData, lastExercise, openingWeight, prefilledExercises, swapExercise } from '../workouts';
import { alternateHint, suggestNext } from '../progression';
import { le, wk } from './helpers';

/** אימון C של 3/10 — נעשה עוד עם משקולות יד, ונשאר כמו שהוא. */
const C_OCT3 = wk('c-1003', '2026-10-03', 'C', [
  le('machine-hip-abduction', 30, [18, 18, 18]),
  { ...le('db-single-arm-row', 15, [12, 12, 12]), rir: 2 },
  le('leg-press', 60, [12, 12, 12]),
]);
const C_SEP27 = wk('c-0927', '2026-09-27', 'C', [{ ...le('db-single-arm-row', 12.5, [12, 12, 12]), rir: 2 }]);

describe('ההיסטוריה של החתירה עם משקולת יד שלמה', () => {
  it('הרשומות נטענות בלי שינוי, תחת המזהה והשם הקיימים', () => {
    const r = parseWorkouts([C_SEP27, C_OCT3]);
    expect(r.rejected).toEqual([]);
    expect(r.ok).toEqual([C_SEP27, C_OCT3]);
    const h = exerciseHistory(r.ok, 'db-single-arm-row');
    expect(h.map((x) => x.d)).toEqual(['2026-09-27', '2026-10-03']);
    expect(h[1]?.ex.n).toBe('חתירה- הטיית גו עם מ.יד');
    expect(openingWeight(r.ok, 'db-single-arm-row')).toBe(15);
    expect(exerciseHistory(r.ok, 'machine-row')).toEqual([]);
  });

  it('האימון של 3/10 נפתח לעריכה עם החתירה מ.יד במקומה; C2 החדש מופיע כשורה ריקה אחרי התוכנית', () => {
    const rows = exercisesFor(C_OCT3, [C_SEP27, C_OCT3]);
    const ids = rows.map((r) => r.exerciseId);
    expect(ids[0]).toBe('warmup');
    expect(ids.slice(1, 4)).toEqual(['machine-hip-abduction', 'db-single-arm-row', 'leg-press']);
    expect(ids).toContain('machine-row');
    const dbRow = rows.find((r) => r.exerciseId === 'db-single-arm-row')!;
    expect(hasData(dbRow)).toBe(true);
    expect(dbRow.sets.map((s) => s.reps)).toEqual([12, 12, 12]);
    const mrRow = rows.find((r) => r.exerciseId === 'machine-row')!;
    expect(hasData(mrRow)).toBe(false);
    expect(mrRow.sets.map((s) => s.weight)).toEqual([null, null, null]);
  });

  it('הסיכום השבועי של שבוע 3/10 מציג את החתירה מ.יד בשמה ועם ההצעה הרגילה שלה', () => {
    const db: DB = { ...emptyDb(), workouts: [C_SEP27, C_OCT3] };
    const d = buildWeeklySummaryData(db, '2026-09-27');
    const lines = d.workouts.items.find((it) => it.d === '2026-10-03')!.lines;
    expect(lines[1]).toMatchObject({ exerciseId: 'db-single-arm-row', name: 'חתירה מ.יד', text: 'חתירה מ.יד 15×12,12,12', next: '17.5 ק״ג · 10 חזרות' });
    expect(lines[1]?.suggestion?.rule).toBe('R1');
    expect(weeklySummaryText(d)).toContain('  חתירה מ.יד 15×12,12,12 · RIR 2 · הבא: 17.5 ק״ג · 10 חזרות (R1)');
  });
});

describe('C2 חדש בלי היסטוריה', () => {
  const c2 = exerciseIn('C', 'machine-row')!;

  it('אימון C חדש: C2 הוא machine-row, 3 סטים ריקים, בלי משקל פותח, בלי הצעה — לא קורס', () => {
    const rows = prefilledExercises([C_SEP27, C_OCT3], 'C');
    const row = rows[2]!;
    expect(row).toMatchObject({ exerciseId: 'machine-row', n: 'חתירה- מכונה ייעודית', targetRepMin: 10, targetRepMax: 12, bodyweightOnly: false });
    expect(row.sets).toEqual([
      { weight: null, reps: null, seconds: null },
      { weight: null, reps: null, seconds: null },
      { weight: null, reps: null, seconds: null },
    ]);
    expect(lastExercise([C_SEP27, C_OCT3], 'machine-row')).toBeNull();
    expect(suggestNext(exerciseHistory([C_SEP27, C_OCT3], 'machine-row'), c2)).toBeNull();
    // שורה רגילה (לא מוחלפת) בלי היסטוריה — בלי הנחיה; המשתמש בוחר משקל בעצמו.
    expect(alternateHint(null, false)).toBeNull();
  });

  it('אחרי הסשן הראשון במכונה: "דרגה אחת למעלה" (step null), והיסטוריה נפרדת מהחתירה מ.יד', () => {
    const first = wk('c-1010', '2026-10-10', 'C', [{ ...le('machine-row', 40, [12, 12, 12]), rir: 2 }]);
    const all = [C_SEP27, C_OCT3, first];
    const s = suggestNext(exerciseHistory(all, 'machine-row'), c2);
    expect(s).toMatchObject({ action: 'up', weight: null, rule: 'R1', basisWeight: 40 });
    expect(exerciseHistory(all, 'db-single-arm-row')).toHaveLength(2);
  });
});

describe('"החלף" ב-C2 מציע את החתירה עם משקולת יד', () => {
  it('ההחלפה ממשיכה את ההיסטוריה של db-single-arm-row: משקל פותח 15 והצעה 17.5 (R1)', () => {
    const c2 = exerciseIn('C', 'machine-row')!;
    const alt = exerciseById('db-single-arm-row')!;
    expect(c2.alternates[0]).toBe('db-single-arm-row');
    const all = [C_SEP27, C_OCT3];
    const row = swapExercise(c2, alt, openingWeight(all, alt.id));
    expect(row).toMatchObject({ exerciseId: 'db-single-arm-row', n: 'חתירה- הטיית גו עם מ.יד', swappedFrom: 'machine-row', targetRepMin: 10, targetRepMax: 12 });
    expect(row.sets.map((s) => s.weight)).toEqual([15, 15, 15]);
    const s = suggestNext(exerciseHistory(all, alt.id), { ...alt, sets: 3 });
    expect(s).toMatchObject({ action: 'up', weight: 17.5, rule: 'R1' });
  });
});
