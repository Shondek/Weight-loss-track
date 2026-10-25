/**
 * עדכון תוכנית 25/10/2026: אימון D — "D — חזה, ידיים, בטן (אופציונלי)".
 *
 * מחוץ לסבב A→B→C: `nextType` ממשיך מהאימון האחרון שבסבב ו-D שקוף; נבחר
 * ידנית בלבד; לא נספר ב-"אימונים n/3" (`WORKOUTS_PER_WEEK` נשאר 3) — בסיכום
 * השבועי ובדוח יש לו שורה נפרדת "אימון D: dd/mm" ואחריה התרגילים באותו פורמט.
 * בלי חלופות לאף תא (תפוס = "דלג ואחזור"). כל התאים RIR 1 (סף 1).
 *
 * תרגיל אחד = מזהה אחד = היסטוריה אחת (כמו `back-extension` ב-6/10): ארבעה
 * מזהים עברו מהמאגר לתאי D והוסרו מרשימות החלופות — `cable-low-fly` (D1, היה
 * של B3), `db-hammer-curl` (D2, של B6), `cable-bar-pushdown` (D3, של B7 ו-C7),
 * `cable-single-arm-lateral-raise` (D5, של A7 ו-C5). `bench-reverse-crunch` (D4)
 * חדש — חזרות בלבד כמו B8. שמות לא השתנו; הערות וסרטונים נוספו (במאגר לא היו).
 *
 * snapshot ההצעות: `cable-low-fly` (טווח 10–12 → 12–15, סף 2 → 1) ו-`cable-bar-pushdown`
 * (12–15 → 10–15) השתנו; D2 ו-D5 — אותו טווח ואותו סף, זהים; D4 נוסף.
 *
 * אין מיגרציה ואין מפתח אחסון חדש: רשומה עם `t: "D"` נשמרת כמו A/B/C, ורשומות
 * A/B/C קיימות נטענות כמו שהן.
 */
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { emptyDb, type WorkoutType } from '../../types';
import { ALTERNATES, PROGRAM, RETIRED, ROTATION, WORKOUT_TITLES, WORKOUT_TYPES, WORKOUTS_PER_WEEK, alternatesFor, exerciseById, exerciseIn, isRotationType, resolveExerciseId, type Exercise } from '../../data/program';
import { CEILING_STAY_LABEL, rirThreshold, suggestNext, type ProgressionSpec } from '../progression';
import { FINISHER_ID, WARMUP_ID, blankLoggedExercise, exercisesFor, lastExercise, makeWorkoutId, nextType, prefilledExercises, rotationWorkouts, sortableStamp, upsertWorkout } from '../workouts';
import { parseWorkouts } from '../schema';
import { buildWeeklySummary, buildWeeklySummaryData } from '../weeklySummary';
import { buildChatReport } from '../exportText';
import { buildWeekSummary, weekGaps } from '../weekSummary';
import { STORAGE_KEYS } from '../store';
import ExerciseFocus, { type AlternateOption } from '../../components/ExerciseFocus';
import { le, wk } from './helpers';

const D1 = 'cable-low-fly';
const D2 = 'db-hammer-curl';
const D3 = 'cable-bar-pushdown';
const D4 = 'bench-reverse-crunch';
const D5 = 'cable-single-arm-lateral-raise';
const D_IDS = [D1, D2, D3, D4, D5];
const MOVED = [D1, D2, D3, D5];

