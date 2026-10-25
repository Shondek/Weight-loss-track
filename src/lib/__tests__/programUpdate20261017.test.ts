/**
 * עדכון תוכנית 17/10/2026: C3 → בנץ' פרס עליון בסמית משין (`smith-incline-bench-press`,
 * מזהה חדש, ספסל בשיפוע), C6 → כפיפת מרפקים בכיסא כומר עם מוט W (`ez-bar-preacher-curl`,
 * מזהה חדש), ופשיטת המרפקים (`triceps-pushdown`) עברה מ-C6 ל-C7 בלי שינוי כך שתרגילי
 * הפולי רצופים; רוטציות הגו נשארו C8. הבנץ' העליון עם משקולות יד (`db-incline-bench-press`)
 * וכפיפת המרפקים בחבל (`cable-rope-curl`) עברו מהתוכנית למאגר — אותו מזהה, מפרט, הערה,
 * סרטון והיסטוריה — כחלופה היחידה של C3 ושל C6 בהתאמה. A2: ההערה פותחת ב-"ספסל ישר
 * (שטוח)." ושום דבר אחר לא השתנה. `barbell-incline-bench-press` (מוט חופשי) — לא נגעו.
 * שאר A, כל B, C1/C2/C4/C5/C8, R1–R6 ו-M — ללא שינוי (snapshot ההצעות: אפס שורות קיימות
 * השתנו; נוספו רק שורות לשני המזהים החדשים).
 */
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { emptyDb } from '../../types';
import { ALTERNATES, PROGRAM, RETIRED, WORKOUT_TYPES, alternatesFor, exerciseById, exerciseIn, resolveExerciseId, type Exercise } from '../../data/program';
import { rirThreshold, suggestNext } from '../progression';
import { FINISHER_ID, WARMUP_ID, blankLoggedExercise, exerciseHistory, exercisesFor, hasData, lastExercise, openingWeight, prefilledExercises, skippedExercises, swapExercise } from '../workouts';
import { parseWorkouts } from '../schema';
import { buildWeeklySummary, buildWeeklySummaryData } from '../weeklySummary';
import { buildChatReport } from '../exportText';
import { STORAGE_KEYS } from '../store';
import ExerciseFocus, { type AlternateOption } from '../../components/ExerciseFocus';
import { le, wk } from './helpers';

const C3 = 'smith-incline-bench-press';
const DB_INCLINE = 'db-incline-bench-press';
const C6 = 'ez-bar-preacher-curl';
const ROPE = 'cable-rope-curl';
const C7 = 'triceps-pushdown';
const A2 = 'smith-bench-press';
const C3_VIDEO = 'https://drive.google.com/file/d/1vt0dsd5rHMKkk6K8ByX9pXWFVtYvOA4A/view?usp=drive_link';
const C6_VIDEO = 'https://drive.google.com/file/d/1AHnam-k3Q4IdReZxiCb6kaS801yFs3hP/view?usp=drive_link';
const DB_INCLINE_VIDEO = 'https://drive.google.com/file/d/1beJfALua4GL3z7GNhTHUTLLQWDSmjfya/view?usp=drive_link';
const ROPE_VIDEO = 'https://drive.google.com/file/d/1IlwfEWHhTiVN4BrimJNfPRc_ZUt-XsTI/view?usp=drive_link';
const C7_VIDEO = 'https://drive.google.com/file/d/1SQCZVCe3hSpqMZHGTp9fIsE0ZJvZ0R3p/view?usp=drive_link';
const C3_NOTE =
  "ספסל מתכוונן בשיפוע נמוך (בערך 15–30°), באותו חריץ בכל פעם — הזווית משנה את הקושי. המוט יורד לחזה העליון, מתחת לעצם הבריח. מרפקים ב-45°. עצירות הבטיחות מעט מעל גובה החזה בתחתית. נרשם סך הפלטות בלי המוט. הסרטון מהספרייה הוא בנץ' עליון עם מוט חופשי, לא בסמית.";
const C6_NOTE = "זרועות צמודות לכרית לכל אורכן, בית השחי בקצה העליון. ירידה איטית 2–3 שנ'. למטה עוצרים רגע לפני נעילה מלאה של המרפק, בלי הקפצה. בלי תנופה מהכתפיים או מהגב. נרשם סך הפלטות בלי המוט.";
const A2_NOTE_BEFORE = "ספסל שטוח. המוט יורד לחזה התחתון, מרפקים ב-45°. עצירות הבטיחות מעט מעל גובה החזה. רושמים את סך הפלטות בלי המוט. הסרטון מראה בנץ' עם מוט חופשי, לא סמית.";
const A2_NOTE_AFTER = "ספסל ישר (שטוח). המוט יורד לחזה התחתון, מרפקים ב-45°. עצירות הבטיחות מעט מעל גובה החזה. רושמים את סך הפלטות בלי המוט. הסרטון מראה בנץ' עם מוט חופשי, לא סמית.";

