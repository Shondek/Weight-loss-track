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

  it('מועלה לפורמט החדש: משקל מוכפל לכל סט, שדות לא מוכרים נשמטים', () => {
    const r = parseWorkouts([legacy]);
    expect(r.rejected).toHaveLength(0);
    expect(r.ok[0]).toEqual({
      id: 'abc',
      d: '2026-08-30',
      t: 'A',
      ex: [
        {
          exerciseId: 'leg-press',
          n: 'לג פרס',
          sets: [
            { weight: 60, reps: 12, seconds: null },
            { weight: 60, reps: 12, seconds: null },
            { weight: 60, reps: 10, seconds: null },
          ],
          targetRepMin: 10,
          targetRepMax: 12,
          type: 'compound',
          bodyweightOnly: false,
        },
      ],
      knee: 0,
      shoulder: 1,
    });
    expect('ts' in (r.ok[0] as object)).toBe(false);
  });

  it('השם הישן ממופה למזהה החדש — ההיסטוריה נשמרת', () => {
    const r = parseWorkouts([
      { ...legacy, ex: [{ n: 'פולי עליון', w: 45, r: [10, 10, 9] }] },
    ]);
    expect(r.ok[0]?.ex[0]?.exerciseId).toBe('lat-pulldown');
  });

  it('תרגיל זמן מועלה לשניות ולא לחזרות', () => {
    const r = parseWorkouts([{ ...legacy, ex: [{ n: 'פלאנק', w: null, r: [45, 40] }] }]);
    expect(r.ok[0]?.ex[0]?.sets).toEqual([
      { weight: null, reps: null, seconds: 45 },
      { weight: null, reps: null, seconds: 40 },
    ]);
  });

  it('סטים ריקים בסוף נחתכים — אורך הסטים משקף מה שבוצע', () => {
    const r = parseWorkouts([{ ...legacy, ex: [{ n: 'פלאנק', w: null, r: [45, null, null] }] }]);
    expect(r.ok[0]?.ex[0]?.sets).toHaveLength(1);
  });

  it('תרגיל שירד מהתוכנית נשמר עם שמו, בלי להתחזות לתרגיל אחר', () => {
    const r = parseWorkouts([
      { ...legacy, ex: [{ n: 'RDL משקולות יד', w: 20, r: [12, 12, 10] }] },
    ]);
    expect(r.ok[0]?.ex[0]).toMatchObject({
      exerciseId: 'legacy:RDL משקולות יד',
      n: 'RDL משקולות יד',
    });
    expect(r.ok[0]?.ex[0]?.sets).toHaveLength(3);
  });

  it('הפורמט החדש נקלט כמו שהוא, באורך סטים משתנה', () => {
    const modern = {
      id: 'm1',
      d: '2026-09-02',
      t: 'A',
      knee: null,
      shoulder: null,
      ex: [
        {
          exerciseId: 'pec-deck',
          n: 'פרפר',
          sets: [
            { weight: 25, reps: 15, seconds: null },
            { weight: 22.5, reps: 13, seconds: null },
          ],
          targetRepMin: 12,
          targetRepMax: 15,
          type: 'isolation',
          bodyweightOnly: false,
        },
      ],
    };
    const r = parseWorkouts([modern]);
    expect(r.ok[0]?.ex[0]?.sets).toHaveLength(2);
    expect(r.ok[0]?.ex[0]?.sets[1]?.weight).toBe(22.5);
  });

  it('יעד וסוג שנשמרו ברשומה גוברים על התוכנית הנוכחית', () => {
    const r = parseWorkouts([
      {
        ...legacy,
        ex: [
          {
            exerciseId: 'leg-press',
            n: 'לחיצת רגליים',
            sets: [{ weight: 60, reps: 8, seconds: null }],
            targetRepMin: 6,
            targetRepMax: 8,
            type: 'isolation',
            bodyweightOnly: true,
          },
        ],
      },
    ]);
    expect(r.ok[0]?.ex[0]).toMatchObject({
      targetRepMin: 6,
      targetRepMax: 8,
      type: 'isolation',
      bodyweightOnly: true,
    });
  });

  it('יותר מ-10 סטים נחתכים', () => {
    const r = parseWorkouts([
      { ...legacy, ex: [{ n: 'לג פרס', w: 10, r: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] }] },
    ]);
    expect(r.ok[0]?.ex[0]?.sets).toHaveLength(10);
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
    expect(parseSettings(undefined)).toEqual({ programStart: null, soundEnabled: true });
    expect(parseSettings({ programStart: 'bad' })).toEqual({
      programStart: null,
      soundEnabled: true,
    });
  });
  it('מנרמל לראשון', () => {
    expect(parseSettings({ programStart: '2026-09-02' })).toEqual({
      programStart: '2026-08-30',
      soundEnabled: true,
    });
  });

  it('צליל: ברירת מחדל דלוקה, וכיבוי מפורש נשמר', () => {
    expect(parseSettings({}).soundEnabled).toBe(true);
    expect(parseSettings({ soundEnabled: false }).soundEnabled).toBe(false);
    expect(parseSettings({ soundEnabled: 'nope' }).soundEnabled).toBe(true);
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
    expect(r.db.settings).toEqual({ programStart: null, soundEnabled: true });
  });

  it('קלט שאינו אובייקט מחזיר DB ריק בלי לזרוק', () => {
    const r = parseDb('junk');
    expect(r.counts).toEqual({ weights: 0, workouts: 0, waist: 0, checkins: 0 });
  });
});
