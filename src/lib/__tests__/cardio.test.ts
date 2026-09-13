import { describe, it, expect } from 'vitest';
import { emptyDb, type StandaloneCardio } from '../../types';
import {
  blankStandalone,
  cardioBudgetFor,
  cardioWeek,
  finishStandalone,
  finisherMinutesInWeek,
  standaloneDetailLine,
  stepsInWeek,
  lastStandalone,
  makeStandaloneId,
  removeStandalone,
  standaloneInWeek,
  standaloneLine,
  standaloneMinutesInWeek,
  upsertStandalone,
} from '../cardio';
import { parseStandaloneCardio, parseDb } from '../schema';
import { mergeDb, recordCount, firstDataDate } from '../db';
import { buildWeekSummary } from '../weekSummary';
import { buildChatReport } from '../exportText';
import {
  blankCardio,
  cardioDetailLine,
  cardioLine,
  finishCardio,
  FINISHER_ID,
  lastFinisherCardio,
  markCardioDone,
  patchCardio,
  workoutsInWeek,
  WARMUP_ID,
} from '../workouts';
import { CARDIO_BUDGET_SCHEDULE, CARDIO_WEEKLY_BUDGET_MIN } from '../../data/config';
import { le, wk } from './helpers';

const WEEK = '2026-08-30'; // ראשון
const TODAY = '2026-09-05'; // שבת

function sc(id: string, d: string, minutes: number, over: Partial<StandaloneCardio> = {}): StandaloneCardio {
  return { id, d, mode: 'treadmill', minutes, incline: 2.5, speed: 5, note: '', ...over };
}

describe('אירובי עצמאי — רשימה', () => {
  it('upsert לפי מזהה, ממוין לפי תאריך ואז מזהה', () => {
    let list = upsertStandalone([], sc('b', '2026-09-02', 60));
    list = upsertStandalone(list, sc('a', '2026-09-01', 30));
    list = upsertStandalone(list, sc('b', '2026-09-02', 45));
    expect(list.map((e) => [e.id, e.minutes])).toEqual([
      ['a', 30],
      ['b', 45],
    ]);
    expect(removeStandalone(list, 'a').map((e) => e.id)).toEqual(['b']);
  });

  it('גבול השבוע: ראשון–שבת, שבת שאחרי לא נכנסת', () => {
    const list = [
      sc('0', '2026-08-29', 10), // שבת של השבוע הקודם
      sc('1', '2026-08-30', 20), // ראשון
      sc('2', '2026-09-05', 30), // שבת
      sc('3', '2026-09-06', 40), // ראשון הבא
    ];
    expect(standaloneInWeek(list, WEEK).map((e) => e.id)).toEqual(['1', '2']);
    expect(standaloneMinutesInWeek(list, WEEK)).toBe(50);
    expect(standaloneMinutesInWeek(list, '2026-09-06')).toBe(40);
  });

  it('האחרון לפי מכשיר ממלא רשומה חדשה; בלי היסטוריה — ברירות המחדל', () => {
    const list = [
      sc('1', '2026-09-01', 45, { mode: 'bike', incline: null, speed: 20 }),
      sc('2', '2026-09-03', 50, { incline: 3, speed: 5.5 }),
    ];
    expect(lastStandalone(list)?.id).toBe('2');
    expect(lastStandalone(list, 'bike')?.id).toBe('1');
    expect(lastStandalone([], 'bike')).toBeNull();

    const id = makeStandaloneId('2026-09-05', 'x');
    expect(id).toBe('2026-09-05-x-cardio');
    expect(blankStandalone(list, '2026-09-05', id)).toEqual(
      sc(id, '2026-09-05', 50, { incline: 3, speed: 5.5 }),
    );
    expect(blankStandalone(list, '2026-09-05', id, 'bike')).toMatchObject({
      mode: 'bike',
      minutes: 45,
      incline: null,
      speed: 20,
    });
    expect(blankStandalone([], '2026-09-05', id)).toEqual(
      sc(id, '2026-09-05', 60, { mode: 'treadmill', incline: 2.5, speed: 5 }),
    );
  });

  it('שורת התצוגה', () => {
    expect(standaloneLine(sc('1', '2026-09-01', 60))).toBe('הליכון · 60 דק׳ · שיפוע 2.5% · 5 קמ״ש');
    expect(standaloneLine(sc('1', '2026-09-01', 45, { mode: 'bike', incline: null, speed: null }))).toBe(
      'אופניים · 45 דק׳',
    );
  });
});

