/** מעקב קריאטין: החלפת מצב, ספירה שבועית, ימים לפני 27/9, מעבר חצות בשעון ישראל, פרסור, גיבוי/ייבוא/מיזוג. */
import { describe, expect, it } from 'vitest';
import { emptyDb, type CreatineDay, type DB } from '../../types';
import { CREATINE_DOSE_G, CREATINE_START, creatineOn, creatineTimeText, creatineWeek, markCreatine, toggleCreatine } from '../creatine';
import { today, toLocalISO } from '../date';
import { parseCreatine, parseDb } from '../schema';
import { backupJson, buildBackup, BACKUP_VERSION } from '../exportText';
import { mergeDb, recordCount } from '../db';
import { buildWeeklySummaryData, weeklySummaryText } from '../weeklySummary';
import { le, wk } from './helpers';

const AT = '2026-09-27T05:15:00.000Z'; // 08:15 בישראל (IDT)

describe('החלפת מצב', () => {
  it('נגיעה מסמנת (עם השעה והמינון), נגיעה שנייה מבטלת; ימים אחרים לא מושפעים', () => {
    let list: CreatineDay[] = [];
    list = toggleCreatine(list, '2026-09-27', AT);
    expect(list).toEqual([{ d: '2026-09-27', taken: true, at: AT, dose_g: CREATINE_DOSE_G }]);
    list = toggleCreatine(list, '2026-09-28', '2026-09-28T04:00:00.000Z');
    expect(list.map((x) => x.d)).toEqual(['2026-09-27', '2026-09-28']);
    list = toggleCreatine(list, '2026-09-27', AT);
    expect(list.map((x) => x.d)).toEqual(['2026-09-28']);
    expect(creatineOn(list, '2026-09-27')).toBeNull();
    // סימון חוזר לאותו יום מחליף את השעה, לא מכפיל
    list = markCreatine(list, '2026-09-28', '2026-09-28T06:00:00.000Z');
    expect(list).toHaveLength(2 - 1);
    expect(list[0]?.at).toBe('2026-09-28T06:00:00.000Z');
  });

  it('השעה מוצגת בשעון ישראל', () => {
    expect(creatineTimeText(AT)).toBe('08:15');
    expect(creatineTimeText('2026-09-27T21:30:00.000Z')).toBe('00:30');
    expect(creatineTimeText('x')).toBeNull();
  });

  it('מעבר חצות לפי שעון ישראל: 21:30 UTC ב-27/9 הוא כבר 28/9', () => {
    expect(today(new Date('2026-09-27T20:59:00.000Z'))).toBe('2026-09-27');
    expect(today(new Date('2026-09-27T21:00:00.000Z'))).toBe('2026-09-28');
    expect(toLocalISO(new Date(AT))).toBe('2026-09-27');
  });

  it('סימון סביב חצות נופל על התאריך הנכון בשעון ישראל — גם אחרי המעבר לשעון חורף', () => {
    // הזרימה של המסך: היום המוצג נגזר מהשעון המקומי, והסימון נרשם לאותו יום עם חותמת הזמן.
    const tapAt = (iso: string) => {
      const now = new Date(iso);
      const d = today(now);
      const list = toggleCreatine([], d, now.toISOString());
      return { d: list[0]!.d, time: creatineTimeText(list[0]!.at), week: creatineWeek(list, '2026-09-27') };
    };
    // שעון קיץ (UTC+3): 23:59 ב-27/9 עדיין 27/9; 00:30 כבר 28/9
    expect(tapAt('2026-09-27T20:59:00.000Z')).toMatchObject({ d: '2026-09-27', time: '23:59' });
    expect(tapAt('2026-09-27T21:30:00.000Z')).toMatchObject({ d: '2026-09-28', time: '00:30' });
    expect(tapAt('2026-09-27T21:30:00.000Z').week).toMatchObject({ taken: 1, days: [false, true, false, false, false, false, false] });
    // שעון חורף (UTC+2, מ-25/10/2026): 22:30 UTC ב-1/11 הוא 00:30 ב-2/11
    expect(tapAt('2026-11-01T21:30:00.000Z')).toMatchObject({ d: '2026-11-01', time: '23:30' });
    expect(tapAt('2026-11-01T22:30:00.000Z')).toMatchObject({ d: '2026-11-02', time: '00:30' });
    // הסימון נופל בשבוע הנכון: 00:30 של ראשון 4/10 שייך לשבוע 4–10/10, לא לשבוע שלפניו
    const sunday = toggleCreatine([], today(new Date('2026-10-03T21:30:00.000Z')), '2026-10-03T21:30:00.000Z');
    expect(sunday[0]!.d).toBe('2026-10-04');
    expect(creatineWeek(sunday, '2026-09-27').taken).toBe(0);
    expect(creatineWeek(sunday, '2026-10-04').taken).toBe(1);
  });
});

