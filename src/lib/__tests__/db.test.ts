import { describe, it, expect } from 'vitest';
import { firstDataDate, mergeDb, programStartWeek } from '../db';
import { needsCheckin, isFilled, upsertCheckin, emptyCheckin, getCheckin } from '../checkins';
import { emptyDb, type DB } from '../../types';

const db = (over: Partial<DB>): DB => ({ ...emptyDb(), ...over });

describe('firstDataDate / programStartWeek', () => {
  it('התאריך המוקדם ביותר מכל הטבלאות', () => {
    expect(
      firstDataDate(
        db({
          weights: [{ d: '2026-08-30', w: 80 }],
          workouts: [
            { schemaVersion: 2, id: 'x', d: '2026-08-12', t: 'A', ex: [], knee: null, shoulder: null },
          ],
        }),
      ),
    ).toBe('2026-08-12');
  });

  it('DB ריק — null', () => {
    expect(firstDataDate(emptyDb())).toBeNull();
    expect(programStartWeek(emptyDb())).toBeNull();
  });

  it('נגזר לראשון של השבוע', () => {
    expect(programStartWeek(db({ weights: [{ d: '2026-08-12', w: 80 }] }))).toBe(
      '2026-08-09',
    );
  });

  it('הגדרה ידנית גוברת', () => {
    expect(
      programStartWeek(
        db({
          weights: [{ d: '2026-08-12', w: 80 }],
          settings: { programStart: '2026-07-05', soundEnabled: true },
        }),
      ),
    ).toBe('2026-07-05');
  });
});

describe('mergeDb', () => {
  const current = db({
    weights: [
      { d: '2026-08-30', w: 80.1 },
      { d: '2026-08-31', w: 80.0 },
    ],
    workouts: [{ schemaVersion: 2, id: 'a', d: '2026-08-30', t: 'A', ex: [], knee: 1, shoulder: null }],
    waist: [{ d: '2026-08-30', cm: 96 }],
  });

  it('רשומה מיובאת גוברת על אותו תאריך', () => {
    const merged = mergeDb(
      current,
      db({ weights: [{ d: '2026-08-30', w: 79.5 }, { d: '2026-09-01', w: 79.8 }] }),
    );
    expect(merged.weights).toEqual([
      { d: '2026-08-30', w: 79.5 },
      { d: '2026-08-31', w: 80.0 },
      { d: '2026-09-01', w: 79.8 },
    ]);
  });

  it('שום דבר קיים לא נמחק', () => {
    const merged = mergeDb(current, emptyDb());
    expect(merged.weights).toHaveLength(2);
    expect(merged.workouts).toHaveLength(1);
    expect(merged.waist).toHaveLength(1);
  });

  it('אימון מתמזג לפי מזהה', () => {
    const merged = mergeDb(
      current,
      db({
        workouts: [
          { schemaVersion: 2, id: 'a', d: '2026-08-30', t: 'B', ex: [], knee: 5, shoulder: null },
          { schemaVersion: 2, id: 'b', d: '2026-09-02', t: 'C', ex: [], knee: null, shoulder: null },
        ],
      }),
    );
    expect(merged.workouts).toHaveLength(2);
    expect(merged.workouts.find((w) => w.id === 'a')?.t).toBe('B');
  });

  it('הגדרות נשמרות אם לקובץ אין הגדרה', () => {
    const withStart = { ...current, settings: { programStart: '2026-08-02', soundEnabled: true } };
    expect(mergeDb(withStart, emptyDb()).settings.programStart).toBe('2026-08-02');
  });

  it('אימונים ישנים: הקיימים נשארים, מיובאים מתווספים, תוכן זהה לא מוכפל', () => {
    const a = { raw: { d: 'x', t: 'A' }, d: 'x', reason: 'תאריך לא תקין' };
    const b = { raw: { d: 'y', t: 'Z' }, d: 'y', reason: 'תאריך לא תקין' };
    const merged = mergeDb(
      db({ legacyWorkouts: [a] }),
      db({ legacyWorkouts: [{ ...a, raw: { ...a.raw } }, b] }),
    );
    expect(merged.legacyWorkouts).toEqual([a, b]);
    expect(mergeDb(db({ legacyWorkouts: [a] }), emptyDb()).legacyWorkouts).toEqual([a]);
  });
});

describe('needsCheckin', () => {
  const filled = {
    weekStart: '2026-08-30',
    adherence: 8,
    hunger: null,
    energy: null,
    sleepHours: null,
    unplannedSnackDays: null,
    note: '',
  };

  it('בשבת בלי צ׳ק-אין — כן', () => {
    expect(needsCheckin([], '2026-09-05', '2026-08-01')).toBe(true);
  });

  it('בשבת כשגם השבוע וגם הקודם מולאו — לא', () => {
    expect(
      needsCheckin(
        [filled, { ...filled, weekStart: '2026-08-23' }],
        '2026-09-05',
        '2026-08-01',
      ),
    ).toBe(false);
  });

  it('שבוע שנשמט מסמן שבוע אחד בלבד, לא לנצח', () => {
    // שבוע 23/08 נשמט. בשבוע 30/08 הסימון פעיל...
    expect(needsCheckin([], '2026-09-02', '2026-08-01')).toBe(true);
    // ...ובשבוע 06/09, אחרי שמולא 30/08, הוא כבר לא חוזר על השמטה ישנה.
    expect(needsCheckin([filled], '2026-09-09', '2026-08-01')).toBe(false);
  });

  it('באמצע השבוע כשהשבוע הקודם נסגר בלי צ׳ק-אין — כן', () => {
    expect(needsCheckin([], '2026-09-02', '2026-08-01')).toBe(true);
  });

  it('באמצע השבוע כשהשבוע הקודם מולא — לא', () => {
    expect(
      needsCheckin([{ ...filled, weekStart: '2026-08-23' }], '2026-09-02', '2026-08-01'),
    ).toBe(false);
  });

  it('התקנה חדשה בלי נתונים — לא מציק', () => {
    expect(needsCheckin([], '2026-09-02', null)).toBe(false);
  });

  it('נתונים שהתחילו רק השבוע — אין על מה לעשות צ׳ק-אין לשבוע שעבר', () => {
    expect(needsCheckin([], '2026-09-02', '2026-08-31')).toBe(false);
  });

  it('צ׳ק-אין ריק לגמרי נחשב כאילו לא נעשה', () => {
    expect(isFilled(emptyCheckin('2026-08-30'))).toBe(false);
    expect(needsCheckin([emptyCheckin('2026-08-30')], '2026-09-05', '2026-08-01')).toBe(true);
  });

  it('הערה בלבד נחשבת מילוי', () => {
    expect(isFilled({ ...emptyCheckin('2026-08-30'), note: 'משהו' })).toBe(true);
  });
});

describe('upsertCheckin', () => {
  it('שבוע קיים מתעדכן ולא מוכפל, והרשימה ממוינת', () => {
    let list = upsertCheckin([], emptyCheckin('2026-09-06'));
    list = upsertCheckin(list, emptyCheckin('2026-08-30'));
    list = upsertCheckin(list, { ...emptyCheckin('2026-08-30'), energy: 7 });
    expect(list).toHaveLength(2);
    expect(list.map((c) => c.weekStart)).toEqual(['2026-08-30', '2026-09-06']);
    expect(getCheckin(list, '2026-08-30')?.energy).toBe(7);
  });
});
