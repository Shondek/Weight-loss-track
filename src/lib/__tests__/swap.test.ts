/** שלב 4.1 ג׳: החלפה חד-פעמית — swappedFrom בפרסור/הסגר/גיבוי/מיזוג, השורה שמוחלפת, ההיסטוריה לפי מזהה. */
import { describe, expect, it } from 'vitest';
import { emptyDb, type DB, type WorkoutEntry } from '../../types';
import { PROGRAM, alternatesFor, exerciseById, exerciseIn } from '../../data/program';
import { mergeDb } from '../db';
import { buildBackup } from '../exportText';
import { parseDb, parseWorkouts } from '../schema';
import { exerciseHistory, exercisesFor, hasData, slotOf, swapExercise, swappedFromLabel } from '../workouts';
import { NO_HISTORY_HINT, alternateHint, suggestNext, type ProgressionSpec } from '../progression';
import { le, wk } from './helpers';

const db = (over: Partial<DB> = {}): DB => ({ ...emptyDb(), ...over });

const specOf = (id: string): ProgressionSpec => {
  const e = exerciseById(id)!;
  return { step: e.step, repRangeMin: e.repRangeMin, repRangeMax: e.repRangeMax, isTimed: e.isTimed, bodyweightOnly: e.bodyweightOnly };
};

/** אימון B שבו הכפיפה עם משקולות הוחלפה בכפיפת פטיש. */
const swappedB = (swappedFrom: unknown, id = 'w1', d = '2026-09-14') => ({
  schemaVersion: 2,
  id,
  d,
  t: 'B',
  ex: [{ ...le('db-hammer-curl', 10, [10, 10]), swappedFrom }],
  knee: null,
  shoulder: null,
});

describe('swappedFrom — פרסור', () => {
  it('מחרוזת נשמרת; חסר/null/ריק → אין שדה; רשומה ישנה נטענת בלי שינוי', () => {
    const r = parseWorkouts([swappedB('db-supinated-curl')]);
    expect(r.rejected).toEqual([]);
    expect(r.ok[0]?.ex[0]).toMatchObject({ exerciseId: 'db-hammer-curl', swappedFrom: 'db-supinated-curl' });
    for (const v of [undefined, null, '']) {
      const p = parseWorkouts([swappedB(v)]);
      expect(p.rejected).toEqual([]);
      expect('swappedFrom' in (p.ok[0]?.ex[0] ?? {})).toBe(false);
    }
    const old = wk('w0', '2026-09-01', 'A', [le('leg-press', 60, [12, 12, 10])]);
    expect(parseWorkouts([old]).ok[0]?.ex[0]).toEqual(old.ex[0]);
  });

  it('כינוי מתורגם: swappedFrom: leg-press-45 → leg-press', () => {
    const r = parseWorkouts([{ ...swappedB('leg-press-45'), t: 'A', ex: [{ ...le('hack-squat', 40, [10, 10, 10]), swappedFrom: 'leg-press-45' }] }]);
    expect(r.ok[0]?.ex[0]?.swappedFrom).toBe('leg-press');
  });

  it('ערך לא תקין → התרגיל נטען בלי הסימון, והערך השבור נדחה עם raw (להסגר)', () => {
    for (const bad of [7, {}, ['x'], '   ']) {
      const r = parseWorkouts([swappedB(bad)]);
      expect(r.ok).toHaveLength(1);
      expect(r.ok[0]?.ex[0]?.swappedFrom).toBeUndefined();
      expect(r.ok[0]?.ex[0]?.sets).toHaveLength(2);
      expect(r.unparsed).toEqual([]);
      expect(r.rejected).toHaveLength(1);
      expect(r.rejected[0]?.raw).toMatchObject({ swappedFrom: bad });
      expect(r.rejected[0]?.reason).toContain('swappedFrom');
    }
  });

  it('שורת אירובי מתעלמת מ-swappedFrom', () => {
    const r = parseWorkouts([
      { ...swappedB('x'), ex: [{ exerciseId: 'warmup', n: 'חימום', sets: [{ weight: null, reps: null, seconds: 600 }], swappedFrom: 'x', cardio: { mode: 'bike', minutes: 10 } }] },
    ]);
    expect(r.ok[0]?.ex[0]?.swappedFrom).toBeUndefined();
    expect(r.rejected).toEqual([]);
  });
});

