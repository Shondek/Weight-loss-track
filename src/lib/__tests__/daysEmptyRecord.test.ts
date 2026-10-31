/**
 * "סגור יום → בטל" משאיר ב-`days` רשומה `{ d, closed: false }` שלא הייתה
 * קיימת כשהיום לא נסגר בכלל (`setDayClosed(…, false)` משמיט `closedAt` אבל
 * לא את הרשומה; "פתח מחדש" במסך התזונה עושה אותו דבר כבר היום).
 *
 * הבדיקה הזו מוכיחה שהרשומה הריקה **שקופה לכל חישוב**: שני מסדים זהים,
 * ההבדל היחיד הוא הרשומה הנוספת, וכל פונקציה שקוראת את הימים מחזירה פלט
 * זהה. הרשימה כאן היא כל קוראי `days` בקוד (grep, 31/10/2026):
 *   lib/weeklySummary.ts (buildWeeklySummaryData / buildWeeklySummary),
 *   lib/weekSummary.ts (buildWeekSummary, weekGaps), lib/exportText.ts
 *   (buildChatReport), lib/steps.ts (stepsOn, recentSteps, stepsWeek),
 *   lib/nutrition/days.ts (dayMeta, isDayClosed), lib/profile.ts
 *   (deviceHasRecords / canSwitchProfile), lib/db.ts (mergeDb), ומסכים:
 *   היום/תזונה (`dayMeta(...)?.closed === true`), נתונים (ספירת ימים סגורים).
 * קובץ בדיקה בלבד — אין שינוי ב-src.
 */

import { describe, expect, it } from 'vitest';
import type { DB, DayMeta, ISODate } from '../../types';
import { goldenDb } from './fixtures/goldenDb';
import { buildWeeklySummary, buildWeeklySummaryData } from '../weeklySummary';
import { buildWeekSummary, weekGaps } from '../weekSummary';
import { buildChatReport } from '../exportText';
import { recentSteps, stepsWeek } from '../steps';
import { dayMeta, isDayClosed, setDayClosed, stepsOn, upsertDay } from '../nutrition/days';
import { daySummary } from '../nutrition/calc';
import { canSwitchProfile, deviceHasRecords } from '../profile';
import { firstDataDate, mergeDb, programStartWeek, recordCount } from '../db';
import { emptyDb } from '../../types';

const TODAY: ISODate = '2026-09-08'; // שלישי; השבוע 06/09–12/09
const WEEK: ISODate = '2026-09-06';
const PREV_WEEK: ISODate = '2026-08-30';

/** המסד הבסיסי: היום לא נסגר ואין לו רשומה. */
function base(): DB {
  const db = goldenDb();
  expect(dayMeta(db.days, TODAY)).toBeNull();
  return db;
}

/** אותו מסד אחרי "סגור יום" ואז "בטל" (או "פתח מחדש") — דרך הפונקציה האמיתית. */
function closedThenUndone(d: ISODate = TODAY): DB {
  const db = base();
  const closed = setDayClosed(db.days, d, true, `${d}T06:05:00.000Z`);
  db.days = setDayClosed(closed, d, false, `${d}T06:06:00.000Z`);
  return db;
}

/** שתי הגרסאות + אימות שההבדל היחיד הוא הרשומה הריקה. */
function pair(d: ISODate = TODAY): { a: DB; b: DB } {
  const a = base();
  const b = closedThenUndone(d);
  const extra: DayMeta = { d, closed: false };
  expect(dayMeta(b.days, d)).toEqual(extra);
  expect(b.days.filter((x) => x.d !== d)).toEqual(a.days);
  const { days: _a, ...restA } = a;
  const { days: _b, ...restB } = b;
  void _a;
  void _b;
  expect(restB).toEqual(restA);
  return { a, b };
}

