import { describe, it, expect } from 'vitest';
import {
  currentValues,
  deadlineOf,
  deriveSegments,
  dominantSegment,
  endOf,
  isExpired,
  recordChange,
  segmentsOf,
  segmentsText,
  startSession,
  stepsText,
  totalMinutes,
  type CardioSession,
} from '../cardioSession';

const T0 = 1_760_000_000_000; // חותמת בסיס כלשהי
const min = (m: number) => m * 60_000;
const target = { kind: 'finisher', workoutId: 'w1', t: 'A', d: '2026-09-13' } as const;

function session(): CardioSession {
  return startSession(target, 'treadmill', 30, 0, 3.5, T0);
}

describe('ריצה — חותמות זמן', () => {
  it('הדוגמה מהמפרט: 0/5/18/30 → 5 · 13 · 12', () => {
    let s = session();
    s = recordChange(s, { incline: 10 }, T0 + min(5));
    s = recordChange(s, { incline: 5, speed: 5 }, T0 + min(18));
    expect(deriveSegments(s, T0 + min(30))).toEqual([
      { minutes: 5, incline: 0, speed: 3.5 },
      { minutes: 13, incline: 10, speed: 3.5 },
      { minutes: 12, incline: 5, speed: 5 },
    ]);
  });

  it('חיתוך אוטומטי: חוזרים אחרי שעתיים — הריצה נגמרת ב-30', () => {
    let s = session();
    s = recordChange(s, { incline: 10 }, T0 + min(5));
    const late = T0 + min(150);
    expect(isExpired(s, late)).toBe(true);
    expect(endOf(s, late)).toBe(deadlineOf(s));
    expect(deriveSegments(s, endOf(s, late))).toEqual([
      { minutes: 5, incline: 0, speed: 3.5 },
      { minutes: 25, incline: 10, speed: 3.5 },
    ]);
    // שינוי אחרי הדדליין לא נרשם
    expect(recordChange(s, { speed: 9 }, late)).toBe(s);
  });

  it('סיים לפני הזמן — רק מה שרץ', () => {
    let s = session();
    s = recordChange(s, { speed: 5 }, T0 + min(10));
    expect(deriveSegments(s, T0 + min(12))).toEqual([
      { minutes: 10, incline: 0, speed: 3.5 },
      { minutes: 2, incline: 0, speed: 5 },
    ]);
  });

  it('עיגול עם העברת שארית: הסכום שווה תמיד לעיגול של סך הריצה', () => {
    let s = session();
    // 4:40, 4:40, 4:40 → 5+4+5 = 14 (14:00 בסה"כ), לא 5+5+5
    s = recordChange(s, { incline: 1 }, T0 + 280_000);
    s = recordChange(s, { incline: 2 }, T0 + 560_000);
    const segs = deriveSegments(s, T0 + 840_000);
    expect(segs.map((x) => x.minutes)).toEqual([5, 4, 5]);
    expect(totalMinutes(segs)).toBe(14);
    // 29:31 → 30
    const s2 = session();
    expect(totalMinutes(deriveSegments(s2, T0 + 29 * 60_000 + 31_000))).toBe(30);
    // 29:29 → 29
    expect(totalMinutes(deriveSegments(s2, T0 + 29 * 60_000 + 29_000))).toBe(29);
  });

  it('שינוי מהיר (פחות מחצי דקה) נבלע — מקטע 0 נשמט', () => {
    let s = session();
    s = recordChange(s, { incline: 3 }, T0 + 10_000);
    s = recordChange(s, { incline: 6 }, T0 + 20_000);
    expect(deriveSegments(s, T0 + min(10))).toEqual([{ minutes: 10, incline: 6, speed: 3.5 }]);
  });

  it('שינוי לאותם ערכים לא מוסיף אירוע; ערכים נוכחיים = האחרון', () => {
    const s = session();
    expect(recordChange(s, { incline: 0 }, T0 + min(1))).toBe(s);
    expect(recordChange(s, { speed: 3.5 }, T0 + min(1))).toBe(s);
    const s2 = recordChange(s, { speed: 4 }, T0 + min(1));
    expect(s2.events).toHaveLength(2);
    expect(currentValues(s2)).toEqual({ incline: 0, speed: 4 });
    expect(currentValues(session())).toEqual({ incline: 0, speed: 3.5 });
  });

  it('ריצה קצרה מחצי דקה — בלי מקטעים', () => {
    expect(deriveSegments(session(), T0 + 20_000)).toEqual([]);
    expect(deriveSegments(session(), T0)).toEqual([]);
  });

  it('חותמת סוף לפני ההתחלה (שעון שהוזז) — לא שלילי', () => {
    expect(endOf(session(), T0 - min(5))).toBe(T0);
    expect(deriveSegments(session(), T0 - min(5))).toEqual([]);
  });
});

describe('מקטעים של רשומה', () => {
  it('רשומה בלי segments = מקטע יחיד; עם segments = עותק', () => {
    expect(segmentsOf({ minutes: 30, incline: 2.5, speed: 5 })).toEqual([
      { minutes: 30, incline: 2.5, speed: 5 },
    ]);
    expect(segmentsOf({ minutes: 12 })).toEqual([{ minutes: 12, incline: null, speed: null }]);
    const segs = [{ minutes: 5, incline: 0, speed: 3 }, { minutes: 7, incline: 1, speed: 4 }];
    const out = segmentsOf({ minutes: 12, incline: 1, speed: 4, segments: segs });
    expect(out).toEqual(segs);
    expect(out[0]).not.toBe(segs[0]);
    // segments ריק = אין segments
    expect(segmentsOf({ minutes: 9, incline: 1, speed: 2, segments: [] })).toEqual([
      { minutes: 9, incline: 1, speed: 2 },
    ]);
  });

  it('המקטע הארוך ביותר; בשוויון — הראשון', () => {
    expect(
      dominantSegment([
        { minutes: 5, incline: 0, speed: 3.5 },
        { minutes: 13, incline: 10, speed: 3.5 },
        { minutes: 12, incline: 5, speed: 5 },
      ]),
    ).toEqual({ minutes: 13, incline: 10, speed: 3.5 });
    expect(
      dominantSegment([
        { minutes: 10, incline: 1, speed: 1 },
        { minutes: 10, incline: 2, speed: 2 },
      ]),
    ).toEqual({ minutes: 10, incline: 1, speed: 1 });
    expect(dominantSegment([])).toBeNull();
  });

  it('טקסטים', () => {
    expect(
      segmentsText([
        { minutes: 5, incline: 0, speed: 3.5 },
        { minutes: 13, incline: 10, speed: null },
        { minutes: 12, incline: null, speed: null },
      ]),
    ).toBe('5 דק׳ 0% 3.5 קמ״ש / 13 דק׳ 10% / 12 דק׳');
    expect(stepsText(3200)).toBe('3,200 צעדים');
    expect(stepsText(0)).toBe('0 צעדים');
  });
});
