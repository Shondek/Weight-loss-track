/**
 * 3/10/2026 (2): A2 → סמית משין, תא ביצפס חדש ב-C (C7), רוטציות הגו ל-8.
 * אימונים ישנים — A עם הבנץ׳ עם משקולות יד, C עם 7 תרגילים — נטענים ומוצגים כמו קודם,
 * וההיסטוריות שלהם שלמות. שום דבר באחסון לא תלוי באינדקס של תרגיל בתוך אימון.
 */
import { describe, expect, it } from 'vitest';
import { emptyDb, type DB } from '../../types';
import { exerciseById, exerciseIn, PROGRAM } from '../../data/program';
import { parseWorkouts } from '../schema';
import { buildWeeklySummaryData, weeklySummaryText } from '../weeklySummary';
import { exerciseHistory, exercisesFor, hasData, moveToEnd, openingWeight, prefilledExercises, swapExercise, FINISHER_ID, WARMUP_ID } from '../workouts';
import { suggestNext } from '../progression';
import { le, wk } from './helpers';

const ids = (list: { exerciseId: string }[]) => list.map((e) => e.exerciseId);

/** אימון A ישן, עם הבנץ׳ עם משקולות יד ב-A2. */
const A_SEP24 = wk('a-0924', '2026-09-24', 'A', [
  le('leg-press', 60, [12, 12, 12]),
  { ...le('db-bench-press', 15, [12, 12, 12]), rir: 2 },
  le('lat-pulldown', 40, [12, 12, 12]),
]);
/** אימון C ישן עם 7 תרגילים — C6 פשיטת מרפקים, C7 רוטציות גו. */
const C_OCT3 = wk('c-1003', '2026-10-03', 'C', [
  le('machine-hip-abduction', 30, [18, 18, 18]),
  { ...le('db-single-arm-row', 15, [12, 12, 12]), rir: 2 },
  le('db-incline-bench-press', 15, [12, 12, 9]),
  le('leg-press', 60, [12, 12, 12]),
  le('db-lateral-raise-standing', 7.5, [15, 15, 15]),
  { ...le('triceps-pushdown', 25, [15, 15]), rir: 1 },
  { ...le('cable-torso-rotation', 20, [15, 15, 15]), rir: 1 },
]);
const ALL = [A_SEP24, C_OCT3];

describe('A2 סמית — אימון A חדש ו"החלף"', () => {
  it('A חדש: A2 הוא הסמית, 3 סטים ריקים, בלי משקל פותח ובלי הצעה (אין היסטוריה)', () => {
    const rows = prefilledExercises(ALL, 'A');
    // מ-6/10/2026 A6 (פשיטת ירך) נכנס בין כפיפת הברכיים להרחקת הכתפיים.
    expect(ids(rows)).toEqual([WARMUP_ID, 'leg-press', 'smith-bench-press', 'lat-pulldown', 'leg-extension', 'leg-curl', 'back-extension', 'db-lateral-raise-seated', 'plank', FINISHER_ID]);
    const a2 = rows[2]!;
    expect(a2).toMatchObject({ n: "בנץ' פרס- סמית משין", targetRepMin: 8, targetRepMax: 12 });
    expect(a2.sets).toHaveLength(3);
    expect(a2.sets.every((s) => s.weight === null && s.reps === null)).toBe(true);
    expect(suggestNext(exerciseHistory(ALL, 'smith-bench-press'), exerciseIn('A', 'smith-bench-press')!)).toBeNull();
  });

  it('"החלף" ב-A2 מציע ראשון את הבנץ׳ עם משקולות יד, עם המשקל וההצעה מההיסטוריה שלו', () => {
    const slot = exerciseIn('A', 'smith-bench-press')!;
    const alt = exerciseById('db-bench-press')!;
    expect(slot.alternates[0]).toBe('db-bench-press');
    const row = swapExercise(slot, alt, openingWeight(ALL, alt.id));
    expect(row).toMatchObject({ exerciseId: 'db-bench-press', n: "בנץ' פרס- משקולות יד", swappedFrom: 'smith-bench-press', targetRepMin: 8, targetRepMax: 12 });
    expect(row.sets.map((s) => s.weight)).toEqual([15, 15, 15]);
    expect(suggestNext(exerciseHistory(ALL, alt.id), { ...alt, sets: 3 })).toMatchObject({ action: 'up', weight: 17.5, rule: 'R1' });
  });

  it('אימון A ישן נפתח לעריכה עם הבנץ׳ עם משקולות יד במקומו; הסמית מופיע כשורה ריקה אחרי השורות שנשמרו', () => {
    const rows = exercisesFor(A_SEP24, ALL);
    expect(ids(rows).slice(1, 4)).toEqual(['leg-press', 'db-bench-press', 'lat-pulldown']);
    expect(ids(rows)).toContain('smith-bench-press');
    expect(hasData(rows.find((r) => r.exerciseId === 'db-bench-press')!)).toBe(true);
    expect(hasData(rows.find((r) => r.exerciseId === 'smith-bench-press')!)).toBe(false);
    expect(exerciseHistory(ALL, 'db-bench-press')).toHaveLength(1);
  });
});

