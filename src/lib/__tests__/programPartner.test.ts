/**
 * התוכנית של בת הזוג (25/10/2026): `program-partner.json` נבנית באותה בנייה
 * כמו `program-abc.json`, שני אימונים A↔B לסירוגין, 2 סטים בכל תא, RIR 2-3,
 * שמות ומזהים מהמאגר של שון, חלופה אחת ב-B2, והמנוע (R1–R6) בלי שינוי.
 *
 * החלק האחרון טוען את המודולים מחדש עם הפרופיל `partner` ובודק שהחיווט
 * האמיתי — `PROGRAM`, `nextType`, `prefilledExercises`, `exercisesFor` —
 * מציג את התוכנית שלה. הקובץ מבודד: ב-vitest לכל קובץ בדיקה רישום מודולים
 * משלו, ולכן הפרופיל לא דולף לבדיקות אחרות.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Rir } from '../../types';
import { setActiveProfile } from '../../data/profile';
import {
  ABC_ROTATION,
  PARTNER_ROTATION,
  PROGRAM,
  WORKOUT_TYPES,
  buildAbcProgram,
  buildPartnerProgram,
} from '../../data/program';
import type { Exercise } from '../../data/programBuild';
import { rirThreshold, suggestNext, type ProgressionSpec, type Session } from '../progression';
import { nextInRotation } from '../workouts';
import { le, wk } from './helpers';

const partner = buildPartnerProgram();
const abc = buildAbcProgram();
const A = partner.program.A;
const B = partner.program.B;
const CELLS = [...A, ...B];

/** המאגר של שון: תוכנית + חלופות + פרושים — לפי מזהה. */
const LIBRARY = abc.byId;

/** 14 התאים: תא → מזהה, והאם הוא קיים במאגר של שון. */
const EXPECTED: { cell: string; id: string; name: string; inLibrary: boolean; video: boolean }[] = [
  { cell: 'A1', id: 'leg-press', name: 'לג-פרס במכונה בישיבה', inLibrary: true, video: true },
  { cell: 'A2', id: 'back-extension', name: 'פשיטת ירך בספסל רומי', inLibrary: true, video: true },
  { cell: 'A3', id: 'lat-pulldown', name: 'משיכה מפולי עליון- אחיזה רחבה בישיבה', inLibrary: true, video: true },
  { cell: 'A4', id: 'db-bench-press', name: "בנץ' פרס- משקולות יד", inLibrary: true, video: true },
  { cell: 'A5', id: 'leg-curl', name: 'כפיפת ברכיים במכונה', inLibrary: true, video: true },
  { cell: 'A6', id: 'reverse-pec-deck', name: 'הרחקה אופקית- מכונת פרפר', inLibrary: true, video: true },
  { cell: 'A7', id: 'plank', name: 'בטן- פלאנק סטטי', inLibrary: true, video: true },
  { cell: 'B1', id: 'db-step-up', name: 'עליות קובייה- מ.יד', inLibrary: true, video: true },
  { cell: 'B2', id: 'db-rdl', name: 'דד-ליפט רומניין עם מ.יד', inLibrary: true, video: true },
  { cell: 'B3', id: 'machine-row', name: 'חתירה- מכונה ייעודית', inLibrary: true, video: true },
  { cell: 'B4', id: 'machine-shoulder-press', name: 'פרס- מכונה', inLibrary: false, video: true },
  { cell: 'B5', id: 'machine-hip-abduction', name: 'הרחקת ירך במכונה', inLibrary: true, video: true },
  { cell: 'B6', id: 'triceps-pushdown', name: 'פשיטת מרפקים- פולי עליון חבל', inLibrary: true, video: true },
  { cell: 'B7', id: 'cable-torso-rotation', name: 'בטן- רוטציות גו פולי אמצעי', inLibrary: true, video: true },
];

const specOf = (e: Exercise): ProgressionSpec => ({
  step: e.step,
  repRangeMin: e.repRangeMin,
  repRangeMax: e.repRangeMax,
  isTimed: e.isTimed,
  bodyweightOnly: e.bodyweightOnly,
  mode: e.mode,
  sets: e.sets,
  bodyweightStart: e.bodyweightStart,
  effort: e.effort,
});