describe('ספירה שבועית', () => {
  const mark = (days: string[]) => days.map((d) => ({ d, taken: true as const, at: `${d}T05:00:00.000Z`, dose_g: 5 }));

  it('שבוע 27/9–3/10 (ההתחלה בראשון): 5 מתוך 7', () => {
    const w = creatineWeek(mark(['2026-09-27', '2026-09-28', '2026-09-29', '2026-10-01', '2026-10-03']), '2026-09-27');
    expect(w).toEqual({ taken: 5, eligible: 7, days: [true, true, true, false, true, false, true] });
  });

  it('ימים לפני 27/9 לא נספרים: השבוע הקודם ריק (eligible 0) גם אם סומן בטעות', () => {
    const w = creatineWeek(mark(['2026-09-25']), '2026-09-20');
    expect(w).toEqual({ taken: 0, eligible: 0, days: [null, null, null, null, null, null, null] });
    // התחלה באמצע שבוע — נספרים רק הימים מההתחלה
    const mid = creatineWeek(mark(['2026-09-29', '2026-10-02']), '2026-09-27', '2026-09-30');
    expect(mid).toEqual({ taken: 1, eligible: 4, days: [null, null, null, false, false, true, false] });
    expect(CREATINE_START).toBe('2026-09-27');
  });

  it('בסיכום השבועי: "קריאטין X/7" בסעיף התזונה; שבוע לפני ההתחלה — בלי השורה', () => {
    const db = emptyDb();
    db.creatine = mark(['2026-09-27', '2026-09-28', '2026-09-30']);
    const d = buildWeeklySummaryData(db, '2026-09-27');
    expect(d.creatine).toMatchObject({ taken: 3, eligible: 7 });
    expect(weeklySummaryText(d)).toContain('נרשמו ולא נסגרו: 0\nקריאטין 3/7\n');
    const before = buildWeeklySummaryData(db, '2026-09-20');
    expect(before.creatine).toBeNull();
    expect(weeklySummaryText(before)).not.toContain('קריאטין');
  });
});

