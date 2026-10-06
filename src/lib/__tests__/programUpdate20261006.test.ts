/**
 * עדכון תוכנית 6/10/2026: A6 "פשיטת ירך בספסל רומי" (`back-extension` — המזהה
 * הקיים מהמאגר, מתחיל במשקל גוף) ו-B8 "בטן- הרמת רגליים על הרצפה"
 * (`floor-leg-raise` — מזהה חדש, חזרות בלבד). שאר התרגילים, R1–R6 שלהם
 * ו-M של הפלאנק — ללא שינוי (snapshot ההצעות).
 */
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { emptyDb, type Rir } from '../../types';
import { ALTERNATES, PROGRAM, RETIRED, WORKOUT_TYPES, alternatesFor, exerciseById, exerciseIn, resolveExerciseId, type Exercise } from '../../data/program';
import {
  BELOW_FLOOR_REVIEW_LABEL,
  CEILING_STAY_LABEL,
  suggestNext,
  suggestionLabel,
  suggestionText,
  type ProgressionSpec,
  type Session,
  type Suggestion,
} from '../progression';
import { FINISHER_ID, WARMUP_ID, blankLoggedExercise, exercisesFor, moveToEnd, prefilledExercises, skippedExercises, swapExercise } from '../workouts';
import { parseWorkouts } from '../schema';
import { buildWeeklySummary } from '../weeklySummary';
import { buildChatReport } from '../exportText';
import { STORAGE_KEYS } from '../store';
import ExerciseFocus, { type AlternateOption } from '../../components/ExerciseFocus';
import { le, wk } from './helpers';

const A6 = 'back-extension';
const B8 = 'floor-leg-raise';
const A6_VIDEO = 'https://drive.google.com/file/d/1LoUzkugv1n9aDjn2MFEOQbhRfj3edzzH/view?usp=share_link';
const B8_VIDEO = 'https://drive.google.com/file/d/1jxSd3J2FcTLraQrUwZcWNwHm1BoefQ0o/view?usp=sharing';
const DRIVE = /^https:\/\/drive\.google\.com\/file\/d\/[A-Za-z0-9_-]+\/view/;

/** `Exercise` מתאים ל-`ProgressionSpec` כמו שהוא — כמו במסך ובסיכום השבועי. */
const specOf = (id: string): ProgressionSpec => exerciseById(id)!;
const sess = (id: string, d: string, weight: number | null, values: number[], rir?: Rir): Session => ({
  d,
  ex: rir === undefined ? le(id, weight, values) : { ...le(id, weight, values), rir },
});
const ids = (list: { exerciseId: string }[]) => list.map((e) => e.exerciseId);

/** אין NaN, Infinity או "null"/"undefined" בשום שדה של ההצעה. */
function expectFinite(s: Suggestion | null): void {
  if (s === null) return;
  for (const v of [s.weight, s.repTarget, s.basisWeight]) {
    if (typeof v === 'number') expect(Number.isFinite(v), s.reason).toBe(true);
  }
  expect(s.reason).not.toMatch(/NaN|Infinity|null|undefined/);
}

const WEIGHTS = [null, 0, 2.5, 5, 7.5, 10, 12.5, 20] as const;
const VALUES = [[15, 15, 15], [17, 17, 17], [17, 17, 16], [12, 12, 12], [11, 11, 10], [13, 13, 12], [9, 9, 9], [15, 15, 14]];
const RIRS = [undefined, 0, 1, 2, 3] as const;