describe('תקציב שבועי', () => {
  it('60 עד 1/11/2026, ואז 120 — לפי ראשון של השבוע', () => {
    expect(CARDIO_WEEKLY_BUDGET_MIN).toBe(60);
    expect(CARDIO_BUDGET_SCHEDULE).toEqual([{ from: '2026-11-01', minutes: 120 }]);
    expect(cardioBudgetFor('2026-09-06')).toBe(60);
    expect(cardioBudgetFor('2026-10-25')).toBe(60);
    expect(cardioBudgetFor('2026-11-01')).toBe(120);
    expect(cardioBudgetFor('2027-01-03')).toBe(120);
  });
});

describe('מונה שבועי — שני המקורות', () => {
  function db() {
    const d = emptyDb();
    d.workouts = [
      // אירובי סיום שבוצע: 15 דק׳. חימום לא נספר.
      wk('w1', '2026-08-31', 'A', [
        markCardioDone(blankCardio(WARMUP_ID), 10),
        le('leg-press', 60, [12, 12, 10]),
        markCardioDone(patchCardio(blankCardio(FINISHER_ID), { mode: 'treadmill', incline: 2, speed: 5 }), 15),
      ]),
      // שורת אירובי ריקה (לא נלחץ "התחל") — אפס.
      wk('w2', '2026-09-03', 'B', [le('db-rdl', 24, [10, 10, 10]), blankCardio(FINISHER_ID)]),
      // אירובי שבת ישן, בלי שיפוע/מהירות — נספר באותו מנגנון.
      wk('w0', '2026-08-29', 'C', [markCardioDone(blankCardio(FINISHER_ID), 12)]),
    ];
    d.standaloneCardio = [sc('s1', '2026-09-02', 60), sc('s2', '2026-09-06', 30)];
    return d;
  }

  it('סיום מתוך האימונים, עצמאי מהמפתח שלו, סכום מול תקציב', () => {
    expect(finisherMinutesInWeek(db().workouts, WEEK)).toBe(15);
    expect(finisherMinutesInWeek(db().workouts, '2026-08-23')).toBe(12);
    expect(cardioWeek(db(), WEEK)).toEqual({ finisher: 15, standalone: 60, total: 75, budget: 60, steps: null });
    expect(cardioWeek(emptyDb(), WEEK)).toEqual({ finisher: 0, standalone: 0, total: 0, budget: 60, steps: null });
  });

  it('קריטי: אירובי — סיום או עצמאי — לא מזיז את "אימונים השבוע"', () => {
    const d = db();
    const before = workoutsInWeek(d.workouts, WEEK).length;
    expect(before).toBe(2);

    // עוד אירובי עצמאי
    d.standaloneCardio = upsertStandalone(d.standaloneCardio, sc('s3', '2026-09-04', 60));
    expect(workoutsInWeek(d.workouts, WEEK).length).toBe(2);
    expect(buildWeekSummary(d, WEEK, TODAY).workouts.done).toBe(2);
    expect(buildChatReport(d, WEEK, TODAY)).toContain('אימונים: 2/3');

    // אירובי סיום שנרשם באימון קיים — אותו אימון, אותה ספירה
    d.workouts = d.workouts.map((w) =>
      w.id === 'w2'
        ? { ...w, ex: w.ex.map((e) => (e.exerciseId === FINISHER_ID ? markCardioDone(e, 20) : e)) }
        : w,
    );
    expect(workoutsInWeek(d.workouts, WEEK).length).toBe(2);
    expect(cardioWeek(d, WEEK)).toEqual({ finisher: 35, standalone: 120, total: 155, budget: 60, steps: null });
  });

  it('הסיכום השבועי והדוח לצ׳אט מציגים את אותם מספרים', () => {
    const r = buildWeekSummary(db(), WEEK, TODAY);
    expect(r.cardio).toMatchObject({ finisher: 15, standalone: 60, total: 75, budget: 60 });
    expect(r.cardio.standaloneItems).toEqual([
      { id: 's1', d: '2026-09-02', text: 'הליכון · 60 דק׳ · שיפוע 2.5% · 5 קמ״ש', detail: null, note: '' },
    ]);
    const text = buildChatReport(db(), WEEK, TODAY);
    expect(text).toContain('אירובי: 75/60 דק׳ · סיום 15 · עצמאי 60');
    expect(text).toContain('02/09 עצמאי — הליכון · 60 דק׳ · שיפוע 2.5% · 5 קמ״ש');
    expect(text).toContain('31/08 A — חימום אופניים 10 דק׳ · לג-פרס 60×12,12,10 · אירובי הליכון 15 דק׳ 2% 5 קמ״ש');
    // שבוע ריק: השורה עדיין קיימת, באפס.
    expect(buildChatReport(emptyDb(), WEEK, TODAY)).toContain('אירובי: 0/60 דק׳ · סיום 0 · עצמאי 0');
  });
});

