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
      schemaVersion: 2,
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
          assisted: false,
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
      { ...legacy, ex: [{ n: 'סקוואט גובלט לספסל', w: 20, r: [12, 12, 10] }] },
    ]);
    expect(r.ok[0]?.ex[0]).toMatchObject({
      exerciseId: 'legacy:סקוואט גובלט לספסל',
      n: 'סקוואט גובלט לספסל',
    });
    expect(r.ok[0]?.ex[0]?.sets).toHaveLength(3);
  });

  it('שם ישן של תרגיל שחזר לתוכנית מתחבר למזהה שלו (RDL → db-rdl)', () => {
    const r = parseWorkouts([
      { ...legacy, ex: [{ n: 'RDL משקולות יד', w: 20, r: [12, 12, 10] }] },
    ]);
    expect(r.ok[0]?.ex[0]).toMatchObject({ exerciseId: 'db-rdl', n: 'RDL משקולות יד' });
  });

  it('תרגיל שירד מהתוכנית (retired) עדיין מזוהה — פלאנק צד נשאר בשניות', () => {
    const r = parseWorkouts([{ ...legacy, ex: [{ n: 'פלאנק צד', w: null, r: [30, 25] }] }]);
    expect(r.ok[0]?.ex[0]?.exerciseId).toBe('side-plank');
    expect(r.ok[0]?.ex[0]?.sets[0]).toEqual({ weight: null, reps: null, seconds: 30 });
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

describe('parseWorkouts — schemaVersion ורשומות שלא ניתן להמיר', () => {
  const v1 = {
    id: 'old',
    ts: 0,
    d: '2026-08-30',
    t: 'A',
    ex: [{ n: 'לג פרס', w: 60, r: [12, 12, 10] }],
    knee: 0,
    shoulder: 1,
  };
  const v2 = {
    schemaVersion: 2,
    id: 'new',
    d: '2026-09-02',
    t: 'B',
    ex: [],
    knee: null,
    shoulder: null,
  };

  it('רשומה ישנה מקבלת schemaVersion 2 ונספרת כמומרת; רשומה חדשה לא נספרת', () => {
    const r = parseWorkouts([v1, v2]);
    expect(r.ok.map((w) => w.schemaVersion)).toEqual([2, 2]);
    expect(r.upgraded).toBe(1);
    expect(parseWorkouts([v2]).upgraded).toBe(0);
  });

  it('רשומה עם תאריך שבור לא נעלמת — חוזרת גולמית ב-unparsed עם סיבה', () => {
    const broken = { ...v1, id: 'broken', d: '30/08/2026' };
    const r = parseWorkouts([v1, broken, 'junk']);
    expect(r.ok).toHaveLength(1);
    expect(r.unparsed).toEqual([
      { raw: broken, d: '30/08/2026', reason: 'תאריך לא תקין' },
      { raw: 'junk', d: null, reason: 'רשומה שאינה אובייקט' },
    ]);
    // אותה רשומה בדיוק — לא עותק מנורמל
    expect(r.unparsed[0]?.raw).toBe(broken);
  });

  it('תרגיל בלי שם ובלי מזהה נשאר, עם שם מציין-מקום', () => {
    const r = parseWorkouts([{ ...v1, ex: [{ w: 20, r: [10, 10] }] }]);
    expect(r.ok[0]?.ex).toHaveLength(1);
    expect(r.ok[0]?.ex[0]).toMatchObject({
      exerciseId: 'legacy:תרגיל ללא שם',
      n: 'תרגיל ללא שם',
    });
    expect(r.ok[0]?.ex[0]?.sets).toHaveLength(2);
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

  it('אימון שבור בייבוא נשמר ב-legacyWorkouts ומדווח כ"נשמר כאימון ישן"', () => {
    const broken = { id: 'b', d: 'nope', t: 'A', ex: [] };
    const r = parseDb({ ...legacyExport, workouts: [...legacyExport.workouts, broken] });
    expect(r.counts.workouts).toBe(1);
    expect(r.db.legacyWorkouts).toEqual([{ raw: broken, d: 'nope', reason: 'תאריך לא תקין' }]);
    expect(r.rejected).toContainEqual({
      section: 'אימונים',
      reason: 'תאריך לא תקין — נשמר כאימון ישן',
      count: 1,
    });
  });

  it('גיבוי v2 עם legacyWorkouts — הרשומות הגולמיות חוזרות למסלול, ומה שעדיין שבור נשאר ישן', () => {
    const stillBroken = { id: 'b', d: 'nope', t: 'A', ex: [] };
    const r = parseDb({
      v: 2,
      workouts: [],
      legacyWorkouts: [
        { raw: stillBroken, d: 'nope', reason: 'תאריך לא תקין' },
        { raw: legacyExport.workouts[0], d: '2026-08-30', reason: 'סיבה שכבר לא רלוונטית' },
      ],
    });
    expect(r.counts.workouts).toBe(1);
    expect(r.db.workouts[0]?.id).toBe('w1');
    expect(r.db.legacyWorkouts.map((l) => l.raw)).toEqual([stillBroken]);
  });
});
