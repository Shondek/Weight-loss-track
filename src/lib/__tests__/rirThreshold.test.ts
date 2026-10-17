/**
 * סף RIR לכל תא (17/10/2026): R1 (עלייה) דורש RIR בסט האחרון ≥ סף התא, ו-R5
 * (נשארים) עוצר תקרה עם RIR מתחת לסף. הסף = min(2, הגבול התחתון של יעד ה-RIR
 * של התא, `effort`): יעד 1 או "1-2" → 1, יעד 2 → 2, יעד 3 (B1) → 2, חסר → 2.
 * עד עכשיו הסף היה 2 לכל התרגילים, ולכן תרגיל בידוד שבוצע בדיוק לפי התוכנית
 * (יעד RIR 1) לא קיבל עלייה לעולם — פשיטת ברכיים 60×15,15 ב-RIR 1 → "נשארים".
 *
 * הסף הוא של התא שבו ההצעה מוצגת: כפיפת ברכיים — A5 (יעד 1) מול B4 (יעד 2);
 * שורה שהוחלפה מקבלת את הסף של התא שהוחלף. מצב שימור (A8), חזרות בלבד (B8),
 * משקל גוף כפתיחה (A6), R2/R3/R6 ו"אשר בעצמך" — ללא שינוי.
 */
import { describe, expect, it } from 'vitest';
import type { LoggedExercise, Rir } from '../../types';
import { emptyDb } from '../../types';
import { PROGRAM, WORKOUT_TYPES, exerciseById, exerciseIn } from '../../data/program';
import { exerciseHistory } from '../workouts';
import {
  CEILING_STAY_LABEL,
  DEFAULT_RIR_THRESHOLD,
  MAINTAIN_LABEL,
  rirThreshold,
  suggestNext,
  type ProgressionSpec,
  type Session,
} from '../progression';
import { buildWeeklySummary, buildWeeklySummaryData } from '../weeklySummary';
import { le, wk } from './helpers';

function sess(id: string, d: string, weight: number | null, values: number[], rir?: Rir, over: Partial<LoggedExercise> = {}): Session {
  const ex: LoggedExercise = { ...le(id, weight, values), ...over, ...(rir === undefined ? {} : { rir }) };
  return { d, ex };
}

/** מפרט "ישן" — בלי effort — כפי שבדיקות קודמות בונות אותו: סף 2 (ההתנהגות הקודמת). */
function bare(id: string): ProgressionSpec {
  const e = exerciseById(id)!;
  return { step: e.step, repRangeMin: e.repRangeMin, repRangeMax: e.repRangeMax, isTimed: e.isTimed, bodyweightOnly: e.bodyweightOnly, mode: e.mode, sets: e.sets, bodyweightStart: e.bodyweightStart };
}