describe('parseStandaloneCardio', () => {
  it('מקבל, מנרמל, וממלא מזהה חסר', () => {
    const r = parseStandaloneCardio([
      { id: 'a', d: '2026-09-01', mode: 'bike', minutes: '45', incline: 0, speed: 22.5, note: 'x' },
      { d: '2026-09-02', mode: 'rowing', minutes: 60.4, incline: 99, speed: -1 },
    ]);
    expect(r.rejected).toEqual([]);
    expect(r.ok).toEqual([
      { id: 'a', d: '2026-09-01', mode: 'bike', minutes: 45, incline: 0, speed: 22.5, note: 'x' },
      {
        id: '2026-09-02-imported-0-cardio',
        d: '2026-09-02',
        mode: 'treadmill',
        minutes: 60,
        incline: null,
        speed: null,
        note: '',
      },
    ]);
  });

  it('דוחה רק מה שאי אפשר להציג, עם סיבה', () => {
    const r = parseStandaloneCardio([
      42,
      { d: 'nope', minutes: 30 },
      { d: '2026-09-01', minutes: 0 },
      { d: '2026-09-01', minutes: 'abc' },
    ]);
    expect(r.ok).toEqual([]);
    expect(r.rejected.map((x) => x.reason)).toEqual([
      'רשומה שאינה אובייקט',
      'תאריך לא תקין',
      'דקות שאינן מספר חיובי',
      'דקות שאינן מספר חיובי',
    ]);
    expect(parseStandaloneCardio(undefined).ok).toEqual([]);
  });

  it('גיבוי ישן בלי המפתח נקלט בלי דחייה; גיבוי חדש מחזיר את הרשומות', () => {
    const old = parseDb({ v: 2, weights: [{ d: '2026-09-01', w: 80 }] });
    expect(old.db.standaloneCardio).toEqual([]);
    expect(old.counts.standaloneCardio).toBe(0);
    expect(old.rejected).toEqual([]);

    const fresh = parseDb({ v: 2, standaloneCardio: [sc('a', '2026-09-01', 60)] });
    expect(fresh.db.standaloneCardio).toEqual([sc('a', '2026-09-01', 60)]);
    expect(fresh.counts.standaloneCardio).toBe(1);
  });
});