const A_ORDER = ['leg-press', A2, 'lat-pulldown', 'leg-extension', 'leg-curl', 'back-extension', 'db-lateral-raise-seated', 'plank'];
// 20/10/2026: B5 חזר לחתירה בחבל (face-pull) — programUpdate20261020.test.ts
const B_ORDER = ['barbell-rdl', 'seated-cable-row', 'pec-deck', 'leg-curl', 'face-pull', 'db-supinated-curl', 'triceps-pushdown', 'floor-leg-raise'];
const C_ORDER = ['machine-hip-abduction', 'machine-row', C3, 'leg-press', 'db-lateral-raise-standing', C6, C7, 'cable-torso-rotation'];

const ids = (list: { exerciseId: string }[]) => list.map((e) => e.exerciseId);

/** אימון C ישן, מלפני העדכון: בנץ' עליון מ.יד ב-C3, פשיטת מרפקים ב-C6, כפיפת מרפקים בחבל ב-C7. */
const C_OCT10 = wk('c-1010', '2026-10-10', 'C', [
  { ...le('machine-hip-abduction', 35, [20, 20, 20]), rir: 1 },
  { ...le('machine-row', 40, [12, 12, 12]), rir: 2 },
  { ...le(DB_INCLINE, 15, [12, 12, 10]), rir: 2 },
  { ...le('leg-press', 80, [12, 12, 12]), rir: 2 },
  { ...le('db-lateral-raise-standing', 7.5, [15, 15, 15]), rir: 1 },
  { ...le(C7, 25, [15, 15]), rir: 1 },
  { ...le(ROPE, 20, [15, 15]), rir: 1 },
  { ...le('cable-torso-rotation', 20, [15, 15, 15]), rir: 1 },
]);
const C_OCT03 = wk('c-1003', '2026-10-03', 'C', [
  { ...le(DB_INCLINE, 15, [12, 12, 9]), rir: 2 },
  { ...le(ROPE, 15, [15, 15]), rir: 2 },
]);
const ALL = [C_OCT03, C_OCT10];

describe('C3 — בנץ׳ פרס עליון בסמית משין (smith-incline-bench-press, 17/10/2026)', () => {
  it('12. המפרט: שלישי ב-C, 3×8–12, RIR 2 (סף 2), מורכב, step 5, הערה וסרטון; חלופה יחידה — בנץ׳ עליון מ.יד; מזהה חדש, לא במאגר ולא בפרושים', () => {
    const c3 = exerciseIn('C', C3)!;
    expect(c3).toMatchObject({
      id: C3,
      name: "בנץ' פרס עליון- סמית משין",
      short: "בנץ' עליון סמית",
      machine: 'Smith Machine (Incline Bench)',
      muscle: 'chest',
      muscles: ['חזה עליון', 'כתף קדמית', 'טרייספס'],
      type: 'compound',
      sets: 3,
      reps: '8-12',
      repRangeMin: 8,
      repRangeMax: 12,
      effort: 'RIR 2',
      step: 5,
      mode: 'progress',
      bodyweightStart: false,
      bodyweightOnly: false,
      isTimed: false,
      unilateral: false,
      assisted: false,
      note: C3_NOTE,
      videoUrl: C3_VIDEO,
      alternates: [DB_INCLINE],
    });
    expect(rirThreshold(c3.effort)).toBe(2);
    expect(PROGRAM.C[2]).toBe(c3);
    expect(exerciseById(C3)).toBe(c3);
    expect(ALTERNATES.some((a) => a.id === C3)).toBe(false);
    expect(RETIRED.some((r) => r.id === C3)).toBe(false);
    expect(resolveExerciseId("בנץ' פרס עליון- סמית משין")).toBe(C3);
    expect(alternatesFor(C3).map((a) => a.id)).toEqual([DB_INCLINE]);
    expect(alternatesFor(C3).map((a) => a.name)).toEqual(["בנץ' פרס עליון- משקולות יד"]);
    // ה-step של הסמית כמו A2 ושאר המוטות
    expect(c3.step).toBe(exerciseIn('A', A2)!.step);
    // הבנץ׳ העליון עם מוט חופשי ובמכונה — במאגר, לא חלופות של C3 ולא של אף תא
    for (const id of ['barbell-incline-bench-press', 'machine-incline-chest-press']) {
      expect(ALTERNATES.some((a) => a.id === id), id).toBe(true);
      for (const t of WORKOUT_TYPES) for (const e of PROGRAM[t]) expect(e.alternates, `${e.id} → ${id}`).not.toContain(id);
    }
  });

  it('14. הבנץ׳ העליון עם משקולות יד: אותו מזהה, שם, 3×8–12, step 2.5, הערה וסרטון — במאגר, לא תא, חלופה של C3 בלבד; השם נפתר', () => {
    const db = exerciseById(DB_INCLINE)!;
    expect(db).toMatchObject({
      id: DB_INCLINE,
      name: "בנץ' פרס עליון- משקולות יד",
      short: "בנץ' פרס עליון",
      machine: 'Dumbbell Incline Bench Press',
      muscle: 'chest',
      muscles: ['חזה עליון', 'כתף קדמית', 'טרייספס'],
      type: 'compound',
      sets: 3,
      repRangeMin: 8,
      repRangeMax: 12,
      step: 2.5,
      note: 'מרפקים ב-45°. מדרון נמוך — לא לחיצה מעל הראש',
      videoUrl: DB_INCLINE_VIDEO,
      mode: 'progress',
      bodyweightStart: false,
      alternates: [],
    });
    expect(ALTERNATES.filter((a) => a.id === DB_INCLINE)).toHaveLength(1);
    expect(RETIRED.some((r) => r.id === DB_INCLINE)).toBe(false);
    for (const t of WORKOUT_TYPES) expect(exerciseIn(t, DB_INCLINE)).toBeUndefined();
    expect(alternatesFor(DB_INCLINE)).toEqual([]);
    expect(resolveExerciseId("בנץ' פרס עליון- משקולות יד")).toBe(DB_INCLINE);
    const hosts = WORKOUT_TYPES.flatMap((t) => PROGRAM[t].filter((e) => e.alternates.includes(DB_INCLINE)).map((e) => `${t}:${e.id}`));
    expect(hosts).toEqual([`C:${C3}`]);
  });

  it('`barbell-incline-bench-press` (מוט חופשי) — לא נגעו', () => {
    expect(exerciseById('barbell-incline-bench-press')).toMatchObject({ id: 'barbell-incline-bench-press', name: "בנץ' פרס עליון", short: "בנץ' עליון מוט", machine: 'Barbell Incline Bench', sets: 3, repRangeMin: 8, repRangeMax: 12, step: 5, note: 'מרפקים ב-45°', videoUrl: null, alternates: [] });
  });
});