const VIDEOS: Record<string, string> = {
  [D1]: 'https://drive.google.com/file/d/1-bwuoyTpJgJI_HAOOg1bCo9klKloVDO8/view?usp=share_link',
  [D2]: 'https://drive.google.com/file/d/1ZjA8roLieYIoncvQhdoeXGePROvkzpBh/view?usp=share_link',
  [D3]: 'https://drive.google.com/file/d/1DkANomsaOj1PYVMH5gIiQ0dp2irQ5XbS/view?usp=drive_link',
  [D4]: 'https://drive.google.com/file/d/1vvcUd7u02YAWbDN6cYGHXI6zPIuJuYDq/view?usp=share_link',
  [D5]: 'https://drive.google.com/file/d/1EGlSug5_egOq4cjPvFoS1Eqo5ALjJfsq/view?usp=share_link',
};
const NOTES: Record<string, string> = {
  [D1]: 'הגלגלות בתחתית. הידיים עולות בקשת מגובה הירכיים עד גובה החזה העליון — לא מעל הכתפיים. מרפקים מעט כפופים וקבועים. בתחתית לא נותנים לכבלים למשוך את הכתפיים לאחור.',
  [D2]: 'אחיזה ניטרלית — אגודלים למעלה לכל אורך התנועה. מרפקים צמודים לגוף, בלי תנופה.',
  [D3]: 'מוט ישר. מרפקים צמודים לגוף ולא זזים קדימה. נעילה למטה בלי להישען מעל המוט.',
  [D4]: 'שוכבים על הספסל ואוחזים בקצה מאחורי הראש. מרימים את האגן ומקרבים ברכיים לחזה — הגו נשאר על הספסל. ירידה איטית. מציק לכתף? אוחזים בצדי הספסל ליד הירכיים. משקל גוף, חזרות בלבד.',
  [D5]: 'לכל צד. הכבל נמוך ועובר לפני הגוף. מרימים עד גובה הכתף, לא מעל. בלי תנופה מהגוף.',
};

const spec = (id: string): ProgressionSpec => exerciseIn('D', id)!;
const sess = (id: string, d: string, weight: number | null, values: number[], rir?: 0 | 1 | 2 | 3 | 4) => ({ d, ex: rir === undefined ? le(id, weight, values) : { ...le(id, weight, values), rir } });

