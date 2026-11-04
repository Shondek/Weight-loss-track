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
 *
 * 4/11/2026 — B5 → ההרחקה בפולי (`cable-reverse-fly`) עצמה, בלי חלופות; החתירה
 * בחבל (`face-pull`) שוב במאגר — אותו מזהה, מפרט, הערה וסרטון — ואינה חלופה של
 * אף תא; B7 → פשיטת מרפקים במוט (`cable-bar-pushdown`). programUpdate20261104.test.ts.
 * מה שנשאר מ-20/10 ונבדק כאן: הפרפר ההפוך במאגר בלי תא, ההיסטוריה של שלושת
 * המזהים נפרדת ושלמה, רשומות ישנות נטענות כמו שהן, אין מפתח אחסון חדש.
 * ההנחות שהשתנו ב-4/11 מסומנות.
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
/** 4/11/2026: ההערה החדשה של ההרחקה בפולי כתא B5. */
const CABLE_NOTE = 'הגלגלות בגובה הכתף. עומדים באמצע העמדה, יד ימין אוחזת בכבל השמאלי ויד שמאל בימני — הכבלים מצטלבים לפני החזה. פותחים את הידיים לצדדים בקשת רחבה עד קו הגוף, לא מעבר. מרפקים מעט כפופים וקבועים — פתיחה, לא חתירה. הכתפיים לא עולות לאוזניים, בלי תנופה מהגב. משקל קל, חזרה איטית. עמדה תפוסה → דלג ואחזור.';

// 4/11/2026: B5 הרחקה בפולי, B7 פשיטת מרפקים במוט
const B_ORDER = ['barbell-rdl', 'seated-cable-row', 'pec-deck', 'leg-curl', CABLE, 'db-supinated-curl', 'cable-bar-pushdown', 'floor-leg-raise'];

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
  it('המפרט של החתירה בחבל (B5 מ-20/10 עד 4/11/2026): 3×15–20, בידוד, step 5, ההערה מ-20/10 מילה במילה, אותו סרטון — מ-4/11/2026 במאגר (סף 2), לא בפרושים, לא חלופה של אף תא', () => {
    const b5 = exerciseById(B5)!;
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
      // 4/11/2026: במאגר אין effort → סף 2
      effort: null,
      step: 5,
      mode: 'progress',
      bodyweightStart: false,
      bodyweightOnly: false,
      isTimed: false,
      unilateral: false,
      assisted: false,
      note: B5_NOTE,
      videoUrl: B5_VIDEO,
      alternates: [],
    });
    // 4/11/2026: B5 הוא ההרחקה בפולי
    expect(PROGRAM.B[4]!.id).toBe(CABLE);
    expect(exerciseIn('B', B5)).toBeUndefined();
    expect(PROGRAM.B.map((e) => e.id)).toEqual(B_ORDER);
    expect(ALTERNATES.filter((a) => a.id === B5)).toHaveLength(1);
    expect(RETIRED.some((r) => r.id === B5)).toBe(false);
    expect(rirThreshold(b5.effort)).toBe(2);
    // החתירה בחבל אינה חלופה של אף תא (החלטה קבועה מ-16/10)
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
    expect(exerciseById(B5)!.step).toBe(5);
  });

  it('אימון B: 8 תאים, 22 סטים; סדר התרגילים לא זז פרט לתא B5 (ומ-4/11/2026 B7); לכל התאים סרטון', () => {
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

  it('ההרחקה בפולי: עד 4/11/2026 החלופה היחידה של B5; מ-4/11/2026 התא B5 עצמו — אותו מזהה, 3×15–20, RIR 1, step 5, אותו סרטון, הערה חדשה, בלי חלופות; ההרחקה עם משקולות יד במאגר בלי תא', () => {
    expect(alternatesFor(B5)).toEqual([]);
    expect(alternatesFor(CABLE)).toEqual([]);
    expect(exerciseIn('B', CABLE)).toMatchObject({ id: CABLE, name: 'הרחקה אופקית- פולי גובה כתף', sets: 3, repRangeMin: 15, repRangeMax: 20, effort: 'RIR 1', step: 5, note: CABLE_NOTE, videoUrl: CABLE_VIDEO, alternates: [] });
    expect(exerciseById(CABLE)).toBe(exerciseIn('B', CABLE));
    expect(ALTERNATES.some((a) => a.id === CABLE)).toBe(false);
    expect(exerciseById(DB_FLY)).toMatchObject({ id: DB_FLY, name: 'הרחקה אופקית עם משקולות יד', sets: 3, repRangeMin: 15, repRangeMax: 20, step: 2.5, note: null, videoUrl: null });
    for (const t of WORKOUT_TYPES) {
      expect(exerciseIn(t, CABLE) === undefined, t).toBe(t !== 'B');
      expect(exerciseIn(t, DB_FLY)).toBeUndefined();
      for (const e of PROGRAM[t]) expect(e.alternates, e.id).not.toContain(DB_FLY);
    }
  });

  it('אין מזהה כפול: כל מזהה פעם אחת בתוכנית+מאגר (פרט לתאים שחוזרים בכוונה ב-A/B/C/D); גודל המאגר', () => {
    const program = WORKOUT_TYPES.flatMap((t) => PROGRAM[t].map((e) => e.id));
    const pool = ALTERNATES.map((a) => a.id);
    // אותו מזהה בכמה אימונים — תאים שחוזרים בכוונה (לג-פרס, כפיפת ברכיים; מ-4/11/2026 פשיטת מרפקים במוט ב-B/C/D במקום החבל ב-B/C)
    const repeated = program.filter((id, i) => program.indexOf(id) !== i);
    expect([...new Set(repeated)].sort()).toEqual(['cable-bar-pushdown', 'leg-curl', 'leg-press']);
    expect(new Set(pool).size).toBe(pool.length);
    for (const id of pool) expect(program, id).not.toContain(id);
    for (const id of pool) expect(RETIRED.some((r) => r.id === id), id).toBe(false);
    // 25/10/2026: אימון D — ארבעה מזהים עברו מהמאגר לתוכנית (38 → 34) ו-D4 חדש (58 → 59)
    // 4/11/2026: החתירה בחבל והפשיטה בחבל למאגר, ההרחקה בפולי לתוכנית (34 → 35); אותם 59 מזהים
    expect(pool).toHaveLength(35);
    expect(new Set([...program, ...pool]).size - 1).toBe(59);
  });
});

