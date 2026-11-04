/**
 * עדכון תוכנית 4/11/2026: שלוש החלפות — שון לא מבצע נכון את שתי התנועות בחבל.
 *
 * B5 → הרחקה אופקית בפולי (`cable-reverse-fly` — המזהה הקיים מהמאגר, היה החלופה
 * היחידה של B5): 3×15–20, RIR 1, step 5, אותו סרטון, הערת ביצוע חדשה, **בלי חלופות**
 * (תפוס = "דלג ואחזור"). החתירה בחבל (`face-pull`) עברה מהתוכנית למאגר — אותו מזהה,
 * מפרט, הערה, סרטון והיסטוריה — ואינה חלופה של אף תא (כמו ב-16/10, PR #22).
 *
 * B7 ו-C7 → פשיטת מרפקים במוט (`cable-bar-pushdown` — המזהה הקיים של D3 מ-25/10):
 * 2×12–15, RIR 1, step 5, אותו סרטון, הערת ביצוע חדשה; החלופות (`cable-kickback`,
 * `db-kickback`) ללא שינוי. D3: הטווח 10–15 → 12–15 (3 סטים, RIR 1 ללא שינוי) — טווח
 * אחד למזהה בשלושת התאים, כמו לג-פרס ב-A ו-C; ההיסטוריה וההצעה מחושבות מכל הסשנים
 * של המזהה בלי קשר לתא (PR #15). הפשיטה בחבל (`triceps-pushdown`) עברה מהתוכנית
 * למאגר — אותו מזהה, מפרט, סרטון והיסטוריה — ואינה חלופה של אף תא.
 *
 * החלופות של D3 נשארו ריקות: `alternatesFor` מקבל גם את סוג האימון, כי זו הפעם
 * הראשונה שאותו מזהה יושב בתאים עם רשימות חלופות שונות (B7/C7 עם, D3 בלי).
 *
 * snapshot ההצעות: `cable-bar-pushdown` — רק מה שנובע מ-10–15 → 12–15 (8 תרחישים,
 * היעד/הרצפה 10 → 12); `face-pull` ו-`triceps-pushdown` — בשני תרחישי ה-RIR 1 בלבד
 * R1 → R5 (מאגר = סף 2, כמו `reverse-pec-deck` ב-20/10); `cable-reverse-fly` — אפס
 * שורות (RIR 1 כבר היה הסף שלה דרך B5). אפס שורות מחוץ לארבעת המזהים.
 *
 * רשומה ישנה שבה B5 הוחלף להרחקה בפולי (swappedFrom: face-pull) נטענת כמו שהיא;
 * בעריכה השורה שהוחלפה תופסת את התא שממנו הוחלפה — שכבר אינו תא — ולכן תא B5
 * (ההרחקה בפולי) מתווסף אחריה כשורה ריקה: אותו מזהה פעמיים, עם הנתונים ובלי. זה
 * אותו מנגנון כמו ב-20/10 לשורה שהוחלפה מהפרפר ההפוך (programUpdate20261020.test.ts).
 *
 * אין מיגרציה ואין מפתח אחסון חדש.
 */
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { emptyDb, type WorkoutType } from '../../types';
import { ALTERNATES, EXERCISE_ALIASES, PROGRAM, RETIRED, WORKOUT_TYPES, alternatesFor, exerciseById, exerciseIn, resolveExerciseId, type Exercise } from '../../data/program';
import { rirThreshold, suggestNext } from '../progression';
import { FINISHER_ID, WARMUP_ID, blankLoggedExercise, exerciseHistory, exercisesFor, hasData, lastExercise, openingWeight, prefilledExercises, skippedExercises, swapExercise } from '../workouts';
import { parseWorkouts } from '../schema';
import { buildWeeklySummary, buildWeeklySummaryData } from '../weeklySummary';
import { buildChatReport } from '../exportText';
import { STORAGE_KEYS } from '../store';
import ExerciseFocus, { type AlternateOption } from '../../components/ExerciseFocus';
import { le, wk } from './helpers';

const CABLE = 'cable-reverse-fly';
const FACE_PULL = 'face-pull';
const BAR = 'cable-bar-pushdown';
const ROPE = 'triceps-pushdown';
const KICKBACKS = ['cable-kickback', 'db-kickback'];
const CABLE_VIDEO = 'https://drive.google.com/file/d/1-fJHu5tp9fL4o9Trs-KTPSQQsD4Z0cW3/view?usp=drive_link';
const FACE_PULL_VIDEO = 'https://drive.google.com/file/d/1FIt-HIDn_y2lMc-UjVUR0BDZiHHStjg1/view?usp=drive_link';
const BAR_VIDEO = 'https://drive.google.com/file/d/1DkANomsaOj1PYVMH5gIiQ0dp2irQ5XbS/view?usp=drive_link';
const ROPE_VIDEO = 'https://drive.google.com/file/d/1SQCZVCe3hSpqMZHGTp9fIsE0ZJvZ0R3p/view?usp=drive_link';
const CABLE_NOTE =
  'הגלגלות בגובה הכתף. עומדים באמצע העמדה, יד ימין אוחזת בכבל השמאלי ויד שמאל בימני — הכבלים מצטלבים לפני החזה. פותחים את הידיים לצדדים בקשת רחבה עד קו הגוף, לא מעבר. מרפקים מעט כפופים וקבועים — פתיחה, לא חתירה. הכתפיים לא עולות לאוזניים, בלי תנופה מהגב. משקל קל, חזרה איטית. עמדה תפוסה → דלג ואחזור.';