describe('1. המבנה: אימון D בתוכנית, מחוץ לסבב', () => {
  it('WORKOUT_TYPES = A/B/C/D; ROTATION = A/B/C; D אופציונלי, כותרת, חמישה תאים', () => {
    expect(WORKOUT_TYPES).toEqual(['A', 'B', 'C', 'D']);
    expect(ROTATION).toEqual(['A', 'B', 'C']);
    expect(isRotationType('D')).toBe(false);
    for (const t of ROTATION) expect(isRotationType(t)).toBe(true);
    expect(WORKOUT_TITLES.D).toBe('D — חזה, ידיים, בטן (אופציונלי)');
    expect(PROGRAM.D.map((e) => e.id)).toEqual(D_IDS);
    expect(WORKOUTS_PER_WEEK).toBe(3);
    // A/B/C — אותם תאים, אותו סדר
    expect(PROGRAM.A).toHaveLength(8);
    expect(PROGRAM.B).toHaveLength(8);
    expect(PROGRAM.C).toHaveLength(8);
  });

  it('המפרט של כל תא: סטים, טווח, RIR 1 (סף 1), step, הערה מילה במילה, סרטון, בלי חלופות', () => {
    const d = (i: number) => PROGRAM.D[i]!;
    expect(d(0)).toMatchObject({ id: D1, name: 'פרפר- תחתון כייבל קרוס', sets: 3, reps: '12-15', repRangeMin: 12, repRangeMax: 15, effort: 'RIR 1', step: 5, mode: 'progress', unilateral: false, bodyweightOnly: false, muscles: ['חזה עליון'] });
    expect(d(1)).toMatchObject({ id: D2, name: 'כפיפת מרפקים- מ.יד מיד פוזישן', sets: 3, reps: '10-12', repRangeMin: 10, repRangeMax: 12, effort: 'RIR 1', step: 2.5, mode: 'progress' });
    expect(d(2)).toMatchObject({ id: D3, name: 'פשיטת מרפקים- פולי עליון מוט', sets: 3, reps: '10-15', repRangeMin: 10, repRangeMax: 15, effort: 'RIR 1', step: 5, mode: 'progress' });
    expect(d(3)).toMatchObject({ id: D4, name: 'בטן- כפיפות בטן לאחור על ספסל', machine: null, muscle: 'core', type: 'core', sets: 3, reps: '10-15', repRangeMin: 10, repRangeMax: 15, effort: 'RIR 1', step: null, mode: 'reps', bodyweightOnly: true, bodyweightStart: false, isTimed: false });
    expect(d(4)).toMatchObject({ id: D5, name: 'הרחקת כתף- כייבל קרוס יד אחת', sets: 2, reps: '12-15 לכל צד', repRangeMin: 12, repRangeMax: 15, effort: 'RIR 1', step: 5, unilateral: true, mode: 'progress' });
    for (const e of PROGRAM.D) {
      expect(e.note, e.id).toBe(NOTES[e.id]);
      expect(e.videoUrl, e.id).toBe(VIDEOS[e.id]);
      expect(e.alternates, e.id).toEqual([]);
      expect(alternatesFor(e.id), e.id).toEqual([]);
      expect(rirThreshold(e.effort), e.id).toBe(1);
      expect(exerciseById(e.id), e.id).toBe(e);
      expect(resolveExerciseId(e.name), e.id).toBe(e.id);
    }
  });

  it('ארבעת המזהים עברו מהמאגר לתוכנית — לא במאגר, לא פרושים; D4 חדש; המאגר 38 → 34 בלי כפילויות', () => {
    for (const id of D_IDS) {
      expect(ALTERNATES.some((a) => a.id === id), id).toBe(false);
      expect(RETIRED.some((r) => r.id === id), id).toBe(false);
    }
    expect(ALTERNATES).toHaveLength(34);
    expect(new Set(ALTERNATES.map((a) => a.id)).size).toBe(34);
    const program = WORKOUT_TYPES.flatMap((t) => PROGRAM[t].map((e) => e.id));
    for (const a of ALTERNATES) expect(program, a.id).not.toContain(a.id);
    // כל מזהה של D מופיע פעם אחת בתוכנית
    for (const id of D_IDS) expect(program.filter((x) => x === id), id).toHaveLength(1);
  });

  it('ששת התאים: החלופות אחרי ההסרה — ושום שינוי אחר בהם', () => {
    expect(exerciseIn('B', 'pec-deck')!.alternates).toEqual(['cable-fly']);
    expect(exerciseIn('B', 'db-supinated-curl')!.alternates).toEqual(['cable-bar-curl', 'db-preacher-curl']);
    expect(exerciseIn('B', 'triceps-pushdown')!.alternates).toEqual(['cable-kickback', 'db-kickback']);
    expect(exerciseIn('C', 'triceps-pushdown')!.alternates).toEqual(['cable-kickback', 'db-kickback']);
    expect(exerciseIn('A', 'db-lateral-raise-seated')!.alternates).toEqual(['db-lateral-raise-standing']);
    expect(exerciseIn('C', 'db-lateral-raise-standing')!.alternates).toEqual(['db-lateral-raise-seated']);
    // אף רשימת חלופות ב-A/B/C לא מכילה מזהה של D
    for (const t of ROTATION) for (const e of PROGRAM[t]) for (const id of MOVED) expect(e.alternates, `${t} ${e.id}`).not.toContain(id);
    // המפרט של ששת התאים — כמו קודם
    expect(exerciseIn('B', 'pec-deck')).toMatchObject({ sets: 3, repRangeMin: 10, repRangeMax: 12, effort: 'RIR 2', step: null });
    expect(exerciseIn('B', 'db-supinated-curl')).toMatchObject({ sets: 2, repRangeMin: 10, repRangeMax: 12, effort: 'RIR 1', step: 2.5 });
    expect(exerciseIn('B', 'triceps-pushdown')).toMatchObject({ sets: 2, repRangeMin: 12, repRangeMax: 15, effort: 'RIR 1', step: 5 });
    expect(exerciseIn('A', 'db-lateral-raise-seated')).toMatchObject({ sets: 3, repRangeMin: 12, repRangeMax: 15, effort: 'RIR 1', step: 2.5 });
    expect(exerciseIn('C', 'db-lateral-raise-standing')).toMatchObject({ sets: 3, repRangeMin: 12, repRangeMax: 15, effort: 'RIR 1', step: 2.5 });
  });
});