describe('A6 — פשיטת ירך בספסל רומי (back-extension, 6/10/2026)', () => {
  it('המפרט: שישי ב-A, 3×12–15, RIR 2, step 2.5, מתחיל במשקל גוף, הערה וסרטון, בלי חלופות; A עם 8; C לא השתנה', () => {
    const a6 = PROGRAM.A[5]!;
    expect(a6).toMatchObject({
      id: A6,
      name: 'פשיטת ירך בספסל רומי',
      short: 'ספסל רומי',
      machine: 'Roman Chair',
      muscle: 'legs',
      type: 'compound',
      sets: 3,
      repRangeMin: 12,
      repRangeMax: 15,
      effort: 'RIR 2',
      step: 2.5,
      bodyweightStart: true,
      bodyweightOnly: false,
      isTimed: false,
      unilateral: false,
      mode: 'progress',
      note: 'הכרית מתחת לעצמות האגן, התנועה מהירך. עולים עד קו ישר עם הגוף, לא מעבר — לא מקשתים את הגב.',
      videoUrl: A6_VIDEO,
      alternates: [],
    });
    expect(a6.reps).toBe('12-15');
    expect(exerciseIn('A', A6)).toBe(a6);
    expect(PROGRAM.A.map((e) => e.id)).toEqual(['leg-press', 'smith-bench-press', 'lat-pulldown', 'leg-extension', 'leg-curl', A6, 'db-lateral-raise-seated', 'plank']);
    // הרחקת הכתפיים והפלאנק זזו מקום אחד בלי שום שינוי אחר
    expect(PROGRAM.A[6]).toMatchObject({ id: 'db-lateral-raise-seated', sets: 3, repRangeMin: 12, repRangeMax: 15, step: 2.5 });
    expect(PROGRAM.A[7]).toMatchObject({ id: 'plank', mode: 'maintain', sets: 3, repRangeMin: 60, repRangeMax: 60 });
    expect(PROGRAM.C.map((e) => e.id)).toEqual(['machine-hip-abduction', 'machine-row', 'db-incline-bench-press', 'leg-press', 'db-lateral-raise-standing', 'triceps-pushdown', 'cable-rope-curl', 'cable-torso-rotation']);
  });

  it('המזהה הקיים: עבר מהמאגר לתוכנית (לא במאגר ולא בפרושים), הוסר מחלופות B1 (שאר החלופות כמו שהיו), ונפתר לפי שם', () => {
    expect(ALTERNATES.some((a) => a.id === A6)).toBe(false);
    expect(RETIRED.some((r) => r.id === A6)).toBe(false);
    expect(resolveExerciseId('פשיטת ירך בספסל רומי')).toBe(A6);
    expect(alternatesFor(A6)).toEqual([]);
    // B1: אותו מפרט; הספסל הרומי הוסר מהחלופות (אותו מזהה בשני תאים עם טווח שונה מערבב היסטוריה), השתיים האחרות בסדרן
    expect(exerciseIn('B', 'db-rdl')).toMatchObject({ sets: 3, repRangeMin: 8, repRangeMax: 10, step: 2.5, effort: 'RIR 3', alternates: ['smith-hip-hinge', 'barbell-rdl'] });
    expect(alternatesFor('db-rdl').map((a) => a.id)).toEqual(['smith-hip-hinge', 'barbell-rdl']);
    expect(alternatesFor('db-rdl').map((a) => a.name)).toEqual(["היפ הינג'- סמית משין", 'דד-ליפט רומניין']);
    // A6 אינו חלופה של אף תא
    for (const t of WORKOUT_TYPES) {
      for (const e of PROGRAM[t]) expect(e.alternates, e.id).not.toContain(A6);
    }
  });

  it('רשומה ישנה של "החלף" ב-B1 לספסל הרומי (משקל גוף) נטענת כמו שהיא ומזינה את A6 — אותו מזהה, ההיסטוריה ממשיכה', () => {
    const old = { ...le(A6, null, [10, 10, 9]), swappedFrom: 'db-rdl' };
    const r = parseWorkouts([wk('b0', '2026-09-28', 'B', [old])]);
    expect(r.rejected).toEqual([]);
    expect(r.ok[0]?.ex[0]).toMatchObject({ exerciseId: A6, swappedFrom: 'db-rdl' });
    expect(r.ok[0]?.ex[0]?.sets.every((s) => s.weight === null)).toBe(true);
    const s = suggestNext([{ d: '2026-09-28', ex: r.ok[0]!.ex[0]! }], specOf(A6));
    expect(s).toMatchObject({ rule: 'R6', action: 'same', weight: null, repTarget: 10 });
    expect(suggestionLabel(s!, { isTimed: false }).weight).toBe('משקל גוף');
  });

  it('a. במשקל גוף, 3×15 עם RIR 2 → נשארים במשקל גוף, יעד 17 (R4) — שדה ריק ו-0 זהים', () => {
    for (const w of [null, 0]) {
      const s = suggestNext([sess(A6, '2026-10-06', w, [15, 15, 15], 2)], specOf(A6));
      expect(s, `weight ${w}`).toMatchObject({ rule: 'R4', action: 'same', weight: null, repTarget: 17, basisWeight: null, rirUnknown: false });
      expect(suggestionLabel(s!, { isTimed: false })).toEqual({ weight: 'משקל גוף', reps: '17 חזרות' });
      expect(suggestionText(s!, { isTimed: false })).toBe('משקל גוף · 17 חזרות');
      expect(s!.reason).toContain('משקל גוף');
      expectFinite(s);
    }
    // R4 קודם ל-RIR (כמו בכל תרגיל): גם בלי RIR וגם עם RIR 1 — קודם 17
    expect(suggestNext([sess(A6, '2026-10-06', null, [15, 15, 15])], specOf(A6))).toMatchObject({ rule: 'R4', repTarget: 17 });
    expect(suggestNext([sess(A6, '2026-10-06', null, [15, 15, 15], 1)], specOf(A6))).toMatchObject({ rule: 'R4', repTarget: 17 });
    // 17,17,16 — עוד לא כל הסטים ב-17
    expect(suggestNext([sess(A6, '2026-10-06', null, [17, 17, 16], 2)], specOf(A6))).toMatchObject({ rule: 'R4', weight: null, repTarget: 17 });
  });

  it('b. במשקל גוף, 3×17 עם RIR 2 → 2.5 ק״ג, היעד חוזר ל-12 (R1)', () => {
    for (const w of [null, 0]) {
      const s = suggestNext([sess(A6, '2026-10-06', w, [17, 17, 17], 2)], specOf(A6));
      expect(s, `weight ${w}`).toMatchObject({ rule: 'R1', action: 'up', weight: 2.5, repTarget: 12, rirUnknown: false });
      expect(suggestionLabel(s!, { isTimed: false })).toEqual({ weight: '2.5 ק״ג', reps: '12 חזרות' });
      expectFinite(s);
    }
    // RIR 0–1 ב-17 → נשארים (R5); בלי RIR → R1 עם "אשר בעצמך"
    expect(suggestNext([sess(A6, '2026-10-06', null, [17, 17, 17], 1)], specOf(A6))).toMatchObject({ rule: 'R5', action: 'same', weight: null, repTarget: 15 });
    expect(suggestNext([sess(A6, '2026-10-06', null, [17, 17, 17])], specOf(A6))).toMatchObject({ rule: 'R1', weight: 2.5, repTarget: 12, rirUnknown: true });
  });

  it('c. 2.5 ק״ג, 3×15 עם RIR 2 → קפיצה גדולה (2.5→5 = 100%): נשארים ב-2.5, יעד 17 (R4); 3×17 → 5; מעל 0 — R1–R6 כרגיל', () => {
    const s = suggestNext([sess(A6, '2026-10-06', 2.5, [15, 15, 15], 2)], specOf(A6));
    expect(s).toMatchObject({ rule: 'R4', action: 'same', weight: 2.5, repTarget: 17 });
    expect(s!.reason).toContain('קפיצה גדולה (2.5 מתוך 2.5 ק״ג)');
    expect(suggestionLabel(s!, { isTimed: false })).toEqual({ weight: '2.5 ק״ג', reps: '17 חזרות' });
    expect(suggestNext([sess(A6, '2026-10-06', 2.5, [17, 17, 17], 2)], specOf(A6))).toMatchObject({ rule: 'R1', action: 'up', weight: 5, repTarget: 12 });
    // 10 ק״ג: 25% → R4; 12.5 ק״ג: 20% בדיוק — לא "יותר מ-20%" → R1
    expect(suggestNext([sess(A6, '2026-10-06', 10, [15, 15, 15], 2)], specOf(A6))).toMatchObject({ rule: 'R4', weight: 10, repTarget: 17 });
    expect(suggestNext([sess(A6, '2026-10-06', 12.5, [15, 15, 15], 2)], specOf(A6))).toMatchObject({ rule: 'R1', weight: 15, repTarget: 12 });
    // R6 ו-R3 עם משקל — כמו בכל תרגיל משקולות יד
    expect(suggestNext([sess(A6, '2026-10-06', 5, [13, 13, 12], 2)], specOf(A6))).toMatchObject({ rule: 'R6', action: 'same', weight: 5, repTarget: 13 });
    expect(suggestNext([sess(A6, '2026-09-29', 5, [11, 11, 10]), sess(A6, '2026-10-06', 5, [11, 10, 10])], specOf(A6))).toMatchObject({ rule: 'R3', action: 'down', weight: 2.5, repTarget: 12 });
  });

  it('R3 במשקל גוף: שני אימונים מתחת ל-12 → אין לאן לרדת, נשארים במשקל גוף (לא "דרגה אחת למטה" ולא 0 ק״ג); אימון אחד גרוע → R6', () => {
    for (const [p, l] of [[null, null], [0, 0], [0, null], [null, 0]] as const) {
      const s = suggestNext([sess(A6, '2026-09-29', p, [11, 11, 10]), sess(A6, '2026-10-06', l, [11, 10, 10])], specOf(A6));
      expect(s, `${p} → ${l}`).toMatchObject({ rule: 'R3', action: 'same', weight: null, repTarget: 12 });
      expect(s!.reason).toContain('אין לאן לרדת');
      expect(suggestionLabel(s!, { isTimed: false }).weight).toBe('משקל גוף');
      expectFinite(s);
    }
    expect(suggestNext([sess(A6, '2026-10-06', null, [11, 10, 10])], specOf(A6))).toMatchObject({ rule: 'R6', action: 'same', weight: null, repTarget: 11 });
  });

  it('הסייג חל רק עם bodyweightStart: אותו מפרט בלי הדגל מתנהג כמו קודם (R1 מריק/0 → 2.5) — שום תרגיל אחר לא נוגע בו', () => {
    const { bodyweightStart: _b, ...plain } = specOf(A6);
    expect('bodyweightStart' in plain).toBe(false);
    expect(suggestNext([sess(A6, '2026-10-06', null, [15, 15, 15], 2)], plain)).toMatchObject({ rule: 'R1', action: 'up', weight: 2.5, repTarget: 12 });
    expect(suggestNext([sess(A6, '2026-10-06', 0, [15, 15, 15], 2)], plain)).toMatchObject({ rule: 'R1', action: 'up', weight: 2.5, repTarget: 12 });
    for (const t of WORKOUT_TYPES) {
      for (const e of PROGRAM[t]) expect(e.bodyweightStart, e.id).toBe(e.id === A6);
    }
    for (const e of [...ALTERNATES, ...RETIRED]) expect(e.bodyweightStart, e.id).toBe(false);
  });

  it('אין NaN, Infinity או חלוקה באפס בשום תרחיש — משקלים ריק/0/2.5…20, כל ערכי הסטים, כל RIR, אימון אחד ושניים', () => {
    let n = 0;
    for (const w of WEIGHTS) {
      for (const values of VALUES) {
        for (const rir of RIRS) {
          const last = sess(A6, '2026-10-06', w, values, rir);
          expectFinite(suggestNext([last], specOf(A6)));
          n++;
          for (const pw of WEIGHTS) {
            for (const pv of VALUES) {
              expectFinite(suggestNext([sess(A6, '2026-09-29', pw, pv, 2), last], specOf(A6)));
              n++;
            }
          }
        }
      }
    }
    expect(n).toBeGreaterThan(1000);
  });

  it('הסיכום השבועי: במשקל גוף בלי "—×", וההצעה "משקל גוף · 17 חזרות (R4)"', () => {
    const db = { ...emptyDb(), workouts: [wk('a1', '2026-10-06', 'A', [{ ...le(A6, null, [15, 15, 15]), rir: 2 }])] };
    const text = buildWeeklySummary(db, '2026-10-06');
    expect(text).toContain('ספסל רומי 15,15,15 · RIR 2 · הבא: משקל גוף · 17 חזרות (R4)');
    expect(text).not.toContain('—×');
    const weighted = { ...emptyDb(), workouts: [wk('a2', '2026-10-06', 'A', [{ ...le(A6, 2.5, [12, 12, 12]), rir: 2 }])] };
    expect(buildWeeklySummary(weighted, '2026-10-06')).toContain('ספסל רומי 2.5×12,12,12 · RIR 2 · הבא: 2.5 ק״ג · 13 חזרות (R6)');
  });
});

