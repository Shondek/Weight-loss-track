import { describe, it, expect } from 'vitest';
import {
  toLocalISO,
  fromISO,
  isValidISO,
  addDays,
  diffDays,
  dayOfWeek,
  weekStart,
  weekEnd,
  weekDays,
  isSameWeek,
  weekNumber,
  dayLetter,
  formatDM,
  formatDMY,
  weekRangeLabel,
  msUntilNextMidnight,
} from '../date';

describe('toLocalISO', () => {
  it('נותן את התאריך המקומי, לא את ה-UTC', () => {
    // 23:50 מקומי — toISOString היה עלול לזוז ליום אחר
    const late = new Date(2026, 7, 30, 23, 50, 0);
    expect(toLocalISO(late)).toBe('2026-08-30');
  });

  it('00:10 מקומי נשאר באותו יום', () => {
    const early = new Date(2026, 7, 30, 0, 10, 0);
    expect(toLocalISO(early)).toBe('2026-08-30');
  });

  it('חוצה חצות ליום הבא', () => {
    const a = new Date(2026, 7, 30, 23, 59, 59);
    const b = new Date(2026, 7, 31, 0, 0, 1);
    expect(toLocalISO(a)).toBe('2026-08-30');
    expect(toLocalISO(b)).toBe('2026-08-31');
  });

  it('מרפד חודש ויום חד-ספרתיים', () => {
    expect(toLocalISO(new Date(2026, 0, 5, 8, 0))).toBe('2026-01-05');
  });

  it('הלוך ושוב דרך fromISO שומר על הערך', () => {
    for (const iso of ['2026-01-01', '2026-02-28', '2026-12-31', '2024-02-29']) {
      expect(toLocalISO(fromISO(iso))).toBe(iso);
    }
  });
});

describe('isValidISO', () => {
  it('מקבל תאריכים תקינים', () => {
    expect(isValidISO('2026-08-30')).toBe(true);
    expect(isValidISO('2024-02-29')).toBe(true);
  });
  it('דוחה קלט לא תקין', () => {
    expect(isValidISO('2026-8-3')).toBe(false);
    expect(isValidISO('2026-13-01')).toBe(false);
    expect(isValidISO('2025-02-29')).toBe(false);
    expect(isValidISO('')).toBe(false);
    expect(isValidISO(null)).toBe(false);
    expect(isValidISO(20260830)).toBe(false);
  });
});

describe('גבולות שבוע', () => {
  it('שבת וראשון הם שבועות שונים', () => {
    // 2026-09-05 שבת, 2026-09-06 ראשון
    expect(dayOfWeek('2026-09-05')).toBe(6);
    expect(dayOfWeek('2026-09-06')).toBe(0);
    expect(weekStart('2026-09-05')).toBe('2026-08-30');
    expect(weekStart('2026-09-06')).toBe('2026-09-06');
    expect(isSameWeek('2026-09-05', '2026-09-06')).toBe(false);
  });

  it('ראשון הוא תחילת השבוע של עצמו', () => {
    expect(weekStart('2026-08-30')).toBe('2026-08-30');
    expect(dayOfWeek('2026-08-30')).toBe(0);
  });

  it('כל ימי השבוע מצביעים לאותו ראשון', () => {
    for (const d of weekDays('2026-08-30')) {
      expect(weekStart(d)).toBe('2026-08-30');
    }
  });

  it('weekEnd הוא השבת', () => {
    expect(weekEnd('2026-08-30')).toBe('2026-09-05');
    expect(weekEnd('2026-09-02')).toBe('2026-09-05');
    expect(dayOfWeek(weekEnd('2026-09-02'))).toBe(6);
  });

  it('weekDays מחזיר בדיוק שבעה ימים רצופים', () => {
    const days = weekDays('2026-08-30');
    expect(days).toEqual([
      '2026-08-30',
      '2026-08-31',
      '2026-09-01',
      '2026-09-02',
      '2026-09-03',
      '2026-09-04',
      '2026-09-05',
    ]);
  });
});

describe('מעבר חודש ושנה', () => {
  it('שבוע שחוצה חודש', () => {
    // 2026-08-30 ראשון → השבוע נמשך אל ספטמבר
    expect(weekRangeLabel('2026-08-30')).toBe('30/08–05/09');
    expect(weekStart('2026-09-01')).toBe('2026-08-30');
  });

  it('שבוע שחוצה שנה', () => {
    // 2026-12-27 ראשון → 2027-01-02 שבת
    expect(weekStart('2026-12-31')).toBe('2026-12-27');
    expect(weekEnd('2026-12-31')).toBe('2027-01-02');
    expect(weekRangeLabel('2026-12-27')).toBe('27/12–02/01');
    expect(weekStart('2027-01-01')).toBe('2026-12-27');
    expect(weekStart('2027-01-03')).toBe('2027-01-03');
  });

  it('addDays חוצה גבול שנה נכון', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2027-01-01', -1)).toBe('2026-12-31');
    expect(addDays('2026-08-31', 1)).toBe('2026-09-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDays('2024-03-01', -1)).toBe('2024-02-29');
  });

  it('diffDays סופר נכון מעבר לחודשים', () => {
    expect(diffDays('2026-08-30', '2026-09-05')).toBe(6);
    expect(diffDays('2026-09-05', '2026-08-30')).toBe(-6);
    expect(diffDays('2026-01-01', '2027-01-01')).toBe(365);
  });
});