describe('C עם 8 תרגילים — אימונים ישנים עם 7', () => {
  it('C חדש: 8 תרגילים בסדר הנכון, C7 חבל ו-C8 רוטציות; C7 בלי היסטוריה → בלי הצעה', () => {
    const rows = prefilledExercises(ALL, 'C');
    expect(ids(rows)).toEqual([WARMUP_ID, 'machine-hip-abduction', 'machine-row', 'db-incline-bench-press', 'leg-press', 'db-lateral-raise-standing', 'triceps-pushdown', 'cable-rope-curl', 'cable-torso-rotation', FINISHER_ID]);
    expect(rows[7]).toMatchObject({ exerciseId: 'cable-rope-curl', targetRepMin: 12, targetRepMax: 15 });
    expect(rows[7]!.sets).toHaveLength(2);
    expect(rows[8]!.sets.map((s) => s.weight)).toEqual([20, 20, 20]); // רוטציות — המשקל האחרון מההיסטוריה
    expect(suggestNext(exerciseHistory(ALL, 'cable-rope-curl'), exerciseIn('C', 'cable-rope-curl')!)).toBeNull();
    expect(suggestNext(exerciseHistory(ALL, 'cable-torso-rotation'), exerciseIn('C', 'cable-torso-rotation')!)).toMatchObject({ rule: 'R4', weight: 20 }); // 5 מתוך 20 ק״ג = קפיצה גדולה
  });

  it('אימון C ישן עם 7 תרגילים נטען בלי שינוי, ומוצג בסדר שנשמר; התא החדש נוסף כשורה ריקה אחרי', () => {
    const r = parseWorkouts([C_OCT3]);
    expect(r.rejected).toEqual([]);
    expect(r.ok[0]).toEqual(C_OCT3);
    const rows = exercisesFor(C_OCT3, ALL);
    expect(ids(rows)).toEqual([WARMUP_ID, 'machine-hip-abduction', 'db-single-arm-row', 'db-incline-bench-press', 'leg-press', 'db-lateral-raise-standing', 'triceps-pushdown', 'cable-torso-rotation', 'machine-row', 'cable-rope-curl', FINISHER_ID]);
    for (const id of ['triceps-pushdown', 'cable-torso-rotation', 'db-single-arm-row']) {
      expect(hasData(rows.find((x) => x.exerciseId === id)!), id).toBe(true);
    }
    expect(hasData(rows.find((x) => x.exerciseId === 'cable-rope-curl')!)).toBe(false);
    expect(exerciseHistory(ALL, 'triceps-pushdown').map((h) => h.ex.sets.map((s) => s.reps))).toEqual([[15, 15]]);
    expect(exerciseHistory(ALL, 'cable-torso-rotation').map((h) => h.ex.sets.map((s) => s.weight))).toEqual([[20, 20, 20]]);
  });

  it('"דלג ואחזור" וההיסטוריה לפי מזהה, לא לפי מיקום — גם עם 8 תאים', () => {
    const rows = prefilledExercises(ALL, 'C');
    const moved = moveToEnd(rows, 'cable-rope-curl');
    expect(ids(moved).slice(-3)).toEqual(['cable-torso-rotation', 'cable-rope-curl', FINISHER_ID]);
    expect(PROGRAM.C.findIndex((e) => e.id === 'cable-torso-rotation')).toBe(7);
  });

  it('הסיכום השבועי של אימון C ישן: 7 שורות, רוטציות הגו בשמן ועם ההצעה שלה, בלי שורה לתא החדש', () => {
    const db: DB = { ...emptyDb(), workouts: ALL };
    const d = buildWeeklySummaryData(db, '2026-09-27');
    const c = d.workouts.items.find((it) => it.t === 'C')!;
    expect(c.lines).toHaveLength(7);
    expect(c.lines[6]).toMatchObject({ exerciseId: 'cable-torso-rotation', name: 'רוטציות גו', text: 'רוטציות גו 20×15,15,15' });
    expect(c.lines[6]?.suggestion?.rule).toBe('R4');
    expect(c.skipped).toEqual([]);
    expect(weeklySummaryText(d)).not.toContain('כפיפת מרפקים חבל');
  });
});