function sess(id: string, d: string, weight: number | null, values: number[], rir?: Rir): Session {
  const spec = partner.byId.get(id)!;
  const timed = spec.isTimed;
  const ex = {
    ...le(id, weight, values),
    sets: values.map((v) => ({ weight: timed || spec.bodyweightOnly ? null : weight, reps: timed ? null : v, seconds: timed ? v : null })),
    n: spec.name,
    targetRepMin: spec.repRangeMin,
    targetRepMax: spec.repRangeMax,
    type: spec.type,
    bodyweightOnly: spec.bodyweightOnly,
  };
  return { d, ex: rir === undefined ? ex : { ...ex, rir } };
}

describe('1. בלי פרופיל — התוכנית של שון כמו היום', () => {
  it('המודול טוען A/B/C/D עם הסבב A→B→C; זהה לבנייה הישירה של program-abc.json', () => {
    expect(WORKOUT_TYPES).toEqual(['A', 'B', 'C', 'D']);
    expect(ABC_ROTATION).toEqual(['A', 'B', 'C']);
    for (const t of WORKOUT_TYPES) expect(PROGRAM[t].map((e) => e.id)).toEqual(abc.program[t].map((e) => e.id));
    expect(abc.program.A).toHaveLength(8);
    expect(abc.program.D).toHaveLength(5);
  });

  it('אף תא של שון לא מפנה למזהה שקיים רק בתוכנית שלה (פרס- מכונה אסור אצלו — כתף)', () => {
    const onlyHers = CELLS.map((e) => e.id).filter((id) => !LIBRARY.has(id));
    expect(onlyHers).toEqual(['machine-shoulder-press']);
    for (const t of abc.types) {
      for (const e of abc.program[t]) {
        expect(onlyHers, `${t}: ${e.id}`).not.toContain(e.id);
        for (const alt of e.alternates) expect(onlyHers, `${t}: ${e.id} → ${alt}`).not.toContain(alt);
      }
    }
    expect(abc.byId.has('machine-shoulder-press')).toBe(false);
  });
});

