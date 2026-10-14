/**
 * עדכון תוכנית 13/10/2026: B1 → דד-ליפט רומניין עם מוט (`barbell-rdl` — המזהה
 * הקיים מהמאגר, היה החלופה השנייה של B1). ה-RDL עם משקולות יד (`db-rdl`) עבר
 * מהתוכנית למאגר כחלופה הראשונה של B1, היפ הינג' סמית שני. שני המזהים, השמות,
 * הסרטונים וההיסטוריה — כמו שהיו. שאר התרגילים, R1–R6 ו-M — ללא שינוי
 * (snapshot ההצעות: אפס שורות שהשתנו — לשני המזהים אותו מפרט כמו קודם).
 */
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { emptyDb } from '../../types';
import { ALTERNATES, EXERCISE_ALIASES, PROGRAM, RETIRED, WORKOUT_TYPES, alternatesFor, exerciseById, exerciseIn, resolveExerciseId, type Exercise } from '../../data/program';
import { suggestNext } from '../progression';
import { FINISHER_ID, WARMUP_ID, blankLoggedExercise, exerciseHistory, exercisesFor, hasData, lastExercise, openingWeight, prefilledExercises, skippedExercises, swapExercise } from '../workouts';
import { parseWorkouts } from '../schema';
import { buildWeeklySummary } from '../weeklySummary';
import { buildChatReport } from '../exportText';
import { STORAGE_KEYS } from '../store';
import ExerciseFocus, { type AlternateOption } from '../../components/ExerciseFocus';
import { le, wk } from './helpers';

const B1 = 'barbell-rdl';
const DB_RDL = 'db-rdl';
const B1_VIDEO = 'https://drive.google.com/file/d/1cYG-9dBbLpEaWJEQgc2FMsqb2pCWqomM/view?usp=share_link';
const DB_RDL_VIDEO = 'https://drive.google.com/file/d/1fJi2Ni_3VP3booTAJAx-gD4rG_oTZU76/view?usp=share_link';
const B1_NOTE = 'מתחילים מהמתקן בגובה הירך, לא מהרצפה · המוט צמוד לירכיים ולשוקיים ולא נוגע ברצפה · עוצרים במתיחה באחורי הירך, לפני שהגב מתעגל · ברכיים רכות וקבועות · נרשם סך הפלטות בלי המוט';
const DB_RDL_NOTE = "הינג' בלבד, גב ניטרלי, בלי כיפוף ברך עמוק";

const ids = (list: { exerciseId: string }[]) => list.map((e) => e.exerciseId);

/** שני אימוני B ישנים, מלפני העדכון, עם ה-RDL במשקולות יד ב-B1. */
const B_SEP29 = wk('b-0929', '2026-09-29', 'B', [
  { ...le(DB_RDL, 22.5, [10, 10, 9]), rir: 2 },
  le('seated-cable-row', 45, [12, 12, 12]),
]);
const B_OCT06 = wk('b-1006', '2026-10-06', 'B', [
  { ...le(DB_RDL, 25, [10, 10, 10]), rir: 3 },
  le('seated-cable-row', 45, [12, 12, 12]),
  le('pec-deck', 30, [12, 12, 12]),
  le('leg-curl', 30, [12, 12, 12]),
  le('face-pull', 20, [20, 20, 20]),
  le('db-supinated-curl', 10, [12, 12]),
  le('triceps-pushdown', 25, [15, 15]),
  le('floor-leg-raise', null, [12, 12, 12]),
]);
const ALL = [B_SEP29, B_OCT06];