describe('C6 — כפיפת מרפקים בכיסא כומר עם מוט W (ez-bar-preacher-curl, 17/10/2026)', () => {
  it('13. המפרט: שישי ב-C, 2×12–15, RIR 1 (סף 1), בידוד, step 5, הערה וסרטון; חלופה יחידה — כפיפת מרפקים בחבל; מזהה חדש', () => {
    const c6 = exerciseIn('C', C6)!;
    expect(c6).toMatchObject({
      id: C6,
      name: 'כפיפת מרפקים- כיסא כומר מוט W',
      short: 'כיסא כומר מוט W',
      machine: 'Preacher Bench (EZ Bar)',
      muscle: 'biceps',
      muscles: ['בייספס'],
      type: 'isolation',
      sets: 2,
      reps: '12-15',
      repRangeMin: 12,
      repRangeMax: 15,
      effort: 'RIR 1',
      step: 5,
      mode: 'progress',
      bodyweightStart: false,
      bodyweightOnly: false,
      isTimed: false,
      unilateral: false,
      assisted: false,
      note: C6_NOTE,
      videoUrl: C6_VIDEO,
      alternates: [ROPE],
    });
    expect(rirThreshold(c6.effort)).toBe(1);
    expect(PROGRAM.C[5]).toBe(c6);
    expect(exerciseById(C6)).toBe(c6);
    expect(ALTERNATES.some((a) => a.id === C6)).toBe(false);
    expect(RETIRED.some((r) => r.id === C6)).toBe(false);
    expect(resolveExerciseId('כפיפת מרפקים- כיסא כומר מוט W')).toBe(C6);
    expect(alternatesFor(C6).map((a) => a.id)).toEqual([ROPE]);
    expect(alternatesFor(C6).map((a) => a.name)).toEqual(['כפיפת מרפקים- פולי תחתון חבל']);
    // כיסא הכומר עם משקולת יד (db-preacher-curl) נשאר במאגר כמו שהיה — תרגיל אחר, לא כפיל
    expect(exerciseById('db-preacher-curl')).toMatchObject({ id: 'db-preacher-curl', name: 'כפיפת מרפק- כיסא כומר מ.יד סופינציה', sets: 2, repRangeMin: 10, repRangeMax: 12, step: 2.5, note: null, videoUrl: null });
    // 25/10/2026: כפיפת הפטיש (db-hammer-curl) עברה ל-D2 והוסרה מחלופות B6
    expect(alternatesFor('db-supinated-curl').map((a) => a.id)).toEqual(['cable-bar-curl', 'db-preacher-curl']);
  });

  it('14. כפיפת המרפקים בחבל: אותו מזהה, שם, 2×12–15, step 5, הערה וסרטון — במאגר, לא תא, חלופה של C6 בלבד; השם נפתר', () => {
    const rope = exerciseById(ROPE)!;
    expect(rope).toMatchObject({
      id: ROPE,
      name: 'כפיפת מרפקים- פולי תחתון חבל',
      short: 'כפיפת מרפקים חבל',
      machine: 'Cable Rope',
      muscle: 'biceps',
      muscles: ['בייספס', 'אמה'],
      type: 'isolation',
      sets: 2,
      repRangeMin: 12,
      repRangeMax: 15,
      step: 5,
      note: 'פולי תחתון, חבל, אחיזה ניטרלית. מרפקים צמודים לגוף.',
      videoUrl: ROPE_VIDEO,
      mode: 'progress',
      bodyweightStart: false,
      alternates: [],
    });
    expect(ALTERNATES.filter((a) => a.id === ROPE)).toHaveLength(1);
    expect(RETIRED.some((r) => r.id === ROPE)).toBe(false);
    for (const t of WORKOUT_TYPES) expect(exerciseIn(t, ROPE)).toBeUndefined();
    expect(alternatesFor(ROPE)).toEqual([]);
    expect(resolveExerciseId('כפיפת מרפקים- פולי תחתון חבל')).toBe(ROPE);
    const hosts = WORKOUT_TYPES.flatMap((t) => PROGRAM[t].filter((e) => e.alternates.includes(ROPE)).map((e) => `${t}:${e.id}`));
    expect(hosts).toEqual([`C:${C6}`]);
  });

  it('17. C7 פשיטת מרפקים: אותו מזהה ומפרט, רק המיקום (מ-C6 ל-C7); זהה ל-B7', () => {
    const c7 = exerciseIn('C', C7)!;
    expect(PROGRAM.C[6]).toBe(c7);
    expect(c7).toMatchObject({
      id: C7,
      name: 'פשיטת מרפקים- פולי עליון חבל',
      short: 'פשיטת מרפקים',
      machine: 'Cable Rope',
      type: 'isolation',
      sets: 2,
      reps: '12-15',
      repRangeMin: 12,
      repRangeMax: 15,
      effort: 'RIR 1',
      step: 5,
      note: null,
      videoUrl: C7_VIDEO,
      // 25/10/2026: פשיטת המרפקים עם מוט (cable-bar-pushdown) עברה ל-D3 והוסרה מחלופות B7 ו-C7
      alternates: ['cable-kickback', 'db-kickback'],
    });
    const b7 = exerciseIn('B', C7)!;
    const { alternates: _a, ...c7Rest } = c7;
    const { alternates: _b, ...b7Rest } = b7;
    expect(c7Rest).toEqual(b7Rest);
    expect(c7.alternates).toEqual(b7.alternates);
    // C8 רוטציות הגו — במקומה, בלי שינוי
    expect(PROGRAM.C[7]).toMatchObject({ id: 'cable-torso-rotation', name: 'בטן- רוטציות גו פולי אמצעי', sets: 3, repRangeMin: 12, repRangeMax: 15, effort: 'RIR 1', step: 5, unilateral: true });
  });
});