describe('B8 — בטן- הרמת רגליים על הרצפה (floor-leg-raise, 6/10/2026)', () => {
  it('המפרט: שמיני ב-B אחרי פשיטת המרפקים, 3×10–15, RIR 1, משקל גוף בלבד, בלי step, חזרות בלבד, הערה וסרטון, בלי חלופות; מזהה חדש', () => {
    const b8 = PROGRAM.B[7]!;
    expect(b8).toMatchObject({
      id: B8,
      name: 'בטן- הרמת רגליים על הרצפה',
      short: 'הרמת רגליים',
      machine: null,
      muscle: 'core',
      type: 'core',
      sets: 3,
      repRangeMin: 10,
      repRangeMax: 15,
      effort: 'RIR 1',
      step: null,
      bodyweightOnly: true,
      bodyweightStart: false,
      isTimed: false,
      mode: 'reps',
      note: 'הגב התחתון צמוד לרצפה לאורך כל התנועה.',
      videoUrl: B8_VIDEO,
      alternates: [],
    });
    expect(b8.reps).toBe('10-15');
    expect(exerciseIn('B', B8)).toBe(b8);
    expect(PROGRAM.B.map((e) => e.id)).toEqual(['db-rdl', 'seated-cable-row', 'pec-deck', 'leg-curl', 'face-pull', 'db-supinated-curl', 'triceps-pushdown', B8]);
    expect(PROGRAM.B[6]).toMatchObject({ id: 'triceps-pushdown', sets: 2, repRangeMin: 12, repRangeMax: 15, step: 5 });
    expect(ALTERNATES.some((a) => a.id === B8)).toBe(false);
    expect(RETIRED.some((r) => r.id === B8)).toBe(false);
    expect(alternatesFor(B8)).toEqual([]);
    expect(resolveExerciseId('בטן- הרמת רגליים על הרצפה')).toBe(B8);
    // משקל גוף בלבד: אין שדה משקל — משקל פותח מתעלם
    expect(blankLoggedExercise(b8, 20).sets).toEqual([
      { weight: null, reps: null, seconds: null },
      { weight: null, reps: null, seconds: null },
      { weight: null, reps: null, seconds: null },
    ]);
    // חזרות בלבד הוא היחיד; שימור נשאר של הפלאנק בלבד
    for (const t of WORKOUT_TYPES) {
      for (const e of PROGRAM[t]) expect(e.mode, e.id).toBe(e.id === B8 ? 'reps' : e.id === 'plank' ? 'maintain' : 'progress');
    }
  });

  it('d. 3×15 עם RIR 2 → "תקרה — נשארים", בלי הצעת משקל (R1 בלי קפיצה)', () => {
    const s = suggestNext([sess(B8, '2026-10-06', null, [15, 15, 15], 2)], specOf(B8));
    expect(s).toMatchObject({ rule: 'R1', action: 'same', weight: null, repTarget: 15, basisWeight: null, rirUnknown: false });
    expect(suggestionLabel(s!, { isTimed: false })).toEqual({ weight: CEILING_STAY_LABEL, reps: '15 חזרות' });
    expect(suggestionText(s!, { isTimed: false })).toBe('תקרה — נשארים · 15 חזרות');
    expect(s!.reason).toContain(CEILING_STAY_LABEL);
    expect(s!.reason).not.toContain('ק״ג');
    expectFinite(s);
    // בלי RIR — אותו דבר, ובלי "אשר בעצמך" (אין קפיצה לאשר); RIR 3 ומעל התקרה — אותו דבר
    expect(suggestNext([sess(B8, '2026-10-06', null, [15, 15, 15])], specOf(B8))).toMatchObject({ rule: 'R1', action: 'same', weight: null, repTarget: 15, rirUnknown: false });
    expect(suggestNext([sess(B8, '2026-10-06', null, [16, 17, 15], 3)], specOf(B8))).toMatchObject({ rule: 'R1', action: 'same', weight: null, repTarget: 15 });
    // תקרה עם RIR 0–1 — נשארים (R5), בלי משקל
    expect(suggestNext([sess(B8, '2026-10-06', null, [15, 15, 15], 1)], specOf(B8))).toMatchObject({ rule: 'R5', action: 'same', weight: null, repTarget: 15 });
  });

  it('e. 12/12/11 → R6, +1 בסט השלישי (יעד 12), משקל גוף', () => {
    const s = suggestNext([sess(B8, '2026-10-06', null, [12, 12, 11], 1)], specOf(B8));
    expect(s).toMatchObject({ rule: 'R6', action: 'same', weight: null, repTarget: 12 });
    expect(suggestionLabel(s!, { isTimed: false })).toEqual({ weight: 'משקל גוף', reps: '12 חזרות' });
    expect(s!.reason).toContain('(11 → 12)');
    expect(suggestNext([sess(B8, '2026-10-06', null, [15, 15, 14], 1)], specOf(B8))).toMatchObject({ rule: 'R6', repTarget: 15 });
  });

  it('f. שני אימונים רצופים מתחת לרצפה → בלי −10%: אותן חזרות (הרצפה) עם סימון "לבדוק" (R3); אימון אחד גרוע → R6', () => {
    const s = suggestNext([sess(B8, '2026-09-29', null, [9, 9, 8], 1), sess(B8, '2026-10-06', null, [9, 9, 9], 1)], specOf(B8));
    expect(s).toMatchObject({ rule: 'R3', action: 'same', weight: null, repTarget: 10 });
    expect(s!.action).not.toBe('down');
    expect(s!.reason).toContain(BELOW_FLOOR_REVIEW_LABEL);
    expect(s!.reason).not.toMatch(/10%|דרגה אחת/);
    expect(suggestionLabel(s!, { isTimed: false })).toEqual({ weight: 'משקל גוף', reps: '10 חזרות' });
    expectFinite(s);
    expect(suggestNext([sess(B8, '2026-10-06', null, [9, 9, 8], 1)], specOf(B8))).toMatchObject({ rule: 'R6', action: 'same', weight: null, repTarget: 9 });
  });

  it('R4 ו-M לא חלים; לעולם לא "למעלה"/"למטה" ולא משקל; בלי היסטוריה → null', () => {
    expect(suggestNext([], specOf(B8))).toBeNull();
    expect(suggestNext([sess(B8, '2026-10-06', null, [])], specOf(B8))).toBeNull();
    for (const values of VALUES) {
      for (const rir of RIRS) {
        for (const prev of [null, ...VALUES]) {
          const history = prev === null ? [sess(B8, '2026-10-06', null, values, rir)] : [sess(B8, '2026-09-29', null, prev, 1), sess(B8, '2026-10-06', null, values, rir)];
          const s = suggestNext(history, specOf(B8))!;
          expect(s.rule).not.toBe('R4');
          expect(s.rule).not.toBe('M');
          expect(s.action).toBe('same');
          expect(s.weight).toBeNull();
          expectFinite(s);
        }
      }
    }
  });

  it('הסיכום השבועי: "הבא: תקרה — נשארים · 15 חזרות (R1)", ושני אימונים מתחת לרצפה מסומנים כירידה בביצועים (R3)', () => {
    const top = { ...emptyDb(), workouts: [wk('b1', '2026-10-06', 'B', [{ ...le(B8, null, [15, 15, 15]), rir: 2 }])] };
    expect(buildWeeklySummary(top, '2026-10-06')).toContain('הרמת רגליים 15,15,15 · RIR 2 · הבא: תקרה — נשארים · 15 חזרות (R1)');
    const below = {
      ...emptyDb(),
      workouts: [wk('b0', '2026-09-29', 'B', [{ ...le(B8, null, [9, 9, 8]), rir: 1 }]), wk('b1', '2026-10-06', 'B', [{ ...le(B8, null, [9, 9, 9]), rir: 1 }])],
    };
    const text = buildWeeklySummary(below, '2026-10-06');
    expect(text).toContain('הבא: משקל גוף · 10 חזרות (R3)');
    expect(text).toContain('ירידה בביצועים (R3): הרמת רגליים');
  });
});