const FACE_PULL_NOTE =
  'הגלגלת בגובה הפנים, לא מעל הראש. צעד אחורה, כך שהמשקל לא נוחת בין החזרות. מושכים את מרכז החבל לכיוון העיניים ומפרידים את הידיים — בסוף הן ליד האוזניים והאגרופים פונים לאחור. מרפקים בגובה הכתף, לא מעל. השכמות נאספות, הכתפיים לא עולות. בלי להישען אחורה. משקל קל, חזרה איטית.';
const BAR_NOTE = 'מרפקים צמודים לגוף ולא זזים קדימה — רק האמה זזה. נעילה למטה בלי להישען מעל המוט. חזרה איטית עד שהאמה בערך מקבילה לרצפה.';

const A_ORDER = ['leg-press', 'smith-bench-press', 'lat-pulldown', 'leg-extension', 'leg-curl', 'back-extension', 'db-lateral-raise-seated', 'plank'];
const B_ORDER = ['barbell-rdl', 'seated-cable-row', 'pec-deck', 'leg-curl', CABLE, 'db-supinated-curl', BAR, 'floor-leg-raise'];
const C_ORDER = ['machine-hip-abduction', 'machine-row', 'smith-incline-bench-press', 'leg-press', 'db-lateral-raise-standing', 'ez-bar-preacher-curl', BAR, 'cable-torso-rotation'];
const D_ORDER = ['cable-low-fly', 'db-hammer-curl', BAR, 'bench-reverse-crunch', 'cable-single-arm-lateral-raise'];

const ids = (list: { exerciseId: string }[]) => list.map((e) => e.exerciseId);

/** היסטוריה לדוגמה: B ישן עם החתירה בחבל והפשיטה בחבל, C ישן עם הפשיטה בחבל, D עם הפשיטה במוט (10–15 אז). */
const B_OCT27 = wk('b-1027', '2026-10-27', 'B', [
  { ...le('barbell-rdl', 40, [10, 10, 10]), rir: 3 },
  le('seated-cable-row', 45, [12, 12, 12]),
  le('pec-deck', 30, [12, 12, 12]),
  le('leg-curl', 30, [12, 12, 12]),
  { ...le(FACE_PULL, 40, [20, 20, 20]), rir: 1 },
  le('db-supinated-curl', 10, [12, 12]),
  { ...le(ROPE, 40, [15, 15]), rir: 1 },
  le('floor-leg-raise', null, [12, 12, 12]),
]);
const C_OCT29 = wk('c-1029', '2026-10-29', 'C', [
  { ...le('machine-hip-abduction', 35, [20, 20, 20]), rir: 1 },
  { ...le('machine-row', 40, [12, 12, 12]), rir: 2 },
  { ...le('smith-incline-bench-press', 30, [12, 12, 12]), rir: 2 },
  { ...le('leg-press', 80, [12, 12, 12]), rir: 2 },
  { ...le('db-lateral-raise-standing', 7.5, [15, 15, 15]), rir: 1 },
  { ...le('ez-bar-preacher-curl', 15, [15, 15]), rir: 1 },
  { ...le(ROPE, 40, [15, 15]), rir: 2 },
  { ...le('cable-torso-rotation', 20, [15, 15, 15]), rir: 1 },
]);
const D_OCT30 = wk('d-1030', '2026-10-30', 'D', [{ ...le(BAR, 30, [12, 12, 12]), rir: 1, targetRepMin: 10 }]);
const ALL = [B_OCT27, C_OCT29, D_OCT30];

const sess = (id: string, d: string, weight: number | null, values: number[], rir?: 0 | 1 | 2 | 3 | 4) => ({ d, ex: rir === undefined ? le(id, weight, values) : { ...le(id, weight, values), rir } });

describe('1. B5 — הרחקה אופקית בפולי (cable-reverse-fly)', () => {
  it('המפרט: חמישי ב-B, 3×15–20, RIR 1 (סף 1), בידוד, step 5, ההערה החדשה מילה במילה, הסרטון הקיים; בלי חלופות; לא במאגר ולא בפרושים', () => {
    const b5 = exerciseIn('B', CABLE)!;
    expect(b5).toMatchObject({
      id: CABLE,
      name: 'הרחקה אופקית- פולי גובה כתף',
      short: 'הרחקה בפולי',
      machine: 'Cable',
      muscle: 'shoulders',
      muscles: ['כתף אחורית'],
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
      note: CABLE_NOTE,
      videoUrl: CABLE_VIDEO,
      alternates: [],
    });
    expect(PROGRAM.B[4]).toBe(b5);
    expect(exerciseById(CABLE)).toBe(b5);
    expect(rirThreshold(b5.effort)).toBe(1);
    expect(alternatesFor(CABLE)).toEqual([]);
    expect(alternatesFor(CABLE, 'B')).toEqual([]);
    expect(ALTERNATES.some((a) => a.id === CABLE)).toBe(false);
    expect(RETIRED.some((r) => r.id === CABLE)).toBe(false);
    for (const t of WORKOUT_TYPES) {
      expect(exerciseIn(t, CABLE) === undefined, t).toBe(t !== 'B');
      for (const e of PROGRAM[t]) expect(e.alternates, `${t} ${e.id}`).not.toContain(CABLE);
    }
    expect(resolveExerciseId('הרחקה אופקית- פולי גובה כתף')).toBe(CABLE);
    // אותו ייצוג ריק כמו בתאי D
    for (const e of PROGRAM.D) expect(e.alternates, e.id).toEqual([]);
  });

  it('החתירה בחבל במאגר: אותו מזהה, שם, 3×15–20, step 5, ההערה והסרטון שהיו לה ב-B5 — פעם אחת; לא בתוכנית, לא בפרושים, לא חלופה של אף תא; השמות הישנים נפתרים אליה', () => {
    const fp = exerciseById(FACE_PULL)!;
    expect(fp).toMatchObject({
      id: FACE_PULL,
      name: 'חתירה אופקית- חבל',
      short: 'חתירה אופקית חבל',
      machine: 'Cable Rope',
      muscle: 'shoulders',
      muscles: ['כתף אחורית', 'סובבי כתף'],
      type: 'isolation',
      sets: 3,
      repRangeMin: 15,
      repRangeMax: 20,
      step: 5,
      note: FACE_PULL_NOTE,
      videoUrl: FACE_PULL_VIDEO,
      mode: 'progress',
      alternates: [],
    });
    expect(ALTERNATES.filter((a) => a.id === FACE_PULL)).toHaveLength(1);
    expect(RETIRED.some((r) => r.id === FACE_PULL)).toBe(false);
    for (const t of WORKOUT_TYPES) {
      expect(exerciseIn(t, FACE_PULL)).toBeUndefined();
      for (const e of PROGRAM[t]) expect(e.alternates, `${t} ${e.id}`).not.toContain(FACE_PULL);
    }
    expect(alternatesFor(FACE_PULL)).toEqual([]);
    expect(resolveExerciseId('חתירה אופקית- חבל')).toBe(FACE_PULL);
    expect(EXERCISE_ALIASES['פייס פול']).toBe(FACE_PULL);
    expect(resolveExerciseId('פייס פול')).toBe(FACE_PULL);
    // הפרפר ההפוך וההרחקה עם משקולות יד — במאגר בלי תא, כמו קודם
    for (const id of ['reverse-pec-deck', 'db-reverse-fly']) {
      expect(ALTERNATES.filter((a) => a.id === id), id).toHaveLength(1);
      for (const t of WORKOUT_TYPES) for (const e of PROGRAM[t]) expect(e.alternates, `${t} ${e.id}`).not.toContain(id);
    }
  });
});

