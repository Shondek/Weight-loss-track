/**
 * ממצא 4 (שלב 7): עריכת אימון ישן — בלי תאים חדשים, בלי שורות כפולות או
 * ריקות לתרגיל שהוחלף. שכבת מסך בלבד; `exercisesFor` ב-lib לא השתנה.
 */
import { describe, expect, it } from 'vitest';
import { WORKOUT_SCHEMA_VERSION, type LoggedExercise, type WorkoutEntry } from '../../types';
import { PROGRAM, exerciseById } from '../../data/program';
import {
  FINISHER_ID,
  WARMUP_ID,
  blankLoggedExercise,
  exercisesFor,
  hasData,
  isCardio,
  prefilledExercises,
  skippedExercises,
  swapExercise,
} from '../../lib/workouts';
import { editorRows, uniqueRows } from '../workoutRows';

const done = (id: string, weight: number | null, reps: number[]): LoggedExercise => {
  const spec = exerciseById(id)!;
  return { ...blankLoggedExercise(spec, weight), sets: reps.map((r) => ({ weight, reps: r, seconds: null })) };
};
const blank = (id: string): LoggedExercise => blankLoggedExercise(exerciseById(id)!);
const workout = (d: string, t: WorkoutEntry['t'], ex: LoggedExercise[]): WorkoutEntry => ({
  schemaVersion: WORKOUT_SCHEMA_VERSION,
  id: `${d}-test-${t}`,
  d,
  t,
  ex,
  knee: null,
  shoulder: null,
});
const ids = (rows: readonly LoggedExercise[]) => rows.map((r) => r.exerciseId);
const strength = (rows: readonly LoggedExercise[]) => rows.filter((r) => !isCardio(r));

/** אימון B כפי שנשמר לפני 4/11/2026: B5 = face-pull, B7 = triceps-pushdown. */
const OLD_B_IDS = ['barbell-rdl', 'seated-cable-row', 'pec-deck', 'leg-curl', 'face-pull', 'db-supinated-curl', 'triceps-pushdown', 'floor-leg-raise'];
const oldB = () => workout('2026-10-20', 'B', OLD_B_IDS.map((id) => (id === 'pec-deck' ? blank(id) : done(id, id === 'floor-leg-raise' ? null : 20, [12, 12]))));

describe('אימון חדש — בלי שינוי', () => {
  it('טיוטה של היום: בדיוק השורות של exercisesFor (כל תאי התוכנית הנוכחית)', () => {
    for (const t of ['A', 'B', 'C', 'D'] as const) {
      const draft = workout('2026-11-11', t, prefilledExercises([], t));
      expect(editorRows(draft, [])).toEqual(exercisesFor(draft, []));
      expect(ids(strength(editorRows(draft, [])))).toEqual(PROGRAM[t].map((s) => s.id));
    }
  });

  it('אימון של היום שכבר נשמר (באמצע סשן): אותן שורות', () => {
    const rows = prefilledExercises([], 'A');
    const saved = workout('2026-11-11', 'A', rows.map((r) => (r.exerciseId === 'leg-press' ? done('leg-press', 120, [10, 10, 10]) : r)));
    expect(editorRows(saved, [saved])).toEqual(exercisesFor(saved, [saved]));
  });

  it('רשומה בלי אף תרגיל כוח (רק חימום): משלימים מהתוכנית, כמו קודם', () => {
    const w = workout('2026-11-11', 'B', []);
    expect(ids(strength(editorRows(w, [w])))).toEqual(PROGRAM.B.map((s) => s.id));
  });
});

describe('תא חדש בתוכנית לא מופיע באימון ישן', () => {
  it('הבסיס: exercisesFor מוסיף לאימון B הישן את התאים החדשים כשורות ריקות', () => {
    const w = oldB();
    const added = ids(strength(exercisesFor(w, [w]))).filter((id) => !OLD_B_IDS.includes(id));
    expect(added).toEqual(['cable-reverse-fly', 'cable-bar-pushdown']);
  });

  it('העורך מציג רק את מה שנשמר ברשומה — בלי התאים החדשים', () => {
    const w = oldB();
    const rows = editorRows(w, [w]);
    expect(ids(rows)).toEqual([WARMUP_ID, ...OLD_B_IDS, FINISHER_ID]);
    // "דולגו" במסך הסיום: רק מה שדולג אז (הפרפר), לא תאים שנוספו אחר כך.
    expect(ids(strength(rows).filter((r) => !hasData(r)))).toEqual(['pec-deck']);
  });

  it('עריכה של אימון ישן לא כותבת את התאים החדשים לרשומה, ו"דולגו" לא משתנה', () => {
    const w = oldB();
    const rows = editorRows(w, [w]);
    // אותו patch של המסך: מחליפים שורה אחת ושומרים את כל השורות המוצגות.
    const edited = done('barbell-rdl', 22.5, [10, 10]);
    const saved: WorkoutEntry = { ...w, ex: rows.map((e) => (e.exerciseId === edited.exerciseId ? edited : e)) };
    expect(ids(skippedExercises(saved))).toEqual(['pec-deck']);
    expect(ids(strength(saved.ex))).toEqual(OLD_B_IDS);
    // לפני התיקון (שורות exercisesFor): התאים החדשים נכנסו לרשומה ול"דולגו".
    const before: WorkoutEntry = { ...w, ex: exercisesFor(w, [w]).map((e) => (e.exerciseId === edited.exerciseId ? edited : e)) };
    expect(ids(skippedExercises(before))).toEqual(['pec-deck', 'cable-reverse-fly', 'cable-bar-pushdown']);
  });
});