describe('rirThreshold — הסף מיעד ה-RIR של התא', () => {
  it('min(2, הגבול התחתון): "RIR 1" → 1, "RIR 1-2" → 1, "RIR 2" → 2, "RIR 3" → 2', () => {
    expect(rirThreshold('RIR 1')).toBe(1);
    expect(rirThreshold('RIR 1-2')).toBe(1);
    expect(rirThreshold('RIR 1–2')).toBe(1);
    expect(rirThreshold('RIR 2')).toBe(2);
    expect(rirThreshold('RIR 3')).toBe(2);
    expect(rirThreshold('RIR 2-3')).toBe(2);
  });

  it('יעד חסר או לא ניתן לפענוח → 2 (ההתנהגות הקודמת)', () => {
    expect(DEFAULT_RIR_THRESHOLD).toBe(2);
    expect(rirThreshold(null)).toBe(2);
    expect(rirThreshold(undefined)).toBe(2);
    expect(rirThreshold('')).toBe(2);
    expect(rirThreshold('—')).toBe(2);
    expect(rirThreshold('קל')).toBe(2);
  });

  it('טבלת התאים: הסף של כל תא בתוכנית לפי הנוסחה', () => {
    const table = WORKOUT_TYPES.flatMap((t) => PROGRAM[t].map((e, i) => `${t}${i + 1} ${e.id} ${e.effort ?? '—'} ${e.mode} → ${rirThreshold(e.effort)}`));
    expect(table).toEqual([
      'A1 leg-press RIR 2 progress → 2',
      'A2 smith-bench-press RIR 2 progress → 2',
      'A3 lat-pulldown RIR 2 progress → 2',
      'A4 leg-extension RIR 1 progress → 1',
      'A5 leg-curl RIR 1 progress → 1',
      'A6 back-extension RIR 2 progress → 2',
      'A7 db-lateral-raise-seated RIR 1 progress → 1',
      'A8 plank — maintain → 2',
      'B1 barbell-rdl RIR 3 progress → 2',
      'B2 seated-cable-row RIR 2 progress → 2',
      'B3 pec-deck RIR 2 progress → 2',
      'B4 leg-curl RIR 2 progress → 2',
      'B5 reverse-pec-deck RIR 1 progress → 1',
      'B6 db-supinated-curl RIR 1 progress → 1',
      'B7 triceps-pushdown RIR 1 progress → 1',
      'B8 floor-leg-raise RIR 1 reps → 1',
      'C1 machine-hip-abduction RIR 1-2 progress → 1',
      'C2 machine-row RIR 2 progress → 2',
      'C3 db-incline-bench-press RIR 2 progress → 2',
      'C4 leg-press RIR 2 progress → 2',
      'C5 db-lateral-raise-standing RIR 1 progress → 1',
      'C6 triceps-pushdown RIR 1 progress → 1',
      'C7 cable-rope-curl RIR 1 progress → 1',
      'C8 cable-torso-rotation RIR 1 progress → 1',
    ]);
  });
});

