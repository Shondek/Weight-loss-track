/**
 * עדכון תוכנית 16/10/2026: B5 → הרחקה אופקית במכונת פרפר, "פרפר הפוך"
 * (`reverse-pec-deck` — המזהה הקיים מהמאגר, היה החלופה הראשונה של B5).
 * החתירה האופקית בחבל (`face-pull`) עברה מהתוכנית למאגר — אותו מזהה, מפרט,
 * סרטון והיסטוריה — ואינה חלופה של B5 (החלטה קבועה). החלופה היחידה של B5
 * היא ההרחקה האופקית בפולי (`cable-reverse-fly`, קיימת במאגר, קיבלה הערה
 * וסרטון). ההרחקה עם משקולות יד (`db-reverse-fly`) נשארה במאגר בלי תא.
 *
 * 20/10/2026 — היפוך: B5 חזר לחתירה בחבל (`face-pull`, עם הערת ביצוע חדשה),
 * והפרפר ההפוך (`reverse-pec-deck`) עבר למאגר עם אותו מזהה, מפרט, הערה וסרטון
 * (programUpdate20261020.test.ts). מה שנשאר מ-16/10 ונבדק כאן: שני המזהים
 * קיימים פעם אחת כל אחד, ההרחקה בפולי עם ההערה והסרטון שלה היא החלופה היחידה
 * של B5, ההרחקה עם משקולות יד במאגר בלי תא, ההיסטוריה של שני המזהים נפרדת
 * ושלמה, רשומות ישנות (עם חתירה בחבל, או עם הפרפר ההפוך שהוחלף מחתירה בחבל)
 * נטענות כמו שהן, ואין מפתח אחסון חדש. ההנחות שהתהפכו ב-20/10 מסומנות.
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

/** B5 מ-16/10 עד 20/10/2026 — מ-20/10 במאגר. */
const REVERSE_PEC_DECK = 'reverse-pec-deck';
/** B5 מ-20/10/2026 (וגם לפני 16/10). */
const FACE_PULL = 'face-pull';
const CABLE = 'cable-reverse-fly';
const DB_FLY = 'db-reverse-fly';
const REVERSE_PEC_DECK_VIDEO = 'https://drive.google.com/file/d/1Oyyswtd8u3qB4fsimpsinv3V0dqr4H3U/view?usp=drive_link';
const CABLE_VIDEO = 'https://drive.google.com/file/d/1-fJHu5tp9fL4o9Trs-KTPSQQsD4Z0cW3/view?usp=drive_link';
const FACE_PULL_VIDEO = 'https://drive.google.com/file/d/1FIt-HIDn_y2lMc-UjVUR0BDZiHHStjg1/view?usp=drive_link';
const REVERSE_PEC_DECK_NOTE = 'פרפר הפוך. פנים לכרית, החזה צמוד אליה · ידיות בגובה הכתף, לא מעל · מרפקים מעט כפופים וקבועים · התנועה מהכתף, בלי למשוך עם הידיים ובלי להרים כתפיים · חזרה איטית.';
const CABLE_NOTE = 'כבלים בגובה הכתף, לא מעל · מרפקים מעט כפופים וקבועים · התנועה מהכתף.';

// 20/10/2026: B5 הוא שוב החתירה בחבל
const B_ORDER = ['barbell-rdl', 'seated-cable-row', 'pec-deck', 'leg-curl', FACE_PULL, 'db-supinated-curl', 'triceps-pushdown', 'floor-leg-raise'];

const ids = (list: { exerciseId: string }[]) => list.map((e) => e.exerciseId);

/** שני אימוני B ישנים, מלפני 16/10, עם החתירה בחבל ב-B5. */
const B_OCT06 = wk('b-1006', '2026-10-06', 'B', [
  le('db-rdl', 25, [10, 10, 10]),
  le('seated-cable-row', 45, [12, 12, 12]),
  { ...le(FACE_PULL, 15, [20, 20, 18]), rir: 1 },
]);
const B_OCT13 = wk('b-1013', '2026-10-13', 'B', [
  { ...le('barbell-rdl', 40, [10, 10, 10]), rir: 3 },
  le('seated-cable-row', 45, [12, 12, 12]),
  le('pec-deck', 30, [12, 12, 12]),
  le('leg-curl', 30, [12, 12, 12]),
  { ...le(FACE_PULL, 20, [20, 20, 20]), rir: 2 },
  le('db-supinated-curl', 10, [12, 12]),
  le('triceps-pushdown', 25, [15, 15]),
  le('floor-leg-raise', null, [12, 12, 12]),
]);
const ALL = [B_OCT06, B_OCT13];

