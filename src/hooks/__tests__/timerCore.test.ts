/**
 * ליבת הטיימר (שלב 7): הכול נגזר מזמן הסיום ומ-`now` שמגיע מבחוץ. הבדיקות
 * מדמות רקע פשוט בכך שלא קוראות ל-`tick` במשך זמן רב — בדיוק מה שקורה
 * כשהדפדפן מקפיא את הטיימרים של דף ברקע או כשהמסך כבוי.
 */
import { describe, expect, it } from 'vitest';
import {
  FINISHED_SHOW_MS,
  IDLE,
  LATE_MS,
  RESTORE_MAX_MS,
  STOPWATCH_SEC,
  addSeconds,
  agoText,
  finishedTitle,
  fromStored,
  isStopwatch,
  mmss,
  pauseTimer,
  resetTimer,
  resumeTimer,
  startTimer,
  tick,
  toStored,
  view,
} from '../timerCore';

const T0 = Date.parse('2026-11-11T08:05:00+02:00');
const SEC = 1000;

describe('טיימר מבוסס זמן סיום — לא סופר טיקים', () => {
  it('מה שנשאר = deadline − now, בלי תלות במספר הקריאות ל-tick', () => {
    const t = startTimer(T0, 90, 'מנוחה');
    expect(t.deadline).toBe(T0 + 90 * SEC);
    // 360 טיקים של 250ms…
    let a = t;
    for (let i = 1; i <= 240; i++) a = tick(a, T0 + i * 250).timer;
    // …או אף טיק אחד: אותה תוצאה בדיוק.
    expect(view(a, T0 + 60 * SEC).remainingSec).toBe(30);
    expect(view(t, T0 + 60 * SEC).remainingSec).toBe(30);
    expect(a).toEqual(t);
  });

  it('רקע: דקה בלי אף טיק — בחזרה הזמן שנשאר נכון', () => {
    const t = startTimer(T0, 180, 'מנוחה');
    // הדף ברקע 60 שניות: שום tick לא רץ. בחזרה:
    const back = tick(t, T0 + 60 * SEC);
    expect(back.alert).toBe(false);
    const v = view(back.timer, T0 + 60 * SEC);
    expect(v.running).toBe(true);
    expect(v.remainingSec).toBe(120);
    expect(v.fractionLeft).toBeCloseTo(120 / 180, 5);
  });

  it('עיגול כלפי מעלה: 0:01 מוצג עד הרגע האחרון, ואז סיום', () => {
    const t = startTimer(T0, 10, 'מנוחה');
    expect(view(t, T0 + 9_001).remainingSec).toBe(1);
    expect(tick(t, T0 + 9_999).timer.deadline).not.toBeNull();
    expect(tick(t, T0 + 10_000).timer.endedAt).toBe(T0 + 10_000);
  });
});

describe('סיום — בזמן מול ברקע', () => {
  it('סיום שזוהה בזמן (האפליקציה פתוחה): alert פעם אחת, ואז מצב "הסתיים"', () => {
    const t = startTimer(T0, 90, 'מנוחה');
    const end = tick(t, T0 + 90 * SEC + 120);
    expect(end.alert).toBe(true);
    expect(end.timer.endedAt).toBe(T0 + 90 * SEC);
    expect(end.timer.deadline).toBeNull();
    // טיק נוסף לא מצפצף שוב.
    const again = tick(end.timer, T0 + 90 * SEC + 370);
    expect(again.alert).toBe(false);
    expect(again.timer).toBe(end.timer);
    const v = view(end.timer, T0 + 95 * SEC);
    expect(v.finished).toBe(true);
    expect(v.running).toBe(false);
    expect(v.endedInBackground).toBe(false);
    expect(v.endedAgoSec).toBe(5);
  });

  it('סיום ברקע: חוזרים 40 שניות אחרי הסיום — בלי צליל, "נגמרה לפני 40 שניות"', () => {
    const t = startTimer(T0, 90, 'מנוחה');
    // הדף ברקע מהשנייה ה-30; שום tick עד החזרה בשנייה ה-130.
    const back = tick(t, T0 + 130 * SEC);
    expect(back.alert).toBe(false);
    expect(back.timer.endedAt).toBe(T0 + 90 * SEC);
    expect(back.timer.seenAt).toBe(T0 + 130 * SEC);
    const v = view(back.timer, T0 + 130 * SEC);
    expect(v.finished).toBe(true);
    expect(v.endedInBackground).toBe(true);
    expect(v.endedAgoSec).toBe(40);
    expect(`${finishedTitle('rest')} ${agoText(v.endedAgoSec)}`).toBe('המנוחה נגמרה לפני 40 שניות');
    // הספירה "לפני X" ממשיכה לעלות מול השעון.
    expect(view(back.timer, T0 + 142 * SEC).endedAgoSec).toBe(52);
  });

  it(`גבול האיחור: עד ${LATE_MS}ms עדיין מצפצף (דפדפן שמאט טיימרים ברקע לטיק בשנייה)`, () => {
    const t = startTimer(T0, 60, 'מנוחה');
    expect(tick(t, T0 + 60 * SEC + LATE_MS).alert).toBe(true);
    expect(tick(t, T0 + 60 * SEC + LATE_MS + 1).alert).toBe(false);
  });

  it(`מצב "הסתיים" נעלם ${FINISHED_SHOW_MS / 1000} שניות אחרי שזוהה — לא אחרי שהסתיים`, () => {
    const t = startTimer(T0, 90, 'מנוחה');
    const back = tick(t, T0 + 300 * SEC); // חזרה 3.5 דקות אחרי הסיום
    expect(view(back.timer, T0 + 300 * SEC).finished).toBe(true);
    expect(tick(back.timer, T0 + 300 * SEC + FINISHED_SHOW_MS - 1).timer.endedAt).not.toBeNull();
    expect(tick(back.timer, T0 + 300 * SEC + FINISHED_SHOW_MS).timer).toBe(IDLE);
  });

  it('טיימר חדש מחליף מצב "הסתיים" מיד', () => {
    const ended = tick(startTimer(T0, 60, 'מנוחה'), T0 + 61 * SEC).timer;
    const next = startTimer(T0 + 70 * SEC, 90, 'מנוחה');
    expect(view(next, T0 + 70 * SEC)).toMatchObject({ running: true, finished: false, remainingSec: 90 });
    expect(ended.endedAt).not.toBeNull();
  });
});

