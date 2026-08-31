import { describe, it, expect } from 'vitest';
import { buildChatReport, backupJson, MAX_CHARS } from '../exportText';
import { EMPTY_DB, type DB, type WeightEntry } from '../../types';

const W = (d: string, w: number): WeightEntry => ({ d, w });

/** שבוע 23/08 חלקי (4/7) ואחריו שבוע 30/08 מלא — כמו בדוגמה שבמפרט. */
function baseDb(): DB {
  return {
    ...EMPTY_DB,
    weights: [
      W('2026-08-23', 80.5),
      W('2026-08-25', 80.3),
      W('2026-08-27', 80.2),
      W('2026-08-29', 80.24),
      W('2026-08-30', 80.1),
      W('2026-08-31', 80.0),
      W('2026-09-01', 79.8),
      W('2026-09-02', 80.2),
      W('2026-09-03', 79.9),
      W('2026-09-04', 79.9),
      W('2026-09-05', 79.9),
    ],
    waist: [
      { d: '2026-08-24', cm: 96.0 },
      { d: '2026-09-01', cm: 95.5 },
    ],
    workouts: [
      {
        id: '2026-09-02-a',
        d: '2026-09-02',
        t: 'A',
        knee: 1,
        shoulder: 2,
        ex: [
          { n: 'לג פרס', w: 60, r: [12, 12, 10] },
          { n: 'לחיצת חזה במכונה', w: 30, r: [10, 10, 8] },
          { n: 'חתירת כבל בישיבה', w: 40, r: [12, 12, 12] },
          { n: 'RDL משקולות יד', w: 20, r: [12, 12, 10] },
          { n: 'פייס פול', w: 15, r: [15, 15, 15] },
          { n: 'פלאנק', w: null, r: [45, 40, 40] },
        ],
      },
      {
        id: '2026-09-05-b',
        d: '2026-09-05',
        t: 'B',
        knee: 0,
        shoulder: 1,
        ex: [
          { n: 'הרמת אגן', w: 60, r: [12, 12, 12] },
          { n: 'פולי עליון', w: 45, r: [10, 10, 9] },
          { n: 'Dead bug', w: null, r: [40, 40, 35] },
        ],
      },
    ],
    checkins: [
      {
        weekStart: '2026-08-30',
        adherence: 8,
        hunger: 5,
        energy: 6,
        sleepHours: 6.5,
        unplannedSnackDays: 1,
        note: 'שבוע עמוס בעבודה, אימון שלישי לא קרה.',
      },
    ],
  };
}

describe('buildChatReport — snapshot של הפורמט', () => {
  it('שבוע מלא', () => {
    expect(buildChatReport(baseDb(), '2026-08-30', '2026-09-05')).toMatchInlineSnapshot(`
      "צ'ק-אין — שבת 05/09/2026 · שבוע 2 · 30/08–05/09

      משקל
      ממוצע השבוע: 79.97 (7/7)
      שבוע קודם: 80.31 (חלקי 4/7)
      השבוע הקודם חלקי (4/7) — אין השוואה
      יומי: א 80.1 · ב 80.0 · ג 79.8 · ד 80.2 · ה 79.9 · ו 79.9 · ש 79.9
      מותניים: 95.5 (קודם 96.0)

      אימונים: 2/3
      02/09 A — לג פרס 60×12,12,10 · לחיצת חזה 30×10,10,8 · חתירת כבל 40×12,12,12 · RDL 20×12,12,10 · פייס פול 15×15,15,15 · פלאנק 45,40,40 שנ׳
      05/09 B — הרמת אגן 60×12,12,12 · פולי עליון 45×10,10,9 · Dead bug 40,40,35 שנ׳
      כאב: ברך 1 · כתף 2

      צ'ק-אין
      היצמדות 8 · רעב 5 · אנרגיה 6 · שינה 6.5 שעות · נשנוש בלתי מתוכנן 1 ימים
      הערה: שבוע עמוס בעבודה, אימון שלישי לא קרה.

      ממוצעים שבועיים אחרונים
      23/08 80.31 (חלקי 4/7) · 30/08 79.97 (7/7)

      חסר: אימון שלישי"
    `);
  });
});

describe('כלל 2 — שבוע חלקי', () => {
  const db = baseDb();
  // מסירים את שבת מהשבוע הנוכחי
  const partial: DB = { ...db, weights: db.weights.filter((e) => e.d !== '2026-09-05') };
  const text = buildChatReport(partial, '2026-08-30', '2026-09-05');

  it('שורת "שינוי" לא מופיעה כלל', () => {
    expect(text).not.toContain('שינוי:');
  });

  it('במקומה מופיעה שורת חלקי', () => {
    expect(text).toContain('השבוע חלקי (6/7) — אין השוואה');
  });

  it('הממוצע עדיין מוצג, עם סימון חלקי', () => {
    expect(text).toContain('ממוצע השבוע: 79.98 (חלקי 6/7)');
  });

  it('היום החסר מופיע בסעיף "חסר"', () => {
    expect(text).toContain('שקילה של 05/09');
  });
});

