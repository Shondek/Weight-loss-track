/** שלב 5: הסיכום השבועי לצ'אט — נתונים מחושבים בלבד. */
import { describe, expect, it } from 'vitest';
import { emptyDb, type DB, type DayMeta, type FoodEntry, type ISODate, type MealType } from '../../types';
import { PROGRAM, WORKOUT_TYPES } from '../../data/program';
import { fridayEntryName } from '../nutrition/friday';
import { swapExercise } from '../workouts';
import { exerciseById, exerciseIn } from '../../data/program';
import {
  buildWeeklySummary,
  buildWeeklySummaryData,
  defaultSummaryWeek,
  MAX_SUMMARY_CHARS,
  weeklySummaryText,
} from '../weeklySummary';
import { addDays } from '../date';
import { le, wk } from './helpers';

const WEEK1 = '2026-08-30';
const WEEK2 = '2026-09-06';
const WEEK3 = '2026-09-13';
const WEEK4 = '2026-09-20';
const WEEK5 = '2026-09-27';

let seq = 0;
function entry(d: ISODate, kcal: number, protein: number, meal: MealType = 'lunch', adhoc = false, name = 'מזון'): FoodEntry {
  seq++;
  const ts = Date.parse(`${d}T12:00:00+03:00`) + seq;
  return {
    id: `${ts}-${seq}`,
    d,
    ts,
    meal,
    foodId: adhoc ? 'c:adhoc' : 'c:food',
    grams: 100,
    ref: { name, kcal, protein, carbs: null, fat: null, fiber: null },
    ...(adhoc ? { adhoc: true as const, n: name } : {}),
  };
}

const closed = (d: ISODate, extra: Partial<DayMeta> = {}): DayMeta => ({ d, closed: true, closedAt: `${d}T22:00:00.000Z`, ...extra });

/**
 * שבועות 1–5 של התוכנית: 1–2 תקפים (79.23 → 78.87), 3 עם 5/7, 4 עם 4/7,
 * 5 תקף (78.40) — ולכן שבוע 5 מושווה לשבוע 2.
 */
function fixture(): DB {
  const db = emptyDb();
  db.settings = { ...db.settings, programStart: '2026-08-30' };
  const w1 = [79.6, 79.4, 79.3, 79.2, 79.1, 79.0, 79.0];
  const w2 = [79.0, 78.9, 78.9, 78.9, 78.8, 78.8, 78.8];
  const w3 = [78.8, 78.7, null, 78.7, null, 78.6, 78.6];
  const w4 = [78.6, null, 78.5, null, null, 78.5, 78.4];
  const w5 = [78.5, 78.5, 78.4, 78.4, 78.4, 78.3, 78.3];
  const week = (ws: ISODate, vals: (number | null)[]) =>
    vals.flatMap((w, i) => (w === null ? [] : [{ d: addDays(ws, i), w }]));
  db.weights = [...week(WEEK1, w1), ...week(WEEK2, w2), ...week(WEEK3, w3), ...week(WEEK4, w4), ...week(WEEK5, w5)];
  db.waist = [
    { d: '2026-08-19', cm: 97 }, // רביעי
    { d: '2026-08-26', cm: 96.5 }, // רביעי
    { d: '2026-08-30', cm: 96 }, // שבת
    { d: '2026-09-05', cm: 93.5 }, // שבת
    { d: '2026-09-09', cm: 95.5 }, // רביעי
    { d: '2026-09-13', cm: 93 }, // ראשון
  ];
  const bench = exerciseIn('A', 'db-bench-press')!;
  const machineSwap = {
    ...swapExercise(bench, exerciseById('machine-chest-press')!, null),
    sets: [40, 40, 40].map((w) => ({ weight: w, reps: 10, seconds: null })),
    rir: 2 as const,
  };
  db.workouts = [
    wk('w1a', '2026-08-30', 'A', [le('leg-press', 55, [12, 12, 12], { rir: 2 })]),
    wk('w1b', '2026-09-01', 'B', [le('db-supinated-curl', 12.5, [8, 3])]),
    wk(
      'w2a',
      '2026-09-06',
      'A',
      [
        le('leg-press', 60, [12, 12, 12], { rir: 2 }),
        machineSwap,
        { exerciseId: 'finisher-cardio', n: 'אירובי סיום', sets: [{ weight: null, reps: null, seconds: 1200 }], targetRepMin: 0, targetRepMax: 0, type: 'cardio', bodyweightOnly: true, assisted: false, cardio: { mode: 'bike', minutes: 20 } },
      ],
      2,
      0,
    ),
    wk('w2b', '2026-09-08', 'B', [le('db-supinated-curl', 12.5, [8, 3], { rir: 1 }), le('db-rdl', 25, [10, 10, 10], { rir: 3 })], 0, 3),
    wk('w2c', '2026-09-10', 'C', [le('leg-press', 60, [12, 12, 12])]),
  ];
  db.standaloneCardio = [{ id: 'sc1', d: '2026-09-11', mode: 'treadmill', minutes: 50, incline: 2.5, speed: 5, note: '' }];
  db.entries = [
    entry('2026-09-06', 2000, 200),
    entry('2026-09-07', 1800, 180),
    entry('2026-09-08', 1900, 195),
    entry('2026-09-09', 1750, 185),
    entry('2026-09-09', 200, 10, 'snack', true, 'משקה חלבון בחוץ'),
    entry('2026-09-10', 1500, 100), // נרשם, לא נסגר
    entry('2026-09-11', 900, 140),
    entry('2026-09-11', 1000, 55, 'dinner', true, fridayEntryName('regular')),
  ];
  db.days = [closed('2026-09-06'), closed('2026-09-07'), closed('2026-09-08'), closed('2026-09-09'), closed('2026-09-11', { fridayTier: 'regular' })];
  db.checkins = [{ weekStart: WEEK2, adherence: 8, hunger: 5, energy: 7, sleepHours: 7, unplannedSnackDays: 1, note: ' שבוע טוב ' }];
  return db;
}