describe('2. הסבב: D שקוף ל-"הבא בתור" ולא נספר ב-3/3', () => {
  const at = (i: number, t: WorkoutType) => wk(makeWorkoutId('2026-10-26', t, `${sortableStamp(i * 1000)}-x`), `2026-10-${26 + i}`, t);

  it('אחרי A→B→C→D הבא הוא A; אחרי A→D הבא הוא B; רק D → A', () => {
    expect(nextType([at(0, 'A'), at(1, 'B'), at(2, 'C'), at(3, 'D')])).toBe('A');
    expect(nextType([at(0, 'A'), at(1, 'D')])).toBe('B');
    expect(nextType([at(0, 'D')])).toBe('A');
    expect(nextType([at(0, 'C'), at(1, 'D'), at(2, 'A'), at(3, 'D')])).toBe('B');
    // הסבב של A/B/C עצמו לא השתנה
    let list = [at(0, 'A')];
    const seen: WorkoutType[] = [];
    for (let i = 1; i <= 6; i++) {
      const t = nextType(list);
      seen.push(t);
      list = upsertWorkout(list, at(i, t));
    }
    expect(seen).toEqual(['B', 'C', 'A', 'B', 'C', 'A']);
  });

  it('rotationWorkouts מסנן D; הסיכום השבועי: "אימונים 3/3" בלי D, ושורת "אימון D: dd/mm" נפרדת', () => {
    const db = emptyDb();
    db.workouts = [
      wk('a', '2026-10-25', 'A', [le('leg-press', 60, [12, 12, 12], { rir: 2 })]),
      wk('b', '2026-10-27', 'B', [le('pec-deck', 30, [12, 12, 12], { rir: 2 })]),
      wk('c', '2026-10-29', 'C', [le('machine-row', 40, [12, 12, 12], { rir: 2 })]),
      wk('d', '2026-10-30', 'D', [le(D1, 40, [15, 15, 15], { rir: 1 }), le(D4, null, [15, 15, 15], { rir: 2 })], 3, null),
    ];
    expect(rotationWorkouts(db.workouts).map((w) => w.t)).toEqual(['A', 'B', 'C']);
    const d = buildWeeklySummaryData(db, '2026-10-25');
    expect(d.workouts.done).toBe(3);
    expect(d.workouts.planned).toBe(3);
    expect(d.workouts.items.map((it) => it.t)).toEqual(['A', 'B', 'C']);
    expect(d.workouts.optional.map((it) => it.t)).toEqual(['D']);
    // כאב כולל D (הברך של אימון D)
    expect(d.workouts.knee).toBe(3);
    expect(d.flags.some((f) => f.includes('אימונים'))).toBe(false);
    const text = buildWeeklySummary(db, '2026-10-25');
    expect(text).toContain('אימונים 3/3 · 25/10 A · 27/10 B · 29/10 C\n25/10 A\n');
    // D1 במשקל 40 ב-RIR 1 בתקרה → R1 +5 (סף 1); D4 חזרות בלבד בתקרה → "תקרה — נשארים"
    expect(text).toContain('29/10 C\n  חתירה מכונה 40×12,12,12 · RIR 2 · הבא: ');
    expect(text).toMatch(/\nאימון D: 30\/10\n  פרפר תחתון 40×15,15,15 · RIR 1 · הבא: 45 ק״ג · 12 חזרות \(R1\)\n  כפיפות לאחור 15,15,15 · RIR 2 · הבא: תקרה — נשארים · 15 חזרות \(R1\)\nכאב: ברך 3 · כתף —\n/);
  });

  it('שבוע בלי D → "אימון D: —"; D בלבד → "אימונים 0/3" + דגל, ו-D בשורה שלו; שני D → כותרת תאריך לכל אחד', () => {
    const none = buildWeeklySummary(emptyDb(), '2026-10-25');
    expect(none).toContain('אימונים 0/3\nאימון D: —\nכאב: ברך — · כתף —');
    const only = emptyDb();
    only.workouts = [wk('d', '2026-10-27', 'D', [le(D2, 15, [12, 12, 12], { rir: 1 })])];
    const dOnly = buildWeeklySummaryData(only, '2026-10-25');
    expect(dOnly.workouts.done).toBe(0);
    expect(dOnly.flags).toContain('פחות מ-3 אימונים (0/3)');
    expect(buildWeeklySummary(only, '2026-10-25')).toContain('אימונים 0/3\nאימון D: 27/10\n  כפיפת פטיש 15×12,12,12 · RIR 1 · הבא: 17.5 ק״ג · 10 חזרות (R1)\nכאב');
    const two = emptyDb();
    two.workouts = [wk('d1', '2026-10-26', 'D', [le(D3, 40, [12, 12, 12])]), wk('d2', '2026-10-29', 'D', [le(D3, 40, [15, 15, 15], { rir: 1 })])];
    const t2 = buildWeeklySummary(two, '2026-10-25');
    expect(t2).toContain('אימון D: 26/10 · 29/10\n26/10 D\n  פשיטת מרפקים מוט 40×12,12,12 · RIR — · הבא: ');
    expect(t2).toContain('29/10 D\n  פשיטת מרפקים מוט 40×15,15,15 · RIR 1 · הבא: 45 ק״ג · 10 חזרות (R1)\nכאב');
  });

  it('הדוח לצ׳אט (ייצוא): "אימונים: n/3" בלי D, שורת "אימון D: dd/mm" ואחריה שורת האימון באותו פורמט; "חסר" לפי הסבב בלבד', () => {
    const db = emptyDb();
    db.workouts = [
      wk('a', '2026-10-25', 'A', [le('leg-press', 60, [12, 12, 12])]),
      wk('d', '2026-10-28', 'D', [le(D5, 5, [15, 15]), le(D2, 10, [12, 12, 12])], null, 2),
    ];
    const text = buildChatReport(db, '2026-10-25', '2026-10-31');
    expect(text).toContain('אימונים: 1/3\n25/10 A — לג-פרס 60×12,12,12\nאימון D: 28/10\n28/10 D — הרחקה בכבל 5×15,15 · כפיפת פטיש 10×12,12,12\nכאב: ברך — · כתף 2\n');
    expect(text).toContain('חסר: אימון שני · אימון שלישי');
    expect(weekGaps(db, '2026-10-25', '2026-10-31').slice(0, 2)).toEqual(['אימון שני', 'אימון שלישי']);
    expect(buildChatReport(emptyDb(), '2026-10-25', '2026-10-31')).toContain('אימונים: 0/3\n—\nאימון D: —\nכאב');
    // סיכום השבוע במסך: אותה חלוקה
    const r = buildWeekSummary(db, '2026-10-25', '2026-10-31');
    expect(r.workouts.done).toBe(1);
    expect(r.workouts.items.map((w) => w.t)).toEqual(['A']);
    expect(r.workouts.optional.map((w) => `${w.t} ${w.d}`)).toEqual(['D 2026-10-28']);
    expect(r.workouts.shoulder).toBe(2);
  });
});

