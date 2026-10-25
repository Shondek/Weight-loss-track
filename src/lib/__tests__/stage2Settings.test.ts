/**
 * הגדרות שלב 2 של התוכנית (25/10/2026, בתוקף מ-1/11/2026):
 *  1. יעד חלבון 190 → 180 — נתון ב-`fatloss:targets` (שכבה עם `from`), לא
 *     קבוע בקוד: הסיכום משתמש ביעד שבתוקף בשבת של השבוע, המסכים ביעד של היום.
 *  2. תקציב אירובי 60 → 120 — כבר תלוי תאריך (`CARDIO_BUDGET_SCHEDULE`), נבדק
 *     ב-cardioBudget.test.ts.
 *  3. מותניים בסיכום: רביעי; אין רביעי → חמישי עם הערך; שישי/שבת "לא תקף".
 *  4. צעדים: שורת היעד הקיימת מ-1/11 ("ימים ≥ 8,000: X/הוזנו", steps.ts) — בלי שינוי.
 *  5. צהריים מהבית: שדה אופציונלי חדש בצ'ק-אין; בסיכום רק משבוע 1/11.
 */
import { describe, expect, it } from 'vitest';
import { emptyDb, type ISODate, type WeeklyCheckin } from '../../types';
import { HOME_LUNCH_FROM, HOME_LUNCH_MAX } from '../../data/config';
import { emptyCheckin, isFilled, upsertCheckin, withHomeLunchDays } from '../checkins';
import { cardioBudgetFor } from '../cardio';
import { parseCheckins } from '../schema';
import { targetFor } from '../nutrition/targets';
import { buildWeeklySummaryData, weeklySummaryText } from '../weeklySummary';

/** השבוע האחרון של שלב 1 (ראשון–שבת), והראשון של שלב 2. 1/11/2026 הוא יום ראשון. */
const LAST_STAGE1_WEEK = '2026-10-25';
const FIRST_STAGE2_WEEK = '2026-11-01';

const TARGETS = [
  { from: '2026-08-30', kcal: 1900, protein: 190, carbs: 120, fat: 60 },
  { from: '2026-11-01', kcal: 1900, protein: 180, carbs: 130, fat: 60 },
];

describe('1. יעד חלבון — היעד שבתוקף ביום / בשבת של השבוע', () => {
  it('יום 31/10 → 190; יום 1/11 → 180; הקלוריות לא משתנות', () => {
    expect(targetFor(TARGETS, '2026-10-31')).toMatchObject({ protein: 190, kcal: 1900 });
    expect(targetFor(TARGETS, '2026-11-01')).toMatchObject({ protein: 180, kcal: 1900 });
    expect(targetFor(TARGETS, '2026-12-15')).toMatchObject({ protein: 180, kcal: 1900 });
  });

  it('שבוע 25–31/10 → 190 (שבת 31/10); שבוע 1–7/11 → 180; "חלבון ≥" לפי היעד של אותו שבוע', () => {
    const db = emptyDb();
    db.targets = TARGETS;
    const before = buildWeeklySummaryData(db, LAST_STAGE1_WEEK);
    expect(before.nutrition.target).toEqual({ kcal: 1900, protein: 190 });
    const after = buildWeeklySummaryData(db, FIRST_STAGE2_WEEK);
    expect(after.nutrition.target).toEqual({ kcal: 1900, protein: 180 });
    expect(before.saturday).toBe('2026-10-31');
    expect(after.week).toBe('2026-11-01');
  });
});

describe('2. תקציב אירובי — כבר תלוי תאריך, לא השתנה', () => {
  it('60 בשבוע 25–31/10, 120 מהשבוע של 1/11', () => {
    expect(cardioBudgetFor(LAST_STAGE1_WEEK)).toBe(60);
    expect(cardioBudgetFor(FIRST_STAGE2_WEEK)).toBe(120);
  });
});

