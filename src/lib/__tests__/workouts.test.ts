import { describe, it, expect } from 'vitest';
import {
  blankExercises,
  prefilledExercises,
  hasData,
  isWorkoutEmpty,
  lastExercise,
  makeWorkoutId,
  nextType,
  peakPain,
  progressionHint,
  rangeComplete,
  removeWorkout,
  sortableStamp,
  upsertWorkout,
  workoutsInWeek,
} from '../workouts';
import { PROGRAM } from '../../data/program';
import type { WorkoutEntry, WorkoutType } from '../../types';

const wk = (
  id: string,
  d: string,
  t: WorkoutType,
  ex: WorkoutEntry['ex'] = [],
  knee: number | null = null,
  shoulder: number | null = null,
): WorkoutEntry => ({ id, d, t, ex, knee, shoulder });

/** היסטוריה שמזינה את המילוי המוקדם של המשקלים. */
const PREFILL_SOURCE: WorkoutEntry[] = [
  wk('p1', '2026-08-24', 'A', [
    { n: 'לג פרס', w: 55, r: [12, 12, 10] },
    { n: 'פלאנק', w: null, r: [45, 40, 40] },
  ]),
];

describe('prefilledExercises', () => {
  it('מאכלס את המשקל האחרון, משאיר את החזרות ריקות', () => {
    const rows = prefilledExercises(PREFILL_SOURCE, 'A');
    const legPress = rows.find((r) => r.n === 'לג פרס');
    expect(legPress?.w).toBe(55);
    expect(legPress?.r).toEqual([null, null, null]);
  });

  it('תרגיל שלא נרשם מעולם נשאר בלי משקל', () => {
    expect(prefilledExercises(PREFILL_SOURCE, 'A').find((r) => r.n === 'פייס פול')?.w).toBeNull();
  });

  it('תרגיל זמן לעולם בלי משקל', () => {
    expect(prefilledExercises(PREFILL_SOURCE, 'A').find((r) => r.n === 'פלאנק')?.w).toBeNull();
  });
});

describe('nextType — סבב A→B→C', () => {
  it('בלי היסטוריה מתחילים ב-A', () => {
    expect(nextType([])).toBe('A');
  });

  it('אחרי A בא B, אחרי B בא C, אחרי C בא A', () => {
    expect(nextType([wk('1', '2026-08-30', 'A')])).toBe('B');
    expect(nextType([wk('1', '2026-08-30', 'B')])).toBe('C');
    expect(nextType([wk('1', '2026-08-30', 'C')])).toBe('A');
  });

  it('נקבע לפי האימון האחרון בתאריך, לא לפי הסדר במערך', () => {
    const list = [wk('z', '2026-08-30', 'C'), wk('a', '2026-09-02', 'A')];
    expect(nextType(list)).toBe('B');
  });

  it('שני אימונים באותו יום — מי שנוצר אחרון קובע', () => {
    const early = makeWorkoutId('2026-09-02', 'A', `${sortableStamp(1_000_000)}-x`);
    const late = makeWorkoutId('2026-09-02', 'B', `${sortableStamp(2_000_000)}-y`);
    const list = [wk(early, '2026-09-02', 'A'), wk(late, '2026-09-02', 'B')];
    expect(nextType(list)).toBe('C');
    expect(nextType([...list].reverse())).toBe('C');

    // הפוך: B נוצר קודם, A אחריו → הבא בתור B
    const list2 = [
      wk(makeWorkoutId('2026-09-02', 'B', `${sortableStamp(1_000_000)}-x`), '2026-09-02', 'B'),
      wk(makeWorkoutId('2026-09-02', 'A', `${sortableStamp(2_000_000)}-y`), '2026-09-02', 'A'),
    ];
    expect(nextType(list2)).toBe('B');
  });

  it('sortableStamp: השוואת מחרוזות שווה להשוואת זמן', () => {
    const times = [0, 1, 999, 1_000_000, 1_700_000_000_000, 1_800_000_000_000];
    const stamps = times.map(sortableStamp);
    expect(stamps.every((x) => x.length === 9)).toBe(true);
    expect([...stamps].sort()).toEqual(stamps);
  });

  it('סבב מלא חוזר לעצמו', () => {
    let list: WorkoutEntry[] = [];
    const seen: WorkoutType[] = [];
    for (let i = 0; i < 7; i++) {
      const t = nextType(list);
      seen.push(t);
      list = upsertWorkout(list, wk(`w${i}`, `2026-09-${String(i + 1).padStart(2, '0')}`, t));
    }
    expect(seen).toEqual(['A', 'B', 'C', 'A', 'B', 'C', 'A']);
  });
});