describe('מסך התרגיל — "החלף" בלי חלופות, "דלג ואחזור", הסרטון', () => {
  /** רינדור סטטי של המוקד (בלי DOM): מה שמרונדר ומה שלא. */
  function html(spec: Exercise, alternates: readonly AlternateOption[]): string {
    return renderToStaticMarkup(
      createElement(ExerciseFocus, {
        spec,
        log: blankLoggedExercise(spec),
        onChange: () => {},
        history: [],
        fullHistory: [],
        onSetLogged: () => {},
        historyOpen: false,
        onToggleHistory: () => {},
        suggestion: null,
        onSkip: () => {},
        alternates,
        onSwap: () => {},
        onUnswap: () => {},
      }),
    );
  }
  const options = (id: string): AlternateOption[] => alternatesFor(id).map((spec) => ({ spec, last: null }));

  it('g. A6 ו-B8: אין חלופות → אין כפתור "החלף" (ולא קריסה); "דלג ואחזור" מוצג. לג-פרס לשם השוואה מציג "החלף"', () => {
    for (const id of [A6, B8]) {
      expect(options(id)).toEqual([]);
      const out = html(exerciseById(id)!, options(id));
      expect(out, id).not.toContain('>החלף<');
      expect(out, id).toContain('>דלג ואחזור<');
      expect(out, id).not.toContain('בטל החלפה');
    }
    const legPress = html(exerciseById('leg-press')!, options('leg-press'));
    expect(options('leg-press')).toHaveLength(3);
    expect(legPress).toContain('>החלף<');
    expect(legPress).toContain('>דלג ואחזור<');
  });

  it('h. הסרטון של A6 ושל B8 — קישור ▶ ליד השם, לטאב חדש, לכתובת ה-Drive המלאה', () => {
    for (const [id, url] of [[A6, A6_VIDEO], [B8, B8_VIDEO]] as const) {
      expect(exerciseById(id)?.videoUrl).toBe(url);
      expect(url).toMatch(DRIVE);
      const out = html(exerciseById(id)!, []);
      expect(out, id).toContain(`href="${url}"`);
      expect(out, id).toContain('target="_blank"');
      expect(out, id).toContain('rel="noopener noreferrer"');
      expect(out, id).toContain(`סרטון הדגמה — ${exerciseById(id)!.name}`);
    }
  });

  it('A6: שדה משקל עם "משקל גוף" כברירת מחדל; B8: בלי שדה משקל בכלל', () => {
    const a6 = html(exerciseById(A6)!, []);
    expect(a6).toContain('משקל — פשיטת ירך בספסל רומי');
    expect(a6).toContain('placeholder="משקל גוף"');
    const b8 = html(exerciseById(B8)!, []);
    expect(b8).not.toContain('משקל — בטן- הרמת רגליים על הרצפה');
    expect(b8).toContain('חזרות, סט 3 — בטן- הרמת רגליים על הרצפה');
  });

  it('לכל תרגיל ב-A/B/C יש videoUrl (בדיקה בלבד — תרגיל קיים לא תוקן)', () => {
    for (const t of WORKOUT_TYPES) {
      for (const e of PROGRAM[t]) {
        expect(e.videoUrl, `${t} ${e.id}`).toMatch(DRIVE);
      }
    }
  });
});