describe('2. program-partner.json — מבנה', () => {
  it('שני אימונים, A ו-B, 7 תאים בכל אחד, כותרות מילה במילה, הסבב A↔B, בלי פרושים', () => {
    expect(partner.types).toEqual(['A', 'B']);
    expect(partner.rotation).toEqual(['A', 'B']);
    expect(PARTNER_ROTATION).toEqual(['A', 'B']);
    expect(partner.titles.A).toBe('A — רגליים, ישבן, גב, חזה');
    expect(partner.titles.B).toBe('B — ישבן, ירך אחורית, גב, כתפיים');
    expect(A).toHaveLength(7);
    expect(B).toHaveLength(7);
    // סוגים שאינם בתוכנית שלה: ריקים, לא שגיאה — רשומה מיובאת עם C/D עדיין נטענת.
    expect(partner.program.C).toEqual([]);
    expect(partner.program.D).toEqual([]);
    expect(partner.titles.C).toBe('');
    expect(partner.retired).toEqual([]);
  });

  it('14 התאים: מזהה, שם מילה במילה, ו-videoUrl מהמאגר של שון לפי השם; מזהה חדש אחד; סרטון בכל תא', () => {
    expect(CELLS.map((e) => e.id)).toEqual(EXPECTED.map((x) => x.id));
    for (const [i, x] of EXPECTED.entries()) {
      const cell = CELLS[i]!;
      expect(cell.name, x.cell).toBe(x.name);
      const lib = LIBRARY.get(x.id);
      expect(lib !== undefined, `${x.cell} ${x.id} במאגר`).toBe(x.inLibrary);
      if (lib) {
        expect(cell.name, `${x.cell} שם כמו במאגר`).toBe(lib.name);
        // סרטון כמו במאגר; תרגיל שבמאגר אין לו סרטון (db-step-up, פרוש) קיבל אחד כאן.
        if (lib.videoUrl !== null) expect(cell.videoUrl, `${x.cell} סרטון כמו במאגר`).toBe(lib.videoUrl);
        expect(cell.machine, `${x.cell} מכונה`).toBe(lib.machine);
        expect(cell.type, `${x.cell} סוג`).toBe(lib.type);
      }
      expect(cell.videoUrl !== null, `${x.cell} יש סרטון`).toBe(x.video);
      expect(cell.videoUrl, `${x.cell} https`).toMatch(/^https:\/\//);
    }
  });

  it('2 סטים בכל תא (שבועיים ראשונים) ו-effort "RIR 2-3" בכל תא — הסף 2', () => {
    for (const e of CELLS) {
      expect(e.sets, e.id).toBe(2);
      expect(e.effort, e.id).toBe('RIR 2-3');
      expect(rirThreshold(e.effort), e.id).toBe(2);
    }
  });

  it('טווחים לפי התוכנית; "לכל רגל"/"לכל צד" → unilateral', () => {
    const ranges = CELLS.map((e) => [e.repRangeMin, e.repRangeMax]);
    expect(ranges).toEqual([
      [10, 12], [10, 15], [10, 12], [10, 12], [10, 12], [12, 15], [20, 40],
      [10, 12], [10, 12], [10, 12], [10, 12], [15, 20], [12, 15], [10, 12],
    ]);
    expect(partner.byId.get('db-step-up')).toMatchObject({ reps: '10-12 לכל רגל', unilateral: true });
    expect(partner.byId.get('cable-torso-rotation')).toMatchObject({ reps: '10-12 לכל צד', unilateral: true });
    for (const e of CELLS) {
      const nums = e.reps.match(/\d+/g)?.map(Number) ?? [];
      expect(nums[0], e.id).toBe(e.repRangeMin);
      expect(nums[nums.length - 1], e.id).toBe(e.repRangeMax);
      if (/לרגל|לצד|ליד/.test(e.reps)) expect(e.unilateral, e.id).toBe(true);
    }
  });

  it('step לפי הציוד: משקולות יד 2.5, פולי 5, לג-פרס 5, מכונות פלטות null', () => {
    const steps = Object.fromEntries(CELLS.map((e) => [e.id, e.step]));
    expect(steps).toEqual({
      'leg-press': 5,
      'back-extension': 2.5,
      'lat-pulldown': 5,
      'db-bench-press': 2.5,
      'leg-curl': null,
      'reverse-pec-deck': null,
      plank: null,
      'db-step-up': 2.5,
      'db-rdl': 2.5,
      'machine-row': null,
      'machine-shoulder-press': null,
      'machine-hip-abduction': null,
      'triceps-pushdown': 5,
      'cable-torso-rotation': 5,
    });
  });

  it('ההערות מילה במילה', () => {
    const notes = Object.fromEntries(CELLS.map((e) => [e.id, e.note]));
    expect(notes).toEqual({
      'leg-press': 'כפות הרגליים גבוה ורחב על הפלטה — יותר עבודה לישבן. הברכיים לא יורדות לחזה.',
      'back-extension': 'מתחילים במשקל גוף. הכרית מתחת לעצמות האגן, התנועה מהירך. עולים עד קו ישר עם הגוף, לא מעבר. 15 חזרות נקיות בכל הסטים → משקולת קלה מול החזה.',
      'lat-pulldown': 'מושכים את המוט לחזה העליון, לא מאחורי הראש. השכמות למטה.',
      'db-bench-press': 'משקולות קלות. מרפקים בזווית של בערך 45° מהגוף.',
      'leg-curl': null,
      'reverse-pec-deck': 'פנים לכרית, החזה צמוד אליה. ידיות בגובה הכתף. מרפקים מעט כפופים וקבועים.',
      plank: 'גוף בקו ישר מהכתפיים לעקבים. האגן לא שוקע ולא עולה.',
      'db-step-up': 'קובייה נמוכה. מתחילים בלי משקולות. דוחפים דרך העקב של הרגל שעל הקובייה.',
      'db-rdl': 'המשקולות צמודות לרגליים. האגן אחורה, גב ישר, ברכיים רכות. עוצרים במתיחה באחורי הירך — המשקולות לא נוגעות ברצפה.',
      'machine-row': 'החזה צמוד לכרית לאורך כל הסט.',
      'machine-shoulder-press': 'הגב צמוד למשענת. למעלה לא נועלים את המרפקים.',
      'machine-hip-abduction': null,
      'triceps-pushdown': 'מרפקים צמודים לגוף ולא זזים.',
      'cable-torso-rotation': 'בעמידה. הסיבוב מהגו, הידיים ישרות.',
    });
  });

  it('bodyweightStart ב-A2 (ספסל רומי) וב-B1 (עליות קובייה) בלבד — עם step 2.5 ובלי bodyweightOnly', () => {
    const starters = CELLS.filter((e) => e.bodyweightStart).map((e) => e.id);
    expect(starters).toEqual(['back-extension', 'db-step-up']);
    for (const id of starters) expect(partner.byId.get(id)).toMatchObject({ step: 2.5, bodyweightOnly: false });
  });

  it('הפלאנק: זמן, משקל גוף, mode "reps" (התקדמות בשניות דרך הכללים הרגילים), 20–40 שנ׳', () => {
    expect(partner.byId.get('plank')).toMatchObject({ isTimed: true, bodyweightOnly: true, mode: 'reps', repRangeMin: 20, repRangeMax: 40, reps: "20-40 שנ'", step: null });
  });

  it('חלופה אחת בלבד: B2 → כפיפת ברכיים במכונה רגל-רגל; בכל תא אחר אין', () => {
    expect(partner.alternates.map((e) => e.id)).toEqual(['single-leg-curl']);
    expect(partner.byId.get('single-leg-curl')).toMatchObject({ name: 'כפיפת ברכיים במכונה רגל-רגל', unilateral: true });
    expect(partner.byId.get('single-leg-curl')?.videoUrl).toMatch(/^https:\/\/drive\.google\.com\//);
    // המאגר של שון לא השתנה — החלופה שם עדיין בלי סרטון.
    expect(LIBRARY.get('single-leg-curl')?.videoUrl).toBeNull();
    expect(LIBRARY.get('single-leg-curl')?.name).toBe('כפיפת ברכיים במכונה רגל-רגל');
    for (const e of CELLS) expect(e.alternates, e.id).toEqual(e.id === 'db-rdl' ? ['single-leg-curl'] : []);
  });

  it('הבנייה מאמתת: סבב שדורש אימון חסר נכשל; קוד לא מוכר נכשל', () => {
    const json = { workouts: [{ code: 'A', title: 'x', exercises: [] }], retired: [], alternates: [] };
    expect(() => buildAbcProgram()).not.toThrow();
    expect(() => buildPartnerProgram()).not.toThrow();
    return import('../../data/programBuild').then(({ buildProgram }) => {
      expect(() => buildProgram(json, 'x.json', ['A', 'B'])).toThrow('x.json: חסר אימון B');
      expect(() => buildProgram({ ...json, workouts: [{ code: 'E', title: 'x', exercises: [] }] }, 'x.json', [])).toThrow('קוד אימון לא מוכר');
    });
  });
});

describe('3. הסבב A↔B — האימון הבא הוא זה שלא בוצע בפעם האחרונה', () => {
  it('בלי היסטוריה → A; אחרי A → B; אחרי B → A; ללא תלות בימים', () => {
    const r = PARTNER_ROTATION;
    expect(nextInRotation([], r)).toBe('A');
    expect(nextInRotation([wk('w1', '2026-11-01', 'A')], r)).toBe('B');
    expect(nextInRotation([wk('w1', '2026-11-01', 'A'), wk('w2', '2026-11-03', 'B')], r)).toBe('A');
    expect(nextInRotation([wk('w1', '2026-11-01', 'A'), wk('w2', '2026-11-03', 'B'), wk('w3', '2026-11-09', 'A')], r)).toBe('B');
    // שני אימונים באותו יום — לפי סדר המזהים (סדר היצירה).
    expect(nextInRotation([wk('2026-11-01-a', '2026-11-01', 'A'), wk('2026-11-01-b', '2026-11-01', 'B')], r)).toBe('A');
  });

  it('הסבב של שון דרך אותה פונקציה — זהה ל-nextType של היום (A→B→C, D שקוף)', () => {
    const r = ABC_ROTATION;
    expect(nextInRotation([], r)).toBe('A');
    expect(nextInRotation([wk('w1', '2026-10-01', 'C')], r)).toBe('A');
    expect(nextInRotation([wk('w1', '2026-10-01', 'A'), wk('w2', '2026-10-02', 'D')], r)).toBe('B');
  });
});

describe('4. ההצעות — המנוע בלי שינוי, על המפרט שלה', () => {
  it('R4 במשקולת קלה: בנץ׳ פרס מ.יד ב-5 ק״ג, 12×2 עם RIR 2 → קודם 14, ואז 7.5', () => {
    const spec = specOf(partner.byId.get('db-bench-press')!);
    const first = suggestNext([sess('db-bench-press', '2026-11-01', 5, [12, 12], 2)], spec);
    expect(first).toMatchObject({ rule: 'R4', action: 'same', weight: 5, repTarget: 14 });
    const second = suggestNext([sess('db-bench-press', '2026-11-01', 5, [14, 14], 2)], spec);
    expect(second).toMatchObject({ rule: 'R1', action: 'up', weight: 7.5, repTarget: 10 });
    // ב-20 ק״ג 2.5 כבר אינו קפיצה גדולה (12.5%) → R1 ישיר.
    expect(suggestNext([sess('db-bench-press', '2026-11-01', 20, [12, 12], 2)], spec)).toMatchObject({ rule: 'R1', weight: 22.5 });
  });

  it('הסף 2 ("RIR 2-3"): תקרה ב-RIR 2 → R1; ב-RIR 1 → R5; בלי RIR → R1 עם "אשר בעצמך"', () => {
    const spec = specOf(partner.byId.get('lat-pulldown')!);
    expect(suggestNext([sess('lat-pulldown', '2026-11-01', 30, [12, 12], 2)], spec)).toMatchObject({ rule: 'R1', weight: 35 });
    expect(suggestNext([sess('lat-pulldown', '2026-11-01', 30, [12, 12], 1)], spec)).toMatchObject({ rule: 'R5', weight: 30 });
    expect(suggestNext([sess('lat-pulldown', '2026-11-01', 30, [12, 12])], spec)).toMatchObject({ rule: 'R1', rirUnknown: true });
  });

  it('bodyweightStart — A2 ספסל רומי: שדה ריק = משקל גוף; 15×2 → R4 (17), ואז R1 → 2.5 ק״ג; מתחת לרצפה פעמיים → נשארים במשקל גוף', () => {
    const spec = specOf(partner.byId.get('back-extension')!);
    expect(suggestNext([sess('back-extension', '2026-11-01', null, [15, 15], 3)], spec)).toMatchObject({ rule: 'R4', repTarget: 17, weight: null });
    expect(suggestNext([sess('back-extension', '2026-11-01', 0, [17, 17], 3)], spec)).toMatchObject({ rule: 'R1', action: 'up', weight: 2.5, repTarget: 10 });
    expect(
      suggestNext([sess('back-extension', '2026-11-01', null, [8, 8]), sess('back-extension', '2026-11-04', null, [9, 8])], spec),
    ).toMatchObject({ rule: 'R3', action: 'same', weight: null, repTarget: 10 });
  });

  it('bodyweightStart — B1 עליות קובייה: 12×2 לכל רגל במשקל גוף → R4 (14), ואז 2.5 ק״ג', () => {
    const spec = specOf(partner.byId.get('db-step-up')!);
    expect(suggestNext([sess('db-step-up', '2026-11-02', null, [12, 12], 2)], spec)).toMatchObject({ rule: 'R4', repTarget: 14 });
    expect(suggestNext([sess('db-step-up', '2026-11-02', 0, [14, 14], 2)], spec)).toMatchObject({ rule: 'R1', weight: 2.5 });
  });

  it('הפלאנק בשניות: 20,20 → R6 (+1 שנ׳); 40,40 → "תקרה — נשארים" בלי משקל; 40 עם RIR 0 → R5', () => {
    const spec = specOf(partner.byId.get('plank')!);
    const low = suggestNext([sess('plank', '2026-11-01', null, [20, 20])], spec);
    expect(low).toMatchObject({ rule: 'R6', repTarget: 21, weight: null });
    const top = suggestNext([sess('plank', '2026-11-01', null, [40, 40], 2)], spec);
    expect(top).toMatchObject({ rule: 'R1', action: 'same', weight: null, repTarget: 40 });
    expect(top?.reason).toContain('40 שנ׳');
    expect(suggestNext([sess('plank', '2026-11-01', null, [40, 40], 0)], spec)).toMatchObject({ rule: 'R5' });
  });

  it('מכונת פלטות (step null): תקרה → "דרגה אחת למעלה" (weight null), ו-R4 לא חל', () => {
    const spec = specOf(partner.byId.get('machine-shoulder-press')!);
    expect(suggestNext([sess('machine-shoulder-press', '2026-11-02', 5, [12, 12], 2)], spec)).toMatchObject({ rule: 'R1', action: 'up', weight: null });
  });
});

describe('5. החיווט האמיתי עם פרופיל partner — המודולים נטענים מחדש', () => {
  afterEach(() => {
    setActiveProfile(null);
    vi.resetModules();
  });

  async function loadAsPartner() {
    vi.resetModules();
    const profile = await import('../../data/profile');
    profile.setActiveProfile('partner');
    const program = await import('../../data/program');
    const workouts = await import('../workouts');
    const helpers = await import('./helpers');
    return { program, workouts, helpers };
  }

  it('PROGRAM/WORKOUT_TYPES/ROTATION/WORKOUT_TITLES הם של התוכנית שלה; exerciseById מוצא את פרס- מכונה', async () => {
    const { program } = await loadAsPartner();
    expect(program.WORKOUT_TYPES).toEqual(['A', 'B']);
    expect(program.ROTATION).toEqual(['A', 'B']);
    expect(program.isRotationType('C')).toBe(false);
    expect(program.PROGRAM.A.map((e) => e.id)).toEqual(A.map((e) => e.id));
    expect(program.PROGRAM.B.map((e) => e.id)).toEqual(B.map((e) => e.id));
    expect(program.PROGRAM.C).toEqual([]);
    expect(program.WORKOUT_TITLES.A).toBe('A — רגליים, ישבן, גב, חזה');
    expect(program.exerciseById('machine-shoulder-press')?.name).toBe('פרס- מכונה');
    expect(program.exerciseIn('A', 'leg-press')?.sets).toBe(2);
    expect(program.alternatesFor('db-rdl').map((e) => e.id)).toEqual(['single-leg-curl']);
    expect(program.alternatesFor('leg-press')).toEqual([]);
    expect(program.resolveExerciseId('פרס- מכונה')).toBe('machine-shoulder-press');
  });

  it('nextType: A↔B; prefilledExercises: חימום + 7 תאים × 2 סטים + אירובי (המסך מסנן את האירובי); exercisesFor משלים תא חסר', async () => {
    const { workouts, helpers } = await loadAsPartner();
    expect(workouts.nextType([])).toBe('A');
    expect(workouts.nextType([helpers.wk('w1', '2026-11-01', 'A')])).toBe('B');
    expect(workouts.nextType([helpers.wk('w1', '2026-11-01', 'A'), helpers.wk('w2', '2026-11-03', 'B')])).toBe('A');

    const rows = workouts.prefilledExercises([], 'A');
    expect(rows.map((r) => r.exerciseId)).toEqual([workouts.WARMUP_ID, ...A.map((e) => e.id), workouts.FINISHER_ID]);
    for (const r of rows.slice(1, -1)) expect(r.sets).toHaveLength(2);
    expect(workouts.blankExercises('B').map((r) => r.n)).toEqual(B.map((e) => e.name));

    // רשומת B שנשמרה בלי B4 (תא חסר) מקבלת אותו כשורה ריקה אחרי מה שנשמר.
    const saved = helpers.wk('w9', '2026-11-05', 'B', B.filter((e) => e.id !== 'machine-shoulder-press').map((e) => helpers.le(e.id, 10, [10, 10])));
    const shown = workouts.exercisesFor(saved, [saved]).filter((r) => !workouts.isCardio(r));
    expect(shown.map((r) => r.exerciseId)).toEqual([...B.filter((e) => e.id !== 'machine-shoulder-press').map((e) => e.id), 'machine-shoulder-press']);
    expect(workouts.hasData(shown[shown.length - 1]!)).toBe(false);
  });

  it('אחרי החזרה ל-null המודול חוזר לתוכנית של שון', async () => {
    vi.resetModules();
    const profile = await import('../../data/profile');
    profile.setActiveProfile(null);
    const program = await import('../../data/program');
    expect(program.WORKOUT_TYPES).toEqual(['A', 'B', 'C', 'D']);
    expect(program.exerciseById('machine-shoulder-press')).toBeUndefined();
  });
});