describe('lastExercise — המשקל האחרון לכל תרגיל', () => {
  const list = [
    wk('1', '2026-08-24', 'A', [{ n: 'לג פרס', w: 55, r: [12, 12, 10] }]),
    wk('2', '2026-08-31', 'A', [{ n: 'לג פרס', w: 60, r: [12, 12, 11] }]),
    wk('3', '2026-09-02', 'B', [{ n: 'פולי עליון', w: 40, r: [10, 10, 10] }]),
  ];

  it('מחזיר את הרישום האחרון לפי תאריך', () => {
    expect(lastExercise(list, 'לג פרס')).toEqual({
      d: '2026-08-31',
      w: 60,
      r: [12, 12, 11],
    });
  });

  it('תרגיל שלא נרשם מעולם', () => {
    expect(lastExercise(list, 'פייס פול')).toBeNull();
  });

  it('מתעלם מהאימון הנוכחי כשמבקשים', () => {
    expect(lastExercise(list, 'לג פרס', '2')?.w).toBe(55);
  });

  it('מתעלם מרישום ריק לגמרי', () => {
    const withBlank = [
      ...list,
      wk('4', '2026-09-05', 'A', [{ n: 'לג פרס', w: null, r: [null, null, null] }]),
    ];
    expect(lastExercise(withBlank, 'לג פרס')?.w).toBe(60);
  });

  it('רישום עם חזרות בלי משקל עדיין נחשב', () => {
    const l = [wk('1', '2026-09-01', 'A', [{ n: 'פלאנק', w: null, r: [45, 40, 40] }])];
    expect(lastExercise(l, 'פלאנק')).toEqual({ d: '2026-09-01', w: null, r: [45, 40, 40] });
  });
});

describe('התקדמות כפולה', () => {
  it('rangeComplete רק כששלושת הסטים בתקרה', () => {
    expect(rangeComplete([12, 12, 12], 12)).toBe(true);
    expect(rangeComplete([12, 12, 13], 12)).toBe(true);
    expect(rangeComplete([12, 12, 11], 12)).toBe(false);
    expect(rangeComplete([12, 12, null], 12)).toBe(false);
    expect(rangeComplete([12, 12], 12)).toBe(false);
  });

  it('מכונה: +5 ק"ג', () => {
    expect(progressionHint({ n: 'לג פרס', w: 60, r: [12, 12, 12] })).toBe(
      'טווח הושלם — +5 ק"ג בפעם הבאה',
    );
  });

  it('משקולת יד: +2.5 ק"ג', () => {
    expect(progressionHint({ n: 'RDL משקולות יד', w: 20, r: [15, 15, 15] })).toBe(
      'טווח הושלם — +2.5 ק"ג בפעם הבאה',
    );
  });

  it('תרגיל זמן: הארכת זמן, בלי ק"ג', () => {
    expect(progressionHint({ n: 'פלאנק', w: null, r: [60, 60, 60] })).toBe(
      'טווח הושלם — הארך את הזמן בפעם הבאה',
    );
  });

  it('מתחת לתקרה — אין רמז', () => {
    expect(progressionHint({ n: 'לג פרס', w: 60, r: [12, 11, 12] })).toBeNull();
  });

  it('תרגיל שאינו בתוכנית — אין רמז', () => {
    expect(progressionHint({ n: 'תרגיל נשכח', w: 10, r: [99, 99, 99] })).toBeNull();
  });
});