describe('3. מותניים בסיכום — רביעי, אחרת חמישי עם הערך, שישי/שבת לא תקף', () => {
  // שבוע 18–24/10/2026: רביעי 21/10, חמישי 22/10, שישי 23/10, שבת 24/10
  const WS = '2026-10-18';
  const section = (text: string) => text.split('מותניים\n')[1]!.split('\n\n')[0]!;
  const withWaist = (entries: { d: ISODate; cm: number }[]) => {
    const db = emptyDb();
    db.waist = entries;
    return buildWeeklySummaryData(db, WS);
  };

  it('רק רביעי → השורה הקיימת, בלי דגל', () => {
    const d = withWaist([{ d: '2026-10-21', cm: 89.5 }]);
    expect(d.waist).toEqual({ wednesday: { d: '2026-10-21', cm: 89.5 }, thursday: null, late: null, previous: [] });
    expect(section(weeklySummaryText(d))).toBe('רביעי 21/10: 89.5 ס״מ\nאחרונות לפני: —');
    expect(d.flags).not.toContain('מותניים לא נמדדו ברביעי');
  });

  it('רק חמישי → "מותניים 89.0 (חמישי 22/10)", נחשב מדידת השבוע — בלי דגל', () => {
    const d = withWaist([{ d: '2026-10-22', cm: 89 }]);
    expect(d.waist).toEqual({ wednesday: null, thursday: { d: '2026-10-22', cm: 89 }, late: null, previous: [] });
    expect(section(weeklySummaryText(d))).toBe('מותניים 89.0 (חמישי 22/10)\nאחרונות לפני: —');
    expect(d.flags).not.toContain('מותניים לא נמדדו ברביעי');
  });

  it('רביעי וחמישי → רביעי גובר; החמישי לא מוצג', () => {
    const d = withWaist([
      { d: '2026-10-21', cm: 89.5 },
      { d: '2026-10-22', cm: 89 },
    ]);
    expect(d.waist.wednesday).toEqual({ d: '2026-10-21', cm: 89.5 });
    expect(d.waist.thursday).toBeNull();
    expect(d.waist.late).toBeNull();
    expect(section(weeklySummaryText(d))).toBe('רביעי 21/10: 89.5 ס״מ\nאחרונות לפני: —');
  });

  it('רק שישי → "(שישי — לא תקף)", הדגל נשאר; רק שבת → "(שבת — לא תקף)"', () => {
    const fri = withWaist([{ d: '2026-10-23', cm: 90 }]);
    expect(fri.waist).toEqual({ wednesday: null, thursday: null, late: { d: '2026-10-23', cm: 90 }, previous: [] });
    expect(section(weeklySummaryText(fri))).toBe('מותניים 90.0 (שישי — לא תקף)\nאחרונות לפני: —');
    expect(fri.flags).toContain('מותניים לא נמדדו ברביעי');

    const sat = withWaist([{ d: '2026-10-24', cm: 90.5 }]);
    expect(section(weeklySummaryText(sat))).toBe('מותניים 90.5 (שבת — לא תקף)\nאחרונות לפני: —');
    expect(sat.flags).toContain('מותניים לא נמדדו ברביעי');
    // שישי ושבת → המאוחרת (שבת)
    const both = withWaist([
      { d: '2026-10-23', cm: 90 },
      { d: '2026-10-24', cm: 90.5 },
    ]);
    expect(both.waist.late).toEqual({ d: '2026-10-24', cm: 90.5 });
  });

  it('חמישי ושישי → חמישי (תקף), השישי לא מוצג; ראשון–שלישי לא נוגעים — נשארים ב"אחרונות לפני"', () => {
    const d = withWaist([
      { d: '2026-10-19', cm: 91 }, // שני — לפני רביעי: "אחרונות לפני"
      { d: '2026-10-22', cm: 89 },
      { d: '2026-10-23', cm: 90 },
    ]);
    expect(d.waist.thursday).toEqual({ d: '2026-10-22', cm: 89 });
    expect(d.waist.late).toBeNull();
    expect(d.waist.previous).toEqual([{ d: '2026-10-19', cm: 91 }]);
    expect(section(weeklySummaryText(d))).toBe('מותניים 89.0 (חמישי 22/10)\nאחרונות לפני: 19/10 91.0');
  });

  it('בלי מדידה → כמו קודם: "לא נמדד ברביעי" + דגל', () => {
    const d = withWaist([]);
    expect(section(weeklySummaryText(d))).toBe('לא נמדד ברביעי\nאחרונות לפני: —');
    expect(d.flags).toContain('מותניים לא נמדדו ברביעי');
  });
});