describe('תרגיל שהוחלף (swappedFrom) — שורה אחת, לא כפולה ולא ריקה', () => {
  /** B5 הוחלף באותו יום להרחקה בפולי, לפני שהיא נהייתה התא עצמו. */
  const swappedB = () => {
    const swapped: LoggedExercise = {
      ...swapExercise(exerciseById('face-pull')!, exerciseById('cable-reverse-fly')!, 15),
      sets: [15, 15, 15].map((r) => ({ weight: 15, reps: r, seconds: null })),
    };
    return workout('2026-10-22', 'B', OLD_B_IDS.map((id) => (id === 'face-pull' ? swapped : done(id, id === 'floor-leg-raise' ? null : 20, [12, 12]))));
  };

  it('הבסיס: exercisesFor מחזיר את החלופה פעמיים — עם הנתונים, ושורה ריקה באותו מזהה', () => {
    const w = swappedB();
    const twice = exercisesFor(w, [w]).filter((r) => r.exerciseId === 'cable-reverse-fly');
    expect(twice.map(hasData)).toEqual([true, false]);
  });

  it('העורך מציג אותה פעם אחת, עם הנתונים ועם "הוחלף מ-"', () => {
    const w = swappedB();
    const rows = editorRows(w, [w]).filter((r) => r.exerciseId === 'cable-reverse-fly');
    expect(rows).toHaveLength(1);
    expect(hasData(rows[0]!)).toBe(true);
    expect(rows[0]!.swappedFrom).toBe('face-pull');
  });

  it('עריכה לא משכפלת את הנתונים לשורה שנייה', () => {
    const w = swappedB();
    const next: LoggedExercise = { ...editorRows(w, [w]).find((r) => r.exerciseId === 'cable-reverse-fly')!, rir: 2 };
    const saved = editorRows(w, [w]).map((e) => (e.exerciseId === next.exerciseId ? next : e));
    expect(saved.filter((r) => r.exerciseId === 'cable-reverse-fly')).toHaveLength(1);
    // לפני התיקון: שתי השורות קיבלו את אותם נתונים.
    const before = exercisesFor(w, [w]).map((e) => (e.exerciseId === next.exerciseId ? next : e));
    expect(before.filter((r) => r.exerciseId === 'cable-reverse-fly' && hasData(r))).toHaveLength(2);
  });

  it('רשומה שכבר נשמרה עם שורה כפולה: מוצגת פעם אחת — זו שיש בה נתונים', () => {
    const w = swappedB();
    const dupBlank = workout(w.d, 'B', [...w.ex, blank('cable-reverse-fly')]);
    expect(editorRows(dupBlank, [dupBlank]).filter((r) => r.exerciseId === 'cable-reverse-fly').map(hasData)).toEqual([true]);
    const blankFirst = [blank('cable-reverse-fly'), ...w.ex];
    const kept = uniqueRows(blankFirst).filter((r) => r.exerciseId === 'cable-reverse-fly');
    expect(kept).toHaveLength(1);
    expect(hasData(kept[0]!)).toBe(true);
  });
});

describe('uniqueRows', () => {
  it('לא נוגע ברשימה בלי כפילויות, ולא בחימום ובאירובי', () => {
    const rows = prefilledExercises([], 'C');
    expect(uniqueRows(rows)).toEqual(rows);
  });

  it('שתי שורות זהות עם נתונים: נשארת הראשונה, במקומה', () => {
    const a = done('leg-press', 120, [10, 10, 10]);
    const b = done('leg-press', 120, [10, 10, 10]);
    const other = done('leg-curl', 30, [12, 12]);
    const out = uniqueRows([a, other, b]);
    expect(out).toHaveLength(2);
    expect(out[0]).toBe(a);
    expect(out[1]).toBe(other);
  });
});