describe('3. הפרסר: D נשמר ונטען; A/B/C כמו קודם; E להסגר', () => {
  const raw = (t: string) => ({ schemaVersion: 2, id: `2026-10-28-x-${t}`, d: '2026-10-28', t, ex: [{ exerciseId: D1, n: 'פרפר- תחתון כייבל קרוס', sets: [{ weight: 10, reps: 15, seconds: null }], targetRepMin: 12, targetRepMax: 15, type: 'isolation', bodyweightOnly: false, assisted: false }], knee: null, shoulder: null });

  it('רשומה עם t: "D" נטענת; A/B/C נטענות בדיוק כמו היום; "E" נדחית להסגר', () => {
    const r = parseWorkouts([raw('A'), raw('B'), raw('C'), raw('D'), raw('E')]);
    expect(r.ok.map((w) => w.t)).toEqual(['A', 'B', 'C', 'D']);
    expect(r.unparsed).toHaveLength(1);
    expect(r.rejected[0]?.reason).toBe('סוג אימון שאינו A/B/C/D');
    expect(r.ok[3]).toMatchObject({ t: 'D', ex: [{ exerciseId: D1, targetRepMin: 12, targetRepMax: 15 }] });
  });

  it('אימון D חדש: חימום, חמשת התאים לפי הסדר עם המשקל הפותח מההיסטוריה (גם מהחלפה ישנה), ואירובי', () => {
    // היסטוריה: כפיפת פטיש שהוחלפה ב-B6 (לפני 25/10) — אותו מזהה, ולכן המשקל הפותח של D2
    const history = [wk('b', '2026-10-20', 'B', [{ ...le(D2, 12.5, [12, 12]), swappedFrom: 'db-supinated-curl' }])];
    const rows = prefilledExercises(history, 'D');
    expect(rows.map((r) => r.exerciseId)).toEqual([WARMUP_ID, ...D_IDS, FINISHER_ID]);
    expect(rows[2]!.sets.map((s) => s.weight)).toEqual([12.5, 12.5, 12.5]);
    // D4 משקל גוף בלבד: בלי שדה משקל
    expect(rows[4]!.sets.map((s) => s.weight)).toEqual([null, null, null]);
    expect(rows[5]!.sets).toHaveLength(2);
    // רשומת D בעריכה: אותם תאים, בלי שורות עודפות
    const entry = wk('d', '2026-10-28', 'D', [le(D1, 10, [15, 15, 15])]);
    expect(exercisesFor(entry, [entry]).map((r) => r.exerciseId)).toEqual([WARMUP_ID, ...D_IDS, FINISHER_ID]);
    expect(lastExercise([...history, entry], D2)?.ex.swappedFrom).toBe('db-supinated-curl');
  });

  it('רשומת B ישנה עם כפיפת פטיש שהוחלפה מ-B6 נטענת ומוצגת כמו קודם — התא של B6 תפוס על ידה', () => {
    const entry = wk('b', '2026-10-20', 'B', [{ ...le(D2, 12.5, [12, 12]), rir: 1, swappedFrom: 'db-supinated-curl' }]);
    const rows = exercisesFor(entry, [entry]);
    expect(rows.filter((r) => r.exerciseId === D2)).toHaveLength(1);
    expect(rows.some((r) => r.exerciseId === 'db-supinated-curl')).toBe(false);
    const d = buildWeeklySummaryData({ ...emptyDb(), workouts: [entry] }, '2026-10-18');
    expect(d.workouts.items[0]!.lines[0]).toMatchObject({ exerciseId: D2, swappedFrom: 'הוחלף מ-כפיפת מרפקים' });
  });

  it('אין מפתח אחסון חדש', () => {
    expect(Object.keys(STORAGE_KEYS).sort()).toEqual(
      ['checkins', 'creatine', 'customFoods', 'days', 'entries', 'favorites', 'quarantine', 'settings', 'standaloneCardio', 'targets', 'waist', 'weights', 'workouts'].sort(),
    );
  });
});