describe('2. B7, C7, D3 — פשיטת מרפקים במוט (cable-bar-pushdown)', () => {
  it('שלושת התאים: אותו מזהה, 12–15 ו-RIR 1 (סף 1) בכולם; 2/2/3 סטים; step 5; אותה הערה חדשה ואותו סרטון; חלופות B7/C7 — קיקבק בפולי וקיקבק מ.יד; D3 בלי', () => {
    const cells: [WorkoutType, number, number, string[]][] = [
      ['B', 6, 2, KICKBACKS],
      ['C', 6, 2, KICKBACKS],
      ['D', 2, 3, []],
    ];
    for (const [t, i, sets, alts] of cells) {
      const e = exerciseIn(t, BAR)!;
      expect(PROGRAM[t][i], t).toBe(e);
      expect(e, t).toMatchObject({
        id: BAR,
        name: 'פשיטת מרפקים- פולי עליון מוט',
        short: 'פשיטת מרפקים מוט',
        machine: 'Cable Bar',
        muscle: 'triceps',
        muscles: ['טרייספס'],
        type: 'isolation',
        sets,
        reps: '12-15',
        repRangeMin: 12,
        repRangeMax: 15,
        effort: 'RIR 1',
        step: 5,
        mode: 'progress',
        bodyweightStart: false,
        bodyweightOnly: false,
        unilateral: false,
        note: BAR_NOTE,
        videoUrl: BAR_VIDEO,
        alternates: alts,
      });
      expect(rirThreshold(e.effort), t).toBe(1);
      expect(alternatesFor(BAR, t).map((a) => a.id), t).toEqual(alts);
    }
    // הזהות זהה בשלושת התאים — רק הסטים שונים
    const { sets: _b, alternates: _ba, ...b7 } = exerciseIn('B', BAR)!;
    const { sets: _c, alternates: _ca, ...c7 } = exerciseIn('C', BAR)!;
    const { sets: _d, alternates: _da, ...d3 } = exerciseIn('D', BAR)!;
    expect(b7).toEqual(c7);
    expect(b7).toEqual(d3);
    expect(alternatesFor(BAR).map((a) => a.id)).toEqual(KICKBACKS);
    expect(alternatesFor(BAR, 'B').map((a) => a.name)).toEqual(['פשיטת מרפק- פולי עליון קיקבק', 'קיק בק- משקולות יד']);
    expect(ALTERNATES.some((a) => a.id === BAR)).toBe(false);
    expect(RETIRED.some((r) => r.id === BAR)).toBe(false);
    expect(resolveExerciseId('פשיטת מרפקים- פולי עליון מוט')).toBe(BAR);
  });

  it('הפשיטה בחבל במאגר: אותו מזהה, שם, 2×12–15, step 5, בלי הערה, אותו סרטון — פעם אחת; לא בתוכנית, לא בפרושים, לא חלופה של אף תא', () => {
    const rope = exerciseById(ROPE)!;
    expect(rope).toMatchObject({
      id: ROPE,
      name: 'פשיטת מרפקים- פולי עליון חבל',
      short: 'פשיטת מרפקים',
      machine: 'Cable Rope',
      muscle: 'triceps',
      muscles: ['טרייספס'],
      type: 'isolation',
      sets: 2,
      repRangeMin: 12,
      repRangeMax: 15,
      step: 5,
      note: null,
      videoUrl: ROPE_VIDEO,
      mode: 'progress',
      alternates: [],
    });
    expect(ALTERNATES.filter((a) => a.id === ROPE)).toHaveLength(1);
    expect(RETIRED.some((r) => r.id === ROPE)).toBe(false);
    for (const t of WORKOUT_TYPES) {
      expect(exerciseIn(t, ROPE)).toBeUndefined();
      for (const e of PROGRAM[t]) expect(e.alternates, `${t} ${e.id}`).not.toContain(ROPE);
    }
    expect(alternatesFor(ROPE)).toEqual([]);
    expect(resolveExerciseId('פשיטת מרפקים- פולי עליון חבל')).toBe(ROPE);
    // החלופות עצמן לא השתנו
    expect(exerciseById('cable-kickback')).toMatchObject({ sets: 2, repRangeMin: 12, repRangeMax: 15, step: 5, unilateral: true });
    expect(exerciseById('db-kickback')).toMatchObject({ sets: 2, repRangeMin: 12, repRangeMax: 15, step: 2.5, unilateral: true });
  });

  it('alternatesFor עם סוג האימון: לג-פרס וכפיפת ברכיים — אותה רשימה בכל תא כמו קודם; שורה שהוחלפה או מזהה שאינו תא באימון הזה → המופע הראשון בתוכנית', () => {
    expect(alternatesFor('leg-press', 'A')).toEqual(alternatesFor('leg-press', 'C'));
    expect(alternatesFor('leg-press', 'C')).toEqual(alternatesFor('leg-press'));
    expect(alternatesFor('leg-curl', 'A').map((a) => a.id)).toEqual(['lying-leg-curl', 'single-leg-curl']);
    expect(alternatesFor('leg-curl', 'B').map((a) => a.id)).toEqual(['lying-leg-curl', 'single-leg-curl']);
    expect(alternatesFor(BAR, 'A').map((a) => a.id)).toEqual(KICKBACKS);
    expect(alternatesFor('cable-kickback', 'B')).toEqual([]);
    expect(alternatesFor('hack-squat', 'A')).toEqual([]);
  });
});