describe('רשומת יום ריקה ({closed:false}) שקופה לכל חישוב', () => {
  for (const [label, d] of [
    ['היום (מחוץ לשבוע המסוכם)', TODAY],
    ['יום בתוך השבוע המסוכם', '2026-09-03'],
    ['יום בתוך השבוע הנוכחי', '2026-09-07'],
  ] as const) {
    describe(label, () => {
      const { a, b } = pair(d);

      it('buildWeekSummary (צ\'ק-אין) — שני השבועות', () => {
        expect(buildWeekSummary(b, WEEK, TODAY)).toEqual(buildWeekSummary(a, WEEK, TODAY));
        expect(buildWeekSummary(b, PREV_WEEK, TODAY)).toEqual(buildWeekSummary(a, PREV_WEEK, TODAY));
        expect(weekGaps(b, WEEK, TODAY)).toEqual(weekGaps(a, WEEK, TODAY));
        expect(weekGaps(b, PREV_WEEK, TODAY)).toEqual(weekGaps(a, PREV_WEEK, TODAY));
      });

      it('buildWeeklySummaryData / buildWeeklySummary — ימים סגורים, ממוצעי קלוריות וחלבון, צעדים, שישי', () => {
        for (const ws of [WEEK, PREV_WEEK]) {
          const da = buildWeeklySummaryData(a, ws);
          const dbb = buildWeeklySummaryData(b, ws);
          expect(dbb).toEqual(da);
          expect(dbb.nutrition.closedDays).toEqual(da.nutrition.closedDays);
          expect(buildWeeklySummary(b, ws)).toBe(buildWeeklySummary(a, ws));
        }
      });

      it('buildChatReport', () => {
        expect(buildChatReport(b, WEEK, TODAY)).toBe(buildChatReport(a, WEEK, TODAY));
        expect(buildChatReport(b, PREV_WEEK, TODAY)).toBe(buildChatReport(a, PREV_WEEK, TODAY));
      });

      it('סטטוס היום במסך היום ובתזונה (dayMeta(...)?.closed === true, isDayClosed)', () => {
        for (const x of ['2026-09-03', '2026-09-04', '2026-09-05', '2026-09-06', '2026-09-07', TODAY]) {
          expect(dayMeta(b.days, x)?.closed === true).toBe(dayMeta(a.days, x)?.closed === true);
          expect(isDayClosed(b.days, x)).toBe(isDayClosed(a.days, x));
          expect(dayMeta(b.days, x)?.fridayTier ?? null).toBe(dayMeta(a.days, x)?.fridayTier ?? null);
          expect(dayMeta(b.days, x)?.closedAt ?? null).toBe(dayMeta(a.days, x)?.closedAt ?? null);
        }
      });

      it('סיכום יום (חלבון/קלוריות) אינו תלוי ב-days כלל', () => {
        expect(daySummary(b.entries, d, () => null)).toEqual(daySummary(a.entries, d, () => null));
      });

      it('צעדים: stepsOn, recentSteps, stepsWeek', () => {
        for (const x of ['2026-09-04', '2026-09-06', '2026-09-07', TODAY]) expect(stepsOn(b.days, x)).toBe(stepsOn(a.days, x));
        expect(recentSteps(b.days, TODAY)).toEqual(recentSteps(a.days, TODAY));
        expect(stepsWeek(b.days, WEEK)).toEqual(stepsWeek(a.days, WEEK));
        expect(stepsWeek(b.days, PREV_WEEK)).toEqual(stepsWeek(a.days, PREV_WEEK));
      });

      it('מסך נתונים: ספירת ימים סגורים, recordCount, firstDataDate, programStartWeek', () => {
        expect(b.days.filter((x) => x.closed).length).toBe(a.days.filter((x) => x.closed).length);
        expect(recordCount(b)).toBe(recordCount(a));
        expect(firstDataDate(b)).toBe(firstDataDate(a));
        expect(programStartWeek(b)).toBe(programStartWeek(a));
      });

      it('deviceHasRecords / canSwitchProfile — במכשיר עם נתונים', () => {
        expect(deviceHasRecords(b)).toBe(deviceHasRecords(a));
        expect(canSwitchProfile(b)).toBe(canSwitchProfile(a));
      });

      it('mergeDb: ייבוא "מיזוג" של כל גרסה לתוך האחרת לא משנה אף רשומה אחרת', () => {
        const ab = mergeDb(a, b);
        const ba = mergeDb(b, a);
        expect(ab.days.filter((x) => x.d !== d)).toEqual(ba.days.filter((x) => x.d !== d));
        expect(ab.days.filter((x) => x.d !== d)).toEqual(upsertDay(a.days, { d, closed: false }).filter((x) => x.d !== d));
      });
    });
  }

  it('סגירה חוזרת אחרי ביטול שקולה לסגירה ראשונה (הרשומה הריקה לא "זוכרת" כלום)', () => {
    const a = base();
    const b = closedThenUndone();
    const at = '2026-09-08T19:00:00.000Z';
    expect(setDayClosed(b.days, TODAY, true, at)).toEqual(setDayClosed(a.days, TODAY, true, at));
  });
});

describe('מקרה קצה מתועד: מכשיר ריק', () => {
  it('deviceHasRecords נבדל — רשומת יום ריקה נספרת כ"יש נתונים" וחוסמת החלפת פרופיל', () => {
    const empty = emptyDb();
    const undone = emptyDb();
    undone.days = setDayClosed(setDayClosed([], TODAY, true, `${TODAY}T06:05:00.000Z`), TODAY, false, `${TODAY}T06:06:00.000Z`);
    expect(undone.days).toEqual([{ d: TODAY, closed: false }]);
    // זה ההבדל היחיד שנמצא. מתועד, לא מתוקן (lib מחוץ לגבולות השלב).
    expect(deviceHasRecords(empty)).toBe(false);
    expect(deviceHasRecords(undone)).toBe(true);
    expect(canSwitchProfile(empty)).toBe(true);
    expect(canSwitchProfile(undone)).toBe(false);
    // וכל השאר זהה גם במכשיר ריק.
    expect(buildWeeklySummary(undone, WEEK)).toBe(buildWeeklySummary(empty, WEEK));
    expect(buildChatReport(undone, WEEK, TODAY)).toBe(buildChatReport(empty, WEEK, TODAY));
    expect(buildWeekSummary(undone, WEEK, TODAY)).toEqual(buildWeekSummary(empty, WEEK, TODAY));
    expect(recordCount(undone)).toBe(recordCount(empty));
    expect(firstDataDate(undone)).toBe(firstDataDate(empty));
  });
});
