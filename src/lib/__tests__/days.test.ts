import { describe, expect, it } from 'vitest';
import { parseDays, parseDb } from '../schema';
import { dayMeta, isDayClosed, setDayClosed, setFridayTier, upsertDay } from '../nutrition/days';
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