describe('1. משקל — תקף מול השוואה, שבועות 1–5', () => {
  it('שבוע 2 תקף → השוואה לשבוע 1: −0.36, שבוע אחד', () => {
    const d2 = buildWeeklySummaryData(fixture(), WEEK2);
    expect(d2.weekNo).toBe(2);
    expect(d2.weight.current).toMatchObject({ avg: 78.87, count: 7, complete: true });
    expect(d2.weight.valid).toBe(true);
    expect(d2.weight.comparison).toEqual({ week: WEEK1, weekNo: 1, avg: 79.23, delta: -0.36, weeks: 1, rate: -0.36 });
    const text = weeklySummaryText(d2);
    expect(text).toContain('שבוע 2 · 06/09–12/09');
    expect(text).toContain('שקילות 7/7 · ממוצע 78.87 · תקף: כן\nהשוואה לשבוע 1 (ממוצע 79.23) · שינוי −0.36 · 1 שבועות · קצב −0.36 לשבוע');
    expect(text).not.toContain('בר-השוואה');
    expect(d2.flags.some((f) => f.includes('לא תקף'))).toBe(false);
  });

  it('שבוע 5 תקף (78.40) מושווה לשבוע 2 — השבוע התקף האחרון — ולא לשבוע 4: −0.47 על 3 שבועות, קצב −0.16', () => {
    const d5 = buildWeeklySummaryData(fixture(), WEEK5);
    expect(d5.weekNo).toBe(5);
    expect(d5.weight.current).toMatchObject({ avg: 78.4, count: 7 });
    expect(d5.weight.comparison).toEqual({ week: WEEK2, weekNo: 2, avg: 78.87, delta: -0.47, weeks: 3, rate: -0.16 });
    const text = weeklySummaryText(d5);
    expect(text).toContain('שקילות 7/7 · ממוצע 78.40 · תקף: כן\nהשוואה לשבוע 2 (ממוצע 78.87) · שינוי −0.47 · 3 שבועות · קצב −0.16 לשבוע');
  });

  it('שבוע 4 (4/7) → "תקף: לא", בלי שורת השוואה, ודגל', () => {
    const d4 = buildWeeklySummaryData(fixture(), WEEK4);
    expect(d4.weight.current).toMatchObject({ count: 4, complete: false });
    expect(d4.weight.valid).toBe(false);
    expect(d4.weight.comparison).toBeNull();
    expect(d4.flags).toContain('שבוע לא תקף (4/7)');
    const text = weeklySummaryText(d4);
    expect(text).toContain('שקילות 4/7 · ממוצע 78.50 · תקף: לא\n\nמותניים');
    expect(text).not.toContain('השוואה');
  });
});

