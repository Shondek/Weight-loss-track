/**
 * עדכון תוכנית 20/10/2026: חזרה לפייס פול — היפוך של 16/10/2026 (PR #22).
 * B5 → חתירה אופקית בחבל (`face-pull` — המזהה הקיים מהמאגר): 3×15–20, RIR 1,
 * step 5 וסרטון כפי שהיו שמורים במאגר, והערת ביצוע חדשה. הפרפר ההפוך
 * (`reverse-pec-deck`) עבר מהתוכנית למאגר — אותו מזהה, מפרט, הערה, סרטון
 * והיסטוריה — ואינו חלופה של אף תא. חלופות B5: `cable-reverse-fly` בלבד, ללא
 * שינוי. `db-reverse-fly` נשאר במאגר בלי תא. אין מיגרציה ואין מפתח אחסון חדש.
 *
 * snapshot ההצעות: אותם שני מזהים ואותו מפרט, אבל סף ה-RIR עובר עם התא
 * (17/10/2026): בשני תרחישי ה-RIR 1 בלבד `face-pull` מקבל R1 במקום R5
 * ו-`reverse-pec-deck` (בלי תא מארח → סף 2) R5 במקום R1. אפס שורות מחוץ לזוג.
 */
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { emptyDb } from '../../types';
import { ALTERNATES, EXERCISE_ALIASES, PROGRAM, RETIRED, WORKOUT_TYPES, alternatesFor, exerciseById, exerciseIn, resolveExerciseId, type Exercise } from '../../data/program';
import { rirThreshold, suggestNext } from '../progression';
import { FINISHER_ID, WARMUP_ID, blankLoggedExercise, exerciseHistory, exercisesFor, hasData, lastExercise, openingWeight, prefilledExercises, skippedExercises, swapExercise } from '../workouts';
import { parseWorkouts } from '../schema';
import { buildWeeklySummary, buildWeeklySummaryData } from '../weeklySummary';
import { buildChatReport } from '../exportText';
import { STORAGE_KEYS } from '../store';
import ExerciseFocus, { type AlternateOption } from '../../components/ExerciseFocus';
import { le, wk } from './helpers';

const B5 = 'face-pull';
const REVERSE_PEC_DECK = 'reverse-pec-deck';
const CABLE = 'cable-reverse-fly';
const DB_FLY = 'db-reverse-fly';
const B5_VIDEO = 'https://drive.google.com/file/d/1FIt-HIDn_y2lMc-UjVUR0BDZiHHStjg1/view?usp=drive_link';
const REVERSE_PEC_DECK_VIDEO = 'https://drive.google.com/file/d/1Oyyswtd8u3qB4fsimpsinv3V0dqr4H3U/view?usp=drive_link';
const CABLE_VIDEO = 'https://drive.google.com/file/d/1-fJHu5tp9fL4o9Trs-KTPSQQsD4Z0cW3/view?usp=drive_link';
const B5_NOTE =
  'הגלגלת בגובה הפנים, לא מעל הראש. צעד אחורה, כך שהמשקל לא נוחת בין החזרות. מושכים את מרכז החבל לכיוון העיניים ומפרידים את הידיים — בסוף הן ליד האוזניים והאגרופים פונים לאחור. מרפקים בגובה הכתף, לא מעל. השכמות נאספות, הכתפיים לא עולות. בלי להישען אחורה. משקל קל, חזרה איטית.';
const REVERSE_PEC_DECK_NOTE = 'פרפר הפוך. פנים לכרית, החזה צמוד אליה · ידיות בגובה הכתף, לא מעל · מרפקים מעט כפופים וקבועים · התנועה מהכתף, בלי למשוך עם הידיים ובלי להרים כתפיים · חזרה איטית.';
const CABLE_NOTE = 'כבלים בגובה הכתף, לא מעל · מרפקים מעט כפופים וקבועים · התנועה מהכתף.';

const B_ORDER = ['barbell-rdl', 'seated-cable-row', 'pec-deck', 'leg-curl', B5, 'db-supinated-curl', 'triceps-pushdown', 'floor-leg-raise'];

const ids = (list: { exerciseId: string }[]) => list.map((e) => e.exerciseId);