describe('אימון חדש, רשומות ישנות, דילוג והחלפה', () => {
  it('אימון A/B חדש: התא החדש במקומו, 3 סטים ריקים, בלי משקל פותח ובלי הצעה (אין היסטוריה)', () => {
    const a = prefilledExercises([], 'A');
    expect(ids(a)).toEqual([WARMUP_ID, 'leg-press', 'smith-bench-press', 'lat-pulldown', 'leg-extension', 'leg-curl', A6, 'db-lateral-raise-seated', 'plank', FINISHER_ID]);
    expect(a[6]).toMatchObject({ exerciseId: A6, n: 'פשיטת ירך בספסל רומי', targetRepMin: 12, targetRepMax: 15, bodyweightOnly: false });
    expect(a[6]!.sets).toHaveLength(3);
    expect(a[6]!.sets.every((s) => s.weight === null && s.reps === null && s.seconds === null)).toBe(true);
    const b = prefilledExercises([], 'B');
    expect(ids(b)).toEqual([WARMUP_ID, 'db-rdl', 'seated-cable-row', 'pec-deck', 'leg-curl', 'face-pull', 'db-supinated-curl', 'triceps-pushdown', B8, FINISHER_ID]);
    expect(b[8]).toMatchObject({ exerciseId: B8, n: 'בטן- הרמת רגליים על הרצפה', targetRepMin: 10, targetRepMax: 15, bodyweightOnly: true });
    expect(b[8]!.sets).toHaveLength(3);
    expect(suggestNext([], specOf(A6))).toBeNull();
    expect(suggestNext([], specOf(B8))).toBeNull();
  });

  it('אימון A ישן (7 תרגילים) ואימון B ישן (7) נטענים כמו שהם; התא החדש מופיע כשורה ריקה אחרי השורות שנשמרו', () => {
    const oldA = wk('a0', '2026-10-01', 'A', [
      le('leg-press', 60, [12, 12, 12]),
      le('smith-bench-press', 40, [12, 12, 10]),
      le('lat-pulldown', 45, [12, 12, 11]),
      le('leg-extension', 30, [15, 15]),
      le('leg-curl', 30, [12, 12]),
      le('db-lateral-raise-seated', 7.5, [15, 15, 15]),
      le('plank', null, [60, 60, 60]),
    ]);
    const rowsA = exercisesFor(oldA, [oldA]);
    expect(ids(rowsA)).toEqual([WARMUP_ID, 'leg-press', 'smith-bench-press', 'lat-pulldown', 'leg-extension', 'leg-curl', 'db-lateral-raise-seated', 'plank', A6, FINISHER_ID]);
    expect(rowsA[8]!.sets.every((s) => s.reps === null && s.weight === null)).toBe(true);
    // הנתונים שנשמרו לא זזו
    expect(rowsA[1]!.sets[0]).toEqual({ weight: 60, reps: 12, seconds: null });
    expect(rowsA[7]!.sets[0]).toEqual({ weight: null, reps: null, seconds: 60 });

    const oldB = wk('b0', '2026-10-03', 'B', [
      le('db-rdl', 25, [10, 10, 10]),
      le('seated-cable-row', 45, [12, 12, 12]),
      le('pec-deck', 30, [12, 12, 12]),
      le('leg-curl', 30, [12, 12, 12]),
      le('face-pull', 20, [20, 20, 20]),
      le('db-supinated-curl', 10, [12, 12]),
      le('triceps-pushdown', 25, [15, 15]),
    ]);
    const rowsB = exercisesFor(oldB, [oldB]);
    expect(ids(rowsB)).toEqual([WARMUP_ID, 'db-rdl', 'seated-cable-row', 'pec-deck', 'leg-curl', 'face-pull', 'db-supinated-curl', 'triceps-pushdown', B8, FINISHER_ID]);
    expect(rowsB[8]).toMatchObject({ exerciseId: B8, bodyweightOnly: true });
    expect(rowsB[8]!.sets.every((s) => s.reps === null)).toBe(true);
  });

  it('"דלג ואחזור" עם 8 תאים: A6 ו-B8 עוברים לסוף סדר הכוח, האירובי נשאר אחרון', () => {
    const a = moveToEnd(prefilledExercises([], 'A'), A6);
    expect(ids(a)).toEqual([WARMUP_ID, 'leg-press', 'smith-bench-press', 'lat-pulldown', 'leg-extension', 'leg-curl', 'db-lateral-raise-seated', 'plank', A6, FINISHER_ID]);
    const b = moveToEnd(prefilledExercises([], 'B'), 'db-rdl');
    expect(ids(b)).toEqual([WARMUP_ID, 'seated-cable-row', 'pec-deck', 'leg-curl', 'face-pull', 'db-supinated-curl', 'triceps-pushdown', B8, 'db-rdl', FINISHER_ID]);
    expect(ids(moveToEnd(b, B8))).toEqual([WARMUP_ID, 'seated-cable-row', 'pec-deck', 'leg-curl', 'face-pull', 'db-supinated-curl', 'triceps-pushdown', 'db-rdl', B8, FINISHER_ID]);
  });

  it('רשומה ישנה שבה B1 הוחלף לספסל הרומי עדיין נטענת ומוצגת בשמו; "החלף" ב-B1 מציע רק את שתי החלופות שנותרו', () => {
    const old = { ...swapExercise({ ...exerciseIn('B', 'db-rdl')!, alternates: [A6] }, exerciseById(A6)!), sets: [{ weight: null, reps: 10, seconds: null }] };
    const r = parseWorkouts([wk('b0', '2026-09-28', 'B', [old])]);
    expect(r.rejected).toEqual([]);
    expect(r.ok[0]?.ex[0]).toMatchObject({ exerciseId: A6, swappedFrom: 'db-rdl', targetRepMin: 8, targetRepMax: 10 });
    expect(exercisesFor(r.ok[0]!, r.ok).map((e) => e.exerciseId)).toContain(A6);
    expect(alternatesFor('db-rdl').map((a) => a.id)).toEqual(['smith-hip-hinge', 'barbell-rdl']);
  });

  it('אימון A/B ישן (7 תרגילים) אינו "לא שלם": נספר כאימון, בלי "דולגו" על התא החדש, ובלי "חסר" — אלא אם הרשומה נערכת ונשמרת מחדש', () => {
    const oldA = wk('a0', '2026-10-05', 'A', [le('leg-press', 60, [12, 12, 12]), le('plank', null, [60, 60, 60])]);
    const oldB = wk('b0', '2026-10-06', 'B', [le('db-rdl', 25, [10, 10, 10]), le('triceps-pushdown', 25, [15, 15])]);
    const db = { ...emptyDb(), workouts: [oldA, oldB] };
    expect(skippedExercises(oldA).map((e) => e.exerciseId)).not.toContain(A6);
    expect(skippedExercises(oldB).map((e) => e.exerciseId)).not.toContain(B8);
    const text = buildWeeklySummary(db, '2026-10-06');
    expect(text).toContain('אימונים 2/3');
    expect(text).not.toContain('ספסל רומי');
    expect(text).not.toContain('הרמת רגליים');
    const report = buildChatReport(db, '2026-10-04', '2026-10-10');
    expect(report).not.toMatch(/דולגו:.*(ספסל רומי|הרמת רגליים)/);
    expect(report).toContain('חסר: אימון שלישי');
    // ההתנהגות הקיימת (מ-C7, 3/10): פתיחת הרשומה לעריכה מוסיפה את התא החדש כשורה ריקה, ושמירה מחדש תרשום אותו כ"דולג"
    const reSaved = { ...oldA, ex: exercisesFor(oldA, [oldA]) };
    expect(skippedExercises(reSaved).map((e) => e.exerciseId)).toContain(A6);
  });
});

describe('אחסון — בלי מפתח חדש ובלי שינוי במפתחות קיימים', () => {
  it('תרגיל חדש = רשומות חדשות בלבד לפי exerciseId; התוכנית לא נשמרת במכשיר', () => {
    expect(Object.keys(STORAGE_KEYS).sort()).toEqual(
      ['checkins', 'creatine', 'customFoods', 'days', 'entries', 'favorites', 'quarantine', 'settings', 'standaloneCardio', 'targets', 'waist', 'weights', 'workouts'].sort(),
    );
    for (const v of Object.values(STORAGE_KEYS)) {
      expect(v).toMatch(/^fatloss:/);
      expect(v).not.toMatch(/program|exercise/);
    }
  });
});