describe('2. שבוע ראשון ושבוע חלקי', () => {
  it('שבוע 1 — תקף, בלי שבוע תקף קודם → "אין שבוע תקף קודם להשוואה", בלי דגל "לא תקף"', () => {
    const d1 = buildWeeklySummaryData(fixture(), WEEK1);
    expect(d1.weekNo).toBe(1);
    expect(d1.weight.current).toMatchObject({ avg: 79.23, count: 7, complete: true });
    expect(d1.weight.valid).toBe(true);
    expect(d1.weight.comparison).toBeNull();
    const text = weeklySummaryText(d1);
    expect(text).toContain('שקילות 7/7 · ממוצע 79.23 · תקף: כן\nאין שבוע תקף קודם להשוואה');
    expect(d1.flags.some((f) => f.includes('לא תקף'))).toBe(false);
  });

  it('5/7 → תקף: לא, בלי השוואה, ודגל; השבוע הקודם חלקי לא פוסל את השבוע הזה', () => {
    const db = fixture();
    db.weights = db.weights.filter((e) => e.d !== '2026-09-10' && e.d !== '2026-09-11');
    const d = buildWeeklySummaryData(db, WEEK2);
    expect(d.weight.current).toMatchObject({ count: 5, complete: false });
    expect(d.weight.valid).toBe(false);
    expect(d.flags).toContain('שבוע לא תקף (5/7)');
    const text = weeklySummaryText(d);
    expect(text).toContain('ה — · ו —');
    expect(text).toContain('שקילות 5/7 · ממוצע 78.90 · תקף: לא');
    expect(text).not.toContain('השוואה');

    const db2 = fixture();
    db2.weights = db2.weights.filter((e) => e.d !== '2026-09-03'); // שבוע 1 → 6/7
    const d2 = buildWeeklySummaryData(db2, WEEK2);
    expect(d2.weight.valid).toBe(true);
    expect(d2.weight.comparison).toBeNull();
    expect(weeklySummaryText(d2)).toContain('אין שבוע תקף קודם להשוואה');
  });
});

describe('3. מותניים — רביעי של השבוע, ושלוש המדידות שלפניו בכל יום', () => {
  it('הערך של רביעי השבוע, ואחריו שלוש המדידות האחרונות לפניו (שבת/רביעי) עם תאריכים', () => {
    const d = buildWeeklySummaryData(fixture(), WEEK2);
    expect(d.waist.wednesday).toEqual({ d: '2026-09-09', cm: 95.5 });
    expect(d.waist.previous).toEqual([
      { d: '2026-09-05', cm: 93.5 },
      { d: '2026-08-30', cm: 96 },
      { d: '2026-08-26', cm: 96.5 },
    ]);
    expect(d.flags).not.toContain('מותניים לא נמדדו ברביעי');
    const text = weeklySummaryText(d);
    expect(text).toContain('רביעי 09/09: 95.5 ס״מ\nאחרונות לפני: 05/09 93.5 · 30/08 96.0 · 26/08 96.5');
  });

  it('שבוע 3 בלי רביעי → "לא נמדד ברביעי" + דגל; ההיסטוריה: 13/9 (ראשון) 93, 5/9 (שבת) 93.5, 30/8 (שבת) 96', () => {
    const db = fixture();
    db.waist = db.waist.filter((e) => ['2026-08-30', '2026-09-05', '2026-09-13'].includes(e.d));
    const d = buildWeeklySummaryData(db, WEEK3);
    expect(d.waist.wednesday).toBeNull();
    expect(d.flags).toContain('מותניים לא נמדדו ברביעי');
    expect(d.waist.previous).toEqual([
      { d: '2026-09-13', cm: 93 },
      { d: '2026-09-05', cm: 93.5 },
      { d: '2026-08-30', cm: 96 },
    ]);
    const text = weeklySummaryText(d);
    expect(text).toContain('מותניים\nלא נמדד ברביעי\nאחרונות לפני: 13/09 93.0 · 05/09 93.5 · 30/08 96.0');
    // בלי אף מדידה — קו
    const empty = buildWeeklySummaryData(emptyDb(), WEEK3);
    expect(weeklySummaryText(empty)).toContain('אחרונות לפני: —');
  });
});