describe('פרסור, גיבוי, ייבוא, מיזוג', () => {
  const good: CreatineDay = { d: '2026-09-27', taken: true, at: AT, dose_g: 5 };

  it('רשומה תקינה נשמרת; שבורות נדחות עם raw; כפילות — האחרונה גוברת', () => {
    const bad = [{ d: 'x', taken: true, at: AT, dose_g: 5 }, { d: '2026-09-28', taken: false, at: AT, dose_g: 5 }, { d: '2026-09-29', taken: true, at: 'no', dose_g: 5 }, { d: '2026-09-30', taken: true, at: AT, dose_g: 0 }, 'junk'];
    const r = parseCreatine([good, ...bad, { ...good, at: '2026-09-27T06:00:00.000Z' }]);
    expect(r.ok).toEqual([{ ...good, at: '2026-09-27T06:00:00.000Z' }]);
    expect(r.rejected.map((x) => x.raw)).toEqual(bad);
    expect(r.rejected.map((x) => x.reason)).toEqual(['תאריך לא תקין', 'סימון שאינו true', 'זמן הסימון לא תקין', 'מינון לא תקין', 'רשומה שאינה אובייקט']);
  });

  it('round-trip: הגיבוי נשאר v2, כולל קריאטין, ונקלט זהה; שורה שבורה בייבוא → הסגר', () => {
    const db = emptyDb();
    db.creatine = [good];
    db.weights = [{ d: '2026-09-27', w: 78.4 }];
    const b = buildBackup(db, '2026-09-27T10:00:00.000Z');
    expect(b.v).toBe(2);
    expect(BACKUP_VERSION).toBe(2);
    expect(b.creatine).toEqual([good]);
    const r = parseDb(JSON.parse(backupJson(db, '2026-09-27T10:00:00.000Z')));
    expect(r.db.creatine).toEqual([good]);
    expect(r.db.weights).toEqual(db.weights);
    expect(r.counts.creatine).toBe(1);
    expect(r.rejected).toEqual([]);

    const broken = parseDb({ v: 2, creatine: [good, { d: '2026-09-28', taken: true, at: 'no', dose_g: 5 }] });
    expect(broken.db.creatine).toEqual([good]);
    expect(broken.db.quarantine.map((q) => q.key)).toEqual(['creatine']);
    expect(broken.rejected).toEqual([{ section: 'קריאטין', reason: 'זמן הסימון לא תקין', count: 1 }]);
  });

  it('גיבוי ישן (v2 בלי creatine) נטען בלי שגיאה, ובמיזוג לא מוחק את יומן הקריאטין; הנכנס גובר לפי תאריך', () => {
    const old = parseDb({ v: 2, weights: [{ d: '2026-09-01', w: 80 }] });
    expect(old.db.creatine).toEqual([]);
    expect(old.rejected).toEqual([]);
    expect(old.db.quarantine).toEqual([]);

    const current = emptyDb();
    current.creatine = [good, { d: '2026-09-28', taken: true, at: AT, dose_g: 5 }];
    const merged = mergeDb(current, old.db);
    expect(merged.creatine).toEqual(current.creatine);
    expect(merged.weights).toEqual([{ d: '2026-09-01', w: 80 }]);

    const incoming = emptyDb();
    incoming.creatine = [{ d: '2026-09-28', taken: true, at: '2026-09-28T07:00:00.000Z', dose_g: 5 }, { d: '2026-09-29', taken: true, at: AT, dose_g: 5 }];
    const merged2 = mergeDb(current, incoming);
    expect(merged2.creatine.map((c) => [c.d, c.at])).toEqual([['2026-09-27', AT], ['2026-09-28', '2026-09-28T07:00:00.000Z'], ['2026-09-29', AT]]);
    expect(recordCount(merged2)).toBe(3);
  });

  it('fixture בפורמט הנוכחי: אחרי הפרסור תוכן כל המפתחות הקיימים זהה, ורק creatine נוסף ריק', () => {
    const fx: DB = {
      ...emptyDb(),
      weights: [{ d: '2026-09-20', w: 79 }],
      workouts: [wk('w1', '2026-09-20', 'A', [le('leg-press', 60, [12, 12, 12], { rir: 2 })], 1, 0)],
      waist: [{ d: '2026-09-23', cm: 95 }],
      checkins: [{ weekStart: '2026-09-20', adherence: 8, hunger: 5, energy: 7, sleepHours: 7, unplannedSnackDays: 1, note: 'ok' }],
      standaloneCardio: [{ id: 'sc', d: '2026-09-21', mode: 'treadmill', minutes: 60, incline: 2.5, speed: 5, note: '', steps: 7000 }],
      settings: { programStart: '2026-08-30', soundEnabled: true, lastBackup: '2026-09-20' },
      customFoods: [{ id: 'c:x', name: 'מזון', cat: 1, kcal: 100, protein: 10, carbs: null, fat: null, fiber: null, portions: [{ u: 'כף', g: 15 }], barcode: null }],
      entries: [{ id: '0000000001-a', d: '2026-09-20', ts: 1_790_000_000_000, meal: 'lunch', foodId: 'c:x', grams: 100, ref: { name: 'מזון', kcal: 100, protein: 10, carbs: null, fat: null, fiber: null } }],
      targets: [{ from: '2026-08-30', kcal: 1900, protein: 190, carbs: 120, fat: 60 }],
      favorites: [{ foodId: 'c:x', grams: 100 }],
      days: [{ d: '2026-09-20', closed: true, closedAt: '2026-09-20T20:00:00.000Z', fridayTier: 'regular', steps: 9000 }],
    };
    const { creatine: _c, quarantine: _q, ...before } = fx;
    void _c;
    void _q;
    const json = JSON.parse(backupJson(fx, '2026-09-27T00:00:00.000Z')) as Record<string, unknown>;
    delete json.creatine; // הפורמט "לפני"
    const after = parseDb(json);
    expect(after.rejected).toEqual([]);
    for (const key of Object.keys(before) as (keyof typeof before)[]) {
      expect(after.db[key], key).toEqual(before[key]);
    }
    expect(after.db.creatine).toEqual([]);
    expect(after.db.quarantine).toEqual([]);
  });
});