describe('B1 — דד-ליפט רומניין עם מוט (barbell-rdl, 13/10/2026)', () => {
  it('המפרט: ראשון ב-B, 3×8–10, RIR 3, step 5, הערת ביצוע וסרטון; המזהה הקיים מהמאגר — לא במאגר ולא בפרושים', () => {
    const b1 = exerciseIn('B', B1)!;
    expect(b1).toMatchObject({
      id: B1,
      name: 'דד-ליפט רומניין',
      short: 'RDL מוט',
      machine: 'Barbell',
      type: 'compound',
      sets: 3,
      reps: '8-10',
      repRangeMin: 8,
      repRangeMax: 10,
      effort: 'RIR 3',
      step: 5,
      mode: 'progress',
      bodyweightStart: false,
      bodyweightOnly: false,
      isTimed: false,
      note: B1_NOTE,
      videoUrl: B1_VIDEO,
      alternates: [DB_RDL, 'smith-hip-hinge'],
    });
    expect(PROGRAM.B[0]).toBe(b1);
    expect(exerciseById(B1)).toBe(b1);
    expect(PROGRAM.B.map((e) => e.id)).toEqual([B1, 'seated-cable-row', 'pec-deck', 'leg-curl', 'face-pull', 'db-supinated-curl', 'triceps-pushdown', 'floor-leg-raise']);
    expect(ALTERNATES.some((a) => a.id === B1)).toBe(false);
    expect(RETIRED.some((r) => r.id === B1)).toBe(false);
    expect(resolveExerciseId('דד-ליפט רומניין')).toBe(B1);
    // המוט אינו חלופה של אף תא — הוא עכשיו המקור
    for (const t of WORKOUT_TYPES) {
      for (const e of PROGRAM[t]) expect(e.alternates, e.id).not.toContain(B1);
    }
  });

  it('"החלף" ב-B1: ה-RDL עם משקולות יד ראשון, היפ הינג\' סמית שני — ושניהם לא השתנו', () => {
    expect(alternatesFor(B1).map((a) => a.id)).toEqual([DB_RDL, 'smith-hip-hinge']);
    expect(alternatesFor(B1).map((a) => a.name)).toEqual(['דד-ליפט רומניין עם מ.יד', "היפ הינג'- סמית משין"]);
    expect(exerciseById('smith-hip-hinge')).toMatchObject({ sets: 3, repRangeMin: 8, repRangeMax: 10, step: 5, note: null, videoUrl: null });
  });

  it('ה-RDL עם משקולות יד: אותו מזהה, שם, סרטון, הערה, step 2.5 ו-3×8–10 — עכשיו במאגר, לא בתוכנית ולא בפרושים; השם הישן עדיין נפתר אליו', () => {
    const dbRdl = exerciseById(DB_RDL)!;
    expect(dbRdl).toMatchObject({
      id: DB_RDL,
      name: 'דד-ליפט רומניין עם מ.יד',
      short: 'RDL',
      machine: 'Dumbbells',
      type: 'compound',
      sets: 3,
      repRangeMin: 8,
      repRangeMax: 10,
      step: 2.5,
      note: DB_RDL_NOTE,
      videoUrl: DB_RDL_VIDEO,
      mode: 'progress',
      bodyweightStart: false,
    });
    expect(ALTERNATES.some((a) => a.id === DB_RDL)).toBe(true);
    expect(RETIRED.some((r) => r.id === DB_RDL)).toBe(false);
    for (const t of WORKOUT_TYPES) expect(exerciseIn(t, DB_RDL)).toBeUndefined();
    expect(alternatesFor(DB_RDL)).toEqual([]);
    expect(resolveExerciseId('דד-ליפט רומניין עם מ.יד')).toBe(DB_RDL);
    expect(EXERCISE_ALIASES['RDL משקולות יד']).toBe(DB_RDL);
    expect(resolveExerciseId('RDL משקולות יד')).toBe(DB_RDL);
  });

  it('מספר התרגילים בתוכנית ובמאגר לא השתנה (56 בלי הפלאנק) — שני המזהים נספרים, כל אחד פעם אחת', () => {
    const all = [...WORKOUT_TYPES.flatMap((t) => PROGRAM[t].map((e) => e.id)), ...ALTERNATES.map((a) => a.id)];
    const unique = new Set(all);
    expect(unique.has(B1)).toBe(true);
    expect(unique.has(DB_RDL)).toBe(true);
    expect(unique.size - 1).toBe(56);
    expect(ALTERNATES).toHaveLength(36);
    expect(new Set(ALTERNATES.map((a) => a.id)).size).toBe(36);
  });
});