describe('4. תזונה — ימים סגורים בלבד', () => {
  it('ממוצעים, חלבון ≥190, מתחת ל-1850, הערכות, ארוחת שישי, ימים פתוחים', () => {
    const d = buildWeeklySummaryData(fixture(), WEEK2);
    expect(d.nutrition.closedDays).toEqual(['2026-09-06', '2026-09-07', '2026-09-08', '2026-09-09', '2026-09-11']);
    expect(d.nutrition).toMatchObject({ avgKcal: 1910, avgProtein: 193, proteinDays: 4, lowKcalDays: 1, estimateDays: 2, fridayTier: 'regular', openDays: 1 });
    const text = weeklySummaryText(d);
    expect(text).toContain('ימים סגורים 5/7 (א ב ג ד ו)');
    expect(text).toContain('ימים סגורים: ממוצע 1910 קק״ל · 193 ג׳ חלבון · חלבון ≥190: 4/5 · מתחת ל-1850: 1/5 · עם הערכה: 2/5 · ארוחת שישי: רגילה');
    expect(text).toContain('נרשמו ולא נסגרו: 1');
    expect(d.flags.some((f) => f.includes('מתחת ל-1850'))).toBe(false);
  });

  it('יום שלא נסגר לא נכנס לממוצע; שלושה ימים סגורים מתחת ל-1850 → דגל; בלי ימים סגורים — בלי ממוצעים', () => {
    const db = fixture();
    db.days = [...db.days, closed('2026-09-10')]; // 1500 קק״ל
    db.entries = db.entries.map((e) => (e.d === '2026-09-09' ? { ...e, ref: { ...e.ref, kcal: e.adhoc ? 100 : 1700 } } : e));
    const d = buildWeeklySummaryData(db, WEEK2);
    expect(d.nutrition.lowKcalDays).toBe(3);
    expect(d.flags).toContain('3 ימים סגורים מתחת ל-1850');
    expect(d.nutrition.openDays).toBe(0);

    const none = fixture();
    none.days = [];
    const dn = buildWeeklySummaryData(none, WEEK2);
    expect(dn.nutrition).toMatchObject({ avgKcal: null, avgProtein: null, openDays: 6 });
    const text = weeklySummaryText(dn);
    expect(text).toContain('ימים סגורים 0/7');
    expect(text).not.toContain('ימים סגורים: ממוצע');
  });
});

describe('5. אימונים — החלפה, RIR, הצעה וכלל לכל תרגיל', () => {
  it('שורת תרגיל: משקל×חזרות · RIR · הבא + כלל; החלפה מסומנת; R3 בדגלים; כאב מקסימלי', () => {
    const d = buildWeeklySummaryData(fixture(), WEEK2);
    expect(d.workouts.done).toBe(3);
    const a = d.workouts.items[0]!;
    expect(a.lines.map((l) => l.text)).toEqual(['לג-פרס 60×12,12,12', "בנץ' מכונה 40×10,10,10"]);
    expect(a.lines[0]).toMatchObject({ rir: 2, swappedFrom: null, next: '65 ק״ג · 10 חזרות' });
    expect(a.lines[0]?.suggestion?.rule).toBe('R1');
    // 10 חזרות בטווח 8–12, לא בשיא → R6 (+1 בסט הנמוך). ההיסטוריה של החלופה — האימון הזה בלבד.
    expect(a.lines[1]).toMatchObject({ swappedFrom: "הוחלף מ-בנץ' פרס", rir: 2, next: '40 ק״ג · 11 חזרות' });
    expect(a.lines[1]?.suggestion?.rule).toBe('R6');
    const b = d.workouts.items[1]!;
    expect(b.lines[0]).toMatchObject({ rir: 1 });
    expect(b.lines[0]?.suggestion).toMatchObject({ rule: 'R3', weight: 10 });
    expect(b.lines[1]).toMatchObject({ rir: 3, next: '27.5 ק״ג · 8 חזרות' });
    expect(d.workouts.drops).toEqual(['כפיפת מרפקים']);
    expect(d.flags).toContain('ירידה בביצועים (R3): כפיפת מרפקים');
    expect(d.workouts).toMatchObject({ knee: 2, shoulder: 3 });
    // תרגיל בלי RIR
    expect(d.workouts.items[2]?.lines[0]).toMatchObject({ rir: null });

    const text = weeklySummaryText(d);
    expect(text).toContain('אימונים 3/3 · 06/09 A · 08/09 B · 10/09 C');
    expect(text).toContain('  לג-פרס 60×12,12,12 · RIR 2 · הבא: 65 ק״ג · 10 חזרות (R1)');
    expect(text).toContain("  בנץ' מכונה 40×10,10,10 · (הוחלף מ-בנץ' פרס) · RIR 2 · הבא: 40 ק״ג · 11 חזרות (R6)");
    expect(text).toContain('  כפיפת מרפקים 12.5×8,3 · RIR 1 · הבא: 10 ק״ג · 10 חזרות (R3)');
    expect(text).toContain('  לג-פרס 60×12,12,12 · RIR — · הבא: 65 ק״ג · 10 חזרות (R1)');
    expect(text).toContain('כאב: ברך 2 · כתף 3');
    // אירובי: 20 סיום + 50 עצמאי = 70/60
    expect(d.cardio).toMatchObject({ total: 70, budget: 60, over: true });
    expect(text).toContain('אירובי: 70/60 דק׳ · סיום 20 · עצמאי 50 · מעל התקציב');
    expect(d.flags).toContain('אירובי מעל התקציב (70/60 דק׳)');
    // צ'ק-אין
    expect(text).toContain('היצמדות 8 · רעב 5 · אנרגיה 7 · שינה 7.0 · נשנוש 1 ימים');
    expect(text).toContain('הערה: שבוע טוב');
  });

  it('שבוע בלי אימונים ובלי צ׳ק-אין → דגלים', () => {
    const db = fixture();
    db.workouts = [];
    db.checkins = [];
    const d = buildWeeklySummaryData(db, WEEK2);
    expect(d.flags).toContain('פחות מ-3 אימונים (0/3)');
    expect(d.flags).toContain('צ׳ק-אין לא מולא');
    const text = weeklySummaryText(d);
    expect(text).toContain('אימונים 0/3\n');
    expect(text).toContain('צ׳ק-אין\nלא מולא');
  });
});