describe('הפרפר ההפוך (reverse-pec-deck) — מ-16/10/2026 בתוכנית, מ-20/10/2026 במאגר', () => {
  it('20/10/2026: המפרט מ-16/10 נשמר במאגר — אותו מזהה, שם, 3×15–20, בידוד, step null, ההערה והסרטון; לא בתוכנית, לא בפרושים, לא חלופה של אף תא', () => {
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
      mode: 'progress',
      bodyweightStart: false,
      bodyweightOnly: false,
      isTimed: false,
      unilateral: false,
      assisted: false,
      note: REVERSE_PEC_DECK_NOTE,
      videoUrl: REVERSE_PEC_DECK_VIDEO,
      alternates: [],
    });
    expect(ALTERNATES.filter((a) => a.id === REVERSE_PEC_DECK)).toHaveLength(1);
    expect(RETIRED.some((r) => r.id === REVERSE_PEC_DECK)).toBe(false);
    for (const t of WORKOUT_TYPES) expect(exerciseIn(t, REVERSE_PEC_DECK)).toBeUndefined();
    expect(resolveExerciseId('הרחקה אופקית- מכונת פרפר')).toBe(REVERSE_PEC_DECK);
    expect(alternatesFor(REVERSE_PEC_DECK)).toEqual([]);
    for (const t of WORKOUT_TYPES) {
      for (const e of PROGRAM[t]) expect(e.alternates, e.id).not.toContain(REVERSE_PEC_DECK);
    }
    expect(PROGRAM.B.map((e) => e.id)).toEqual(B_ORDER);
  });

  it('אותה מכונה כמו B3 (פרפר): ה-step של הפרפר ההפוך שווה ל-step של B3 — null, "דרגה אחת"', () => {
    const b3 = exerciseIn('B', 'pec-deck')!;
    expect(PROGRAM.B[2]).toBe(b3);
    expect(b3.step).toBeNull();
    expect(exerciseById(REVERSE_PEC_DECK)!.step).toBe(b3.step);
  });

  it('אימון B: 8 תאים, 22 סטים; סדר התרגילים לא זז פרט לתא B5', () => {
    expect(PROGRAM.B).toHaveLength(8);
    expect(PROGRAM.B.reduce((n, e) => n + e.sets, 0)).toBe(22);
    expect(PROGRAM.B.map((e) => e.id)).toEqual(B_ORDER);
  });

  it('לכל התאים בתוכנית (A, B, C) יש סרטון', () => {
    for (const t of WORKOUT_TYPES) {
      for (const e of PROGRAM[t]) {
        expect(e.videoUrl, `${t}: ${e.id}`).toMatch(/^https:\/\/drive\.google\.com\/file\/d\//);
      }
    }
  });

  it('"החלף" ב-B5: ההרחקה בפולי בלבד — עם ההערה והסרטון שלה, step 5 כמו שאר תרגילי הפולי; לא נוצר כפיל', () => {
    // 20/10/2026: התא הוא החתירה בחבל; רשימת החלופות לא השתנתה
    expect(alternatesFor(FACE_PULL).map((a) => a.id)).toEqual([CABLE]);
    expect(alternatesFor(FACE_PULL).map((a) => a.name)).toEqual(['הרחקה אופקית- פולי גובה כתף']);
    const cable = exerciseById(CABLE)!;
    expect(cable).toMatchObject({
      id: CABLE,
      name: 'הרחקה אופקית- פולי גובה כתף',
      short: 'הרחקה בפולי',
      machine: 'Cable',
      type: 'isolation',
      sets: 3,
      repRangeMin: 15,
      repRangeMax: 20,
      step: 5,
      note: CABLE_NOTE,
      videoUrl: CABLE_VIDEO,
      mode: 'progress',
      bodyweightStart: false,
    });
    expect(ALTERNATES.filter((a) => a.id === CABLE)).toHaveLength(1);
    expect(ALTERNATES.filter((a) => a.name === 'הרחקה אופקית- פולי גובה כתף')).toHaveLength(1);
    expect(RETIRED.some((r) => r.id === CABLE)).toBe(false);
    for (const t of WORKOUT_TYPES) expect(exerciseIn(t, CABLE)).toBeUndefined();
    for (const id of ['cable-fly', 'cable-low-fly', 'seated-cable-row', 'triceps-pushdown']) expect(exerciseById(id)?.step, id).toBe(cable.step);
  });

  it('החתירה בחבל: אותו מזהה, שם, 3×15–20, step 5, אותו סרטון — מ-20/10/2026 שוב בתוכנית (B5), לא במאגר ולא בפרושים; השמות הישנים נפתרים אליה', () => {
    const facePull = exerciseById(FACE_PULL)!;
    expect(facePull).toMatchObject({
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
      videoUrl: FACE_PULL_VIDEO,
      mode: 'progress',
      bodyweightStart: false,
      alternates: [CABLE],
    });
    expect(exerciseIn('B', FACE_PULL)).toBe(facePull);
    expect(ALTERNATES.some((a) => a.id === FACE_PULL)).toBe(false);
    expect(RETIRED.some((r) => r.id === FACE_PULL)).toBe(false);
    for (const t of WORKOUT_TYPES) {
      for (const e of PROGRAM[t]) expect(e.alternates, e.id).not.toContain(FACE_PULL);
    }
    // השמות הישנים עדיין נפתרים אליה — ההיסטוריה מתחברת
    expect(resolveExerciseId('חתירה אופקית- חבל')).toBe(FACE_PULL);
    expect(EXERCISE_ALIASES['פייס פול']).toBe(FACE_PULL);
    expect(resolveExerciseId('פייס פול')).toBe(FACE_PULL);
  });

  it('ההרחקה עם משקולות יד נשארה במאגר כמו שהייתה — בלי תא ובלי שינוי', () => {
    expect(exerciseById(DB_FLY)).toMatchObject({ id: DB_FLY, name: 'הרחקה אופקית עם משקולות יד', sets: 3, repRangeMin: 15, repRangeMax: 20, step: 2.5, note: null, videoUrl: null });
    expect(ALTERNATES.some((a) => a.id === DB_FLY)).toBe(true);
    for (const t of WORKOUT_TYPES) {
      expect(exerciseIn(t, DB_FLY)).toBeUndefined();
      for (const e of PROGRAM[t]) expect(e.alternates, e.id).not.toContain(DB_FLY);
    }
  });

  it('מספר התרגילים בתוכנית ובמאגר לא השתנה — שני המזהים נספרים, כל אחד פעם אחת', () => {
    const all = [...WORKOUT_TYPES.flatMap((t) => PROGRAM[t].map((e) => e.id)), ...ALTERNATES.map((a) => a.id)];
    const unique = new Set(all);
    expect(unique.has(REVERSE_PEC_DECK)).toBe(true);
    expect(unique.has(FACE_PULL)).toBe(true);
    expect(unique.has(CABLE)).toBe(true);
    // 17/10/2026: +2 מזהים חדשים בתוכנית (C3 סמית, C6 כיסא כומר) ו-+2 במאגר (בנץ׳ עליון מ.יד, כפיפת מרפקים בחבל). 20/10/2026: החלפת מקום — אותו מספר.
    expect(unique.size - 1).toBe(58);
    expect(ALTERNATES).toHaveLength(38);
    expect(new Set(ALTERNATES.map((a) => a.id)).size).toBe(38);
  });
});