describe('4. ההצעות בתאי D (המנוע לא השתנה)', () => {
  it('D1 ו-D5 במשקל נמוך (5, step 5): R4 — קודם תקרה +2, ואז 10', () => {
    for (const id of [D1, D5]) {
      const first = suggestNext([sess(id, '2026-10-28', 5, Array.from({ length: spec(id).sets ?? 0 }, () => 15), 1)], spec(id));
      expect(first, id).toMatchObject({ rule: 'R4', action: 'same', weight: 5, repTarget: 17 });
      const second = suggestNext([sess(id, '2026-11-04', 5, Array.from({ length: spec(id).sets ?? 0 }, () => 17), 1)], spec(id));
      expect(second, id).toMatchObject({ rule: 'R1', action: 'up', weight: 10, repTarget: 12 });
    }
  });

  it('D4 חזרות בלבד: תקרה נקייה → "תקרה — נשארים" בלי משקל; מתחת לרצפה פעמיים → בלי −10%', () => {
    const top = suggestNext([sess(D4, '2026-10-28', null, [15, 15, 15], 2)], spec(D4));
    expect(top).toMatchObject({ rule: 'R1', action: 'same', weight: null, repTarget: 15 });
    expect(top!.reason).toContain(CEILING_STAY_LABEL);
    const low = suggestNext([sess(D4, '2026-10-21', null, [10, 9, 8]), sess(D4, '2026-10-28', null, [10, 9, 8])], spec(D4));
    expect(low).toMatchObject({ rule: 'R3', action: 'same', weight: null, repTarget: 10 });
  });

  it('סשן ראשון בלי היסטוריה → אין הצעה (כיול); D2 ו-D5 — הסף 1: תקרה ב-RIR 1 → R1, ב-RIR 0 → R5', () => {
    for (const id of D_IDS) expect(suggestNext([], spec(id)), id).toBeNull();
    // משקלים שבהם step/משקל ≤ 20% (אחרת R4 — נבדק למעלה)
    expect(suggestNext([sess(D2, '2026-10-28', 15, [12, 12, 12], 1)], spec(D2))).toMatchObject({ rule: 'R1', weight: 17.5, repTarget: 10 });
    expect(suggestNext([sess(D2, '2026-10-28', 15, [12, 12, 12], 0)], spec(D2))).toMatchObject({ rule: 'R5', weight: 15 });
    expect(suggestNext([sess(D5, '2026-10-28', 40, [15, 15], 1)], spec(D5))).toMatchObject({ rule: 'R1', weight: 45, repTarget: 12 });
    // D3 10–15: אמצע הטווח → R6
    expect(suggestNext([sess(D3, '2026-10-28', 20, [12, 12, 12], 1)], spec(D3))).toMatchObject({ rule: 'R6', weight: 20, repTarget: 13 });
  });
});