describe('6. מספר השבוע וגבולות ראשון–שבת', () => {
  it('programStart 2026-08-30 = שבוע 1; תאריך באמצע השבוע מנורמל לראשון; שבת שייכת לשבוע שלפני', () => {
    const db = fixture();
    expect(buildWeeklySummaryData(db, '2026-09-09').week).toBe(WEEK2);
    expect(buildWeeklySummaryData(db, '2026-09-12').weekNo).toBe(2);
    expect(buildWeeklySummaryData(db, '2026-09-13').weekNo).toBe(3);
    expect(buildWeeklySummaryData(db, '2026-09-05').weekNo).toBe(1);
    // שקילת שבת 05/09 נספרת בשבוע 1 ולא בשבוע 2
    expect(buildWeeklySummaryData(db, WEEK2).weight.current.days[0]).toBe(79.0);
    expect(buildWeeklySummaryData(db, WEEK1).weight.current.days[6]).toBe(79.0);
    // בלי programStart — נגזר מהנתון הראשון: מדידת המותניים של 19/08 → שבוע 4. לכן ההגדרה נשמרת.
    db.settings = { ...db.settings, programStart: null };
    expect(buildWeeklySummaryData(db, WEEK2).weekNo).toBe(4);
    expect(weeklySummaryText(buildWeeklySummaryData(emptyDb(), WEEK2))).toContain('שבוע — · 06/09–12/09');
  });

  it('ברירת המחדל לבורר: בשבת השבוע הנוכחי, אחרת השבוע השלם האחרון', () => {
    expect(defaultSummaryWeek('2026-09-12')).toBe(WEEK2); // שבת
    expect(defaultSummaryWeek('2026-09-13')).toBe(WEEK2); // ראשון
    expect(defaultSummaryWeek('2026-09-16')).toBe(WEEK2); // רביעי
  });
});

describe('7. אורך', () => {
  it('שבוע מלא (3 אימונים עם כל התרגילים, תזונה, צ׳ק-אין) נשאר מתחת לתקרה', () => {
    const db = fixture();
    db.workouts = [
      ...db.workouts.filter((w) => w.d < WEEK2),
      ...WORKOUT_TYPES.map((t, i) =>
        wk(`full-${t}`, `2026-09-0${6 + i * 2}`, t, PROGRAM[t].map((spec) => le(spec.id, spec.bodyweightOnly ? null : 40, Array.from({ length: spec.sets }, () => spec.repRangeMax), { rir: 2 })), 3, 4),
      ),
    ];
    db.days = weekDaysClosed();
    const text = buildWeeklySummary(db, WEEK2);
    expect(text.length).toBeLessThanOrEqual(MAX_SUMMARY_CHARS);
    expect(text.length).toBeGreaterThan(1500);
    expect(text.endsWith('…')).toBe(false);
  });
});

function weekDaysClosed(): DayMeta[] {
  return ['06', '07', '08', '09', '10', '11', '12'].map((d) => closed(`2026-09-${d}`));
}
