import { describe, expect, it } from 'vitest';
import { parseDays, parseDb } from '../schema';
import { dayMeta, isDayClosed, setDayClosed, setDaySteps, setFridayTier, stepsOn, upsertDay } from '../nutrition/days';
import { mergeDb } from '../db';
import { buildBackup } from '../exportText';
import { emptyDb, type DayMeta, type DB } from '../../types';

const db = (over: Partial<DB> = {}): DB => ({ ...emptyDb(), ...over });

describe('parseDays', () => {
  it('רשומה תקינה, שדות אופציונליים רק כשתקינים', () => {
    const r = parseDays([
      { d: '2026-09-25', closed: true, closedAt: '2026-09-25T21:00:00.000Z', fridayTier: 'large' },
      { d: '2026-09-24', closed: false, closedAt: 'not a date', fridayTier: 'huge' },
    ]);
    expect(r.rejected).toEqual([]);
    expect(r.ok).toEqual([
      { d: '2026-09-24', closed: false },
      { d: '2026-09-25', closed: true, closedAt: '2026-09-25T21:00:00.000Z', fridayTier: 'large' },
    ]);
  });

  it('כפילות תאריך — האחרונה גוברת', () => {
    const r = parseDays([
      { d: '2026-09-25', closed: false },
      { d: '2026-09-25', closed: true },
    ]);
    expect(r.ok).toEqual([{ d: '2026-09-25', closed: true }]);
  });

  it('דחיות נושאות את הרשומה הגולמית — להסגר', () => {
    const bad = [{ d: '25/09/2026', closed: true }, { d: '2026-09-25' }, 'junk'];
    const r = parseDays(bad);
    expect(r.ok).toEqual([]);
    expect(r.rejected.map((x) => x.raw)).toEqual(bad);
    expect(r.rejected.map((x) => x.reason)).toEqual(['תאריך לא תקין', 'סטטוס סגירה שאינו כן/לא', 'רשומה שאינה אובייקט']);
  });
});

describe('days — עזרים', () => {
  it('סגירה שומרת זמן, פתיחה מוחקת אותו ומשאירה שישי', () => {
    let list: DayMeta[] = [];
    list = setFridayTier(list, '2026-09-25', 'regular');
    list = setDayClosed(list, '2026-09-25', true, '2026-09-25T21:00:00.000Z');
    expect(dayMeta(list, '2026-09-25')).toEqual({ d: '2026-09-25', closed: true, closedAt: '2026-09-25T21:00:00.000Z', fridayTier: 'regular' });
    expect(isDayClosed(list, '2026-09-25')).toBe(true);
    list = setDayClosed(list, '2026-09-25', false, '2026-09-25T22:00:00.000Z');
    expect(dayMeta(list, '2026-09-25')).toEqual({ d: '2026-09-25', closed: false, fridayTier: 'regular' });
    list = setFridayTier(list, '2026-09-25', null);
    expect(dayMeta(list, '2026-09-25')).toEqual({ d: '2026-09-25', closed: false });
    expect(upsertDay(list, { d: '2026-09-20', closed: true }).map((x) => x.d)).toEqual(['2026-09-20', '2026-09-25']);
  });
});

describe('days — גיבוי, ייבוא, מיזוג', () => {
  const D: DayMeta = { d: '2026-09-25', closed: true, closedAt: '2026-09-25T21:00:00.000Z' };

  it('buildBackup כולל days', () => {
    const b = buildBackup(db({ days: [D] }), '2026-09-26T00:00:00.000Z');
    expect(b.days).toEqual([D]);
  });

  it('גיבוי בלי days נקלט בדיוק כמו קודם — days ריק, בלי דחייה', () => {
    const r = parseDb({ v: 2, weights: [{ d: '2026-09-01', w: 80 }] });
    expect(r.db.days).toEqual([]);
    expect(r.db.quarantine).toEqual([]);
    expect(r.rejected).toEqual([]);
    expect(r.db.weights).toHaveLength(1);
  });

  it('שורת days שבורה בייבוא נכנסת להסגר', () => {
    const r = parseDb({ v: 2, days: [D, { d: 'x', closed: true }] });
    expect(r.db.days).toEqual([D]);
    expect(r.db.quarantine.map((q) => [q.key, q.raw])).toEqual([['days', { d: 'x', closed: true }]]);
    expect(r.rejected).toContainEqual({ section: 'ימים', reason: 'תאריך לא תקין', count: 1 });
  });

  it('mergeDb — הנכנס גובר לפי תאריך, הקיים לא נמחק', () => {
    const merged = mergeDb(
      db({ days: [{ d: '2026-09-25', closed: false }, { d: '2026-09-20', closed: true }] }),
      db({ days: [D] }),
    );
    expect(merged.days).toEqual([{ d: '2026-09-20', closed: true }, D]);
  });
});