describe('DB — מיזוג, ספירה, תאריך ראשון', () => {
  it('מיזוג לפי מזהה, הנכנס גובר, הקיים לא נמחק', () => {
    const cur = { ...emptyDb(), standaloneCardio: [sc('a', '2026-09-01', 60), sc('b', '2026-09-02', 30)] };
    const inc = { ...emptyDb(), standaloneCardio: [sc('b', '2026-09-02', 45), sc('c', '2026-09-03', 20)] };
    expect(mergeDb(cur, inc).standaloneCardio.map((e) => [e.id, e.minutes])).toEqual([
      ['a', 60],
      ['b', 45],
      ['c', 20],
    ]);
  });

  it('נספר ברשומות (לגיבוי) ובתאריך הראשון, ועדיין לא באימונים', () => {
    const d = { ...emptyDb(), standaloneCardio: [sc('a', '2026-07-01', 60)] };
    expect(recordCount(d)).toBe(1);
    expect(firstDataDate(d)).toBe('2026-07-01');
    expect(d.workouts).toEqual([]);
  });
});

describe('מקטעים וצעדים', () => {
  const SEGS = [
    { minutes: 5, incline: 0, speed: 3.5 },
    { minutes: 13, incline: 10, speed: 3.5 },
    { minutes: 12, incline: 5, speed: 5 },
  ];

  it('finishStandalone: minutes = סכום, העליון = המקטע הארוך ביותר', () => {
    const e = finishStandalone({ id: 's', d: '2026-09-02', mode: 'treadmill', note: '' }, SEGS, 3200);
    expect(e).toEqual({
      id: 's', d: '2026-09-02', mode: 'treadmill', note: '',
      minutes: 30, incline: 10, speed: 3.5, segments: SEGS, steps: 3200,
    });
    expect(e.segments).not.toBe(SEGS);
    expect(standaloneLine(e)).toBe('הליכון · 30 דק׳ · שיפוע 10% · 3.5 קמ״ש');
    expect(standaloneDetailLine(e)).toBe('5 דק׳ 0% 3.5 קמ״ש / 13 דק׳ 10% 3.5 קמ״ש / 12 דק׳ 5% 5 קמ״ש · 3,200 צעדים');
    // בלי צעדים ומקטע יחיד — אין שורת פירוט
    const single = finishStandalone({ id: 's2', d: '2026-09-02', mode: 'bike', note: '' }, [SEGS[0]!], null);
    expect(single).toEqual({ id: 's2', d: '2026-09-02', mode: 'bike', note: '', minutes: 5, incline: 0, speed: 3.5, segments: [SEGS[0]] });
    expect(standaloneDetailLine(single)).toBeNull();
    // רשומה ישנה (בלי segments) — כמו קודם
    expect(standaloneDetailLine(sc('old', '2026-09-01', 60))).toBeNull();
  });

  it('finishCardio: הרשומה באימון, הביצוע ב-sets[0].seconds', () => {
    const ex = finishCardio(blankCardio(FINISHER_ID), 'treadmill', SEGS, 3200);
    expect(ex.cardio).toEqual({ mode: 'treadmill', minutes: 30, incline: 10, speed: 3.5, segments: SEGS, steps: 3200 });
    expect(ex.sets).toEqual([{ weight: null, reps: null, seconds: 1800 }]);
    expect(cardioLine(ex)).toBe('אירובי · הליכון · 30 דק׳ · שיפוע 10% · 3.5 קמ״ש');
    expect(cardioDetailLine(ex)).toBe('5 דק׳ 0% 3.5 קמ״ש / 13 דק׳ 10% 3.5 קמ״ש / 12 דק׳ 5% 5 קמ״ש · 3,200 צעדים');
    // מקטע יחיד עם צעדים — רק הצעדים בפירוט; ישן בלי כלום — null
    expect(cardioDetailLine(finishCardio(blankCardio(FINISHER_ID), 'bike', [{ minutes: 20, incline: null, speed: null }], 100))).toBe('100 צעדים');
    expect(cardioDetailLine(markCardioDone(blankCardio(FINISHER_ID), 12))).toBeNull();
    expect(cardioDetailLine(blankCardio(FINISHER_ID))).toBeNull();
  });

  it('מילוי מראש מהאחרון: המקטע הארוך ביותר, בלי מקטעים ובלי צעדים', () => {
    const w = wk('w', '2026-09-05', 'A', [finishCardio(blankCardio(FINISHER_ID), 'treadmill', SEGS, 3200)]);
    expect(lastFinisherCardio([w])).toEqual({ mode: 'treadmill', minutes: 30, incline: 10, speed: 3.5 });
    const d = { ...emptyDb(), standaloneCardio: [finishStandalone({ id: 's', d: '2026-09-02', mode: 'treadmill', note: '' }, SEGS, null)] };
    expect(blankStandalone(d.standaloneCardio, '2026-09-10', 'new')).toEqual({
      id: 'new', d: '2026-09-10', mode: 'treadmill', minutes: 30, incline: 10, speed: 3.5, note: '',
    });
  });

  it('צעדים בשבוע: סכום סיום+עצמאי, null כשאף רשומה לא רשמה', () => {
    const d = emptyDb();
    d.workouts = [wk('w', '2026-09-01', 'A', [finishCardio(blankCardio(FINISHER_ID), 'treadmill', SEGS, 3200)])];
    d.standaloneCardio = [
      finishStandalone({ id: 's1', d: '2026-09-02', mode: 'treadmill', note: '' }, SEGS, 4000),
      finishStandalone({ id: 's2', d: '2026-09-03', mode: 'bike', note: '' }, [SEGS[0]!], null),
    ];
    expect(stepsInWeek(d, WEEK)).toBe(7200);
    expect(cardioWeek(d, WEEK)).toMatchObject({ finisher: 30, standalone: 35, total: 65, steps: 7200 });
    d.standaloneCardio = [d.standaloneCardio[1]!];
    d.workouts = [];
    expect(stepsInWeek(d, WEEK)).toBeNull();
  });
});

