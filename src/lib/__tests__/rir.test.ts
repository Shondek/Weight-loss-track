/** שלב 4A: RIR בסט האחרון — פרסור, הסגר, גיבוי, מיזוג; רשומות ישנות לא משתנות. */
import { describe, expect, it } from 'vitest';
import { parseDb, parseWorkouts } from '../schema';
import { mergeDb } from '../db';
import { buildBackup } from '../exportText';
import { emptyDb, type DB, type WorkoutEntry } from '../../types';
import { le, wk } from './helpers';

const db = (over: Partial<DB> = {}): DB => ({ ...emptyDb(), ...over });

const withRir = (rir: unknown) => ({
  schemaVersion: 2,
  id: 'w1',
  d: '2026-09-14',
  t: 'B',
  ex: [{ ...le('db-supinated-curl', 12.5, [8, 3]), rir }],
  knee: null,
  shoulder: null,
});

describe('RIR — פרסור', () => {
  it('0–4 נשמר; חסר/null → אין שדה; רשומה ישנה נטענת בלי שינוי', () => {
    for (const v of [0, 1, 2, 3, 4]) {
      const r = parseWorkouts([withRir(v)]);
      expect(r.rejected).toEqual([]);
      expect(r.ok[0]?.ex[0]?.rir).toBe(v);
    }
    const old = wk('w0', '2026-09-01', 'A', [le('leg-press', 60, [12, 12, 10])]);
    const r = parseWorkouts([old]);
    expect(r.ok[0]?.ex[0]).toEqual(old.ex[0]);
    expect('rir' in (r.ok[0]?.ex[0] ?? {})).toBe(false);
    expect(parseWorkouts([withRir(null)]).ok[0]?.ex[0]?.rir).toBeUndefined();
  });

  it('מחוץ לטווח → התרגיל נטען בלי RIR, והערך השבור נדחה עם raw (להסגר)', () => {
    for (const bad of [5, -1, 2.5, 'x']) {
      const r = parseWorkouts([withRir(bad)]);
      expect(r.ok).toHaveLength(1);
      expect(r.ok[0]?.ex[0]?.rir).toBeUndefined();
      expect(r.ok[0]?.ex[0]?.sets).toHaveLength(2);
      expect(r.unparsed).toEqual([]);
      expect(r.rejected).toHaveLength(1);
      expect(r.rejected[0]?.raw).toMatchObject({ rir: bad });
      expect(r.rejected[0]?.reason).toContain('RIR');
    }
  });

  it('שורת אירובי מתעלמת מ-RIR', () => {
    const r = parseWorkouts([
      { ...withRir(2), ex: [{ exerciseId: 'warmup', n: 'חימום', sets: [{ weight: null, reps: null, seconds: 600 }], rir: 2, cardio: { mode: 'bike', minutes: 10 } }] },
    ]);
    expect(r.ok[0]?.ex[0]?.rir).toBeUndefined();
    expect(r.rejected).toEqual([]);
  });
});

describe('RIR — הסגר, גיבוי, מיזוג', () => {
  it('ייבוא: RIR שבור נכנס להסגר במפתח workouts; הרשומה נשמרת ולא הופכת ל"אימון ישן"', () => {
    const r = parseDb({ v: 2, workouts: [withRir(9)] });
    expect(r.db.workouts).toHaveLength(1);
    expect(r.db.legacyWorkouts).toEqual([]);
    expect(r.db.quarantine.map((q) => q.key)).toEqual(['workouts']);
    expect(r.db.quarantine[0]?.raw).toMatchObject({ rir: 9 });
    expect(r.rejected).toEqual([{ section: 'אימונים', reason: expect.stringContaining('RIR'), count: 1 }]);
  });

  it('גיבוי כולל rir; מיזוג — הנכנס גובר לפי מזהה ושומר rir', () => {
    const w: WorkoutEntry = { ...(withRir(3) as WorkoutEntry) };
    const b = buildBackup(db({ workouts: [w] }), '2026-09-26T00:00:00.000Z');
    expect(b.workouts[0]?.ex[0]?.rir).toBe(3);
    const roundTrip = parseDb(JSON.parse(JSON.stringify(b)));
    expect(roundTrip.db.workouts[0]?.ex[0]?.rir).toBe(3);

    const merged = mergeDb(db({ workouts: [wk('w1', '2026-09-14', 'B', [le('db-supinated-curl', 12.5, [8, 3])])] }), db({ workouts: [w] }));
    expect(merged.workouts[0]?.ex[0]?.rir).toBe(3);
  });
});