describe('3. התוכנית כולה: רק B5, B7, C7 ו-D3 השתנו', () => {
  it('A/B/C/D: סדר, מזהים, סטים, טווחים, RIR, step, mode וחלופות', () => {
    const snap = (t: WorkoutType) => PROGRAM[t].map((e) => `${e.id}:${e.sets}x${e.repRangeMin}-${e.repRangeMax}:${e.effort}:${e.step}:${e.mode}:${e.alternates.join(',')}`);
    expect(PROGRAM.A.map((e) => e.id)).toEqual(A_ORDER);
    expect(PROGRAM.B.map((e) => e.id)).toEqual(B_ORDER);
    expect(PROGRAM.C.map((e) => e.id)).toEqual(C_ORDER);
    expect(PROGRAM.D.map((e) => e.id)).toEqual(D_ORDER);
    expect(snap('A')).toEqual([
      'leg-press:3x10-12:RIR 2:5:progress:hack-squat,machine-squat,goblet-squat',
      'smith-bench-press:3x8-12:RIR 2:5:progress:db-bench-press,machine-chest-press,barbell-bench-press',
      'lat-pulldown:3x10-12:RIR 2:5:progress:lat-pulldown-close,lat-pulldown-wide-studio,assisted-pull-up',
      'leg-extension:2x12-15:RIR 1:null:progress:wall-sit',
      'leg-curl:2x10-12:RIR 1:null:progress:lying-leg-curl,single-leg-curl',
      'back-extension:3x12-15:RIR 2:2.5:progress:',
      'db-lateral-raise-seated:3x12-15:RIR 1:2.5:progress:db-lateral-raise-standing',
      'plank:3x60-60:null:2.5:maintain:side-plank-static,cable-crunch',
    ]);
    expect(snap('B')).toEqual([
      'barbell-rdl:3x8-10:RIR 3:5:progress:db-rdl,smith-hip-hinge',
      'seated-cable-row:3x10-12:RIR 2:5:progress:machine-row,t-bar-row,single-arm-cable-row',
      'pec-deck:3x10-12:RIR 2:null:progress:cable-fly',
      'leg-curl:3x10-12:RIR 2:null:progress:lying-leg-curl,single-leg-curl',
      'cable-reverse-fly:3x15-20:RIR 1:5:progress:',
      'db-supinated-curl:2x10-12:RIR 1:2.5:progress:cable-bar-curl,db-preacher-curl',
      'cable-bar-pushdown:2x12-15:RIR 1:5:progress:cable-kickback,db-kickback',
      'floor-leg-raise:3x10-15:RIR 1:null:reps:',
    ]);
    expect(snap('C')).toEqual([
      'machine-hip-abduction:3x15-20:RIR 1-2:null:progress:band-hip-abduction-standing,band-hip-abduction-seated',
      'machine-row:3x10-12:RIR 2:null:progress:db-single-arm-row,single-arm-cable-row,t-bar-row',
      'smith-incline-bench-press:3x8-12:RIR 2:5:progress:db-incline-bench-press',
      'leg-press:3x10-12:RIR 2:5:progress:hack-squat,machine-squat,goblet-squat',
      'db-lateral-raise-standing:3x12-15:RIR 1:2.5:progress:db-lateral-raise-seated',
      'ez-bar-preacher-curl:2x12-15:RIR 1:5:progress:cable-rope-curl',
      'cable-bar-pushdown:2x12-15:RIR 1:5:progress:cable-kickback,db-kickback',
      'cable-torso-rotation:3x12-15:RIR 1:5:progress:side-plank-static,side-bend',
    ]);
    expect(snap('D')).toEqual([
      'cable-low-fly:3x12-15:RIR 1:5:progress:',
      'db-hammer-curl:3x10-12:RIR 1:2.5:progress:',
      'cable-bar-pushdown:3x12-15:RIR 1:5:progress:',
      'bench-reverse-crunch:3x10-15:RIR 1:null:reps:',
      'cable-single-arm-lateral-raise:2x12-15:RIR 1:5:progress:',
    ]);
    // 22 סטים ב-B וב-C כמו קודם; לכל התאים סרטון
    expect(PROGRAM.B.reduce((n, e) => n + e.sets, 0)).toBe(22);
    expect(PROGRAM.C.reduce((n, e) => n + e.sets, 0)).toBe(22);
    for (const t of WORKOUT_TYPES) for (const e of PROGRAM[t]) expect(e.videoUrl, `${t}: ${e.id}`).toMatch(/^https:\/\/drive\.google\.com\/file\/d\//);
  });

  it('המאגר: 34 → 35 (החתירה בחבל והפשיטה בחבל נכנסו, ההרחקה בפולי יצאה); אותם 59 מזהים בסך הכול, אין כפילויות, אין מזהה חדש', () => {
    const program = WORKOUT_TYPES.flatMap((t) => PROGRAM[t].map((e) => e.id));
    const pool = ALTERNATES.map((a) => a.id);
    expect(pool).toHaveLength(35);
    expect(new Set(pool).size).toBe(35);
    expect(new Set(ALTERNATES.map((a) => a.name)).size).toBe(35);
    for (const id of pool) expect(program, id).not.toContain(id);
    for (const id of pool) expect(RETIRED.some((r) => r.id === id), id).toBe(false);
    expect(new Set([...program, ...pool]).size - 1).toBe(59);
    const repeated = program.filter((id, i) => program.indexOf(id) !== i);
    expect([...new Set(repeated)].sort()).toEqual([BAR, 'leg-curl', 'leg-press']);
    expect(program.filter((id) => id === BAR)).toHaveLength(3);
    expect(RETIRED).toHaveLength(17);
  });
});

describe('4. ההצעה לפשיטה במוט — סף 1 בכל אחד משלושת התאים, היסטוריה אחת למזהה', () => {
  it('תקרה 40×15 עם RIR 1 → R1 +5 (יעד 12) ב-B7, ב-C7 וב-D3; RIR 0 → R5; הרצפה 12: 40×12,12 → R6 (13)', () => {
    for (const t of ['B', 'C', 'D'] as const) {
      const cell = exerciseIn(t, BAR)!;
      const top = Array.from({ length: cell.sets }, () => 15);
      expect(suggestNext([sess(BAR, '2026-11-04', 40, top, 1)], cell), t).toMatchObject({ rule: 'R1', action: 'up', weight: 45, repTarget: 12 });
      expect(suggestNext([sess(BAR, '2026-11-04', 40, top, 0)], cell), t).toMatchObject({ rule: 'R5', action: 'same', weight: 40, repTarget: 15 });
      expect(suggestNext([sess(BAR, '2026-11-04', 40, Array.from({ length: cell.sets }, () => 12), 1)], cell), t).toMatchObject({ rule: 'R6', action: 'same', weight: 40, repTarget: 13 });
      expect(suggestNext([], cell), t).toBeNull();
    }
  });

  it('הסיכום השבועי: שורת הפשיטה במוט באימון B, C ו-D מקבלת R1 בתקרה עם RIR 1 (סף התא = 1)', () => {
    const db = emptyDb();
    db.workouts = [
      wk('b', '2026-11-02', 'B', [{ ...le(BAR, 40, [15, 15]), rir: 1 }]),
      wk('c', '2026-11-04', 'C', [{ ...le(BAR, 40, [15, 15]), rir: 1 }]),
      wk('d', '2026-11-06', 'D', [{ ...le(BAR, 40, [15, 15, 15]), rir: 1 }]),
    ];
    const data = buildWeeklySummaryData(db, '2026-11-01');
    for (const item of [...data.workouts.items, ...data.workouts.optional]) {
      expect(item.lines[0]!.suggestion, item.t).toMatchObject({ rule: 'R1', action: 'up', weight: 45, repTarget: 12 });
    }
    const text = buildWeeklySummary(db, '2026-11-01');
    expect(text).toContain('02/11 B\n  פשיטת מרפקים מוט 40×15,15 · RIR 1 · הבא: 45 ק״ג · 12 חזרות (R1)');
    expect(text).toContain('04/11 C\n  פשיטת מרפקים מוט 40×15,15 · RIR 1 · הבא: 45 ק״ג · 12 חזרות (R1)');
    // אימון D יחיד בשבוע: הכותרת "אימון D: dd/mm" ומיד השורות
    expect(text).toContain('אימון D: 06/11\n  פשיטת מרפקים מוט 40×15,15,15 · RIR 1 · הבא: 45 ק״ג · 12 חזרות (R1)');
  });

  it('היסטוריה אחת למזהה: סשן D ישן (10–15) מזין את המשקל הפותח ואת ההצעה של B7 ו-C7, ולהפך; ההיסטוריה של הפשיטה בחבל נפרדת', () => {
    expect(exerciseHistory(ALL, BAR).map((h) => h.d)).toEqual(['2026-10-30']);
    expect(openingWeight(ALL, BAR)).toBe(30);
    const rowsB = prefilledExercises(ALL, 'B');
    expect(ids(rowsB)).toEqual([WARMUP_ID, ...B_ORDER, FINISHER_ID]);
    expect(rowsB[7]).toMatchObject({ exerciseId: BAR, n: 'פשיטת מרפקים- פולי עליון מוט', targetRepMin: 12, targetRepMax: 15 });
    expect(rowsB[7]!.sets.map((s) => s.weight)).toEqual([30, 30]);
    const rowsC = prefilledExercises(ALL, 'C');
    expect(ids(rowsC)).toEqual([WARMUP_ID, ...C_ORDER, FINISHER_ID]);
    expect(rowsC[7]!.sets.map((s) => s.weight)).toEqual([30, 30]);
    const rowsD = prefilledExercises(ALL, 'D');
    expect(ids(rowsD)).toEqual([WARMUP_ID, ...D_ORDER, FINISHER_ID]);
    expect(rowsD[3]!.sets.map((s) => s.weight)).toEqual([30, 30, 30]);
    // ההצעה מהסשן הישן (30×12,12,12, RIR 1) לפי התא של היום (12–15): הרצפה → R6, 13
    for (const t of ['B', 'C', 'D'] as const) expect(suggestNext(exerciseHistory(ALL, BAR), exerciseIn(t, BAR)!), t).toMatchObject({ rule: 'R6', weight: 30, repTarget: 13 });
    // סשן חדש ב-B7 נכנס להיסטוריה של D3 ולהפך
    const b = wk('b-1104', '2026-11-04', 'B', [{ ...le(BAR, 30, [15, 15]), rir: 1 }]);
    expect(exerciseHistory([...ALL, b], BAR).map((h) => h.d)).toEqual(['2026-10-30', '2026-11-04']);
    expect(lastExercise([...ALL, b], BAR)?.d).toBe('2026-11-04');
    expect(prefilledExercises([...ALL, b], 'D')[3]!.sets.map((s) => s.weight)).toEqual([30, 30, 30]);
    // הפשיטה בחבל — היסטוריה משלה, לא עוברת למוט
    expect(exerciseHistory(ALL, ROPE).map((h) => h.d)).toEqual(['2026-10-27', '2026-10-29']);
    expect(openingWeight(ALL, ROPE)).toBe(40);
    // ההרחקה בפולי — בלי היסטוריה → B5 בלי משקל פותח; החתירה בחבל שומרת את שלה
    expect(rowsB[5]).toMatchObject({ exerciseId: CABLE, targetRepMin: 15, targetRepMax: 20 });
    expect(rowsB[5]!.sets.map((s) => s.weight)).toEqual([null, null, null]);
    expect(openingWeight(ALL, FACE_PULL)).toBe(40);
    expect(suggestNext(exerciseHistory(ALL, CABLE), exerciseIn('B', CABLE)!)).toBeNull();
  });
});

describe('5. רשומות ישנות — נטענות ומוצגות כמו היום', () => {
  it('הפרסר: B ישן עם החתירה בחבל והפשיטה בחבל, C ישן עם הפשיטה בחבל, D עם הפשיטה במוט (10–15) — בלי דחיות, שווים למקור', () => {
    const r = parseWorkouts(ALL);
    expect(r.rejected).toEqual([]);
    expect(r.ok).toEqual(ALL);
    // גם בפורמט הגולמי של האחסון
    const raw = {
      schemaVersion: 2,
      id: 'b-raw',
      d: '2026-10-20',
      t: 'B',
      ex: [
        { exerciseId: FACE_PULL, n: 'חתירה אופקית- חבל', sets: [{ weight: 20, reps: 20, seconds: null }], targetRepMin: 15, targetRepMax: 20, type: 'isolation', bodyweightOnly: false, assisted: false, rir: 1 },
        { exerciseId: ROPE, n: 'פשיטת מרפקים- פולי עליון חבל', sets: [{ weight: 25, reps: 15, seconds: null }], targetRepMin: 12, targetRepMax: 15, type: 'isolation', bodyweightOnly: false, assisted: false },
      ],
      knee: null,
      shoulder: null,
    };
    const r2 = parseWorkouts([raw]);
    expect(r2.rejected).toEqual([]);
    expect(r2.ok[0]?.ex.map((e) => e.exerciseId)).toEqual([FACE_PULL, ROPE]);
  });

  it('B ישן בעריכה: החתירה בחבל והפשיטה בחבל במקומן עם הנתונים; B5 (הרחקה בפולי) ו-B7 (פשיטה במוט) שורות ריקות אחריהן; לא "דולגו"', () => {
    const rows = exercisesFor(B_OCT27, ALL);
    expect(ids(rows)).toEqual([WARMUP_ID, 'barbell-rdl', 'seated-cable-row', 'pec-deck', 'leg-curl', FACE_PULL, 'db-supinated-curl', ROPE, 'floor-leg-raise', CABLE, BAR, FINISHER_ID]);
    const fp = rows.find((x) => x.exerciseId === FACE_PULL)!;
    expect(fp).toMatchObject({ n: 'חתירה אופקית- חבל', targetRepMin: 15, targetRepMax: 20, rir: 1 });
    expect(fp.sets.map((s) => s.weight)).toEqual([40, 40, 40]);
    expect(hasData(fp)).toBe(true);
    const rope = rows.find((x) => x.exerciseId === ROPE)!;
    expect(rope).toMatchObject({ n: 'פשיטת מרפקים- פולי עליון חבל', targetRepMin: 12, targetRepMax: 15 });
    expect(hasData(rope)).toBe(true);
    for (const id of [CABLE, BAR]) {
      const row = rows.find((x) => x.exerciseId === id)!;
      expect(hasData(row), id).toBe(false);
      expect(row.sets.every((s) => s.reps === null), id).toBe(true);
    }
    expect(rows.find((x) => x.exerciseId === CABLE)!.sets).toHaveLength(3);
    expect(rows.find((x) => x.exerciseId === BAR)!.sets).toHaveLength(2);
    expect(rows.find((x) => x.exerciseId === BAR)!.sets.map((s) => s.weight)).toEqual([30, 30]);
    expect(ids(skippedExercises(B_OCT27))).toEqual([]);
  });

  it('C ישן בעריכה: הפשיטה בחבל במקומה; C7 (פשיטה במוט) שורה ריקה אחרי; D ישן — D3 תופס את התא (אותו מזהה), בלי שורה עודפת', () => {
    const rowsC = exercisesFor(C_OCT29, ALL);
    expect(ids(rowsC)).toEqual([WARMUP_ID, 'machine-hip-abduction', 'machine-row', 'smith-incline-bench-press', 'leg-press', 'db-lateral-raise-standing', 'ez-bar-preacher-curl', ROPE, 'cable-torso-rotation', BAR, FINISHER_ID]);
    expect(hasData(rowsC.find((x) => x.exerciseId === ROPE)!)).toBe(true);
    expect(hasData(rowsC.find((x) => x.exerciseId === BAR)!)).toBe(false);
    expect(ids(skippedExercises(C_OCT29))).toEqual([]);
    // השורות שנשמרו קודם (D3), ואחריהן התאים החסרים לפי סדר התוכנית — בלי שורה נוספת ל-D3
    const rowsD = exercisesFor(D_OCT30, ALL);
    expect(ids(rowsD)).toEqual([WARMUP_ID, BAR, 'cable-low-fly', 'db-hammer-curl', 'bench-reverse-crunch', 'cable-single-arm-lateral-raise', FINISHER_ID]);
    const d3 = rowsD.find((x) => x.exerciseId === BAR)!;
    expect(hasData(d3)).toBe(true);
    // היעד שנשמר ברשומה (10–15) נשאר כמו שנרשם
    expect(d3).toMatchObject({ targetRepMin: 10, targetRepMax: 15, rir: 1 });
    expect(ids(skippedExercises(D_OCT30))).toEqual([]);
  });

  it('הסיכום השבועי והדוח של רשומות ישנות: החתירה בחבל והפשיטה בחבל מהמאגר (סף 2 → RIR 1 בתקרה = R5, כמו הפרפר ההפוך ב-20/10); בלי שורות לתאים החדשים; בלי "דולגו"', () => {
    const db = { ...emptyDb(), workouts: ALL };
    const data = buildWeeklySummaryData(db, '2026-10-25');
    const b = data.workouts.items.find((w) => w.t === 'B')!;
    expect(b.lines).toHaveLength(8);
    expect(b.lines.map((l) => l.exerciseId)).toEqual(ids(B_OCT27.ex));
    expect(b.lines[4]!.suggestion).toMatchObject({ rule: 'R5', action: 'same', weight: 40, repTarget: 20 });
    expect(b.lines[6]!.suggestion).toMatchObject({ rule: 'R5', action: 'same', weight: 40, repTarget: 15 });
    expect(b.skipped).toEqual([]);
    const text = buildWeeklySummary(db, '2026-10-25');
    expect(text).toContain('חתירה אופקית חבל 40×20,20,20 · RIR 1 · הבא: 40 ק״ג · 20 חזרות (R5)');
    expect(text).toContain('פשיטת מרפקים 40×15,15 · RIR 1 · הבא: 40 ק״ג · 15 חזרות (R5)');
    // C: הפשיטה בחבל עם RIR 2 בתקרה → R1 כמו קודם (לא תלוי בסף)
    expect(text).toContain('פשיטת מרפקים 40×15,15 · RIR 2 · הבא: 45 ק״ג · 12 חזרות (R1)');
    // D: הפשיטה במוט 30×12,12,12 (נרשם ב-10–15) לפי התא של היום (12–15): הרצפה → R6
    expect(text).toContain('אימון D: 30/10\n  פשיטת מרפקים מוט 30×12,12,12 · RIR 1 · הבא: 30 ק״ג · 13 חזרות (R6)');
    expect(text).not.toContain('הרחקה בפולי');
    expect(text).not.toMatch(/דולגו/);
    const report = buildChatReport(db, '2026-10-25', '2026-10-31');
    expect(report).toContain('27/10 B — RDL מוט 40×10,10,10 · חתירת כבל 45×12,12,12 · פרפר 30×12,12,12 · כפיפת ברכיים 30×12,12,12 · חתירה אופקית חבל 40×20,20,20 · כפיפת מרפקים 10×12,12 · פשיטת מרפקים 40×15,15 · הרמת רגליים 12,12,12');
    expect(report).toContain('אימון D: 30/10\n30/10 D — פשיטת מרפקים מוט 30×12,12,12');
    expect(report).not.toMatch(/דולגו/);
  });

  it('רשומה ישנה שבה B5 הוחלף מהחתירה בחבל להרחקה בפולי (swappedFrom: face-pull) נטענת כמו שהיא; בעריכה השורה שהוחלפה נשארת עם הנתונים ותא B5 (אותו מזהה) מתווסף ריק אחריה; ההיסטוריה של ההרחקה בפולי ממשיכה לפי המזהה', () => {
    const old = { ...le(CABLE, 15, [20, 20, 20]), swappedFrom: FACE_PULL, rir: 1 as const };
    const r = parseWorkouts([wk('b-swap', '2026-10-24', 'B', [old])]);
    expect(r.rejected).toEqual([]);
    expect(r.ok[0]?.ex[0]).toMatchObject({ exerciseId: CABLE, swappedFrom: FACE_PULL, targetRepMin: 15, targetRepMax: 20 });
    const all = [...ALL, ...r.ok];
    const rows = exercisesFor(r.ok[0]!, all);
    // השורה שהוחלפה תופסת את התא שממנו הוחלפה (החתירה בחבל — כבר לא תא), ולכן תא B5 מתווסף כשורה ריקה: אותו מזהה פעמיים — עם הנתונים (ראשונה) ובלי
    expect(ids(rows)).toEqual([WARMUP_ID, CABLE, 'barbell-rdl', 'seated-cable-row', 'pec-deck', 'leg-curl', CABLE, 'db-supinated-curl', BAR, 'floor-leg-raise', FINISHER_ID]);
    expect(rows[1]).toMatchObject({ swappedFrom: FACE_PULL });
    expect(rows[1]!.sets.map((s) => s.weight)).toEqual([15, 15, 15]);
    expect(hasData(rows[1]!)).toBe(true);
    expect(rows[6]!.swappedFrom).toBeUndefined();
    expect(hasData(rows[6]!)).toBe(false);
    expect(ids(rows)).not.toContain(FACE_PULL);
    expect(ids(skippedExercises(r.ok[0]!))).toEqual([]);
    expect(exerciseHistory(all, CABLE).map((h) => h.d)).toEqual(['2026-10-24']);
    expect(openingWeight(all, CABLE)).toBe(15);
    // B חדש: המשקל הפותח של B5 מההחלפה הישנה; ההצעה — קפיצה גדולה (5 מתוך 15)
    expect(prefilledExercises(all, 'B')[5]!.sets.map((s) => s.weight)).toEqual([15, 15, 15]);
    expect(suggestNext(exerciseHistory(all, CABLE), exerciseIn('B', CABLE)!)).toMatchObject({ rule: 'R4', weight: 15, repTarget: 22 });
    // הסיכום: "הוחלף מ-חתירה אופקית חבל", והסף של ההרחקה בפולי (1)
    const line = buildWeeklySummaryData({ ...emptyDb(), workouts: r.ok }, '2026-10-18').workouts.items[0]!.lines[0]!;
    expect(line.swappedFrom).toBe('הוחלף מ-חתירה אופקית חבל');
    expect(line.suggestion).toMatchObject({ rule: 'R4', weight: 15 });
  });

  it('רשומה ישנה שבה B7 הוחלף מהפשיטה בחבל לקיקבק (swappedFrom: triceps-pushdown) נטענת כמו שהיא ומוצגת "הוחלף מ-פשיטת מרפקים"', () => {
    const old = { ...le('cable-kickback', 10, [15, 15]), swappedFrom: ROPE, rir: 1 as const };
    const r = parseWorkouts([wk('b-swap2', '2026-10-24', 'B', [old])]);
    expect(r.rejected).toEqual([]);
    const rows = exercisesFor(r.ok[0]!, [...ALL, ...r.ok]);
    expect(rows.find((x) => x.exerciseId === 'cable-kickback')).toMatchObject({ swappedFrom: ROPE });
    expect(ids(rows)).toContain(BAR);
    const line = buildWeeklySummaryData({ ...emptyDb(), workouts: r.ok }, '2026-10-18').workouts.items[0]!.lines[0]!;
    expect(line.swappedFrom).toBe('הוחלף מ-פשיטת מרפקים');
  });
});

describe('6. "החלף" ומסך התרגיל', () => {
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
  const options = (id: string, t: WorkoutType): AlternateOption[] => alternatesFor(id, t).map((alt) => ({ spec: alt, last: lastExercise(ALL, alt.id) }));

  it('B5: סרטון ההרחקה בפולי, ההערה החדשה, "דלג ואחזור" — בלי "החלף"', () => {
    const out = html(exerciseIn('B', CABLE)!, options(CABLE, 'B'));
    expect(out).toContain(`href="${CABLE_VIDEO}"`);
    expect(out).toContain('סרטון הדגמה — הרחקה אופקית- פולי גובה כתף');
    expect(out).toContain(CABLE_NOTE);
    expect(out).toContain('>דלג ואחזור<');
    expect(out).not.toContain('>החלף</button>');
    expect(out).not.toContain(FACE_PULL_VIDEO);
    expect(out).not.toContain(FACE_PULL_NOTE);
  });

  it('B7 ו-C7: סרטון הפשיטה במוט, ההערה החדשה, "החלף" עם שתי החלופות (בלי החבל); "החלף" יורש 2×12–15; D3: אותו סרטון ואותה הערה, בלי "החלף"', () => {
    for (const t of ['B', 'C'] as const) {
      const spec = exerciseIn(t, BAR)!;
      const opts = options(BAR, t);
      expect(opts.map((o) => o.spec.id), t).toEqual(KICKBACKS);
      const out = html(spec, opts);
      expect(out, t).toContain(`href="${BAR_VIDEO}"`);
      expect(out, t).toContain('סרטון הדגמה — פשיטת מרפקים- פולי עליון מוט');
      expect(out, t).toContain(BAR_NOTE);
      expect(out, t).toContain('>החלף</button>');
      expect(out, t).toContain('>דלג ואחזור<');
      expect(out, t).not.toContain(ROPE_VIDEO);
      const row = swapExercise(spec, opts[0]!.spec, openingWeight(ALL, 'cable-kickback'));
      expect(row, t).toMatchObject({ exerciseId: 'cable-kickback', swappedFrom: BAR, targetRepMin: 12, targetRepMax: 15 });
      expect(row.sets, t).toHaveLength(2);
    }
    const d3 = exerciseIn('D', BAR)!;
    expect(options(BAR, 'D')).toEqual([]);
    const out = html(d3, options(BAR, 'D'));
    expect(out).toContain(`href="${BAR_VIDEO}"`);
    expect(out).toContain(BAR_NOTE);
    expect(out).toContain('>דלג ואחזור<');
    expect(out).not.toContain('>החלף</button>');
  });
});

describe('7. אחסון — בלי מפתח חדש ובלי מיגרציה', () => {
  it('התוכנית לא נשמרת במכשיר; המפתחות הקיימים לא השתנו', () => {
    expect(Object.keys(STORAGE_KEYS).sort()).toEqual(
      ['checkins', 'creatine', 'customFoods', 'days', 'entries', 'favorites', 'quarantine', 'settings', 'standaloneCardio', 'targets', 'waist', 'weights', 'workouts'].sort(),
    );
    for (const v of Object.values(STORAGE_KEYS)) {
      expect(v).toMatch(/^fatloss:/);
      expect(v).not.toMatch(/program|exercise|pushdown|fly|pull/);
    }
  });
});
