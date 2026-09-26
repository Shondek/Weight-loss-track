/** שלב 4D: כללי ההתקדמות — המקרים האמיתיים מהיומן, ומקרי הקצה של כל כלל. */
import { describe, expect, it } from 'vitest';
import type { LoggedExercise } from '../../types';
import { exerciseById, exerciseIn } from '../../data/program';
import { exerciseHistory } from '../workouts';
import { roundDownToStep, suggestNext, suggestionLabel, type ProgressionSpec, type Session } from '../progression';
import { le, wk } from './helpers';

function specOf(id: string): ProgressionSpec {
  const e = exerciseById(id)!;
  return { step: e.step, repRangeMin: e.repRangeMin, repRangeMax: e.repRangeMax, isTimed: e.isTimed, bodyweightOnly: e.bodyweightOnly };
}

const session = (d: string, ex: LoggedExercise): Session => ({ d, ex });

describe('1. המקרים האמיתיים מהיומן', () => {
  it('db-bench-press 15×12,12,12 → 17.5 (R1)', () => {
    const s = suggestNext([session('2026-09-24', { ...le('db-bench-press', 15, [12, 12, 12]), rir: 2 })], specOf('db-bench-press'));
    expect(s).toMatchObject({ action: 'up', weight: 17.5, repTarget: 8, rule: 'R1', rirUnknown: false });
    expect(suggestionLabel(s!, { isTimed: false })).toEqual({ weight: '17.5 ק״ג', reps: '8 חזרות' });
  });

  it('db-rdl 25×10,10,10 → 27.5 (R1)', () => {
    const s = suggestNext([session('2026-09-22', { ...le('db-rdl', 25, [10, 10, 10]), rir: 3 })], specOf('db-rdl'));
    expect(s).toMatchObject({ action: 'up', weight: 27.5, repTarget: 8, rule: 'R1' });
  });

  it('db-supinated-curl 12.5×(8,3) ב-14/9 וגם ב-24/9 → 10 (R3)', () => {
    const s = suggestNext(
      [session('2026-09-14', le('db-supinated-curl', 12.5, [8, 3])), session('2026-09-24', le('db-supinated-curl', 12.5, [8, 3]))],
      specOf('db-supinated-curl'),
    );
    expect(s).toMatchObject({ action: 'down', weight: 10, repTarget: 10, rule: 'R3' });
    expect(s?.reason).toContain('שני אימונים רצופים');
  });

  it('db-lateral-raise-standing 7.5×15,15,15 → נשאר 7.5, יעד 17 (R4)', () => {
    const s = suggestNext([session('2026-09-25', { ...le('db-lateral-raise-standing', 7.5, [15, 15, 15]), rir: 3 })], specOf('db-lateral-raise-standing'));
    expect(s).toMatchObject({ action: 'same', weight: 7.5, repTarget: 17, rule: 'R4' });
    expect(suggestionLabel(s!, { isTimed: false })).toEqual({ weight: '7.5 ק״ג', reps: '17 חזרות' });
    // אחרי 17 בכל הסטים — קופצים
    const s2 = suggestNext([session('2026-10-02', { ...le('db-lateral-raise-standing', 7.5, [17, 17, 17]), rir: 2 })], specOf('db-lateral-raise-standing'));
    expect(s2).toMatchObject({ action: 'up', weight: 10, rule: 'R1' });
  });

  it('db-incline-bench-press 15×12,12,9 → נשאר 15 (R6), יעד 10', () => {
    const s = suggestNext([session('2026-09-25', le('db-incline-bench-press', 15, [12, 12, 9]))], specOf('db-incline-bench-press'));
    expect(s).toMatchObject({ action: 'same', weight: 15, repTarget: 10, rule: 'R6' });
  });

  it('leg-press משותף ל-A ול-C — היסטוריה לפי מזהה משני האימונים', () => {
    const workouts = [
      wk('a1', '2026-09-20', 'A', [le('leg-press', 60, [12, 12, 10])]),
      wk('c1', '2026-09-24', 'C', [le('leg-press', 60, [12, 12, 12])]),
      wk('b1', '2026-09-22', 'B', [le('db-rdl', 25, [10, 10, 10])]),
    ];
    const history = exerciseHistory(workouts, 'leg-press');
    expect(history.map((h) => h.workoutId)).toEqual(['a1', 'c1']);
    const spec = exerciseIn('C', 'leg-press')!;
    const s = suggestNext(history, { step: spec.step, repRangeMin: spec.repRangeMin, repRangeMax: spec.repRangeMax, isTimed: false, bodyweightOnly: false });
    expect(s).toMatchObject({ action: 'up', weight: 65, rule: 'R1', rirUnknown: true, lastDate: '2026-09-24' });
  });
});