/** היסטוריה לדוגמה: שני אימוני B מלפני 16/10 עם החתירה בחבל, ואימון B מ-17/10 עם הפרפר ההפוך ב-B5. */
const B_OCT06 = wk('b-1006', '2026-10-06', 'B', [
  le('db-rdl', 25, [10, 10, 10]),
  le('seated-cable-row', 45, [12, 12, 12]),
  { ...le(B5, 15, [20, 20, 18]), rir: 1 },
]);
const B_OCT13 = wk('b-1013', '2026-10-13', 'B', [
  { ...le('barbell-rdl', 40, [10, 10, 10]), rir: 3 },
  le('seated-cable-row', 45, [12, 12, 12]),
  le('pec-deck', 30, [12, 12, 12]),
  le('leg-curl', 30, [12, 12, 12]),
  { ...le(B5, 20, [20, 20, 20]), rir: 2 },
  le('db-supinated-curl', 10, [12, 12]),
  le('triceps-pushdown', 25, [15, 15]),
  le('floor-leg-raise', null, [12, 12, 12]),
]);
const B_OCT17 = wk('b-1017', '2026-10-17', 'B', [
  { ...le('barbell-rdl', 40, [10, 10, 10]), rir: 3 },
  le('seated-cable-row', 45, [12, 12, 12]),
  le('pec-deck', 30, [12, 12, 12]),
  le('leg-curl', 30, [12, 12, 12]),
  { ...le(REVERSE_PEC_DECK, 30, [20, 20, 20]), rir: 2 },
  le('db-supinated-curl', 10, [12, 12]),
  le('triceps-pushdown', 25, [15, 15]),
  le('floor-leg-raise', null, [12, 12, 12]),
]);
const FACE_PULL_ONLY = [B_OCT06, B_OCT13];
const ALL = [B_OCT06, B_OCT13, B_OCT17];