describe('ההיסטוריה של החתירה בחבל — שלמה גם אחרי 4/11/2026', () => {
  it('B חדש: B5 הוא ההרחקה בפולי בלי היסטוריה → בלי משקל פותח; המשקל הפותח (20) וההצעה (R4) של החתירה בחבל נשארים שלה, לפי המזהה', () => {
    const rows = prefilledExercises(FACE_PULL_ONLY, 'B');
    expect(ids(rows)).toEqual([WARMUP_ID, ...B_ORDER, FINISHER_ID]);
    const b5 = rows[5]!;
    expect(b5).toMatchObject({ exerciseId: CABLE, n: 'הרחקה אופקית- פולי גובה כתף', targetRepMin: 15, targetRepMax: 20, type: 'isolation', bodyweightOnly: false });
    expect(b5.sets).toHaveLength(3);
    expect(b5.sets.every((s) => s.weight === null && s.reps === null && s.seconds === null)).toBe(true);
    const h = exerciseHistory(FACE_PULL_ONLY, B5);
    expect(h.map((x) => x.d)).toEqual(['2026-10-06', '2026-10-13']);
    expect(openingWeight(FACE_PULL_ONLY, B5)).toBe(20);
    expect(suggestNext(h, exerciseById(B5)!)).toMatchObject({ action: 'same', weight: 20, rule: 'R4', repTarget: 22, basisWeight: 20 });
  });

  it('סף RIR: עד 4/11/2026 התא (1) — תקרה 40×20,20,20 עם RIR 1 → R1; מ-4/11/2026 במאגר, בלי תא → סף 2 → R5 (כמו הפרפר ההפוך ב-20/10)', () => {
    const all = [wk('b-fp', '2026-10-13', 'B', [{ ...le(B5, 40, [20, 20, 20]), rir: 1 }])];
    expect(suggestNext(exerciseHistory(all, B5), exerciseById(B5)!)).toMatchObject({ action: 'same', weight: 40, rule: 'R5', repTarget: 20, basisWeight: 40 });
    expect(suggestNext(exerciseHistory(all, B5), { ...exerciseById(B5)!, effort: 'RIR 1' })).toMatchObject({ action: 'up', weight: 45, rule: 'R1', repTarget: 15 });
    const db = { ...emptyDb(), workouts: all };
    expect(buildWeeklySummary(db, '2026-10-13')).toContain('חתירה אופקית חבל 40×20,20,20 · RIR 1 · הבא: 40 ק״ג · 20 חזרות (R5)');
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
  it('נטענת ומוצגת בלי שגיאה: השורה במקומה עם הנתונים; התאים החסרים (מ-4/11/2026: B5 הרחקה בפולי ו-B7 פשיטה במוט) שורות ריקות אחריה; הפרפר ההפוך לא "דולג"', () => {
    const r = parseWorkouts(ALL);
    expect(r.rejected).toEqual([]);
    expect(r.ok).toEqual(ALL);
    const rows = exercisesFor(B_OCT17, ALL);
    expect(ids(rows)).toEqual([WARMUP_ID, 'barbell-rdl', 'seated-cable-row', 'pec-deck', 'leg-curl', REVERSE_PEC_DECK, 'db-supinated-curl', 'triceps-pushdown', 'floor-leg-raise', CABLE, 'cable-bar-pushdown', FINISHER_ID]);
    const rpd = rows.find((x) => x.exerciseId === REVERSE_PEC_DECK)!;
    expect(rpd).toMatchObject({ n: 'הרחקה אופקית- מכונת פרפר', targetRepMin: 15, targetRepMax: 20, rir: 2 });
    expect(rpd.sets).toEqual([{ weight: 30, reps: 20, seconds: null }, { weight: 30, reps: 20, seconds: null }, { weight: 30, reps: 20, seconds: null }]);
    expect(hasData(rpd)).toBe(true);
    const b5 = rows.find((x) => x.exerciseId === CABLE)!;
    expect(hasData(b5)).toBe(false);
    expect(b5.sets).toHaveLength(3);
    expect(b5.sets.every((s) => s.weight === null && s.reps === null)).toBe(true);
    expect(ids(rows)).not.toContain(B5);
    expect(ids(skippedExercises(B_OCT17))).toEqual([]);
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

  it('רשומה ישנה שבה B5 (אז הפרפר ההפוך) הוחלף להרחקה בפולי (swappedFrom: reverse-pec-deck) נטענת כמו שהיא; מ-4/11/2026 ההרחקה בפולי היא התא B5 — השורה שהוחלפה נשארת עם הנתונים ותא B5 מתווסף ריק אחריה (אותו מזהה פעמיים); בלי שורה לחתירה בחבל', () => {
    const old = { ...le(CABLE, 25, [20, 20, 20]), swappedFrom: REVERSE_PEC_DECK, rir: 2 as const };
    const r = parseWorkouts([wk('b-swap', '2026-10-17', 'B', [old])]);
    expect(r.rejected).toEqual([]);
    expect(r.ok[0]?.ex[0]).toMatchObject({ exerciseId: CABLE, swappedFrom: REVERSE_PEC_DECK, targetRepMin: 15, targetRepMax: 20 });
    const all = [...FACE_PULL_ONLY, ...r.ok];
    const rows = exercisesFor(r.ok[0]!, all);
    // השורה שהוחלפה נשארת (יש בה נתון) ותופסת את התא שממנו הוחלפה — הפרפר ההפוך, שכבר אינו תא; לכן כל תאי B החסרים ברשומה — ובהם B5 (ההרחקה בפולי, אותו מזהה) — שורות ריקות לפי סדר התוכנית, כמו ב-20/10
    expect(ids(rows)).toEqual([WARMUP_ID, CABLE, 'barbell-rdl', 'seated-cable-row', 'pec-deck', 'leg-curl', CABLE, 'db-supinated-curl', 'cable-bar-pushdown', 'floor-leg-raise', FINISHER_ID]);
    const swapped = rows[1]!;
    expect(swapped).toMatchObject({ swappedFrom: REVERSE_PEC_DECK });
    expect(swapped.sets.map((x) => x.weight)).toEqual([25, 25, 25]);
    expect(hasData(swapped)).toBe(true);
    expect(rows[6]!.swappedFrom).toBeUndefined();
    expect(hasData(rows[6]!)).toBe(false);
    expect(ids(rows)).not.toContain(B5);
    expect(ids(rows)).not.toContain(REVERSE_PEC_DECK);
    expect(exerciseHistory(all, CABLE).map((h) => h.d)).toEqual(['2026-10-17']);
    expect(exerciseHistory(all, B5)).toHaveLength(2);
    expect(ids(skippedExercises(r.ok[0]!))).toEqual([]);
  });
});

describe('"החלף" ב-B5 ומסך התרגיל', () => {
  it('"החלף" ב-B5: עד 4/11/2026 הציע רק את ההרחקה בפולי; מ-4/11/2026 היא התא עצמו, בלי חלופות; שורה ישנה שהוחלפה מהחתירה בחבל להרחקה בפולי (RIR 1 בתקרה) עדיין מקבלת R1 — הסף של ההרחקה בפולי הוא 1', () => {
    const slot = exerciseIn('B', CABLE)!;
    expect(alternatesFor(CABLE, 'B')).toEqual([]);
    expect(alternatesFor(B5)).toEqual([]);
    expect(suggestNext(exerciseHistory(ALL, CABLE), slot)).toBeNull();
    const swapped = le(CABLE, 40, [20, 20, 20], { rir: 1, swappedFrom: B5 });
    const db = { ...emptyDb(), workouts: [wk('b', '2026-10-20', 'B', [swapped])] };
    expect(buildWeeklySummaryData(db, '2026-10-18').workouts.items[0]!.lines[0]!.suggestion).toMatchObject({ rule: 'R1', action: 'up', weight: 45, repTarget: 15 });
    // "החלף" בכיוון ההפוך לא קיים: החתירה בחבל אינה חלופה של אף תא
    for (const t of WORKOUT_TYPES) for (const e of PROGRAM[t]) expect(e.alternates, `${t} ${e.id}`).not.toContain(B5);
    expect(swapExercise(slot, exerciseById(B5)!, openingWeight(ALL, B5))).toMatchObject({ exerciseId: B5, swappedFrom: CABLE, targetRepMin: 15, targetRepMax: 20 });
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

  it('B5 (4/11/2026 — הרחקה בפולי): קישור ▶ לסרטון, ההערה החדשה המלאה, "דלג ואחזור" בלי "החלף"; ההערה והסרטון של החתירה בחבל לא מופיעים', () => {
    const spec = exerciseIn('B', CABLE)!;
    const options: AlternateOption[] = alternatesFor(CABLE, 'B').map((alt) => ({ spec: alt, last: lastExercise(ALL, alt.id) }));
    const out = html(spec, options);
    expect(out).toContain(`href="${CABLE_VIDEO}"`);
    expect(out).toContain('target="_blank"');
    expect(out).toContain('סרטון הדגמה — הרחקה אופקית- פולי גובה כתף');
    expect(out).toContain(CABLE_NOTE);
    expect(out).not.toContain('>החלף<');
    expect(out).toContain('>דלג ואחזור<');
    expect(out).toContain('משקל — הרחקה אופקית- פולי גובה כתף');
    expect(out).not.toContain(B5_VIDEO);
    expect(out).not.toContain(B5_NOTE);
    expect(out).not.toContain(REVERSE_PEC_DECK_VIDEO);
    expect(out).not.toContain(REVERSE_PEC_DECK_NOTE);
    expect(options).toEqual([]);
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
