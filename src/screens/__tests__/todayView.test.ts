import { describe, expect, it } from 'vitest';
import { waistStatus, weekDots } from '../todayView';
import type { WaistEntry } from '../../types';

// שבוע הבדיקה: ראשון 25/10/2026 … שבת 31/10/2026. רביעי = 28/10, חמישי = 29/10.
const WEEK = ['2026-10-25', '2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31'] as const;
const NAMES = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'] as const;
const PREV: WaistEntry = { d: '2026-10-21', cm: 97.5 };
const OLDER: WaistEntry = { d: '2026-10-14', cm: 98 };

describe('waistStatus — לא נמדד השבוע, לפי היום בשבוע', () => {
  const history = [OLDER, PREV];
  const expected = ['upcoming', 'upcoming', 'upcoming', 'due', 'due', 'missed', 'missed'] as const;
  WEEK.forEach((today, i) => {
    it(`${NAMES[i]} → ${expected[i]}`, () => {
      const s = waistStatus(history, today);
      expect(s.kind).toBe(expected[i]);
      expect(s.inWeek).toBeNull();
      // "קודם"/"אחרון" הוא המדידה האחרונה שלפני השבוע, לא הישנה יותר.
      expect(s.previous).toEqual(PREV);
      expect(s.measuredDay).toBeNull();
    });
  });
});

describe('waistStatus — נמדד השבוע', () => {
  const wed: WaistEntry = { d: '2026-10-28', cm: 96.5 };

  WEEK.slice(3).forEach((today, i) => {
    it(`מדידת רביעי נראית מכל יום מרביעי והלאה (${NAMES[i + 3]})`, () => {
      const s = waistStatus([PREV, wed], today);
      expect(s.kind).toBe('measured');
      expect(s.inWeek).toEqual(wed);
      expect(s.previous).toEqual(PREV);
      expect(s.measuredDay).toBe('רביעי');
    });
  });

  it('מדידה בחמישי בלי רביעי = נמדד (תקין), כמו בסיכום השבועי', () => {
    const thu: WaistEntry = { d: '2026-10-29', cm: 96.5 };
    const s = waistStatus([PREV, thu], '2026-10-29');
    expect(s.kind).toBe('measured');
    expect(s.inWeek).toEqual(thu);
    expect(s.measuredDay).toBe('חמישי');
    // גם בשבת עדיין "נמדד", לא "הוחמץ".
    expect(waistStatus([PREV, thu], '2026-10-31').kind).toBe('measured');
  });

  it('רביעי וגם חמישי — רביעי גובר', () => {
    const wedE: WaistEntry = { d: '2026-10-28', cm: 96.5 };
    const thu: WaistEntry = { d: '2026-10-29', cm: 96 };
    expect(waistStatus([wedE, thu], '2026-10-30').inWeek).toEqual(wedE);
  });

  it('מדידה בשישי = צ\'יפ ניטרלי (measured-other), לא "תקין" ולא "הוחמץ"', () => {
    const fri: WaistEntry = { d: '2026-10-30', cm: 96.5 };
    const s = waistStatus([PREV, fri], '2026-10-30');
    expect(s.kind).toBe('measured-other');
    expect(s.inWeek).toEqual(fri);
    expect(s.measuredDay).toBe('שישי');
    expect(s.previous).toEqual(PREV);
    expect(waistStatus([PREV, fri], '2026-10-31').kind).toBe('measured-other');
  });

  it('מדידה בשני = ניטרלי, וביום ראשון שלפניה היא עוד לא נראית', () => {
    const mon: WaistEntry = { d: '2026-10-26', cm: 96.5 };
    expect(waistStatus([mon], '2026-10-26').kind).toBe('measured-other');
    expect(waistStatus([mon], '2026-10-27').kind).toBe('measured-other');
    expect(waistStatus([mon], '2026-10-25').kind).toBe('upcoming');
  });

  it('מדידה אחרת השבוע וגם רביעי — רביעי גובר', () => {
    const mon: WaistEntry = { d: '2026-10-26', cm: 97 };
    const wedE: WaistEntry = { d: '2026-10-28', cm: 96.5 };
    const s = waistStatus([mon, wedE], '2026-10-30');
    expect(s.kind).toBe('measured');
    expect(s.inWeek).toEqual(wedE);
  });
});

describe('waistStatus — שבוע ראשון בלי היסטוריה', () => {
  it('בלי אף מדידה: הסטטוס לפי היום, previous ריק', () => {
    expect(waistStatus([], '2026-10-25')).toEqual({ kind: 'upcoming', inWeek: null, previous: null, measuredDay: null });
    expect(waistStatus([], '2026-10-28')).toEqual({ kind: 'due', inWeek: null, previous: null, measuredDay: null });
    expect(waistStatus([], '2026-10-31')).toEqual({ kind: 'missed', inWeek: null, previous: null, measuredDay: null });
  });

  it('מדידה ראשונה אי פעם ברביעי: נמדד, בלי "קודם"', () => {
    const s = waistStatus([{ d: '2026-10-28', cm: 96.5 }], '2026-10-28');
    expect(s.kind).toBe('measured');
    expect(s.previous).toBeNull();
  });

  it('מדידה מהשבוע הקודם לא נספרת כמדידה של השבוע הזה', () => {
    const s = waistStatus([{ d: '2026-10-24', cm: 97 }], '2026-10-28');
    expect(s.kind).toBe('due');
    expect(s.previous).toEqual({ d: '2026-10-24', cm: 97 });
  });
});

describe('weekDots', () => {
  it('נשקל / חסר / עתיד, והיום מסומן — בלי ערכים', () => {
    const dots = weekDots('2026-10-25', [94.5, null, 94.1, null, null, null, null], '2026-10-28');
    expect(dots.map((d) => d.state)).toEqual(['done', 'missing', 'done', 'missing', 'future', 'future', 'future']);
    expect(dots.map((d) => d.today)).toEqual([false, false, false, true, false, false, false]);
    expect(dots.map((d) => d.letter)).toEqual(['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש']);
    expect(dots[3]!.label).toBe('רביעי: חסר (היום)');
    expect(dots[0]!.label).toBe('ראשון: נשקל');
    expect(dots[6]!.label).toBe('שבת: עדיין לא');
    // אף שדה לא נושא את המשקל עצמו.
    for (const d of dots) expect(JSON.stringify(d)).not.toContain('94');
  });

  it('שבוע קודם שלם: הכול done ואין "היום"', () => {
    const dots = weekDots('2026-10-18', [1, 2, 3, 4, 5, 6, 7], '2026-10-28');
    expect(dots.every((d) => d.state === 'done' && !d.today)).toBe(true);
  });
});