describe('2. כללים ומקרי קצה', () => {
  const bench = specOf('db-bench-press'); // 8–12, step 2.5

  it('R5: בשיא עם RIR 1 → נשארים; RIR 0 גם', () => {
    for (const rir of [0, 1] as const) {
      const s = suggestNext([session('2026-09-24', { ...le('db-bench-press', 15, [12, 12, 12]), rir })], bench);
      expect(s).toMatchObject({ action: 'same', weight: 15, repTarget: 12, rule: 'R5' });
    }
  });

  it('R1 בלי RIR → מוצע, מסומן rirUnknown', () => {
    const s = suggestNext([session('2026-09-24', le('db-bench-press', 15, [12, 12, 12]))], bench);
    expect(s).toMatchObject({ action: 'up', weight: 17.5, rule: 'R1', rirUnknown: true });
  });

  it('R3 דורש שני אימונים רצופים: אימון גרוע אחד → R6, לא ירידה; משקל שונה קודם → לא R3', () => {
    const one = suggestNext([session('2026-09-24', le('db-supinated-curl', 12.5, [8, 3]))], specOf('db-supinated-curl'));
    expect(one).toMatchObject({ action: 'same', weight: 12.5, repTarget: 4, rule: 'R6' });
    const otherWeight = suggestNext(
      [session('2026-09-14', le('db-supinated-curl', 10, [8, 3])), session('2026-09-24', le('db-supinated-curl', 12.5, [8, 3]))],
      specOf('db-supinated-curl'),
    );
    expect(otherWeight?.rule).toBe('R6');
    // הקודם-קודם היה גרוע אבל הקודם טוב → לא רצופים
    const gap = suggestNext(
      [
        session('2026-09-04', le('db-supinated-curl', 12.5, [8, 3])),
        session('2026-09-14', le('db-supinated-curl', 12.5, [10, 10])),
        session('2026-09-24', le('db-supinated-curl', 12.5, [8, 3])),
      ],
      specOf('db-supinated-curl'),
    );
    expect(gap?.rule).toBe('R6');
  });

  it('step null → "דרגה אחת למעלה/למטה", R4 לא חל', () => {
    const pec = specOf('pec-deck'); // 10–12, step null
    const up = suggestNext([session('2026-09-24', { ...le('pec-deck', 30, [12, 12, 12]), rir: 2 })], pec);
    expect(up).toMatchObject({ action: 'up', weight: null, rule: 'R1' });
    expect(suggestionLabel(up!, { isTimed: false }).weight).toBe('דרגה אחת למעלה');
    const down = suggestNext(
      [session('2026-09-14', le('pec-deck', 30, [9, 9, 9])), session('2026-09-24', le('pec-deck', 30, [9, 8, 8]))],
      pec,
    );
    expect(down).toMatchObject({ action: 'down', weight: null, rule: 'R3' });
    expect(suggestionLabel(down!, { isTimed: false }).weight).toBe('דרגה אחת למטה');
    // משקל קטן ביחס לצעד, אבל step null → אין R4
    const small = suggestNext([session('2026-09-24', { ...le('pec-deck', 5, [12, 12, 12]), rir: 3 })], pec);
    expect(small?.rule).toBe('R1');
  });

  it('משקלים שונים בין סטים: הבסיס הוא המשקל הנפוץ, והסיבה מציינת זאת', () => {
    const ex: LoggedExercise = {
      ...le('db-bench-press', 15, [12, 12, 12]),
      sets: [
        { weight: 15, reps: 12, seconds: null },
        { weight: 15, reps: 12, seconds: null },
        { weight: 12.5, reps: 12, seconds: null },
      ],
      rir: 2,
    };
    const s = suggestNext([session('2026-09-24', ex)], bench);
    expect(s).toMatchObject({ action: 'up', weight: 17.5, basisWeight: 15, mixedWeights: true, rule: 'R1' });
    expect(s?.reason).toContain('משקלים שונים בין סטים');
    // שוויון בספירה → המשקל של הסט המאוחר
    const tie: LoggedExercise = { ...ex, sets: [{ weight: 15, reps: 10, seconds: null }, { weight: 17.5, reps: 8, seconds: null }] };
    expect(suggestNext([session('2026-09-24', tie)], bench)?.basisWeight).toBe(17.5);
  });

  it('אין היסטוריה → null; סטים ריקים בלבד → null', () => {
    expect(suggestNext([], bench)).toBeNull();
    expect(suggestNext([session('2026-09-24', le('db-bench-press', 15, [null, null, null]))], bench)).toBeNull();
  });

  it('פלאנק: שניות הן "החזרות"; 45×3 עם משקל גוף → R1 מציע את הפלטה הראשונה', () => {
    const plank = specOf('plank'); // 30–45, step 2.5, timed
    const s = suggestNext([session('2026-09-24', { ...le('plank', null, [45, 45, 45]), rir: 2 })], plank);
    expect(s).toMatchObject({ action: 'up', weight: 2.5, repTarget: 30, rule: 'R1' });
    expect(suggestionLabel(s!, { isTimed: true })).toEqual({ weight: '2.5 ק״ג', reps: '30 שנ׳' });
    const mid = suggestNext([session('2026-09-24', le('plank', null, [45, 40, 35]))], plank);
    expect(mid).toMatchObject({ action: 'same', weight: null, repTarget: 36, rule: 'R6' });
    expect(suggestionLabel(mid!, { isTimed: true }).weight).toBe('משקל גוף');
  });

  it('עיגול למטה ל-step', () => {
    expect(roundDownToStep(12.5 * 0.9, 2.5)).toBe(10);
    expect(roundDownToStep(60 * 0.9, 5)).toBe(50);
    expect(roundDownToStep(27.5 * 0.9, 2.5)).toBe(22.5);
    expect(roundDownToStep(10 * 0.9, 2.5)).toBe(7.5);
  });
});