describe('שעון קיץ/חורף (Asia/Jerusalem)', () => {
  // ישראל: שעון קיץ מתחיל בערב שישי שלפני ראשון האחרון של מרץ,
  // ומסתיים בראשון האחרון של אוקטובר. הבדיקות רצות ב-TZ=Asia/Jerusalem
  // (נקבע ב-vitest.config.ts) כדי שהמעברים יהיו אמיתיים.
  it('אזור הזמן של הבדיקות הוא ירושלים', () => {
    expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe('Asia/Jerusalem');
  });

  it('מעבר לשעון קיץ 2026 (27/03) לא מזיז ימים', () => {
    expect(addDays('2026-03-26', 1)).toBe('2026-03-27');
    expect(addDays('2026-03-27', 1)).toBe('2026-03-28');
    expect(addDays('2026-03-28', 1)).toBe('2026-03-29');
    expect(diffDays('2026-03-26', '2026-03-30')).toBe(4);
    expect(weekStart('2026-03-28')).toBe('2026-03-22');
    expect(weekDays('2026-03-22')).toHaveLength(7);
    expect(new Set(weekDays('2026-03-22')).size).toBe(7);
  });

  it('חזרה לשעון חורף 2026 (25/10) לא מזיזה ימים', () => {
    expect(addDays('2026-10-24', 1)).toBe('2026-10-25');
    expect(addDays('2026-10-25', 1)).toBe('2026-10-26');
    expect(diffDays('2026-10-23', '2026-10-27')).toBe(4);
    expect(weekStart('2026-10-25')).toBe('2026-10-25');
    expect(new Set(weekDays('2026-10-25')).size).toBe(7);
  });

  it('שרשור של 400 ימים לא צובר סחיפה', () => {
    let iso = '2026-01-01';
    for (let i = 0; i < 400; i++) iso = addDays(iso, 1);
    expect(iso).toBe('2027-02-05');
    expect(diffDays('2026-01-01', iso)).toBe(400);
  });

  it('שקילה שנרשמה ב-23:50 בליל מעבר השעון נשמרת ליום הנכון', () => {
    const beforeDst = new Date(2026, 2, 26, 23, 50, 0);
    expect(toLocalISO(beforeDst)).toBe('2026-03-26');
    const afterDst = new Date(2026, 2, 28, 23, 50, 0);
    expect(toLocalISO(afterDst)).toBe('2026-03-28');
  });
});

describe('weekNumber', () => {
  it('שבוע ההתחלה הוא 1', () => {
    expect(weekNumber('2026-08-23', '2026-08-23')).toBe(1);
    expect(weekNumber('2026-08-23', '2026-08-30')).toBe(2);
    expect(weekNumber('2026-08-23', '2026-09-05')).toBe(2); // שבת של שבוע 2
    expect(weekNumber('2026-08-23', '2026-09-06')).toBe(3);
  });
  it('עובד גם כשהעוגן אינו ראשון', () => {
    expect(weekNumber('2026-08-26', '2026-08-30')).toBe(2);
  });
});

describe('תצוגה', () => {
  it('אותיות ימים', () => {
    expect(dayLetter('2026-08-30')).toBe('א');
    expect(dayLetter('2026-09-05')).toBe('ש');
  });
  it('פורמטים', () => {
    expect(formatDM('2026-09-05')).toBe('05/09');
    expect(formatDMY('2026-09-05')).toBe('05/09/2026');
  });
});

describe('msUntilNextMidnight', () => {
  it('חיובי ולא עולה על 24 שעות', () => {
    const ms = msUntilNextMidnight(new Date(2026, 7, 30, 23, 50, 0));
    expect(ms).toBeGreaterThan(0);
    expect(ms).toBeLessThanOrEqual(24 * 3600 * 1000);
    expect(ms).toBeLessThan(11 * 60 * 1000);
  });
  it('אחרי חצות מכוון לחצות של מחר', () => {
    const ms = msUntilNextMidnight(new Date(2026, 7, 30, 0, 5, 0));
    expect(ms / 3600000).toBeGreaterThan(23);
  });
});