describe('ההיסטוריה של ה-RDL עם משקולות יד — שלמה', () => {
  it('רשומות ישנות של B עם db-rdl נטענות כמו שהן; ההיסטוריה לפי המזהה מלאה, עם המשקלים וה-RIR', () => {
    const r = parseWorkouts(ALL);
    expect(r.rejected).toEqual([]);
    expect(r.ok).toEqual(ALL);
    const h = exerciseHistory(ALL, DB_RDL);
    expect(h.map((x) => x.d)).toEqual(['2026-09-29', '2026-10-06']);
    expect(h.map((x) => x.ex.sets.map((s) => s.weight))).toEqual([[22.5, 22.5, 22.5], [25, 25, 25]]);
    expect(h.map((x) => x.ex.rir)).toEqual([2, 3]);
    expect(lastExercise(ALL, DB_RDL)?.d).toBe('2026-10-06');
    expect(openingWeight(ALL, DB_RDL)).toBe(25);
    // ההיסטוריה של המוט ריקה — לא "ירשה" דבר מהמשקולות
    expect(exerciseHistory(ALL, B1)).toEqual([]);
    expect(openingWeight(ALL, B1)).toBeNull();
  });

  it('אימון B ישן נפתח לעריכה עם ה-RDL במשקולות יד במקומו ועם הנתונים; המוט מופיע כשורה ריקה אחרי השורות שנשמרו', () => {
    const rows = exercisesFor(B_OCT06, ALL);
    expect(ids(rows)).toEqual([WARMUP_ID, DB_RDL, 'seated-cable-row', 'pec-deck', 'leg-curl', 'face-pull', 'db-supinated-curl', 'triceps-pushdown', 'floor-leg-raise', B1, FINISHER_ID]);
    const dbRdl = rows.find((x) => x.exerciseId === DB_RDL)!;
    expect(dbRdl).toMatchObject({ n: 'דד-ליפט רומניין עם מ.יד', targetRepMin: 8, targetRepMax: 10 });
    expect(dbRdl.sets).toEqual([{ weight: 25, reps: 10, seconds: null }, { weight: 25, reps: 10, seconds: null }, { weight: 25, reps: 10, seconds: null }]);
    expect(hasData(dbRdl)).toBe(true);
    const b1 = rows.find((x) => x.exerciseId === B1)!;
    expect(hasData(b1)).toBe(false);
    expect(b1.sets).toHaveLength(3);
    expect(b1.sets.every((s) => s.weight === null && s.reps === null)).toBe(true);
    // הרשומה הישנה אינה "לא שלמה": המוט לא נספר כתרגיל שדולג
    expect(ids(skippedExercises(B_OCT06))).not.toContain(B1);
  });

  it('הסיכום השבועי והדוח של אימון B ישן: שורת ה-RDL עם ההצעה שלה (R1 מהמשקולות), בלי שורה למוט', () => {
    const db = { ...emptyDb(), workouts: ALL };
    const text = buildWeeklySummary(db, '2026-10-06');
    expect(text).toContain('RDL 25×10,10,10 · RIR 3 · הבא: 27.5 ק״ג · 8 חזרות (R1)');
    expect(text).not.toContain('RDL מוט');
    const report = buildChatReport(db, '2026-10-04', '2026-10-10');
    expect(report).toContain('RDL 25×10,10,10');
    expect(report).not.toContain('RDL מוט');
    expect(report).not.toMatch(/דולגו:.*RDL/);
  });
});