describe('ההיסטוריה של החתירה בחבל — שלמה', () => {
  it('רשומות ישנות של B עם face-pull נטענות כמו שהן; ההיסטוריה לפי המזהה מלאה, עם המשקלים וה-RIR', () => {
    const r = parseWorkouts(ALL);
    expect(r.rejected).toEqual([]);
    expect(r.ok).toEqual(ALL);
    const h = exerciseHistory(ALL, FACE_PULL);
    expect(h.map((x) => x.d)).toEqual(['2026-10-06', '2026-10-13']);
    expect(h.map((x) => x.ex.sets.map((s) => s.weight))).toEqual([[15, 15, 15], [20, 20, 20]]);
    expect(h.map((x) => x.ex.rir)).toEqual([1, 2]);
    expect(lastExercise(ALL, FACE_PULL)?.d).toBe('2026-10-13');
    expect(openingWeight(ALL, FACE_PULL)).toBe(20);
    // ההצעה לחתירה בחבל מחושבת בדיוק כמו קודם: תקרה עם RIR 2 ב-20 ק״ג, אבל step 5 הוא קפיצה גדולה ביחס למשקל → R4: קודם 22 בכל הסטים
    expect(suggestNext(h, exerciseById(FACE_PULL)!)).toMatchObject({ action: 'same', weight: 20, rule: 'R4', repTarget: 22, basisWeight: 20 });
    // ההיסטוריה של הפרפר ההפוך ריקה — לא "ירשה" דבר מהחתירה בחבל
    expect(exerciseHistory(ALL, REVERSE_PEC_DECK)).toEqual([]);
    expect(openingWeight(ALL, REVERSE_PEC_DECK)).toBeNull();
  });

  it('אימון B ישן נפתח לעריכה עם החתירה בחבל במקומה ועם הנתונים; 20/10/2026: היא שוב התא עצמו — בלי שורה ריקה לפרפר ההפוך', () => {
    const rows = exercisesFor(B_OCT13, ALL);
    expect(ids(rows)).toEqual([WARMUP_ID, 'barbell-rdl', 'seated-cable-row', 'pec-deck', 'leg-curl', FACE_PULL, 'db-supinated-curl', 'triceps-pushdown', 'floor-leg-raise', FINISHER_ID]);
    const facePull = rows.find((x) => x.exerciseId === FACE_PULL)!;
    expect(facePull).toMatchObject({ n: 'חתירה אופקית- חבל', targetRepMin: 15, targetRepMax: 20 });
    expect(facePull.sets).toEqual([{ weight: 20, reps: 20, seconds: null }, { weight: 20, reps: 20, seconds: null }, { weight: 20, reps: 20, seconds: null }]);
    expect(hasData(facePull)).toBe(true);
    expect(ids(rows)).not.toContain(REVERSE_PEC_DECK);
    expect(ids(skippedExercises(B_OCT13))).not.toContain(REVERSE_PEC_DECK);
    expect(ids(skippedExercises(B_OCT13))).not.toContain(FACE_PULL);
  });

  it('הסיכום השבועי והדוח של אימון B ישן: שורת החתירה בחבל עם ההצעה שלה (R4 — קפיצה גדולה ביחס למשקל), בלי שורה לפרפר ההפוך', () => {
    const db = { ...emptyDb(), workouts: ALL };
    const text = buildWeeklySummary(db, '2026-10-13');
    expect(text).toContain('חתירה אופקית חבל 20×20,20,20 · RIR 2 · הבא: 20 ק״ג · 22 חזרות (R4)');
    expect(text).not.toContain('פרפר הפוך');
    const report = buildChatReport(db, '2026-10-11', '2026-10-17');
    expect(report).toContain('חתירה אופקית חבל 20×20,20,20');
    expect(report).not.toContain('פרפר הפוך');
    expect(report).not.toMatch(/דולגו:.*פרפר הפוך/);
  });
});