describe('5. הכרטיס: "החלף" בששת התאים מציג את הרשימה החדשה; בתאי D אין "החלף"', () => {
  function html(sp: Exercise, alternates: readonly AlternateOption[]): string {
    return renderToStaticMarkup(
      createElement(ExerciseFocus, {
        spec: sp,
        log: blankLoggedExercise(sp),
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
  const options = (id: string): AlternateOption[] => alternatesFor(id).map((alt) => ({ spec: alt, last: null }));

  it('ששת התאים — האפשרויות שהכרטיס מקבל ל"החלף" הן הרשימה החדשה, בלי ארבעת המזהים של D; הכפתור קיים', () => {
    const cases: [WorkoutType, string, string[]][] = [
      ['B', 'pec-deck', ['פרפר- כייבל קרוס']],
      ['B', 'db-supinated-curl', ['כפיפת מרפקים- פולי תחתון מוט', 'כפיפת מרפק- כיסא כומר מ.יד סופינציה']],
      ['B', 'triceps-pushdown', ['פשיטת מרפק- פולי עליון קיקבק', 'קיק בק- משקולות יד']],
      ['C', 'triceps-pushdown', ['פשיטת מרפק- פולי עליון קיקבק', 'קיק בק- משקולות יד']],
      ['A', 'db-lateral-raise-seated', ['הרחקת כתפיים- עמידה מ.יד']],
      ['C', 'db-lateral-raise-standing', ['הרחקת כתפיים- ישיבה מ.יד']],
    ];
    for (const [t, id, names] of cases) {
      const opts = options(id);
      // הרשימה שהמסך מעביר לכרטיס (WorkoutScreen: alternatesFor(spec.id)) — השמות החדשים, בלי מזהי D
      expect(opts.map((o) => o.spec.name), `${t} ${id}`).toEqual(names);
      for (const gone of MOVED) expect(opts.map((o) => o.spec.id), `${t} ${id} → ${gone}`).not.toContain(gone);
      // הרשימה עצמה נפתחת רק בלחיצה; בסטטי — הכפתור "החלף" קיים (יש חלופות)
      const out = html(exerciseIn(t, id)!, opts);
      expect(out, `${t} ${id}`).toContain('>החלף</button>');
    }
  });

  it('תאי D: ההערה והסרטון מוצגים, "דלג ואחזור" קיים, בלי כפתור "החלף" (אין חלופות)', () => {
    for (const e of PROGRAM.D) {
      expect(options(e.id), e.id).toEqual([]);
      const out = html(e, options(e.id));
      expect(out, e.id).toContain(`href="${VIDEOS[e.id]}"`);
      expect(out, e.id).toContain(NOTES[e.id]!.slice(0, 20));
      expect(out, e.id).toContain('דלג ואחזור');
      expect(out, e.id).not.toContain('>החלף</button>');
    }
  });
});