describe('דוח הצ׳אט עם מקטעים וצעדים', () => {
  it('שורת האימון, שורת העצמאי ושורת השבוע', () => {
    const SEGS = [
      { minutes: 5, incline: 0, speed: 3.5 },
      { minutes: 13, incline: 10, speed: 3.5 },
      { minutes: 12, incline: 5, speed: 5 },
    ];
    const d = emptyDb();
    d.workouts = [wk('w', '2026-09-01', 'A', [le('leg-press', 60, [12]), finishCardio(blankCardio(FINISHER_ID), 'treadmill', SEGS, 3200)])];
    d.standaloneCardio = [finishStandalone({ id: 's', d: '2026-09-02', mode: 'treadmill', note: '' }, SEGS, 4000)];
    const text = buildChatReport(d, WEEK, TODAY);
    expect(text).toContain(
      '01/09 A — לג-פרס 60×12 · אירובי הליכון 30 דק׳ 10% 3.5 קמ״ש (5 דק׳ 0% 3.5 קמ״ש / 13 דק׳ 10% 3.5 קמ״ש / 12 דק׳ 5% 5 קמ״ש) 3,200 צעדים',
    );
    expect(text).toContain('אירובי: 60/60 דק׳ · סיום 30 · עצמאי 30 · 7,200 צעדים');
    expect(text).toContain(
      '02/09 עצמאי — הליכון · 30 דק׳ · שיפוע 10% · 3.5 קמ״ש (5 דק׳ 0% 3.5 קמ״ש / 13 דק׳ 10% 3.5 קמ״ש / 12 דק׳ 5% 5 קמ״ש · 4,000 צעדים)',
    );
    // בלי צעדים בשום רשומה — השורה השבועית כמו קודם
    d.workouts = [];
    d.standaloneCardio = [finishStandalone({ id: 's', d: '2026-09-02', mode: 'bike', note: '' }, [SEGS[0]!], null)];
    expect(buildChatReport(d, WEEK, TODAY)).toContain('אירובי: 5/60 דק׳ · סיום 0 · עצמאי 5\n');
    const r = buildWeekSummary(d, WEEK, TODAY);
    expect(r.cardio.steps).toBeNull();
    expect(r.cardio.standaloneItems[0]?.detail).toBeNull();
  });
});