describe('אימון B חדש ו"החלף"', () => {
  it('B חדש (20/10/2026): B5 הוא החתירה בחבל עם המשקל הפותח מההיסטוריה שלה; לפרפר ההפוך אין תא', () => {
    const rows = prefilledExercises(ALL, 'B');
    expect(ids(rows)).toEqual([WARMUP_ID, ...B_ORDER, FINISHER_ID]);
    const b5 = rows[5]!;
    expect(b5).toMatchObject({ exerciseId: FACE_PULL, n: 'חתירה אופקית- חבל', targetRepMin: 15, targetRepMax: 20, type: 'isolation', bodyweightOnly: false });
    expect(b5.sets).toHaveLength(3);
    expect(b5.sets.every((s) => s.weight === 20 && s.reps === null && s.seconds === null)).toBe(true);
    expect(ids(rows)).not.toContain(REVERSE_PEC_DECK);
    expect(suggestNext(exerciseHistory(ALL, REVERSE_PEC_DECK), exerciseById(REVERSE_PEC_DECK)!)).toBeNull();
    expect(suggestNext([], exerciseById(REVERSE_PEC_DECK)!)).toBeNull();
  });

  it('סשן של הפרפר ההפוך 30×20,20,20 עם RIR 2 → "דרגה אחת למעלה" (R1, step null, בלי מספר); ההיסטוריה שלו לא מערבבת את החתירה בחבל', () => {
    const first = wk('b-1016', '2026-10-16', 'B', [{ ...le(REVERSE_PEC_DECK, 30, [20, 20, 20]), rir: 2 }]);
    const all = [...ALL, first];
    expect(exerciseHistory(all, REVERSE_PEC_DECK)).toHaveLength(1);
    expect(exerciseHistory(all, FACE_PULL)).toHaveLength(2);
    expect(suggestNext(exerciseHistory(all, REVERSE_PEC_DECK), exerciseById(REVERSE_PEC_DECK)!)).toMatchObject({ action: 'up', weight: null, rule: 'R1', repTarget: 15, basisWeight: 30 });
    expect(suggestNext(exerciseHistory(all, REVERSE_PEC_DECK), exerciseById(REVERSE_PEC_DECK)!)?.reason).toContain('דרגה אחת למעלה');
    expect(openingWeight(all, REVERSE_PEC_DECK)).toBe(30);
    expect(openingWeight(all, FACE_PULL)).toBe(20);
  });

  it('"החלף" ב-B5 מציע רק את ההרחקה בפולי — בלי היסטוריה, סטים ריקים, יורשת 3×15–20', () => {
    const slot = exerciseIn('B', FACE_PULL)!;
    const alts = alternatesFor(FACE_PULL);
    expect(alts.map((a) => a.id)).toEqual([CABLE]);
    const row = swapExercise(slot, alts[0]!, openingWeight(ALL, CABLE));
    expect(row).toMatchObject({ exerciseId: CABLE, n: 'הרחקה אופקית- פולי גובה כתף', swappedFrom: FACE_PULL, targetRepMin: 15, targetRepMax: 20 });
    expect(row.sets).toHaveLength(3);
    expect(row.sets.every((s) => s.weight === null)).toBe(true);
    expect(suggestNext(exerciseHistory(ALL, CABLE), { ...alts[0]!, sets: slot.sets })).toBeNull();
  });

  it('רשומה ישנה שבה B5 הוחלף מחתירה בחבל לפרפר ההפוך (swappedFrom: face-pull) נטענת כמו שהיא; ההיסטוריה של הפרפר ההפוך ממשיכה לפי המזהה, והשורה תופסת את תא B5', () => {
    const old = { ...le(REVERSE_PEC_DECK, 25, [20, 20, 20]), swappedFrom: FACE_PULL, rir: 2 as const };
    const r = parseWorkouts([wk('b-swap', '2026-10-09', 'B', [old])]);
    expect(r.rejected).toEqual([]);
    expect(r.ok[0]?.ex[0]).toMatchObject({ exerciseId: REVERSE_PEC_DECK, swappedFrom: FACE_PULL, targetRepMin: 15, targetRepMax: 20 });
    const all = [...ALL, ...r.ok];
    expect(exerciseHistory(all, REVERSE_PEC_DECK).map((h) => h.d)).toEqual(['2026-10-09']);
    expect(openingWeight(all, REVERSE_PEC_DECK)).toBe(25);
    expect(suggestNext(exerciseHistory(all, REVERSE_PEC_DECK), exerciseById(REVERSE_PEC_DECK)!)).toMatchObject({ action: 'up', weight: null, rule: 'R1' });
    // עריכת הרשומה הישנה: השורה שהוחלפה תופסת את תא B5 (החתירה בחבל) — אין שורה ריקה לחתירה בחבל
    const rows = exercisesFor(r.ok[0]!, all);
    expect(ids(rows)).not.toContain(FACE_PULL);
    const withData = rows.filter((x) => x.exerciseId === REVERSE_PEC_DECK && hasData(x));
    expect(withData).toHaveLength(1);
    expect(withData[0]).toMatchObject({ swappedFrom: FACE_PULL });
    expect(withData[0]!.sets.map((x) => x.weight)).toEqual([25, 25, 25]);
    expect(ids(skippedExercises(r.ok[0]!))).not.toContain(REVERSE_PEC_DECK);
    expect(ids(skippedExercises(r.ok[0]!))).not.toContain(FACE_PULL);
  });
});

describe('מסך התרגיל — B5 עם סרטון, הערה ו"החלף"', () => {
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

  it('B5 (20/10/2026 — חתירה בחבל): קישור ▶ לסרטון שלה, "החלף" ו"דלג ואחזור"; החלופה היחידה — ההרחקה בפולי, בלי היסטוריה; הסרטון של הפרפר ההפוך לא מופיע', () => {
    const spec = exerciseIn('B', FACE_PULL)!;
    const options: AlternateOption[] = alternatesFor(FACE_PULL).map((alt) => ({ spec: alt, last: lastExercise(ALL, alt.id) }));
    const out = html(spec, options);
    expect(out).toContain(`href="${FACE_PULL_VIDEO}"`);
    expect(out).toContain('target="_blank"');
    expect(out).toContain('סרטון הדגמה — חתירה אופקית- חבל');
    expect(out).toContain('>החלף<');
    expect(out).toContain('>דלג ואחזור<');
    expect(out).toContain('משקל — חתירה אופקית- חבל');
    expect(out).toContain('aria-expanded="false"');
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