describe('צעדים (שלב 6)', () => {
  it('פרסור: שלם 0–100,000 נשמר; חסר/null → אין שדה; רשומה ישנה נטענת בלי שינוי', () => {
    const r = parseDays([
      { d: '2026-09-25', closed: true, steps: 9812 },
      { d: '2026-09-24', closed: false, steps: 0 },
      { d: '2026-09-23', closed: false, steps: null },
      { d: '2026-09-22', closed: true, closedAt: '2026-09-22T21:00:00.000Z', fridayTier: 'large' },
    ]);
    expect(r.rejected).toEqual([]);
    expect(r.ok).toEqual([
      { d: '2026-09-22', closed: true, closedAt: '2026-09-22T21:00:00.000Z', fridayTier: 'large' },
      { d: '2026-09-23', closed: false },
      { d: '2026-09-24', closed: false, steps: 0 },
      { d: '2026-09-25', closed: true, steps: 9812 },
    ]);
  });

  it('150000 / 8.5 / "x" / −1 → רק השדה נשמט, היום נשאר (closed נשאר true), והשורה הגולמית נדחית עם reason "steps"', () => {
    for (const bad of [150000, 8.5, 'x', -1]) {
      const row = { d: '2026-09-25', closed: true, closedAt: '2026-09-25T21:00:00.000Z', fridayTier: 'regular', steps: bad };
      const r = parseDays([row]);
      expect(r.ok).toEqual([{ d: '2026-09-25', closed: true, closedAt: '2026-09-25T21:00:00.000Z', fridayTier: 'regular' }]);
      expect(r.rejected).toHaveLength(1);
      expect(r.rejected[0]?.raw).toBe(row);
      expect(r.rejected[0]?.reason).toMatch(/^steps/);
    }
  });

  it('ייבוא: צעדים שבורים → הסגר במפתח days, היום נשמר; גיבוי ומיזוג שומרים צעדים; גיבוי ישן בלי צעדים נקלט כמו קודם', () => {
    const r = parseDb({ v: 2, days: [{ d: '2026-09-25', closed: true, steps: 150000 }] });
    expect(r.db.days).toEqual([{ d: '2026-09-25', closed: true }]);
    expect(r.db.quarantine.map((q) => [q.key, q.raw])).toEqual([['days', { d: '2026-09-25', closed: true, steps: 150000 }]]);
    expect(r.rejected).toEqual([{ section: 'ימים', reason: expect.stringMatching(/^steps/), count: 1 }]);

    const D: DayMeta = { d: '2026-09-25', closed: true, closedAt: '2026-09-25T21:00:00.000Z', steps: 9812 };
    const b = buildBackup(db({ days: [D] }), '2026-09-26T00:00:00.000Z');
    expect(b.days).toEqual([D]);
    const roundTrip = parseDb(JSON.parse(JSON.stringify(b)));
    expect(roundTrip.db.days).toEqual([D]);
    expect(roundTrip.rejected).toEqual([]);

    const merged = mergeDb(db({ days: [{ d: '2026-09-25', closed: false }] }), db({ days: [D] }));
    expect(merged.days).toEqual([D]);
    const back = mergeDb(db({ days: [D] }), db({ days: [{ d: '2026-09-25', closed: false }] }));
    expect(back.days).toEqual([{ d: '2026-09-25', closed: false }]);

    const old = parseDb({ v: 2, days: [{ d: '2026-09-25', closed: true, fridayTier: 'regular' }] });
    expect(old.db.days).toEqual([{ d: '2026-09-25', closed: true, fridayTier: 'regular' }]);
    expect(old.rejected).toEqual([]);
  });

  it('setDaySteps קובע/מסיר בלי לגעת בסגירה ובשישי; stepsOn', () => {
    let list: DayMeta[] = [{ d: '2026-09-25', closed: true, closedAt: '2026-09-25T21:00:00.000Z', fridayTier: 'regular' }];
    list = setDaySteps(list, '2026-09-25', 9812);
    expect(dayMeta(list, '2026-09-25')).toEqual({ d: '2026-09-25', closed: true, closedAt: '2026-09-25T21:00:00.000Z', fridayTier: 'regular', steps: 9812 });
    expect(stepsOn(list, '2026-09-25')).toBe(9812);
    list = setDaySteps(list, '2026-09-24', 7000);
    expect(dayMeta(list, '2026-09-24')).toEqual({ d: '2026-09-24', closed: false, steps: 7000 });
    list = setDaySteps(list, '2026-09-25', null);
    expect(dayMeta(list, '2026-09-25')).toEqual({ d: '2026-09-25', closed: true, closedAt: '2026-09-25T21:00:00.000Z', fridayTier: 'regular' });
    expect(stepsOn(list, '2026-09-25')).toBeNull();
    expect(stepsOn(list, '2026-09-01')).toBeNull();
  });
});