describe('R1 / R5 לפי הסף של התא', () => {
  const A4 = 'leg-extension'; // בידוד, יעד RIR 1, step null ("דרגה אחת")
  const C1 = 'machine-hip-abduction'; // יעד "RIR 1-2"
  const A1 = 'leg-press'; // מורכב, יעד RIR 2, step 5
  const B1 = 'barbell-rdl'; // יעד RIR 3, step 5

  it('1. בידוד, יעד 1, תקרה בכל הסטים, RIR 1 → R1 (המקרה האמיתי: פשיטת ברכיים 60×15,15 ב-RIR 1, שבוע שני ברצף)', () => {
    const h = [sess(A4, '2026-10-06', 60, [15, 15], 1), sess(A4, '2026-10-13', 60, [15, 15], 1)];
    const s = suggestNext(h, exerciseIn('A', A4)!);
    expect(s).toMatchObject({ rule: 'R1', action: 'up', weight: null, repTarget: 12, rirUnknown: false, basisWeight: 60 });
    expect(s!.reason).toContain('RIR 1');
    expect(s!.reason).toContain('דרגה אחת למעלה');
    // לפני השינוי (סף 2 לכולם) — R5
    expect(suggestNext(h, bare(A4))).toMatchObject({ rule: 'R5', action: 'same', weight: 60, repTarget: 15 });
  });

  it('2. בידוד, יעד 1, תקרה, RIR 0 → R5', () => {
    const s = suggestNext([sess(A4, '2026-10-13', 60, [15, 15], 0)], exerciseIn('A', A4)!);
    expect(s).toMatchObject({ rule: 'R5', action: 'same', weight: 60, repTarget: 15 });
    expect(s!.reason).toBe('הגעת ל-15 בכל הסטים, אבל RIR 0 — עוד לא נקי. אותו משקל');
  });

  it('3. יעד "1-2" (C1), תקרה, RIR 1 → R1; RIR 0 → R5', () => {
    expect(suggestNext([sess(C1, '2026-10-13', 30, [20, 20, 20], 1)], exerciseIn('C', C1)!)).toMatchObject({ rule: 'R1', action: 'up', repTarget: 15 });
    expect(suggestNext([sess(C1, '2026-10-13', 30, [20, 20, 20], 0)], exerciseIn('C', C1)!)).toMatchObject({ rule: 'R5', action: 'same', repTarget: 20 });
  });

  it('4. מורכב, יעד 2, תקרה, RIR 1 → R5 (ללא שינוי) — זהה למפרט בלי effort', () => {
    const h = [sess(A1, '2026-10-13', 100, [12, 12, 12], 1)];
    const s = suggestNext(h, exerciseIn('A', A1)!);
    expect(s).toMatchObject({ rule: 'R5', action: 'same', weight: 100, repTarget: 12 });
    expect(s).toEqual(suggestNext(h, bare(A1)));
  });

  it('5. מורכב, יעד 2, תקרה, RIR 2 → R1 (ללא שינוי) — זהה למפרט בלי effort', () => {
    const h = [sess(A1, '2026-10-13', 100, [12, 12, 12], 2)];
    const s = suggestNext(h, exerciseIn('A', A1)!);
    expect(s).toMatchObject({ rule: 'R1', action: 'up', weight: 105, repTarget: 10 });
    expect(s).toEqual(suggestNext(h, bare(A1)));
  });

  it('6. RDL, יעד 3, תקרה, RIR 2 → R1 (ללא שינוי); RIR 1 → R5 (ללא שינוי)', () => {
    const up = [sess(B1, '2026-10-13', 40, [10, 10, 10], 2)];
    expect(suggestNext(up, exerciseIn('B', B1)!)).toMatchObject({ rule: 'R1', action: 'up', weight: 45, repTarget: 8 });
    expect(suggestNext(up, exerciseIn('B', B1)!)).toEqual(suggestNext(up, bare(B1)));
    const stay = [sess(B1, '2026-10-13', 40, [10, 10, 10], 1)];
    expect(suggestNext(stay, exerciseIn('B', B1)!)).toMatchObject({ rule: 'R5', action: 'same', weight: 40 });
    expect(suggestNext(stay, exerciseIn('B', B1)!)).toEqual(suggestNext(stay, bare(B1)));
  });

  it('7. כפיפת ברכיים, סשן אחרון בתקרה ב-RIR 1: בתא A5 (יעד 1) → R1 · בתא B4 (יעד 2) → R5 — אותה היסטוריה', () => {
    const LC = 'leg-curl';
    const h = [sess(LC, '2026-10-06', 30, [12, 12, 12], 2), sess(LC, '2026-10-13', 35, [12, 12, 12], 1)];
    expect(exerciseIn('A', LC)!.effort).toBe('RIR 1');
    expect(exerciseIn('B', LC)!.effort).toBe('RIR 2');
    expect(suggestNext(h, exerciseIn('A', LC)!)).toMatchObject({ rule: 'R1', action: 'up', weight: null, repTarget: 10, basisWeight: 35 });
    expect(suggestNext(h, exerciseIn('B', LC)!)).toMatchObject({ rule: 'R5', action: 'same', weight: 35, repTarget: 12, basisWeight: 35 });
  });

  it('7ב. הסיכום השבועי מחשב לפי התא של האימון: אותו תרגיל ב-A → R1, ב-B → R5', () => {
    const LC = 'leg-curl';
    const db = {
      ...emptyDb(),
      workouts: [
        wk('a', '2026-10-11', 'A', [le(LC, 35, [12, 12], { rir: 1 })]),
        wk('b', '2026-10-13', 'B', [le(LC, 35, [12, 12, 12], { rir: 1 })]),
      ],
    };
    const data = buildWeeklySummaryData(db, '2026-10-11');
    const a = data.workouts.items.find((w) => w.t === 'A')!.lines[0]!;
    const b = data.workouts.items.find((w) => w.t === 'B')!.lines[0]!;
    expect(a.suggestion).toMatchObject({ rule: 'R1', action: 'up' });
    expect(b.suggestion).toMatchObject({ rule: 'R5', action: 'same' });
    const text = buildWeeklySummary(db, '2026-10-11');
    expect(text).toMatch(/כפיפת ברכיים 35×12,12 · RIR 1 · הבא: דרגה אחת למעלה · 10 חזרות \(R1\)/);
    expect(text).toMatch(/כפיפת ברכיים 35×12,12,12 · RIR 1 · הבא: 35 ק״ג · 12 חזרות \(R5\)/);
  });

  it('8. R4, משקולת קטנה, יעד 1 (C5 הרחקת כתפיים 7.5 ק״ג, step 2.5): תקרה +2 בכל הסטים ב-RIR 1 → קפיצה · ב-RIR 0 → לא · תקרה בלבד → המתנה (R4) כמו קודם', () => {
    const C5 = 'db-lateral-raise-standing';
    const spec = exerciseIn('C', C5)!;
    expect(spec.effort).toBe('RIR 1');
    expect(suggestNext([sess(C5, '2026-10-13', 7.5, [17, 17, 17], 1)], spec)).toMatchObject({ rule: 'R1', action: 'up', weight: 10, repTarget: 12 });
    expect(suggestNext([sess(C5, '2026-10-13', 7.5, [17, 17, 17], 0)], spec)).toMatchObject({ rule: 'R5', action: 'same', weight: 7.5, repTarget: 15 });
    expect(suggestNext([sess(C5, '2026-10-13', 7.5, [15, 15, 15], 1)], spec)).toMatchObject({ rule: 'R4', action: 'same', weight: 7.5, repTarget: 17 });
    // לפני השינוי: תקרה +2 ב-RIR 1 → R5
    expect(suggestNext([sess(C5, '2026-10-13', 7.5, [17, 17, 17], 1)], bare(C5))).toMatchObject({ rule: 'R5' });
    // סף 2 (A6 משקל גוף כפתיחה, יעד 2): תקרה +2 ב-RIR 1 → R5 כמו קודם
    const A6 = 'back-extension';
    expect(suggestNext([sess(A6, '2026-10-13', 2.5, [17, 17, 17], 1)], exerciseIn('A', A6)!)).toMatchObject({ rule: 'R5' });
    expect(suggestNext([sess(A6, '2026-10-13', 2.5, [17, 17, 17], 2)], exerciseIn('A', A6)!)).toMatchObject({ rule: 'R1', action: 'up', weight: 5 });
  });

  it('9. חזרות בלבד (B8), שימור (A8), משקל גוף כפתיחה (A6) — תוצאה זהה לפני ואחרי', () => {
    const B8 = 'floor-leg-raise';
    for (const rir of [0, 1, 2, 3, undefined] as const) {
      const h = [sess(B8, '2026-10-13', null, [15, 15, 15], rir)];
      expect(suggestNext(h, exerciseIn('B', B8)!), `B8 rir ${rir}`).toEqual(suggestNext(h, bare(B8)));
    }
    expect(suggestNext([sess(B8, '2026-10-13', null, [15, 15, 15], 1)], exerciseIn('B', B8)!)).toMatchObject({ rule: 'R5', action: 'same', weight: null, repTarget: 15 });
    expect(suggestNext([sess(B8, '2026-10-13', null, [15, 15, 15], 2)], exerciseIn('B', B8)!)).toMatchObject({ rule: 'R1', action: 'same', weight: null, repTarget: 15 });
    expect(suggestNext([sess(B8, '2026-10-13', null, [15, 15, 15], 2)], exerciseIn('B', B8)!)!.reason).toContain(CEILING_STAY_LABEL);

    const A8 = 'plank';
    for (const rir of [0, 1, 2, undefined] as const) {
      const h = [sess(A8, '2026-10-13', null, [60, 60, 60], rir)];
      const s = suggestNext(h, exerciseIn('A', A8)!);
      expect(s, `A8 rir ${rir}`).toEqual(suggestNext(h, bare(A8)));
      expect(s).toMatchObject({ rule: 'M', action: 'same', repTarget: 60 });
      expect(s!.reason).toContain(MAINTAIN_LABEL);
    }

    const A6 = 'back-extension';
    const cases: Session[][] = [
      [sess(A6, '2026-10-13', null, [15, 15, 15], 2)],
      [sess(A6, '2026-10-13', 0, [17, 17, 17], 2)],
      [sess(A6, '2026-10-13', null, [17, 17, 17], 1)],
      [sess(A6, '2026-10-13', 2.5, [15, 15, 15], 1)],
      [sess(A6, '2026-10-06', null, [10, 10, 9]), sess(A6, '2026-10-13', null, [11, 10, 10])],
    ];
    for (const h of cases) expect(suggestNext(h, exerciseIn('A', A6)!)).toEqual(suggestNext(h, bare(A6)));
    expect(suggestNext(cases[0]!, exerciseIn('A', A6)!)).toMatchObject({ rule: 'R4', repTarget: 17 });
    expect(suggestNext(cases[1]!, exerciseIn('A', A6)!)).toMatchObject({ rule: 'R1', action: 'up', weight: 2.5 });
    expect(suggestNext(cases[2]!, exerciseIn('A', A6)!)).toMatchObject({ rule: 'R5' });
  });

  it('10. בלי RIR → R1 עם "אשר בעצמך", כמו לפני — גם בסף 1 וגם בסף 2', () => {
    const a4 = suggestNext([sess(A4, '2026-10-13', 60, [15, 15])], exerciseIn('A', A4)!);
    expect(a4).toMatchObject({ rule: 'R1', action: 'up', rirUnknown: true });
    expect(a4).toEqual(suggestNext([sess(A4, '2026-10-13', 60, [15, 15])], bare(A4)));
    const a1 = suggestNext([sess(A1, '2026-10-13', 100, [12, 12, 12])], exerciseIn('A', A1)!);
    expect(a1).toMatchObject({ rule: 'R1', action: 'up', weight: 105, rirUnknown: true });
    expect(a1).toEqual(suggestNext([sess(A1, '2026-10-13', 100, [12, 12, 12])], bare(A1)));
  });

  it('R2/R3/R6 — לא תלויים בסף: אמצע הטווח, סט מתחת לרצפה, שני אימונים מתחת לרצפה — זהים עם ובלי effort', () => {
    const cases: Session[][] = [
      [sess(A4, '2026-10-13', 60, [14, 13], 1)],
      [sess(A4, '2026-10-13', 60, [15, 11], 0)],
      [sess(A4, '2026-10-06', 60, [11, 11], 0), sess(A4, '2026-10-13', 60, [12, 11], 1)],
      [sess(A1, '2026-10-06', 100, [9, 9, 9], 1), sess(A1, '2026-10-13', 100, [9, 9, 8], 1)],
      [sess(A4, '2026-10-13', 60, [14, 13], 1, { sets: [{ weight: 60, reps: 14, seconds: null }, { weight: 55, reps: 13, seconds: null }] })],
    ];
    expect(suggestNext(cases[0]!, exerciseIn('A', A4)!)).toMatchObject({ rule: 'R6', repTarget: 14 });
    expect(suggestNext(cases[1]!, exerciseIn('A', A4)!)).toMatchObject({ rule: 'R6' });
    expect(suggestNext(cases[2]!, exerciseIn('A', A4)!)).toMatchObject({ rule: 'R3', action: 'down', weight: null });
    expect(suggestNext(cases[3]!, exerciseIn('A', A1)!)).toMatchObject({ rule: 'R3', action: 'down', weight: 90 });
    expect(suggestNext(cases[4]!, exerciseIn('A', A4)!)).toMatchObject({ rule: 'R6', mixedWeights: true });
    for (const h of cases) {
      const id = h[0]!.ex.exerciseId;
      expect(suggestNext(h, exerciseIn('A', id)!)).toEqual(suggestNext(h, bare(id)));
    }
  });
});