describe('swappedFrom — הסגר, גיבוי, מיזוג', () => {
  it('ייבוא: סימון שבור נכנס להסגר במפתח workouts; הרשומה נשמרת', () => {
    const r = parseDb({ v: 2, workouts: [swappedB(7)] });
    expect(r.db.workouts).toHaveLength(1);
    expect(r.db.legacyWorkouts).toEqual([]);
    expect(r.db.quarantine.map((q) => q.key)).toEqual(['workouts']);
    expect(r.db.quarantine[0]?.raw).toMatchObject({ swappedFrom: 7 });
    expect(r.rejected).toEqual([{ section: 'אימונים', reason: expect.stringContaining('swappedFrom'), count: 1 }]);
  });

  it('גיבוי כולל swappedFrom וחוזר בייבוא; מיזוג — הנכנס גובר לפי מזהה ושומר את הסימון', () => {
    const w = swappedB('db-supinated-curl') as WorkoutEntry;
    const b = buildBackup(db({ workouts: [w] }), '2026-09-26T00:00:00.000Z');
    expect(b.workouts[0]?.ex[0]?.swappedFrom).toBe('db-supinated-curl');
    const roundTrip = parseDb(JSON.parse(JSON.stringify(b)));
    expect(roundTrip.db.workouts[0]?.ex[0]).toEqual(w.ex[0]);
    expect(roundTrip.rejected).toEqual([]);

    const merged = mergeDb(db({ workouts: [wk('w1', '2026-09-14', 'B', [le('db-supinated-curl', 12.5, [8, 3])])] }), db({ workouts: [w] }));
    expect(merged.workouts).toHaveLength(1);
    expect(merged.workouts[0]?.ex[0]).toMatchObject({ exerciseId: 'db-hammer-curl', swappedFrom: 'db-supinated-curl' });
    // הכיוון ההפוך: רשומה ישנה בלי הסימון נכנסת על רשומה שהוחלפה — הנכנס גובר, בלי שדה.
    const back = mergeDb(db({ workouts: [w] }), db({ workouts: [wk('w1', '2026-09-14', 'B', [le('db-supinated-curl', 12.5, [8, 3])])] }));
    expect('swappedFrom' in (back.workouts[0]?.ex[0] ?? {})).toBe(false);
  });
});

describe('swapExercise — השורה שנוצרת', () => {
  const slot = exerciseIn('B', 'db-supinated-curl')!; // 2×10–12
  const hammer = exerciseById('db-hammer-curl')!;

  it('המזהה והשם של החלופה, סטים וטווח מהתא, swappedFrom = המקורי, משקל פותח מהחלופה', () => {
    const row = swapExercise(slot, hammer, 10);
    expect(row).toMatchObject({
      exerciseId: 'db-hammer-curl',
      n: hammer.name,
      swappedFrom: 'db-supinated-curl',
      targetRepMin: 10,
      targetRepMax: 12,
      type: hammer.type,
      bodyweightOnly: false,
      assisted: false,
    });
    expect(row.sets).toEqual([
      { weight: 10, reps: null, seconds: null },
      { weight: 10, reps: null, seconds: null },
    ]);
    expect(hasData(row)).toBe(false);
    expect(slotOf(row)).toBe('db-supinated-curl');
    expect(swappedFromLabel(row)).toBe(`הוחלף מ-${slot.name}`);
    expect(swappedFromLabel(le('db-supinated-curl', 12.5, [8, 3]))).toBeNull();
  });

  it('תא B עם 3 סטים → החלופה מקבלת 3 סטים גם אם במאגר רשומים 2', () => {
    const legCurlB = exerciseIn('B', 'leg-curl')!;
    expect(legCurlB.sets).toBe(3);
    const row = swapExercise(legCurlB, exerciseById('lying-leg-curl')!, null);
    expect(row.sets).toHaveLength(3);
    expect(row).toMatchObject({ targetRepMin: 10, targetRepMax: 12 });
  });

  it('חלופת זמן בתא של חזרות שומרת 30–45 שניות ומשקל גוף (wall-sit במקום פשיטת ברך)', () => {
    const legExt = exerciseIn('A', 'leg-extension')!;
    const row = swapExercise(legExt, exerciseById('wall-sit')!, 30);
    expect(row).toMatchObject({ exerciseId: 'wall-sit', swappedFrom: 'leg-extension', targetRepMin: 30, targetRepMax: 45, bodyweightOnly: true });
    expect(row.sets).toHaveLength(legExt.sets);
    expect(row.sets.every((s) => s.weight === null)).toBe(true);
  });

  it('החלופות לתא מגיעות מהתוכנית לפי המזהה של התרגיל המקורי', () => {
    expect(alternatesFor('db-supinated-curl').map((a) => a.id)).toEqual(['cable-bar-curl', 'db-hammer-curl', 'db-preacher-curl']);
    expect(alternatesFor('db-hammer-curl')).toEqual([]);
  });
});