describe('11. התוכנית כולה: C בסדר החדש; A ו-B כמו קודם (פרט להערה של A2)', () => {
  it('C: 8 תאים בסדר החדש, תרגילי הפולי (C7, C8) רצופים; 22 סטים', () => {
    expect(PROGRAM.C.map((e) => e.id)).toEqual(C_ORDER);
    expect(PROGRAM.C).toHaveLength(8);
    expect(PROGRAM.C.reduce((n, e) => n + e.sets, 0)).toBe(22);
    expect(PROGRAM.C.slice(6).map((e) => e.machine)).toEqual(['Cable Rope', 'Cable']);
  });

  it('A ו-B: אותם מזהים, סטים, טווחים, RIR, step, חלופות, סרטונים והערות', () => {
    expect(PROGRAM.A.map((e) => e.id)).toEqual(A_ORDER);
    expect(PROGRAM.B.map((e) => e.id)).toEqual(B_ORDER);
    const snap = (t: 'A' | 'B') => PROGRAM[t].map((e) => `${e.id}:${e.sets}x${e.repRangeMin}-${e.repRangeMax}:${e.effort}:${e.step}:${e.mode}:${e.alternates.join(',')}`);
    expect(snap('A')).toEqual([
      'leg-press:3x10-12:RIR 2:5:progress:hack-squat,machine-squat,goblet-squat',
      'smith-bench-press:3x8-12:RIR 2:5:progress:db-bench-press,machine-chest-press,barbell-bench-press',
      'lat-pulldown:3x10-12:RIR 2:5:progress:lat-pulldown-close,lat-pulldown-wide-studio,assisted-pull-up',
      'leg-extension:2x12-15:RIR 1:null:progress:wall-sit',
      'leg-curl:2x10-12:RIR 1:null:progress:lying-leg-curl,single-leg-curl',
      'back-extension:3x12-15:RIR 2:2.5:progress:',
      // 25/10/2026: ההרחקה בכבל יד אחת → D5, הוסרה מחלופות A7 (ומ-C5)
      'db-lateral-raise-seated:3x12-15:RIR 1:2.5:progress:db-lateral-raise-standing',
      'plank:3x60-60:null:2.5:maintain:side-plank-static,cable-crunch',
    ]);
    expect(snap('B')).toEqual([
      'barbell-rdl:3x8-10:RIR 3:5:progress:db-rdl,smith-hip-hinge',
      'seated-cable-row:3x10-12:RIR 2:5:progress:machine-row,t-bar-row,single-arm-cable-row',
      // 25/10/2026: הפרפר התחתון → D1, הוסר מחלופות B3
      'pec-deck:3x10-12:RIR 2:null:progress:cable-fly',
      'leg-curl:3x10-12:RIR 2:null:progress:lying-leg-curl,single-leg-curl',
      'face-pull:3x15-20:RIR 1:5:progress:cable-reverse-fly',
      // 25/10/2026: כפיפת הפטיש → D2, פשיטת מרפקים עם מוט → D3 — הוסרו מחלופות B6, B7
      'db-supinated-curl:2x10-12:RIR 1:2.5:progress:cable-bar-curl,db-preacher-curl',
      'triceps-pushdown:2x12-15:RIR 1:5:progress:cable-kickback,db-kickback',
      'floor-leg-raise:3x10-15:RIR 1:null:reps:',
    ]);
    // C1, C2, C4, C5, C8 — ללא שינוי
    expect(PROGRAM.C[0]).toMatchObject({ id: 'machine-hip-abduction', sets: 3, repRangeMin: 15, repRangeMax: 20, effort: 'RIR 1-2', step: null, alternates: ['band-hip-abduction-standing', 'band-hip-abduction-seated'] });
    expect(PROGRAM.C[1]).toMatchObject({ id: 'machine-row', sets: 3, repRangeMin: 10, repRangeMax: 12, effort: 'RIR 2', step: null, alternates: ['db-single-arm-row', 'single-arm-cable-row', 't-bar-row'] });
    expect(PROGRAM.C[3]).toMatchObject({ id: 'leg-press', sets: 3, repRangeMin: 10, repRangeMax: 12, effort: 'RIR 2', step: 5, alternates: ['hack-squat', 'machine-squat', 'goblet-squat'] });
    expect(PROGRAM.C[4]).toMatchObject({ id: 'db-lateral-raise-standing', sets: 3, repRangeMin: 12, repRangeMax: 15, effort: 'RIR 1', step: 2.5, alternates: ['db-lateral-raise-seated'] });
  });

  it('18. A2: ההערה פותחת ב-"ספסל ישר (שטוח)." — אותו תוכן אחריה; שם, מזהה, מפרט, step, סרטון וחלופות ללא שינוי', () => {
    const a2 = exerciseIn('A', A2)!;
    expect(a2.note).toBe(A2_NOTE_AFTER);
    expect(a2.note!.startsWith('ספסל ישר (שטוח).')).toBe(true);
    // ההערה הקודמת פתחה ב-"ספסל שטוח." — המשפט הזה הוחלף במשפט החדש; כל השאר מילה במילה
    expect(a2.note!.slice('ספסל ישר (שטוח).'.length)).toBe(A2_NOTE_BEFORE.slice('ספסל שטוח.'.length));
    expect(a2).toMatchObject({
      id: A2,
      name: "בנץ' פרס- סמית משין",
      short: "בנץ' סמית",
      machine: 'Smith Machine',
      sets: 3,
      reps: '8-12',
      repRangeMin: 8,
      repRangeMax: 12,
      effort: 'RIR 2',
      step: 5,
      mode: 'progress',
      videoUrl: 'https://drive.google.com/file/d/1veAvZoDJk28ZJdVUAOHaKAm9JCNMa_az/view?usp=drive_link',
      alternates: ['db-bench-press', 'machine-chest-press', 'barbell-bench-press'],
    });
    expect(PROGRAM.A[1]).toBe(a2);
  });

  it('20. לכל התאים בתוכנית (A, B, C) יש סרטון', () => {
    for (const t of WORKOUT_TYPES) {
      for (const e of PROGRAM[t]) {
        expect(e.videoUrl, `${t}: ${e.id}`).toMatch(/^https:\/\/drive\.google\.com\/file\/d\//);
      }
    }
  });

  it('מספר התרגילים: 58 בלי הפלאנק (56 + שני המזהים החדשים), 38 במאגר (36 + השניים שעברו) — כל מזהה פעם אחת', () => {
    const all = [...WORKOUT_TYPES.flatMap((t) => PROGRAM[t].map((e) => e.id)), ...ALTERNATES.map((a) => a.id)];
    const unique = new Set(all);
    for (const id of [C3, C6, DB_INCLINE, ROPE, C7]) expect(unique.has(id), id).toBe(true);
    // 25/10/2026: אימון D — +1 מזהה חדש (D4), וארבעה מזהים עברו מהמאגר לתוכנית (38 → 34)
    expect(unique.size - 1).toBe(59);
    expect(ALTERNATES).toHaveLength(34);
    expect(new Set(ALTERNATES.map((a) => a.id)).size).toBe(34);
    expect(new Set(ALTERNATES.map((a) => a.name)).size).toBe(34);
  });
});

describe('14/19. ההיסטוריה של התרגילים שיצאו — שלמה; רשומת C ישנה נטענת ומוצגת', () => {
  it('14. ההיסטוריה לפי המזהה של הבנץ׳ העליון מ.יד ושל כפיפת המרפקים בחבל — מלאה, עם משקלים ו-RIR; ההצעה ממשיכה; לתאים החדשים אין היסטוריה', () => {
    const r = parseWorkouts(ALL);
    expect(r.rejected).toEqual([]);
    expect(r.ok).toEqual(ALL);
    const hi = exerciseHistory(ALL, DB_INCLINE);
    expect(hi.map((x) => x.d)).toEqual(['2026-10-03', '2026-10-10']);
    expect(hi.map((x) => x.ex.sets.map((s) => s.weight))).toEqual([[15, 15, 15], [15, 15, 15]]);
    expect(openingWeight(ALL, DB_INCLINE)).toBe(15);
    expect(suggestNext(hi, exerciseById(DB_INCLINE)!)).toMatchObject({ rule: 'R6', action: 'same', weight: 15, repTarget: 11 });
    const hr = exerciseHistory(ALL, ROPE);
    expect(hr.map((x) => x.d)).toEqual(['2026-10-03', '2026-10-10']);
    expect(hr.map((x) => x.ex.sets.map((s) => s.weight))).toEqual([[15, 15], [20, 20]]);
    expect(hr.map((x) => x.ex.rir)).toEqual([2, 1]);
    expect(lastExercise(ALL, ROPE)?.d).toBe('2026-10-10');
    expect(openingWeight(ALL, ROPE)).toBe(20);
    expect(exerciseHistory(ALL, C3)).toEqual([]);
    expect(exerciseHistory(ALL, C6)).toEqual([]);
    expect(openingWeight(ALL, C3)).toBeNull();
    expect(openingWeight(ALL, C6)).toBeNull();
  });

  it('19. אימון C ישן (בנץ׳ עליון מ.יד ב-C3, כפיפת מרפקים בחבל ב-C7) נפתח לעריכה בלי שגיאה: השורות במקומן עם הנתונים, התאים החדשים כשורות ריקות אחריהן, ולא "דולגו"', () => {
    const rows = exercisesFor(C_OCT10, ALL);
    expect(ids(rows)).toEqual([WARMUP_ID, 'machine-hip-abduction', 'machine-row', DB_INCLINE, 'leg-press', 'db-lateral-raise-standing', C7, ROPE, 'cable-torso-rotation', C3, C6, FINISHER_ID]);
    const incline = rows.find((x) => x.exerciseId === DB_INCLINE)!;
    expect(incline).toMatchObject({ n: "בנץ' פרס עליון- משקולות יד", targetRepMin: 8, targetRepMax: 12 });
    expect(incline.sets.map((s) => s.reps)).toEqual([12, 12, 10]);
    const rope = rows.find((x) => x.exerciseId === ROPE)!;
    expect(rope).toMatchObject({ n: 'כפיפת מרפקים- פולי תחתון חבל', targetRepMin: 12, targetRepMax: 15 });
    expect(rope.sets).toEqual([{ weight: 20, reps: 15, seconds: null }, { weight: 20, reps: 15, seconds: null }]);
    for (const id of [DB_INCLINE, ROPE, C7, 'cable-torso-rotation']) expect(hasData(rows.find((x) => x.exerciseId === id)!), id).toBe(true);
    for (const id of [C3, C6]) {
      const row = rows.find((x) => x.exerciseId === id)!;
      expect(hasData(row), id).toBe(false);
      expect(row.sets.every((s) => s.weight === null && s.reps === null)).toBe(true);
    }
    expect(rows.find((x) => x.exerciseId === C3)!.sets).toHaveLength(3);
    expect(rows.find((x) => x.exerciseId === C6)!.sets).toHaveLength(2);
    expect(ids(skippedExercises(C_OCT10))).toEqual([]);
  });

  it('19. הסיכום השבועי והדוח של אימון C ישן: 8 שורות בשמות הישנים עם ההצעות שלהן, בלי שורה לתאים החדשים ובלי שגיאה', () => {
    const db = { ...emptyDb(), workouts: ALL };
    const data = buildWeeklySummaryData(db, '2026-10-04');
    const c = data.workouts.items.find((w) => w.d === '2026-10-10')!;
    expect(c.lines).toHaveLength(8);
    expect(c.lines.map((l) => l.exerciseId)).toEqual(ids(C_OCT10.ex));
    expect(c.lines[2]).toMatchObject({ exerciseId: DB_INCLINE, name: "בנץ' פרס עליון", text: "בנץ' פרס עליון 15×12,12,10" });
    expect(c.lines[2]!.suggestion).toMatchObject({ rule: 'R6' });
    // כפיפת מרפקים בחבל: תקרה ב-20 ק״ג עם step 5 — קפיצה גדולה (R4), בדיוק כמו לפני העדכון
    expect(c.lines[6]).toMatchObject({ exerciseId: ROPE, name: 'כפיפת מרפקים חבל', text: 'כפיפת מרפקים חבל 20×15,15' });
    expect(c.lines[6]!.suggestion).toMatchObject({ rule: 'R4', action: 'same', weight: 20, repTarget: 17 });
    expect(c.skipped).toEqual([]);
    const text = buildWeeklySummary(db, '2026-10-04');
    expect(text).toContain("בנץ' פרס עליון 15×12,12,10 · RIR 2 · הבא: 15 ק״ג · 11 חזרות (R6)");
    expect(text).toContain('כפיפת מרפקים חבל 20×15,15 · RIR 1 · הבא: 20 ק״ג · 17 חזרות (R4)');
    expect(text).not.toContain('סמית');
    expect(text).not.toContain('כיסא כומר');
    const report = buildChatReport(db, '2026-10-04', '2026-10-10');
    expect(report).toContain("בנץ' פרס עליון 15×12,12,10");
    expect(report).toContain('כפיפת מרפקים חבל 20×15,15');
    expect(report).not.toMatch(/דולגו:.*(סמית|כומר)/);
  });
});

describe('15/16. אימון C חדש ו"החלף"', () => {
  it('15. C חדש: C3 ו-C6 בתאים שלהם, סטים ריקים, בלי משקל פותח; לסשן הראשון אין הצעה (משקל פותח ידני); C7 פשיטת מרפקים עם המשקל האחרון', () => {
    const rows = prefilledExercises(ALL, 'C');
    expect(ids(rows)).toEqual([WARMUP_ID, ...C_ORDER, FINISHER_ID]);
    const c3 = rows[3]!;
    expect(c3).toMatchObject({ exerciseId: C3, n: "בנץ' פרס עליון- סמית משין", targetRepMin: 8, targetRepMax: 12, type: 'compound', bodyweightOnly: false });
    expect(c3.sets).toHaveLength(3);
    expect(c3.sets.every((s) => s.weight === null && s.reps === null && s.seconds === null)).toBe(true);
    const c6 = rows[6]!;
    expect(c6).toMatchObject({ exerciseId: C6, n: 'כפיפת מרפקים- כיסא כומר מוט W', targetRepMin: 12, targetRepMax: 15, type: 'isolation', bodyweightOnly: false });
    expect(c6.sets).toHaveLength(2);
    expect(c6.sets.every((s) => s.weight === null && s.reps === null)).toBe(true);
    expect(rows[7]).toMatchObject({ exerciseId: C7 });
    expect(rows[7]!.sets.map((s) => s.weight)).toEqual([25, 25]);
    for (const id of [C3, C6]) {
      expect(suggestNext(exerciseHistory(ALL, id), exerciseIn('C', id)!), id).toBeNull();
      expect(suggestNext([], exerciseIn('C', id)!), id).toBeNull();
    }
  });

  it('סשן ראשון של C3 40×12,12,12 ב-RIR 2 → 45 (R1, סף 2); ב-RIR 1 → נשארים (R5). סשן ראשון של C6 10×15,15 ב-RIR 1 → קפיצה גדולה (R4), ואחרי 17,17 ב-RIR 1 → 15 (R1, סף 1)', () => {
    const c3First = wk('c-1017', '2026-10-17', 'C', [{ ...le(C3, 40, [12, 12, 12]), rir: 2 }]);
    expect(suggestNext(exerciseHistory([...ALL, c3First], C3), exerciseIn('C', C3)!)).toMatchObject({ rule: 'R1', action: 'up', weight: 45, repTarget: 8 });
    const c3Stay = wk('c-1017', '2026-10-17', 'C', [{ ...le(C3, 40, [12, 12, 12]), rir: 1 }]);
    expect(suggestNext(exerciseHistory([...ALL, c3Stay], C3), exerciseIn('C', C3)!)).toMatchObject({ rule: 'R5', action: 'same', weight: 40 });
    // ההיסטוריה של הבנץ׳ העליון מ.יד לא מתערבבת
    expect(exerciseHistory([...ALL, c3First], DB_INCLINE)).toHaveLength(2);
    expect(exerciseHistory([...ALL, c3First], C3)).toHaveLength(1);

    const c6First = wk('c-1017', '2026-10-17', 'C', [{ ...le(C6, 10, [15, 15]), rir: 1 }]);
    expect(suggestNext(exerciseHistory([...ALL, c6First], C6), exerciseIn('C', C6)!)).toMatchObject({ rule: 'R4', action: 'same', weight: 10, repTarget: 17 });
    const c6Next = wk('c-1024', '2026-10-24', 'C', [{ ...le(C6, 10, [17, 17]), rir: 1 }]);
    expect(suggestNext(exerciseHistory([...ALL, c6First, c6Next], C6), exerciseIn('C', C6)!)).toMatchObject({ rule: 'R1', action: 'up', weight: 15, repTarget: 12 });
    const c6Zero = wk('c-1024', '2026-10-24', 'C', [{ ...le(C6, 10, [17, 17]), rir: 0 }]);
    expect(suggestNext(exerciseHistory([...ALL, c6First, c6Zero], C6), exerciseIn('C', C6)!)).toMatchObject({ rule: 'R5', action: 'same', weight: 10 });
    expect(exerciseHistory([...ALL, c6First], ROPE)).toHaveLength(2);
  });

  it('16. "החלף" ב-C3 → נרשם תחת המזהה של הבנץ׳ העליון מ.יד, עם המשקל האחרון שלו ו-3×8–12; "החלף" ב-C6 → תחת cable-rope-curl, עם המשקל האחרון ו-2×12–15', () => {
    const c3 = exerciseIn('C', C3)!;
    const alts3 = alternatesFor(C3);
    expect(alts3.map((a) => a.id)).toEqual([DB_INCLINE]);
    const row3 = swapExercise(c3, alts3[0]!, openingWeight(ALL, DB_INCLINE));
    expect(row3).toMatchObject({ exerciseId: DB_INCLINE, n: "בנץ' פרס עליון- משקולות יד", swappedFrom: C3, targetRepMin: 8, targetRepMax: 12 });
    expect(row3.sets.map((s) => s.weight)).toEqual([15, 15, 15]);
    expect(suggestNext(exerciseHistory(ALL, DB_INCLINE), { ...alts3[0]!, sets: c3.sets })).toMatchObject({ rule: 'R6', weight: 15 });

    const c6 = exerciseIn('C', C6)!;
    const alts6 = alternatesFor(C6);
    expect(alts6.map((a) => a.id)).toEqual([ROPE]);
    const row6 = swapExercise(c6, alts6[0]!, openingWeight(ALL, ROPE));
    expect(row6).toMatchObject({ exerciseId: ROPE, n: 'כפיפת מרפקים- פולי תחתון חבל', swappedFrom: C6, targetRepMin: 12, targetRepMax: 15 });
    expect(row6.sets).toHaveLength(2);
    expect(row6.sets.map((s) => s.weight)).toEqual([20, 20]);
    // ההצעה לשורה שהוחלפה — מההיסטוריה של החבל, עם הסף של התא C6 (יעד 1): תקרה ב-40 ק״ג (step 5 — לא קפיצה גדולה) עם RIR 1 → R1
    const swapped = wk('c-1017', '2026-10-17', 'C', [{ ...row6, sets: [{ weight: 40, reps: 15, seconds: null }, { weight: 40, reps: 15, seconds: null }], rir: 1 }]);
    const db = { ...emptyDb(), workouts: [...ALL, swapped] };
    const line = buildWeeklySummaryData(db, '2026-10-11').workouts.items.find((w) => w.d === '2026-10-17')!.lines[0]!;
    expect(line).toMatchObject({ exerciseId: ROPE, swappedFrom: 'הוחלף מ-כיסא כומר מוט W' });
    expect(line.suggestion).toMatchObject({ rule: 'R1', action: 'up', weight: 45, repTarget: 12, basisWeight: 40 });
    expect(exerciseHistory(db.workouts, ROPE)).toHaveLength(3);
    expect(exerciseHistory(db.workouts, C6)).toEqual([]);
  });
});

describe('מסך התרגיל — C3 ו-C6 עם סרטון, הערה ו"החלף"', () => {
  /** React מקודד גרש כ-&#x27; ב-HTML הסטטי. */
  const esc = (s: string) => s.replace(/'/g, '&#x27;');
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

  it('C3: קישור ▶ לסרטון, ההערה המלאה, "RIR 2", "החלף" ו"דלג ואחזור"; החלופה — בנץ׳ עליון מ.יד עם ההיסטוריה שלו', () => {
    const spec = exerciseIn('C', C3)!;
    const options: AlternateOption[] = alternatesFor(C3).map((alt) => ({ spec: alt, last: lastExercise(ALL, alt.id) }));
    const out = html(spec, options);
    expect(out).toContain(`href="${C3_VIDEO}"`);
    expect(out).toContain(esc("סרטון הדגמה — בנץ' פרס עליון- סמית משין"));
    expect(out).toContain(esc(C3_NOTE));
    expect(out).toContain('RIR 2');
    expect(out).toContain('>החלף<');
    expect(out).toContain('>דלג ואחזור<');
    expect(out).not.toContain(DB_INCLINE_VIDEO);
    expect(options.map((o) => o.spec.id)).toEqual([DB_INCLINE]);
    expect(options[0]!.spec.videoUrl).toBe(DB_INCLINE_VIDEO);
    expect(options[0]!.last?.d).toBe('2026-10-10');
  });

  it('C6: קישור ▶ לסרטון, ההערה המלאה, "RIR 1", "החלף"; החלופה — כפיפת מרפקים בחבל עם ההיסטוריה שלה', () => {
    const spec = exerciseIn('C', C6)!;
    const options: AlternateOption[] = alternatesFor(C6).map((alt) => ({ spec: alt, last: lastExercise(ALL, alt.id) }));
    const out = html(spec, options);
    expect(out).toContain(`href="${C6_VIDEO}"`);
    expect(out).toContain('סרטון הדגמה — כפיפת מרפקים- כיסא כומר מוט W');
    expect(out).toContain(esc(C6_NOTE));
    expect(out).toContain('RIR 1');
    expect(out).toContain('>החלף<');
    expect(options.map((o) => o.spec.id)).toEqual([ROPE]);
    expect(options[0]!.spec.videoUrl).toBe(ROPE_VIDEO);
    expect(options[0]!.last?.d).toBe('2026-10-10');
  });

  it('A2: ההערה החדשה מוצגת במלואה', () => {
    const out = html(exerciseIn('A', A2)!, []);
    expect(out).toContain(esc(A2_NOTE_AFTER));
    expect(out).toContain('יעד <span class="num">3×8–12</span> · RIR 2');
  });
});

describe('אחסון — בלי מפתח חדש ובלי מיגרציה', () => {
  it('התוכנית לא נשמרת במכשיר; המפתחות הקיימים לא השתנו', () => {
    expect(Object.keys(STORAGE_KEYS).sort()).toEqual(
      ['checkins', 'creatine', 'customFoods', 'days', 'entries', 'favorites', 'quarantine', 'settings', 'standaloneCardio', 'targets', 'waist', 'weights', 'workouts'].sort(),
    );
    for (const v of Object.values(STORAGE_KEYS)) {
      expect(v).toMatch(/^fatloss:/);
      expect(v).not.toMatch(/program|exercise|smith|preacher|incline|curl/);
    }
  });
});