describe('שורה שהוחלפה — הסף של התא שהוחלף', () => {
  it('"החלף" בתא עם יעד 1 (C5) לחלופה מהמאגר (בלי effort): תקרה ב-RIR 1 → R1 בסיכום השבועי; אותה חלופה בתא עם יעד 2 → R5', () => {
    const ALT = 'cable-single-arm-lateral-raise'; // חלופה של A7 (יעד 1) ושל C5 (יעד 1); במאגר בלי effort
    expect(exerciseById(ALT)!.effort).toBeNull();
    // ההיסטוריה של החלופה: 40×15,15,15 ב-RIR 1 — תקרה
    const swappedC = le(ALT, 40, [15, 15, 15], { rir: 1, swappedFrom: 'db-lateral-raise-standing' });
    const dbC = { ...emptyDb(), workouts: [wk('c', '2026-10-13', 'C', [swappedC])] };
    const lineC = buildWeeklySummaryData(dbC, '2026-10-11').workouts.items[0]!.lines[0]!;
    expect(lineC.swappedFrom).toBe('הוחלף מ-הרחקת כתפיים בעמידה');
    expect(lineC.suggestion).toMatchObject({ rule: 'R1', action: 'up', weight: 45, repTarget: 12 });
    // אותה חלופה כביכול בתא עם יעד 2 (A2 בנץ׳ — לא ברשימת החלופות שלו, אבל הסף נקבע לפי התא שהוחלף): R5
    const swappedA = le(ALT, 40, [12, 12, 12], { rir: 1, swappedFrom: 'smith-bench-press', targetRepMin: 8, targetRepMax: 12 });
    const dbA = { ...emptyDb(), workouts: [wk('a', '2026-10-13', 'A', [swappedA])] };
    const lineA = buildWeeklySummaryData(dbA, '2026-10-11').workouts.items[0]!.lines[0]!;
    expect(lineA.suggestion).toMatchObject({ rule: 'R5', action: 'same', weight: 40, repTarget: 12 });
    // התא שהוחלף לא באימון הזה (רשומה ישנה) → הסף של החלופה עצמה (בלי effort → 2)
    const swappedOld = le(ALT, 40, [15, 15, 15], { rir: 1, swappedFrom: 'face-pull' });
    const dbOld = { ...emptyDb(), workouts: [wk('b', '2026-10-13', 'B', [swappedOld])] };
    expect(buildWeeklySummaryData(dbOld, '2026-10-11').workouts.items[0]!.lines[0]!.suggestion).toMatchObject({ rule: 'R5' });
  });

  it('"החלף" ל-db-bench-press בתא A2 (יעד 2): תקרה ב-RIR 1 → R5 כמו קודם; ב-RIR 2 → R1 כמו קודם', () => {
    const DB = 'db-bench-press';
    const mk = (rir: Rir) => ({ ...emptyDb(), workouts: [wk('a', '2026-10-13', 'A', [le(DB, 15, [12, 12, 12], { rir, swappedFrom: 'smith-bench-press' })])] });
    expect(buildWeeklySummaryData(mk(1), '2026-10-11').workouts.items[0]!.lines[0]!.suggestion).toMatchObject({ rule: 'R5', weight: 15 });
    expect(buildWeeklySummaryData(mk(2), '2026-10-11').workouts.items[0]!.lines[0]!.suggestion).toMatchObject({ rule: 'R1', action: 'up', weight: 17.5 });
  });

  it('המנוע לפי מזהה: ההצעה מחושבת מכל הסשנים של אותו מזהה, גם כשהוחלף — ורק הסף מגיע מהתא', () => {
    const LC = 'leg-curl';
    const all = [
      wk('a', '2026-10-06', 'A', [le(LC, 30, [12, 12], { rir: 2 })]),
      wk('b', '2026-10-08', 'B', [le(LC, 35, [12, 12, 12], { rir: 1 })]),
    ];
    const h = exerciseHistory(all, LC);
    expect(h).toHaveLength(2);
    expect(suggestNext(h, exerciseIn('A', LC)!)).toMatchObject({ rule: 'R1', basisWeight: 35 });
    expect(suggestNext(h, exerciseIn('B', LC)!)).toMatchObject({ rule: 'R5', basisWeight: 35 });
  });
});