describe('exercisesFor — שורה שהוחלפה תופסת את התא', () => {
  it('אין שורה ריקה נוספת למקורי; הסדר נשמר; מספר תרגילי הכוח כמו בתוכנית', () => {
    const slot = exerciseIn('B', 'db-supinated-curl')!;
    const swapped = swapExercise(slot, exerciseById('db-hammer-curl')!, 10);
    const entry = wk('w1', '2026-09-14', 'B', [
      le('db-rdl', 25, [10, 10, 10]),
      swapped,
      le('seated-cable-row', 40, [12, 12, 12]),
    ]);
    const rows = exercisesFor(entry, [entry]);
    const strength = rows.filter((r) => r.exerciseId !== 'warmup' && r.exerciseId !== 'finisher-cardio');
    expect(strength.map((r) => r.exerciseId)).not.toContain('db-supinated-curl');
    expect(strength.map((r) => r.exerciseId).slice(0, 3)).toEqual(['db-rdl', 'db-hammer-curl', 'seated-cable-row']);
    expect(strength.filter((r) => r.exerciseId === 'db-hammer-curl')).toHaveLength(1);
    expect(strength.map(slotOf).sort()).toEqual(PROGRAM.B.map((e) => e.id).sort());
    expect(strength.find((r) => r.exerciseId === 'db-hammer-curl')?.swappedFrom).toBe('db-supinated-curl');
  });

  it('שורה שהוחלפה בלי נתונים (אימון פתוח) עדיין מוצגת במקום המקורי', () => {
    const slot = exerciseIn('A', 'leg-press')!;
    const swapped = swapExercise(slot, exerciseById('hack-squat')!, null);
    const entry = wk('w1', '2026-09-14', 'A', [swapped]);
    const rows = exercisesFor(entry, []);
    expect(rows[1]?.exerciseId).toBe('hack-squat');
    expect(rows.some((r) => r.exerciseId === 'leg-press')).toBe(false);
  });
});

describe('היסטוריה והתקדמות לפי מזהה — אימון עם החלפה לא נספר למקורי', () => {
  const slot = exerciseIn('B', 'db-supinated-curl')!;
  const workouts = [
    wk('b1', '2026-09-04', 'B', [le('db-supinated-curl', 12.5, [8, 3])]),
    // 12.5 ק״ג: צעד 2.5 הוא בדיוק 20% — לא "קפיצה גדולה" (R4), אז R1 חל.
    wk('b2', '2026-09-14', 'B', [{ ...swapExercise(slot, exerciseById('db-hammer-curl')!, 12.5), sets: [{ weight: 12.5, reps: 12, seconds: null }, { weight: 12.5, reps: 12, seconds: null }], rir: 2 }]),
    wk('b3', '2026-09-24', 'B', [le('db-supinated-curl', 12.5, [8, 3])]),
  ];

  it('R3 של המקורי מדלג על אימון ההחלפה: שני אימונים "רצופים" הם b1 ו-b3', () => {
    const history = exerciseHistory(workouts, 'db-supinated-curl');
    expect(history.map((h) => h.workoutId)).toEqual(['b1', 'b3']);
    const s = suggestNext(history, specOf('db-supinated-curl'));
    expect(s).toMatchObject({ action: 'down', weight: 10, rule: 'R3', lastDate: '2026-09-24' });
  });

  it('ההיסטוריה של החלופה מכילה רק את אימון ההחלפה, וההצעה לה לפי הכללים הרגילים', () => {
    const history = exerciseHistory(workouts, 'db-hammer-curl');
    expect(history.map((h) => h.workoutId)).toEqual(['b2']);
    const s = suggestNext(history, { ...specOf('db-hammer-curl'), repRangeMin: 10, repRangeMax: 12 });
    expect(s).toMatchObject({ action: 'up', weight: 15, rule: 'R1', rirUnknown: false });
    expect(alternateHint(s, true)).toBeNull();
  });

  it('חלופה בלי היסטוריה → ההנחיה; שורה רגילה בלי היסטוריה → בלי הנחיה', () => {
    expect(suggestNext(exerciseHistory(workouts, 'db-preacher-curl'), specOf('db-preacher-curl'))).toBeNull();
    expect(alternateHint(null, true)).toBe(NO_HISTORY_HINT);
    expect(NO_HISTORY_HINT).toBe('אין היסטוריה — התחל קל, 2–3 חזרות ברזרבה');
    expect(alternateHint(null, false)).toBeNull();
  });
});