describe('5. צהריים מהבית — שדה אופציונלי בצ\'ק-אין, בסיכום רק מ-1/11', () => {
  const base: WeeklyCheckin = { weekStart: FIRST_STAGE2_WEEK, adherence: 8, hunger: 5, energy: 7, sleepHours: 7, unplannedSnackDays: 1, note: '' };

  it('רשומה ישנה בלי השדה נטענת כמו שהייתה — בלי המפתח, לא null', () => {
    const r = parseCheckins([{ weekStart: '2026-10-25', adherence: 8, hunger: 5, energy: 7, sleepHours: 7, unplannedSnackDays: 1, note: 'x' }]);
    expect(r.ok).toHaveLength(1);
    expect('homeLunchDays' in r.ok[0]!).toBe(false);
    expect(r.ok[0]).toEqual({ weekStart: '2026-10-25', adherence: 8, hunger: 5, energy: 7, sleepHours: 7, unplannedSnackDays: 1, note: 'x' });
  });

  it('0 ו-5 נשמרים; 6, −1, null ומחרוזת ריקה → השדה לא נכתב; שאר השדות לא משתנים', () => {
    expect(HOME_LUNCH_MAX).toBe(5);
    const ok = parseCheckins([
      { weekStart: '2026-11-01', homeLunchDays: 0 },
      { weekStart: '2026-11-08', homeLunchDays: 5 },
      { weekStart: '2026-11-15', homeLunchDays: 6 },
      { weekStart: '2026-11-22', homeLunchDays: -1 },
      { weekStart: '2026-11-29', homeLunchDays: null },
      { weekStart: '2026-12-06', homeLunchDays: '' },
    ]).ok;
    expect(ok.map((c) => c.homeLunchDays)).toEqual([0, 5, undefined, undefined, undefined, undefined]);
    expect(ok[0]).toMatchObject({ adherence: null, hunger: null, energy: null, sleepHours: null, unplannedSnackDays: null, note: '' });
  });

  it('isFilled: רק "צהריים מהבית" כבר נחשב מולא; withHomeLunchDays קובע ומסיר בלי null', () => {
    const empty = emptyCheckin(FIRST_STAGE2_WEEK);
    expect(isFilled(empty)).toBe(false);
    const set = withHomeLunchDays(empty, 0);
    expect(set).toEqual({ ...empty, homeLunchDays: 0 });
    expect(isFilled(set)).toBe(true);
    const cleared = withHomeLunchDays(set, null);
    expect(cleared).toEqual(empty);
    expect('homeLunchDays' in cleared).toBe(false);
    // עדכון רגיל של שדה אחר שומר על הערך
    const list = upsertCheckin([], { ...withHomeLunchDays(base, 3), adherence: 9 });
    expect(list[0]).toMatchObject({ adherence: 9, homeLunchDays: 3 });
  });

  it('סיכום: שבוע 1–7/11 עם ערך → "צהריים מהבית: 3/5"; ערך 0 → "0/5"; ערך 5 → "5/5"', () => {
    for (const [days, expected] of [
      [3, '3/5'],
      [0, '0/5'],
      [5, '5/5'],
    ] as const) {
      const db = emptyDb();
      db.checkins = [withHomeLunchDays(base, days)];
      const d = buildWeeklySummaryData(db, FIRST_STAGE2_WEEK);
      expect(d.homeLunch).toEqual({ days, max: 5 });
      expect(weeklySummaryText(d)).toContain(`הערה: —\nצהריים מהבית: ${expected}\n\nדגלים`);
    }
  });

  it('שבוע מ-1/11 בלי ערך (רשומה ישנה או צ\'ק-אין ריק) → "צהריים מהבית: —"', () => {
    const db = emptyDb();
    db.checkins = [base];
    const d = buildWeeklySummaryData(db, FIRST_STAGE2_WEEK);
    expect(d.homeLunch).toEqual({ days: null, max: 5 });
    expect(weeklySummaryText(d)).toContain('הערה: —\nצהריים מהבית: —\n\nדגלים');
    // בלי צ'ק-אין בכלל — השורה עדיין מודפסת (כמו שאר הסעיפים: "לא נרשם", לא "נעלם")
    const none = buildWeeklySummaryData(emptyDb(), FIRST_STAGE2_WEEK);
    expect(weeklySummaryText(none)).toContain('צ׳ק-אין\nלא מולא\nצהריים מהבית: —\n\nדגלים');
  });

  it('שבוע לפני 1/11 → אין שורה בכלל, גם כשהוזן ערך; הפלט של סעיף הצ\'ק-אין זהה לקודם', () => {
    expect(HOME_LUNCH_FROM).toBe('2026-11-01');
    const db = emptyDb();
    db.checkins = [withHomeLunchDays({ ...base, weekStart: LAST_STAGE1_WEEK }, 4)];
    const d = buildWeeklySummaryData(db, LAST_STAGE1_WEEK);
    expect(d.homeLunch).toBeNull();
    const text = weeklySummaryText(d);
    expect(text).not.toContain('צהריים מהבית');
    expect(text).toContain('היצמדות 8 · רעב 5 · אנרגיה 7 · שינה 7.0 · נשנוש 1 ימים\nהערה: —\n\nדגלים');
  });
});
