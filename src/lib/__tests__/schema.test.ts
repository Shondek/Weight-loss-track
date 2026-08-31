import { describe, it, expect } from 'vitest';
import { parseDb, parseWeights, parseWorkouts, parseCheckins, parseSettings } from '../schema';

describe('parseWeights', () => {
  it('מקבל רשומות תקינות וממיין', () => {
    const r = parseWeights([
      { d: '2026-09-01', w: 80.2 },
      { d: '2026-08-30', w: 80.1 },
    ]);
    expect(r.ok).toEqual([
      { d: '2026-08-30', w: 80.1 },
      { d: '2026-09-01', w: 80.2 },
    ]);
    expect(r.rejected).toHaveLength(0);
  });

  it('תאריך כפול — האחרון גובר, בלי כפילות', () => {
    const r = parseWeights([
      { d: '2026-08-30', w: 80.1 },
      { d: '2026-08-30', w: 79.9 },
    ]);
    expect(r.ok).toEqual([{ d: '2026-08-30', w: 79.9 }]);
  });

  it('דוחה תאריך פסול, משקל לא מספרי ומשקל מטורף — עם סיבה מדויקת', () => {
    const r = parseWeights([
      { d: 'nope', w: 80 },
      { d: '2026-08-30', w: 'abc' },
      { d: '2026-08-31', w: 5 },
      { d: '2026-09-01', w: 900 },
      42,
    ]);
    expect(r.ok).toHaveLength(0);
    expect(r.rejected.map((x) => x.reason)).toEqual([
      'תאריך לא תקין',
      'משקל שאינו מספר',
      'משקל מחוץ לטווח 20–400 ק"ג',
      'משקל מחוץ לטווח 20–400 ק"ג',
      'רשומה שאינה אובייקט',
    ]);
  });

  it('מקבל משקל שהגיע כמחרוזת', () => {
    expect(parseWeights([{ d: '2026-08-30', w: '80.4' }]).ok).toEqual([
      { d: '2026-08-30', w: 80.4 },
    ]);
  });

  it('קלט שאינו מערך מחזיר רשימה ריקה', () => {
    expect(parseWeights(null).ok).toEqual([]);
    expect(parseWeights({ d: '2026-08-30' }).ok).toEqual([]);
  });
});

describe('parseWorkouts — פורמט הגרסה הישנה', () => {
  const legacy = {
    id: 'abc',
    ts: 0,
    d: '2026-08-30',
    t: 'A',
    ex: [{ n: 'לג פרס', w: 60, r: [12, 12, 10] }],
    knee: 0,
    shoulder: 1,
  };

  it('מתקבל כמו שהוא, שדות לא מוכרים נשמטים בשקט', () => {
    const r = parseWorkouts([legacy]);
    expect(r.rejected).toHaveLength(0);
    expect(r.ok[0]).toEqual({
      id: 'abc',
      d: '2026-08-30',
      t: 'A',
      ex: [{ n: 'לג פרס', w: 60, r: [12, 12, 10] }],
      knee: 0,
      shoulder: 1,
    });
    expect('ts' in (r.ok[0] as object)).toBe(false);
  });

  it('משלים סטים חסרים ל-3 עם null', () => {
    const r = parseWorkouts([{ ...legacy, ex: [{ n: 'פלאנק', w: null, r: [45] }] }]);
    expect(r.ok[0]?.ex[0]?.r).toEqual([45, null, null]);
  });

  it('חותך סטים מיותרים לשלושה', () => {
    const r = parseWorkouts([{ ...legacy, ex: [{ n: 'X', w: 10, r: [1, 2, 3, 4, 5] }] }]);
    expect(r.ok[0]?.ex[0]?.r).toEqual([1, 2, 3]);
  });

  it('מייצר מזהה אם חסר', () => {
    const { id, ...noId } = legacy;
    void id;
    const r = parseWorkouts([noId]);
    expect(r.ok[0]?.id).toBeTruthy();
  });

  it('דוחה סוג אימון לא חוקי', () => {
    const r = parseWorkouts([{ ...legacy, t: 'D' }]);
    expect(r.ok).toHaveLength(0);
    expect(r.rejected[0]?.reason).toContain('A/B/C');
  });

  it('כאב מחוץ לטווח הופך ל-null', () => {
    const r = parseWorkouts([{ ...legacy, knee: 42, shoulder: -3 }]);
    expect(r.ok[0]?.knee).toBeNull();
    expect(r.ok[0]?.shoulder).toBeNull();
  });
});

describe('parseCheckins', () => {
  it('מנרמל תאריך שבוע לראשון וחותך הערה ל-280', () => {
    const r = parseCheckins([
      {
        weekStart: '2026-09-02',
        adherence: 8,
        hunger: 5,
        energy: 6,
        sleepHours: 6.4,
        unplannedSnackDays: 1,
        note: 'x'.repeat(400),
      },
    ]);
    expect(r.ok[0]?.weekStart).toBe('2026-08-30');
    expect(r.ok[0]?.sleepHours).toBe(6.5);
    expect(r.ok[0]?.note).toHaveLength(280);
  });

  it('ערכים מחוץ לטווח הופכים ל-null', () => {
    const r = parseCheckins([
      { weekStart: '2026-08-30', adherence: 0, hunger: 11, unplannedSnackDays: 9 },
    ]);
    expect(r.ok[0]?.adherence).toBeNull();
    expect(r.ok[0]?.hunger).toBeNull();
    expect(r.ok[0]?.unplannedSnackDays).toBeNull();
  });
});

describe('parseSettings', () => {
  it('ברירת מחדל על קלט זבל', () => {
    expect(parseSettings(undefined)).toEqual({ programStart: null });
    expect(parseSettings({ programStart: 'bad' })).toEqual({ programStart: null });
  });
  it('מנרמל לראשון', () => {
    expect(parseSettings({ programStart: '2026-09-02' })).toEqual({
      programStart: '2026-08-30',
    });
  });
});

describe('parseDb — ייבוא מהגרסה הישנה', () => {
  const legacyExport = {
    v: 1,
    exported: '2026-08-30T10:00:00.000Z',
    weights: [
      { d: '2026-08-30', w: 80.1 },
      { d: 'שבור', w: 80.1 },
    ],
    workouts: [
      {
        id: 'w1',
        ts: 0,
        d: '2026-08-30',
        t: 'A',
        ex: [{ n: 'לג פרס', w: 60, r: [12, 12, 10] }],
        knee: 0,
        shoulder: 1,
      },
    ],
  };

  it('מקבל את המבנה כמו שהוא ומדווח על דחיות', () => {
    const r = parseDb(legacyExport);
    expect(r.counts).toEqual({ weights: 1, workouts: 1, waist: 0, checkins: 0 });
    expect(r.rejected).toEqual([
      { section: 'משקל', reason: 'תאריך לא תקין', count: 1 },
    ]);
    expect(r.db.settings).toEqual({ programStart: null });
  });

  it('קלט שאינו אובייקט מחזיר DB ריק בלי לזרוק', () => {
    const r = parseDb('junk');
    expect(r.counts).toEqual({ weights: 0, workouts: 0, waist: 0, checkins: 0 });
  });
});