describe('±שניות, השהיה, איפוס', () => {
  it('+30 ו-−15 מזיזים את זמן הסיום; −15 בסוף לא יורד מתחת לעכשיו', () => {
    const t = startTimer(T0, 60, 'מנוחה');
    const plus = addSeconds(t, T0 + 10 * SEC, 30);
    expect(view(plus, T0 + 10 * SEC).remainingSec).toBe(80);
    expect(plus.totalSec).toBe(90);
    const minus = addSeconds(t, T0 + 50 * SEC, -15);
    expect(minus.deadline).toBe(T0 + 50 * SEC);
    expect(tick(minus, T0 + 50 * SEC).alert).toBe(true);
  });

  it('+30 אחרי חזרה מהרקע פועל על הזמן האמיתי שנשאר', () => {
    const t = startTimer(T0, 90, 'מנוחה');
    const back = tick(t, T0 + 60 * SEC).timer; // דקה ברקע
    expect(view(addSeconds(back, T0 + 60 * SEC, 30), T0 + 60 * SEC).remainingSec).toBe(60);
  });

  it('השהיה שומרת את מה שנשאר; טיימר מושהה לא פג גם אחרי שעה ברקע', () => {
    const t = startTimer(T0, 600, 'חימום', 'countdown');
    const paused = pauseTimer(t, T0 + 100 * SEC);
    expect(paused.deadline).toBeNull();
    expect(paused.pausedMs).toBe(500 * SEC);
    const later = tick(paused, T0 + 3700 * SEC);
    expect(later.alert).toBe(false);
    expect(view(later.timer, T0 + 3700 * SEC)).toMatchObject({ running: true, paused: true, remainingSec: 500, finished: false });
    const resumed = resumeTimer(later.timer, T0 + 3700 * SEC);
    expect(resumed.deadline).toBe(T0 + 4200 * SEC);
    expect(view(resumed, T0 + 3760 * SEC).remainingSec).toBe(440);
  });

  it('איפוס מחזיר למשך המלא, מושהה', () => {
    const t = startTimer(T0, 600, 'חימום', 'countdown');
    const r = resetTimer(pauseTimer(t, T0 + 100 * SEC));
    expect(view(r, T0 + 200 * SEC)).toMatchObject({ paused: true, remainingSec: 600 });
    expect(resetTimer(IDLE)).toBe(IDLE);
  });

  it('פעולות על טיימר שלא רץ לא עושות כלום', () => {
    expect(addSeconds(IDLE, T0, 30)).toBe(IDLE);
    expect(pauseTimer(IDLE, T0)).toBe(IDLE);
    expect(resumeTimer(IDLE, T0)).toBe(IDLE);
    expect(startTimer(T0, 0, 'x')).toBe(IDLE);
    expect(tick(IDLE, T0)).toEqual({ timer: IDLE, alert: false });
  });
});