describe('שבוע, ריקנות וכאב', () => {
  it('workoutsInWeek לוקח רק את השבוע המבוקש', () => {
    const list = [
      wk('1', '2026-08-29', 'A'),
      wk('2', '2026-08-30', 'B'),
      wk('3', '2026-09-05', 'C'),
      wk('4', '2026-09-06', 'A'),
    ];
    expect(workoutsInWeek(list, '2026-08-30').map((w) => w.id)).toEqual(['2', '3']);
  });

  it('אימון בלי שום נתון נחשב ריק, גם עם משקלים מאוכלסים מראש', () => {
    const empty = wk('1', '2026-08-30', 'A', blankExercises('A'));
    expect(isWorkoutEmpty(empty)).toBe(true);
    expect(
      isWorkoutEmpty(wk('2', '2026-08-30', 'A', prefilledExercises(PREFILL_SOURCE, 'A'))),
    ).toBe(true);
    expect(isWorkoutEmpty({ ...empty, knee: 0 })).toBe(false);
    expect(
      isWorkoutEmpty({ ...empty, ex: [{ n: 'לג פרס', w: null, r: [10, null, null] }] }),
    ).toBe(false);
  });

  it('hasData — משקל לבדו אינו נתון, נדרשת חזרה אחת לפחות', () => {
    expect(hasData({ n: 'x', w: null, r: [null, null, null] })).toBe(false);
    // המשקל מאוכלס אוטומטית מההיסטוריה, ולכן אינו מעיד שהתרגיל בוצע
    expect(hasData({ n: 'x', w: 60, r: [null, null, null] })).toBe(false);
    expect(hasData({ n: 'x', w: null, r: [10, null, null] })).toBe(true);
  });

  it('peakPain מחזיר את הערך הגבוה, ו-null אם לא נרשם', () => {
    const list = [wk('1', '2026-08-30', 'A', [], 1, null), wk('2', '2026-09-01', 'B', [], 3, 2)];
    expect(peakPain(list, 'knee')).toBe(3);
    expect(peakPain(list, 'shoulder')).toBe(2);
    expect(peakPain([wk('1', '2026-08-30', 'A')], 'knee')).toBeNull();
  });

  it('upsert לפי מזהה, remove לפי מזהה', () => {
    let list = upsertWorkout([], wk('1', '2026-08-30', 'A'));
    list = upsertWorkout(list, wk('1', '2026-08-30', 'B'));
    expect(list).toHaveLength(1);
    expect(list[0]?.t).toBe('B');
    expect(removeWorkout(list, '1')).toHaveLength(0);
  });
});

describe('התוכנית', () => {
  it('שלושה אימונים, שישה תרגילים בכל אחד', () => {
    for (const t of ['A', 'B', 'C'] as const) {
      expect(PROGRAM[t]).toHaveLength(6);
    }
  });

  it('blankExercises מייצר שורה לכל תרגיל עם 3 סטים ריקים', () => {
    const rows = blankExercises('B');
    expect(rows.map((r) => r.n)).toEqual(PROGRAM.B.map((s) => s.n));
    expect(rows.every((r) => r.r.length === 3 && r.r.every((x) => x === null))).toBe(true);
  });

  it('תרגילי זמן מוגדרים ככאלה בקובץ התוכנית, לא בקומפוננטה', () => {
    const timed = ['פלאנק', 'Dead bug', 'פלאנק צד'];
    for (const t of ['A', 'B', 'C'] as const) {
      for (const spec of PROGRAM[t]) {
        expect(spec.kind).toBe(timed.includes(spec.n) ? 'time' : 'reps');
      }
    }
  });

  it('לכל תרגיל טווח חוקי ותוספת', () => {
    for (const t of ['A', 'B', 'C'] as const) {
      for (const spec of PROGRAM[t]) {
        expect(spec.min).toBeLessThan(spec.max);
        expect(spec.short.length).toBeGreaterThan(0);
        if (spec.kind === 'reps') expect(spec.increment).toBeGreaterThan(0);
      }
    }
  });
});
