import { describe, it, expect } from 'vitest';
import {
  blankExercises,
  blankLoggedExercise,
  exerciseHistory,
  exercisesFor,
  hasData,
  isWorkoutEmpty,
  lastExercise,
  lastWeightOf,
  makeWorkoutId,
  nextType,
  peakPain,
  prefilledExercises,
  removeWorkout,
  sortableStamp,
  upsertWorkout,
  withSetCount,
  workoutsInWeek,
} from '../workouts';
import { PROGRAM, TYPE_CONFIG, exerciseById, resolveExerciseId } from '../../data/program';
import type { WorkoutEntry, WorkoutType } from '../../types';
import { le, wk } from './helpers';

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
      list = upsertWorkout(
        list,
        wk(
          makeWorkoutId('2026-09-01', t, `${sortableStamp(i * 1000)}-x`),
          `2026-09-${String(i + 1).padStart(2, '0')}`,
          t,
        ),
      );
    }
    expect(seen).toEqual(['A', 'B', 'C', 'A', 'B', 'C', 'A']);
  });
});

describe('lastExercise — היסטוריה לפי מזהה, לא לפי שם', () => {
  const list = [
    wk('1', '2026-08-24', 'A', [le('leg-press', 55, [12, 12, 10])]),
    wk('2', '2026-08-31', 'A', [le('leg-press', 60, [12, 12, 11])]),
    wk('3', '2026-09-02', 'B', [le('lat-pulldown', 40, [10, 10, 10])]),
  ];

  it('מחזיר את הרישום האחרון לפי תאריך', () => {
    const found = lastExercise(list, 'leg-press');
    expect(found?.d).toBe('2026-08-31');
    expect(lastWeightOf(found!.ex)).toBe(60);
  });

  it('תרגיל שלא נרשם מעולם', () => {
    expect(lastExercise(list, 'face-pull')).toBeNull();
  });

  it('מתעלם מהאימון הנוכחי כשמבקשים', () => {
    expect(lastWeightOf(lastExercise(list, 'leg-press', '2')!.ex)).toBe(55);
  });

  it('מתעלם מרישום בלי אף חזרה', () => {
    const withBlank = [
      ...list,
      wk('4', '2026-09-05', 'A', [le('leg-press', 65, [null, null, null])]),
    ];
    expect(lastWeightOf(lastExercise(withBlank, 'leg-press')!.ex)).toBe(60);
  });

  it('תרגיל זמן נחשב גם בלי משקל', () => {
    const l = [wk('1', '2026-09-01', 'A', [le('plank', null, [45, 40, 40])])];
    const found = lastExercise(l, 'plank');
    expect(found?.ex.sets.map((s) => s.seconds)).toEqual([45, 40, 40]);
    expect(lastWeightOf(found!.ex)).toBeNull();
  });

  it('exerciseHistory מחזיר הכול מהישן לחדש', () => {
    expect(exerciseHistory(list, 'leg-press').map((h) => h.d)).toEqual([
      '2026-08-24',
      '2026-08-31',
    ]);
  });

  it('שם ישן ממופה למזהה החדש, כך שההיסטוריה נשמרת', () => {
    expect(resolveExerciseId('לג פרס')).toBe('leg-press');
    expect(resolveExerciseId('פולי עליון')).toBe('lat-pulldown');
    expect(resolveExerciseId('לחיצת רגליים')).toBe('leg-press');
    expect(resolveExerciseId('RDL משקולות יד')).toBeNull();
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

  it('hasData — משקל לבדו אינו נתון, נדרשת חזרה אחת לפחות', () => {
    expect(hasData(le('leg-press', null, [null, null, null]))).toBe(false);
    expect(hasData(le('leg-press', 60, [null, null, null]))).toBe(false);
    expect(hasData(le('leg-press', null, [10, null, null]))).toBe(true);
    expect(hasData(le('plank', null, [30]))).toBe(true);
  });

  it('אימון ריק, גם עם משקלים מאוכלסים מראש', () => {
    expect(isWorkoutEmpty(wk('1', '2026-08-30', 'A', blankExercises('A')))).toBe(true);
    expect(
      isWorkoutEmpty(
        wk('2', '2026-08-30', 'A', prefilledExercises(PREFILL_SOURCE, 'A')),
      ),
    ).toBe(true);
    expect(isWorkoutEmpty(wk('3', '2026-08-30', 'A', [], 0))).toBe(false);
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

const PREFILL_SOURCE: WorkoutEntry[] = [
  wk('p1', '2026-08-24', 'A', [
    le('leg-press', 55, [12, 12, 10]),
    le('plank', null, [45, 40, 40]),
  ]),
];

describe('בניית אימון', () => {
  it('prefilledExercises מאכלס משקל אחרון ומשאיר חזרות ריקות', () => {
    const rows = prefilledExercises(PREFILL_SOURCE, 'A');
    const legPress = rows.find((r) => r.exerciseId === 'leg-press');
    expect(legPress?.sets.map((s) => s.weight)).toEqual([55, 55, 55]);
    expect(legPress?.sets.every((s) => s.reps === null)).toBe(true);
  });

  it('תרגיל שלא נרשם מעולם נשאר בלי משקל', () => {
    expect(
      prefilledExercises(PREFILL_SOURCE, 'A')
        .find((r) => r.exerciseId === 'cable-curl')
        ?.sets.every((s) => s.weight === null),
    ).toBe(true);
  });

  it('תרגיל זמן ומשקל-גוף לעולם בלי משקל', () => {
    const a = prefilledExercises(PREFILL_SOURCE, 'A');
    expect(a.find((r) => r.exerciseId === 'plank')?.sets.every((s) => s.weight === null)).toBe(true);
    const c = prefilledExercises([], 'C');
    expect(
      c.find((r) => r.exerciseId === 'bulgarian-split-squat')?.sets.every((s) => s.weight === null),
    ).toBe(true);
  });

  it('מספר הסטים נלקח מהתוכנית, לא קבוע', () => {
    const a = blankExercises('A');
    expect(a.find((r) => r.exerciseId === 'leg-press')?.sets).toHaveLength(3);
    expect(a.find((r) => r.exerciseId === 'pec-deck')?.sets).toHaveLength(2);
  });

  it('withSetCount משלים סטים שנחתכו בשמירה, בלי לקצץ עודפים', () => {
    const two = le('leg-press', 60, [12, 12]);
    expect(withSetCount(two, 3).sets).toHaveLength(3);
    expect(withSetCount(two, 1).sets).toHaveLength(2);
  });

  it('exercisesFor מחזיר את תרגילי התוכנית ומוסיף תרגיל שירד ממנה', () => {
    const orphan = le('legacy:RDL משקולות יד', 20, [12, 12, 10], {
      n: 'RDL משקולות יד',
    });
    const entry = wk('1', '2026-09-01', 'A', [le('leg-press', 60, [12, 12, 12]), orphan]);
    const rows = exercisesFor(entry, [entry]);
    expect(rows).toHaveLength(PROGRAM.A.length + 1);
    expect(rows[rows.length - 1]?.n).toBe('RDL משקולות יד');
  });
});

describe('התוכנית', () => {
  it('מספר התרגילים בכל אימון', () => {
    expect(PROGRAM.A).toHaveLength(9);
    expect(PROGRAM.B).toHaveLength(8);
    expect(PROGRAM.C).toHaveLength(7);
  });

  it('מזהים ייחודיים בכל התוכנית', () => {
    const ids = (['A', 'B', 'C'] as const).flatMap((t) => PROGRAM[t].map((e) => e.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('כל תרגיל תקין: טווח, סטים, שם קצר', () => {
    for (const t of ['A', 'B', 'C'] as const) {
      for (const spec of PROGRAM[t]) {
        expect(spec.repRangeMin).toBeLessThanOrEqual(spec.repRangeMax);
        expect(spec.sets).toBeGreaterThanOrEqual(2);
        expect(spec.short.length).toBeGreaterThan(0);
        expect(spec.muscles.length).toBeGreaterThan(0);
      }
    }
  });

  it('דגלים מיוחדים לפי המפרט', () => {
    expect(exerciseById('bulgarian-split-squat')).toMatchObject({
      bodyweightOnly: true,
      unilateral: true,
      note: 'משקל גוף בלבד — מגבלת ברך',
    });
    expect(exerciseById('single-arm-cable-row')?.unilateral).toBe(true);
    expect(exerciseById('dead-bug')?.unilateral).toBe(true);
    expect(exerciseById('plank')?.isTimed).toBe(true);
    expect(exerciseById('side-plank')?.isTimed).toBe(true);
  });

  it('תרגילי משקל גוף בלי שם מכונה', () => {
    for (const id of ['plank', 'side-plank', 'dead-bug', 'bulgarian-split-squat']) {
      expect(exerciseById(id)?.machine).toBeNull();
    }
  });

  it('TYPE_CONFIG כפי שהוגדר', () => {
    expect(TYPE_CONFIG.compound).toEqual({
      restBetweenSets: 120,
      restBetweenExercises: 180,
      weightIncrement: 5,
    });
    expect(TYPE_CONFIG.isolation).toEqual({
      restBetweenSets: 60,
      restBetweenExercises: 90,
      weightIncrement: 2.5,
    });
    expect(TYPE_CONFIG.core).toEqual({
      restBetweenSets: 45,
      restBetweenExercises: 90,
      weightIncrement: 0,
    });
  });

  it('blankLoggedExercise מקפיא את היעד ואת הסוג', () => {
    const spec = exerciseById('leg-extension')!;
    const row = blankLoggedExercise(spec, 30);
    expect(row).toMatchObject({
      exerciseId: 'leg-extension',
      targetRepMin: 12,
      targetRepMax: 15,
      type: 'isolation',
      bodyweightOnly: false,
    });
    expect(row.sets).toHaveLength(2);
  });
});