describe('המבנה השמור (fatloss:ui:timer) — אותם חמישה שדות', () => {
  it('רץ / מושהה נשמרים בדיוק כמו בגרסה הקודמת', () => {
    const t = startTimer(T0, 90, 'מנוחה');
    expect(toStored(t)).toEqual({ deadline: T0 + 90 * SEC, totalSec: 90, label: 'מנוחה', kind: 'rest', pausedMs: null });
    const p = pauseTimer(startTimer(T0, 600, 'חימום', 'countdown'), T0 + 100 * SEC);
    expect(toStored(p)).toEqual({ deadline: 0, totalSec: 600, label: 'חימום', kind: 'countdown', pausedMs: 500 * SEC });
    expect(toStored(IDLE)).toBeNull();
    expect(Object.keys(toStored(t)!).sort()).toEqual(['deadline', 'kind', 'label', 'pausedMs', 'totalSec']);
  });

  it('טעינה מחדש באמצע ספירה: ממשיך מאותו זמן סיום', () => {
    const stored = toStored(startTimer(T0, 90, 'מנוחה'));
    const restored = fromStored(stored, T0 + 40 * SEC);
    expect(view(restored, T0 + 40 * SEC)).toMatchObject({ running: true, remainingSec: 50 });
  });

  it('הדף נסגר ברקע והטיימר הסתיים בינתיים: בטעינה — "נגמרה לפני X", בלי צליל', () => {
    const stored = toStored(startTimer(T0, 90, 'מנוחה'));
    const now = T0 + 150 * SEC;
    const first = tick(fromStored(stored, now), now);
    expect(first.alert).toBe(false);
    expect(view(first.timer, now)).toMatchObject({ finished: true, endedInBackground: true, endedAgoSec: 60 });
    // נשאר שמור עם אותו deadline עד שנסגר, כך שטעינה נוספת מציגה אותו שוב.
    expect(toStored(first.timer)).toEqual(stored);
  });

  it(`טיימר שהסתיים לפני יותר מ-${RESTORE_MAX_MS / 60_000} דקות לא משוחזר`, () => {
    const stored = toStored(startTimer(T0, 90, 'מנוחה'));
    expect(fromStored(stored, T0 + 90 * SEC + RESTORE_MAX_MS)).not.toBe(IDLE);
    expect(fromStored(stored, T0 + 90 * SEC + RESTORE_MAX_MS + 1)).toBe(IDLE);
    expect(fromStored(null, T0)).toBe(IDLE);
  });

  it('מושהה משוחזר כמושהה, בלי תלות בזמן שעבר', () => {
    const p = pauseTimer(startTimer(T0, 600, 'חימום', 'countdown'), T0 + 100 * SEC);
    const restored = fromStored(toStored(p), T0 + 86_400 * SEC);
    expect(view(restored, T0 + 86_400 * SEC)).toMatchObject({ paused: true, remainingSec: 500 });
  });
});

describe('אירובי: ספירה לאחור או סטופר', () => {
  it('ריצה במשך שנקבע: ספירה לאחור רגילה', () => {
    const t = startTimer(T0, 30 * 60, 'אירובי', 'cardio');
    const v = view(t, T0 + 12 * 60 * SEC + 34 * SEC);
    expect(v.stopwatch).toBe(false);
    expect(mmss(v.remainingSec)).toBe('17:26');
    expect(mmss(v.elapsedSec)).toBe('12:34');
  });

  it('סטופר = ריצה במשך המרבי: מציגים זמן שעבר, גם אחרי רקע', () => {
    expect(isStopwatch('cardio', STOPWATCH_SEC)).toBe(true);
    expect(isStopwatch('cardio', STOPWATCH_SEC - 60)).toBe(false);
    expect(isStopwatch('countdown', STOPWATCH_SEC)).toBe(false);
    const t = startTimer(T0, STOPWATCH_SEC, 'אירובי', 'cardio');
    // 25 דקות, מתוכן 20 ברקע בלי טיקים:
    const v = view(tick(t, T0 + 25 * 60 * SEC).timer, T0 + 25 * 60 * SEC);
    expect(v.stopwatch).toBe(true);
    expect(mmss(v.elapsedSec)).toBe('25:00');
  });
});

describe('טקסט', () => {
  it('mmss', () => {
    expect(mmss(0)).toBe('0:00');
    expect(mmss(65)).toBe('1:05');
    expect(mmss(600)).toBe('10:00');
    expect(mmss(-3)).toBe('0:00');
  });

  it('"לפני X"', () => {
    expect(agoText(0)).toBe('עכשיו');
    expect(agoText(1)).toBe('לפני שנייה');
    expect(agoText(12)).toBe('לפני 12 שניות');
    expect(agoText(59)).toBe('לפני 59 שניות');
    expect(agoText(65)).toBe('לפני 1:05 דק׳');
  });

  it('כותרת הסיום לפי סוג', () => {
    expect(finishedTitle('rest')).toBe('המנוחה נגמרה');
    expect(finishedTitle('countdown')).toBe('החימום נגמר');
    expect(finishedTitle('cardio')).toBe('האירובי נגמר');
  });
});