describe('B5 — חתירה אופקית בחבל, פייס פול (face-pull, 20/10/2026)', () => {
  it('המפרט: חמישי ב-B, 3×15–20, RIR 1, בידוד, step 5, ההערה החדשה מילה במילה, הסרטון שהיה במאגר; חלופה יחידה — הרחקה בפולי; לא במאגר ולא בפרושים', () => {
    const b5 = exerciseIn('B', B5)!;
    expect(b5).toMatchObject({
      id: B5,
      name: 'חתירה אופקית- חבל',
      short: 'חתירה אופקית חבל',
      machine: 'Cable Rope',
      muscle: 'shoulders',
      muscles: ['כתף אחורית', 'סובבי כתף'],
      type: 'isolation',
      sets: 3,
      reps: '15-20',
      repRangeMin: 15,
      repRangeMax: 20,
      effort: 'RIR 1',
      step: 5,
      mode: 'progress',
      bodyweightStart: false,
      bodyweightOnly: false,
      isTimed: false,
      unilateral: false,
      assisted: false,
      note: B5_NOTE,
      videoUrl: B5_VIDEO,
      alternates: [CABLE],
    });
    expect(PROGRAM.B[4]).toBe(b5);
    expect(exerciseById(B5)).toBe(b5);
    expect(PROGRAM.B.map((e) => e.id)).toEqual(B_ORDER);
    expect(ALTERNATES.some((a) => a.id === B5)).toBe(false);
    expect(RETIRED.some((r) => r.id === B5)).toBe(false);
    expect(rirThreshold(b5.effort)).toBe(1);
    // החתירה בחבל אינה חלופה של אף תא — היא התא
    for (const t of WORKOUT_TYPES) {
      for (const e of PROGRAM[t]) expect(e.alternates, e.id).not.toContain(B5);
    }
    // השמות הישנים נפתרים אליה — ההיסטוריה מתחברת
    expect(resolveExerciseId('חתירה אופקית- חבל')).toBe(B5);
    expect(EXERCISE_ALIASES['פייס פול']).toBe(B5);
    expect(resolveExerciseId('פייס פול')).toBe(B5);
  });

  it('step 5 כמו שאר תרגילי הכבל — כפי שהיה שמור במאגר, לא הומצא', () => {
    for (const id of ['cable-fly', 'cable-low-fly', 'seated-cable-row', 'triceps-pushdown', CABLE]) expect(exerciseById(id)?.step, id).toBe(5);
    expect(exerciseIn('B', B5)!.step).toBe(5);
  });

  it('אימון B: 8 תאים, 22 סטים; סדר התרגילים לא זז פרט לתא B5; לכל התאים סרטון', () => {
    expect(PROGRAM.B).toHaveLength(8);
    expect(PROGRAM.B.reduce((n, e) => n + e.sets, 0)).toBe(22);
    expect(PROGRAM.B.map((e) => e.id)).toEqual(B_ORDER);
    for (const t of WORKOUT_TYPES) {
      for (const e of PROGRAM[t]) expect(e.videoUrl, `${t}: ${e.id}`).toMatch(/^https:\/\/drive\.google\.com\/file\/d\//);
    }
  });

  it('הפרפר ההפוך במאגר: אותו מזהה, שם, 3×15–20, step null, אותה הערה ואותו סרטון — פעם אחת, לא בתוכנית, לא בפרושים ולא חלופה של אף תא', () => {
    const rpd = exerciseById(REVERSE_PEC_DECK)!;
    expect(rpd).toMatchObject({
      id: REVERSE_PEC_DECK,
      name: 'הרחקה אופקית- מכונת פרפר',
      short: 'פרפר הפוך',
      machine: 'Reverse Pec Deck',
      muscle: 'shoulders',
      muscles: ['כתף אחורית', 'סובבי כתף'],
      type: 'isolation',
      sets: 3,
      repRangeMin: 15,
      repRangeMax: 20,
      step: null,
      note: REVERSE_PEC_DECK_NOTE,
      videoUrl: REVERSE_PEC_DECK_VIDEO,
      mode: 'progress',
      bodyweightStart: false,
      alternates: [],
    });
    expect(rpd.step).toBe(exerciseIn('B', 'pec-deck')!.step);
    expect(ALTERNATES.filter((a) => a.id === REVERSE_PEC_DECK)).toHaveLength(1);
    expect(ALTERNATES.filter((a) => a.name === 'הרחקה אופקית- מכונת פרפר')).toHaveLength(1);
    expect(RETIRED.some((r) => r.id === REVERSE_PEC_DECK)).toBe(false);
    for (const t of WORKOUT_TYPES) expect(exerciseIn(t, REVERSE_PEC_DECK)).toBeUndefined();
    expect(alternatesFor(REVERSE_PEC_DECK)).toEqual([]);
    for (const t of WORKOUT_TYPES) {
      for (const e of PROGRAM[t]) expect(e.alternates, e.id).not.toContain(REVERSE_PEC_DECK);
    }
    expect(resolveExerciseId('הרחקה אופקית- מכונת פרפר')).toBe(REVERSE_PEC_DECK);
  });

  it('חלופות B5: ההרחקה בפולי בלבד — ללא שינוי בהערה, בסרטון וב-step; ההרחקה עם משקולות יד במאגר בלי תא', () => {
    expect(alternatesFor(B5).map((a) => a.id)).toEqual([CABLE]);
    expect(alternatesFor(B5).map((a) => a.name)).toEqual(['הרחקה אופקית- פולי גובה כתף']);
    expect(exerciseById(CABLE)).toMatchObject({ id: CABLE, name: 'הרחקה אופקית- פולי גובה כתף', sets: 3, repRangeMin: 15, repRangeMax: 20, step: 5, note: CABLE_NOTE, videoUrl: CABLE_VIDEO });
    expect(ALTERNATES.filter((a) => a.id === CABLE)).toHaveLength(1);
    expect(exerciseById(DB_FLY)).toMatchObject({ id: DB_FLY, name: 'הרחקה אופקית עם משקולות יד', sets: 3, repRangeMin: 15, repRangeMax: 20, step: 2.5, note: null, videoUrl: null });
    for (const t of WORKOUT_TYPES) {
      expect(exerciseIn(t, CABLE)).toBeUndefined();
      expect(exerciseIn(t, DB_FLY)).toBeUndefined();
      for (const e of PROGRAM[t]) expect(e.alternates, e.id).not.toContain(DB_FLY);
    }
  });

  it('אין מזהה כפול: כל מזהה פעם אחת בתוכנית+מאגר (פרט לתאים שחוזרים בכוונה ב-A/B/C); גודל המאגר 38 כמו קודם', () => {
    const program = WORKOUT_TYPES.flatMap((t) => PROGRAM[t].map((e) => e.id));
    const pool = ALTERNATES.map((a) => a.id);
    // אותו מזהה בשני אימונים — תאים שחוזרים בכוונה (לג-פרס, כפיפת ברכיים, פשיטת מרפקים)
    const repeated = program.filter((id, i) => program.indexOf(id) !== i);
    expect([...new Set(repeated)].sort()).toEqual(['leg-curl', 'leg-press', 'triceps-pushdown']);
    expect(new Set(pool).size).toBe(pool.length);
    for (const id of pool) expect(program, id).not.toContain(id);
    for (const id of pool) expect(RETIRED.some((r) => r.id === id), id).toBe(false);
    // 25/10/2026: אימון D — ארבעה מזהים עברו מהמאגר לתוכנית (38 → 34) ו-D4 חדש (58 → 59)
    expect(pool).toHaveLength(34);
    expect(new Set([...program, ...pool]).size - 1).toBe(59);
  });
});

describe('ההצעה ל-B5 מחושבת מההיסטוריה של החתירה בחבל', () => {
  it('B חדש: B5 הוא החתירה בחבל עם המשקל הפותח האחרון שלה (20), וההצעה מההיסטוריה שלה (R4 — קפיצה גדולה ביחס למשקל)', () => {
    const rows = prefilledExercises(FACE_PULL_ONLY, 'B');
    expect(ids(rows)).toEqual([WARMUP_ID, ...B_ORDER, FINISHER_ID]);
    const b5 = rows[5]!;
    expect(b5).toMatchObject({ exerciseId: B5, n: 'חתירה אופקית- חבל', targetRepMin: 15, targetRepMax: 20, type: 'isolation', bodyweightOnly: false });
    expect(b5.sets).toHaveLength(3);
    expect(b5.sets.every((s) => s.weight === 20 && s.reps === null && s.seconds === null)).toBe(true);
    const h = exerciseHistory(FACE_PULL_ONLY, B5);
    expect(h.map((x) => x.d)).toEqual(['2026-10-06', '2026-10-13']);
    expect(openingWeight(FACE_PULL_ONLY, B5)).toBe(20);
    expect(suggestNext(h, exerciseIn('B', B5)!)).toMatchObject({ action: 'same', weight: 20, rule: 'R4', repTarget: 22, basisWeight: 20 });
  });

  it('סף RIR של התא (1): תקרה 40×20,20,20 עם RIR 1 → R1, +5 ק״ג (במאגר, בלי תא, זה היה R5)', () => {
    const all = [wk('b-fp', '2026-10-13', 'B', [{ ...le(B5, 40, [20, 20, 20]), rir: 1 }])];
    expect(suggestNext(exerciseHistory(all, B5), exerciseIn('B', B5)!)).toMatchObject({ action: 'up', weight: 45, rule: 'R1', repTarget: 15, basisWeight: 40 });
    expect(suggestNext(exerciseHistory(all, B5), { ...exerciseIn('B', B5)!, effort: null })).toMatchObject({ action: 'same', weight: 40, rule: 'R5' });
    const db = { ...emptyDb(), workouts: all };
    expect(buildWeeklySummary(db, '2026-10-13')).toContain('חתירה אופקית חבל 40×20,20,20 · RIR 1 · הבא: 45 ק״ג · 15 חזרות (R1)');
  });

  it('ההיסטוריה של הפרפר ההפוך נפרדת ונגישה לפי המזהה; ההיסטוריה של החתירה בחבל לא "ירשה" ממנה', () => {
    expect(exerciseHistory(ALL, B5).map((x) => x.d)).toEqual(['2026-10-06', '2026-10-13']);
    expect(exerciseHistory(ALL, REVERSE_PEC_DECK).map((x) => x.d)).toEqual(['2026-10-17']);
    expect(exerciseHistory(ALL, REVERSE_PEC_DECK)[0]!.ex.sets.map((s) => s.weight)).toEqual([30, 30, 30]);
    expect(lastExercise(ALL, REVERSE_PEC_DECK)?.d).toBe('2026-10-17');
    expect(openingWeight(ALL, REVERSE_PEC_DECK)).toBe(30);
    expect(openingWeight(ALL, B5)).toBe(20);
    // ההצעה לפרפר ההפוך מהמאגר: תקרה עם RIR 2, step null → "דרגה אחת למעלה" (R1), כמו קודם
    expect(suggestNext(exerciseHistory(ALL, REVERSE_PEC_DECK), exerciseById(REVERSE_PEC_DECK)!)).toMatchObject({ action: 'up', weight: null, rule: 'R1', repTarget: 15, basisWeight: 30 });
  });
});

describe('רשומת B ישנה עם הפרפר ההפוך ב-B5', () => {
  it('נטענת ומוצגת בלי שגיאה: השורה במקומה עם הנתונים; החתירה בחבל שורה ריקה אחריה עם המשקל הפותח מההיסטוריה שלה; הפרפר ההפוך לא "דולג"', () => {
    const r = parseWorkouts(ALL);
    expect(r.rejected).toEqual([]);
    expect(r.ok).toEqual(ALL);
    const rows = exercisesFor(B_OCT17, ALL);
    expect(ids(rows)).toEqual([WARMUP_ID, 'barbell-rdl', 'seated-cable-row', 'pec-deck', 'leg-curl', REVERSE_PEC_DECK, 'db-supinated-curl', 'triceps-pushdown', 'floor-leg-raise', B5, FINISHER_ID]);
    const rpd = rows.find((x) => x.exerciseId === REVERSE_PEC_DECK)!;
    expect(rpd).toMatchObject({ n: 'הרחקה אופקית- מכונת פרפר', targetRepMin: 15, targetRepMax: 20, rir: 2 });
    expect(rpd.sets).toEqual([{ weight: 30, reps: 20, seconds: null }, { weight: 30, reps: 20, seconds: null }, { weight: 30, reps: 20, seconds: null }]);
    expect(hasData(rpd)).toBe(true);
    const b5 = rows.find((x) => x.exerciseId === B5)!;
    expect(hasData(b5)).toBe(false);
    expect(b5.sets).toHaveLength(3);
    expect(b5.sets.every((s) => s.weight === 20 && s.reps === null)).toBe(true);
    expect(ids(skippedExercises(B_OCT17))).not.toContain(B5);
    expect(ids(skippedExercises(B_OCT17))).not.toContain(REVERSE_PEC_DECK);
  });

  it('הסיכום השבועי והדוח: שורת הפרפר ההפוך עם ההצעה שלה (RIR 2 → דרגה אחת, R1), בלי שורה לחתירה בחבל באימון הזה ובלי "דולגו"', () => {
    const db = { ...emptyDb(), workouts: ALL };
    const text = buildWeeklySummary(db, '2026-10-17');
    expect(text).toContain('פרפר הפוך 30×20,20,20 · RIR 2 · הבא: דרגה אחת למעלה · 15 חזרות (R1)');
    const report = buildChatReport(db, '2026-10-11', '2026-10-17');
    expect(report).toContain('17/10 B — RDL מוט 40×10,10,10 · חתירת כבל 45×12,12,12 · פרפר 30×12,12,12 · כפיפת ברכיים 30×12,12,12 · פרפר הפוך 30×20,20,20 · כפיפת מרפקים 10×12,12 · פשיטת מרפקים 25×15,15 · הרמת רגליים 12,12,12');
    expect(report).not.toMatch(/דולגו/);
    expect(text).not.toMatch(/דולגו/);
  });

  it('סף ה-RIR עובר עם התא: רשומה ישנה של הפרפר ההפוך בתקרה עם RIR 1 מקבלת עכשיו R5 (סף 2 — אין תא מארח), לא R1 כמו כשהיה B5', () => {
    const old = wk('b-rir1', '2026-10-17', 'B', [{ ...le(REVERSE_PEC_DECK, 30, [20, 20, 20]), rir: 1 }]);
    const db = { ...emptyDb(), workouts: [old] };
    const line = buildWeeklySummaryData(db, '2026-10-11').workouts.items[0]!.lines[0]!;
    expect(line.suggestion).toMatchObject({ rule: 'R5', action: 'same', weight: 30, repTarget: 20 });
    expect(buildWeeklySummary(db, '2026-10-17')).toContain('פרפר הפוך 30×20,20,20 · RIR 1 · הבא: 30 ק״ג · 20 חזרות (R5)');
  });

  it('רשומה ישנה שבה B5 (אז הפרפר ההפוך) הוחלף להרחקה בפולי (swappedFrom: reverse-pec-deck) נטענת כמו שהיא; החתירה בחבל שורה ריקה אחריה', () => {
    const old = { ...le(CABLE, 25, [20, 20, 20]), swappedFrom: REVERSE_PEC_DECK, rir: 2 as const };
    const r = parseWorkouts([wk('b-swap', '2026-10-17', 'B', [old])]);
    expect(r.rejected).toEqual([]);
    expect(r.ok[0]?.ex[0]).toMatchObject({ exerciseId: CABLE, swappedFrom: REVERSE_PEC_DECK, targetRepMin: 15, targetRepMax: 20 });
    const all = [...FACE_PULL_ONLY, ...r.ok];
    const rows = exercisesFor(r.ok[0]!, all);
    // השורה שהוחלפה נשארת (יש בה נתון); כל תאי B החסרים ברשומה — ובהם B5 החתירה בחבל — שורות ריקות לפי סדר התוכנית
    expect(ids(rows)).toEqual([WARMUP_ID, CABLE, 'barbell-rdl', 'seated-cable-row', 'pec-deck', 'leg-curl', B5, 'db-supinated-curl', 'triceps-pushdown', 'floor-leg-raise', FINISHER_ID]);
    expect(rows[1]).toMatchObject({ swappedFrom: REVERSE_PEC_DECK });
    expect(rows[1]!.sets.map((x) => x.weight)).toEqual([25, 25, 25]);
    const b5 = rows.find((x) => x.exerciseId === B5)!;
    expect(hasData(b5)).toBe(false);
    expect(b5.sets.every((s) => s.weight === 20 && s.reps === null)).toBe(true);
    expect(ids(rows)).not.toContain(REVERSE_PEC_DECK);
    expect(exerciseHistory(all, CABLE).map((h) => h.d)).toEqual(['2026-10-17']);
    expect(exerciseHistory(all, B5)).toHaveLength(2);
    expect(ids(skippedExercises(r.ok[0]!))).toEqual([]);
  });
});

describe('"החלף" ב-B5 ומסך התרגיל', () => {
  it('"החלף" מציע רק את ההרחקה בפולי — בלי היסטוריה, סטים ריקים, יורשת 3×15–20; הסף של התא (RIR 1) חל על השורה שהוחלפה', () => {
    const slot = exerciseIn('B', B5)!;
    const alts = alternatesFor(B5);
    expect(alts.map((a) => a.id)).toEqual([CABLE]);
    const row = swapExercise(slot, alts[0]!, openingWeight(ALL, CABLE));
    expect(row).toMatchObject({ exerciseId: CABLE, n: 'הרחקה אופקית- פולי גובה כתף', swappedFrom: B5, targetRepMin: 15, targetRepMax: 20 });
    expect(row.sets).toHaveLength(3);
    expect(row.sets.every((s) => s.weight === null)).toBe(true);
    expect(suggestNext(exerciseHistory(ALL, CABLE), { ...alts[0]!, sets: slot.sets })).toBeNull();
    const swapped = le(CABLE, 40, [20, 20, 20], { rir: 1, swappedFrom: B5 });
    const db = { ...emptyDb(), workouts: [wk('b', '2026-10-20', 'B', [swapped])] };
    expect(buildWeeklySummaryData(db, '2026-10-18').workouts.items[0]!.lines[0]!.suggestion).toMatchObject({ rule: 'R1', action: 'up', weight: 45, repTarget: 15 });
  });

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

  it('B5: קישור ▶ לסרטון, ההערה המלאה, "החלף" ו"דלג ואחזור"; החלופה היחידה — ההרחקה בפולי', () => {
    const spec = exerciseIn('B', B5)!;
    const options: AlternateOption[] = alternatesFor(B5).map((alt) => ({ spec: alt, last: lastExercise(ALL, alt.id) }));
    const out = html(spec, options);
    expect(out).toContain(`href="${B5_VIDEO}"`);
    expect(out).toContain('target="_blank"');
    expect(out).toContain('סרטון הדגמה — חתירה אופקית- חבל');
    expect(out).toContain(B5_NOTE);
    expect(out).toContain('>החלף<');
    expect(out).toContain('>דלג ואחזור<');
    expect(out).toContain('משקל — חתירה אופקית- חבל');
    expect(out).not.toContain(REVERSE_PEC_DECK_VIDEO);
    expect(out).not.toContain(REVERSE_PEC_DECK_NOTE);
    expect(options.map((o) => o.spec.id)).toEqual([CABLE]);
    expect(options[0]!.spec.videoUrl).toBe(CABLE_VIDEO);
    expect(options[0]!.last).toBeNull();
  });
});

describe('אחסון — בלי מפתח חדש ובלי מיגרציה', () => {
  it('התוכנית לא נשמרת במכשיר; המפתחות הקיימים לא השתנו', () => {
    expect(Object.keys(STORAGE_KEYS).sort()).toEqual(
      ['checkins', 'creatine', 'customFoods', 'days', 'entries', 'favorites', 'quarantine', 'settings', 'standaloneCardio', 'targets', 'waist', 'weights', 'workouts'].sort(),
    );
    for (const v of Object.values(STORAGE_KEYS)) {
      expect(v).toMatch(/^fatloss:/);
      expect(v).not.toMatch(/program|exercise|pec|face/);
    }
  });
});