describe('אימון B חדש ו"החלף"', () => {
  it('B חדש: B1 הוא המוט, 3 סטים ריקים, בלי משקל פותח; לסשן הראשון אין הצעה (אין היסטוריה למזהה)', () => {
    const rows = prefilledExercises(ALL, 'B');
    expect(ids(rows)).toEqual([WARMUP_ID, B1, 'seated-cable-row', 'pec-deck', 'leg-curl', 'face-pull', 'db-supinated-curl', 'triceps-pushdown', 'floor-leg-raise', FINISHER_ID]);
    const b1 = rows[1]!;
    expect(b1).toMatchObject({ exerciseId: B1, n: 'דד-ליפט רומניין', targetRepMin: 8, targetRepMax: 10, type: 'compound', bodyweightOnly: false });
    expect(b1.sets).toHaveLength(3);
    expect(b1.sets.every((s) => s.weight === null && s.reps === null && s.seconds === null)).toBe(true);
    expect(suggestNext(exerciseHistory(ALL, B1), exerciseIn('B', B1)!)).toBeNull();
    expect(suggestNext([], exerciseIn('B', B1)!)).toBeNull();
  });

  it('סשן ראשון של המוט 40×10,10,10 עם RIR 3 → 45 (R1, step 5); ההיסטוריה שלו לא מערבבת את המשקולות', () => {
    const first = wk('b-1013', '2026-10-13', 'B', [{ ...le(B1, 40, [10, 10, 10]), rir: 3 }]);
    const all = [...ALL, first];
    expect(exerciseHistory(all, B1)).toHaveLength(1);
    expect(exerciseHistory(all, DB_RDL)).toHaveLength(2);
    expect(suggestNext(exerciseHistory(all, B1), exerciseIn('B', B1)!)).toMatchObject({ action: 'up', weight: 45, rule: 'R1', repTarget: 8 });
    expect(openingWeight(all, B1)).toBe(40);
    expect(openingWeight(all, DB_RDL)).toBe(25);
  });

  it('"החלף" ב-B1 מציע ראשון את ה-RDL עם משקולות יד, עם המשקל וההצעה מההיסטוריה שלו (step 2.5), ושני את היפ הינג\' סמית', () => {
    const slot = exerciseIn('B', B1)!;
    const alts = alternatesFor(B1);
    expect(alts.map((a) => a.id)).toEqual([DB_RDL, 'smith-hip-hinge']);
    const dbRdl = alts[0]!;
    const row = swapExercise(slot, dbRdl, openingWeight(ALL, dbRdl.id));
    expect(row).toMatchObject({ exerciseId: DB_RDL, n: 'דד-ליפט רומניין עם מ.יד', swappedFrom: B1, targetRepMin: 8, targetRepMax: 10 });
    expect(row.sets.map((s) => s.weight)).toEqual([25, 25, 25]);
    expect(suggestNext(exerciseHistory(ALL, dbRdl.id), { ...dbRdl, sets: slot.sets })).toMatchObject({ action: 'up', weight: 27.5, rule: 'R1' });
    const smith = swapExercise(slot, alts[1]!, openingWeight(ALL, alts[1]!.id));
    expect(smith).toMatchObject({ exerciseId: 'smith-hip-hinge', swappedFrom: B1, targetRepMin: 8, targetRepMax: 10 });
    expect(smith.sets.every((s) => s.weight === null)).toBe(true);
  });

  it('רשומה ישנה שבה B1 הוחלף למוט (swappedFrom: db-rdl) נטענת כמו שהיא ומזינה את B1 החדש — אותו מזהה, ההיסטוריה ממשיכה', () => {
    const old = { ...le(B1, 40, [10, 10, 10]), swappedFrom: DB_RDL, rir: 3 as const };
    const r = parseWorkouts([wk('b-swap', '2026-10-09', 'B', [old])]);
    expect(r.rejected).toEqual([]);
    expect(r.ok[0]?.ex[0]).toMatchObject({ exerciseId: B1, swappedFrom: DB_RDL, targetRepMin: 8, targetRepMax: 10 });
    const all = [...ALL, ...r.ok];
    expect(exerciseHistory(all, B1).map((h) => h.d)).toEqual(['2026-10-09']);
    expect(openingWeight(all, B1)).toBe(40);
    expect(suggestNext(exerciseHistory(all, B1), exerciseIn('B', B1)!)).toMatchObject({ action: 'up', weight: 45, rule: 'R1' });
    // עריכת הרשומה הישנה: שורת המוט שהוחלפה מוצגת במקומה עם הנתונים. התא db-rdl שהיא תופסת אינו
    // בתוכנית, ולכן התא barbell-rdl נחשב "חסר" ומתווסף כשורה ריקה אחרי השורות שנשמרו — אותה התנהגות
    // כמו בכל רשומה ישנה שהוחלפה אל תרגיל שנכנס אחר כך לתוכנית (C2, A2). תצוגה בלבד: ההיסטוריה,
    // המשקל הפותח וההצעה (למעלה) נכונים, והשורה הריקה לא נשמרת ולא נספרת כ"דולג" אלא אם הרשומה נשמרת מחדש.
    const rows = exercisesFor(r.ok[0]!, all);
    expect(ids(rows)).not.toContain(DB_RDL);
    const withData = rows.filter((x) => x.exerciseId === B1 && hasData(x));
    expect(withData).toHaveLength(1);
    expect(withData[0]).toMatchObject({ swappedFrom: DB_RDL });
    expect(withData[0]!.sets.map((x) => x.weight)).toEqual([40, 40, 40]);
    expect(ids(skippedExercises(r.ok[0]!))).not.toContain(B1);
  });
});

describe('מסך התרגיל — B1 עם סרטון, הערה ו"החלף"', () => {
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

  it('B1: קישור ▶ לסרטון, ההערה המלאה, "החלף" ו"דלג ואחזור" (רשימת החלופות נפתחת רק בלחיצה — הסדר נבדק ב-alternatesFor)', () => {
    const spec = exerciseIn('B', B1)!;
    const options: AlternateOption[] = alternatesFor(B1).map((alt) => ({ spec: alt, last: lastExercise(ALL, alt.id) }));
    const out = html(spec, options);
    expect(out).toContain(`href="${B1_VIDEO}"`);
    expect(out).toContain('target="_blank"');
    expect(out).toContain('סרטון הדגמה — דד-ליפט רומניין');
    expect(out).toContain(B1_NOTE);
    expect(out).toContain('>החלף<');
    expect(out).toContain('>דלג ואחזור<');
    expect(out).toContain('משקל — דד-ליפט רומניין');
    expect(out).toContain('aria-expanded="false"');
    expect(options.map((o) => o.spec.id)).toEqual([DB_RDL, 'smith-hip-hinge']);
    expect(options[0]!.last?.d).toBe('2026-10-06');
    expect(options[1]!.last).toBeNull();
  });
});

describe('אחסון — בלי מפתח חדש ובלי מיגרציה', () => {
  it('התוכנית לא נשמרת במכשיר; המפתחות הקיימים לא השתנו', () => {
    expect(Object.keys(STORAGE_KEYS).sort()).toEqual(
      ['checkins', 'creatine', 'customFoods', 'days', 'entries', 'favorites', 'quarantine', 'settings', 'standaloneCardio', 'targets', 'waist', 'weights', 'workouts'].sort(),
    );
    for (const v of Object.values(STORAGE_KEYS)) {
      expect(v).toMatch(/^fatloss:/);
      expect(v).not.toMatch(/program|exercise|rdl/);
    }
  });
});