describe('כלל 2 — שני שבועות מלאים נותנים שורת שינוי', () => {
  const db = baseDb();
  const full: DB = {
    ...db,
    weights: [
      ...db.weights.filter((e) => e.d >= '2026-08-30'),
      W('2026-08-23', 80.5),
      W('2026-08-24', 80.4),
      W('2026-08-25', 80.3),
      W('2026-08-26', 80.2),
      W('2026-08-27', 80.3),
      W('2026-08-28', 80.2),
      W('2026-08-29', 80.3),
    ],
  };
  const text = buildChatReport(full, '2026-08-30', '2026-09-05');

  it('ירידה בק"ג ובאחוז ממשקל הגוף', () => {
    expect(text).toContain('שבוע קודם: 80.31 (7/7)');
    expect(text).toContain('שינוי: ירידה 0.34 ק"ג (0.42%)');
  });
});

describe('כלל 3 — שדה שלא מולא נכתב "—"', () => {
  const text = buildChatReport(
    { ...EMPTY_DB, weights: [W('2026-09-02', 80)] },
    '2026-08-30',
    '2026-09-05',
  );

  it('כל השדות קיימים, ריקים מסומנים', () => {
    expect(text).toContain('יומי: א — · ב — · ג — · ד 80.0 · ה — · ו — · ש —');
    expect(text).toContain('מותניים: — (קודם —)');
    expect(text).toContain('כאב: ברך — · כתף —');
    expect(text).toContain(
      'היצמדות — · רעב — · אנרגיה — · שינה — שעות · נשנוש בלתי מתוכנן — ימים',
    );
    expect(text).toContain('הערה: —');
  });
});

describe('כלל 4 — סעיף חסר', () => {
  it('מפרט אימונים חסרים, ימים בלי שקילה ומותניים', () => {
    const text = buildChatReport(
      { ...EMPTY_DB, weights: [W('2026-08-30', 80), W('2026-08-31', 80)] },
      '2026-08-30',
      '2026-09-05',
    );
    expect(text).toContain(
      'חסר: אימון ראשון · אימון שני · אימון שלישי · שקילות של 01/09, 02/09, 03/09, 04/09, 05/09 · מדידת מותניים',
    );
  });

  it('לא מחשיב ימים עתידיים כחסרים', () => {
    const text = buildChatReport(
      { ...EMPTY_DB, weights: [W('2026-08-30', 80), W('2026-08-31', 80)] },
      '2026-08-30',
      '2026-08-31',
    );
    expect(text).not.toContain('01/09');
  });

  it('כשאין חסר — נכתב מקף, השורה לא נעלמת', () => {
    const db = baseDb();
    const complete: DB = {
      ...db,
      workouts: [
        ...db.workouts,
        { id: 'x', d: '2026-09-04', t: 'C', knee: null, shoulder: null, ex: [{ n: 'הרמות עגל', w: 20, r: [15, 15, 15] }] },
      ],
    };
    expect(buildChatReport(complete, '2026-08-30', '2026-09-05')).toContain('חסר: —');
  });
});

describe('כלל 1 — תקרת 2,500 תווים', () => {
  it('היסטוריה ארוכה נחתכת לשמונה שבועות', () => {
    const weights: WeightEntry[] = [];
    for (let i = 0; i < 52 * 7; i++) {
      const d = new Date(2025, 8, 7 + i);
      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      weights.push(W(iso, 80 + (i % 5) / 10));
    }
    const text = buildChatReport({ ...EMPTY_DB, weights }, '2026-08-30', '2026-09-05');
    expect(text.length).toBeLessThanOrEqual(MAX_CHARS);
    expect(text.split('ממוצעים שבועיים אחרונים\n')[1]?.split('\n')[0]?.split(' · ')).toHaveLength(8);
  });

  it('גם עם המון אימונים ותרגילים נשאר מתחת לתקרה', () => {
    const db = baseDb();
    const many = { ...db, workouts: [...Array(9)].map((_, i) => ({
      ...db.workouts[0]!,
      id: `w${i}`,
      d: `2026-09-0${(i % 5) + 1}`,
    })) };
    const text = buildChatReport(many, '2026-08-30', '2026-09-05');
    expect(text.length).toBeLessThanOrEqual(MAX_CHARS);
    expect(text).toContain('אימונים: 9/3');
  });
});

describe('backupJson', () => {
  it('מייצר את מבנה הייצוא של הגרסה הקיימת', () => {
    const parsed: unknown = JSON.parse(backupJson(baseDb(), '2026-09-05T05:00:00.000Z'));
    expect(parsed).toMatchObject({ v: 1, exported: '2026-09-05T05:00:00.000Z' });
    expect(Object.keys(parsed as object)).toEqual([
      'v',
      'exported',
      'weights',
      'workouts',
      'waist',
      'checkins',
      'settings',
    ]);
  });
});
