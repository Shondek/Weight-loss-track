/**
 * בדיקות על תוכן `program-abc.json` דרך ה-API של program.ts: הקובץ הוא
 * נתונים ידניים, ואלה הטעויות שקל לעשות בו.
 */

import { describe, it, expect } from 'vitest';
import {
  ALTERNATES,
  alternatesFor,
  EXERCISE_ALIASES,
  EXERCISE_ID_ALIASES,
  PROGRAM,
  RETIRED,
  TYPE_CONFIG,
  WORKOUT_TITLES,
  WORKOUT_TYPES,
  exerciseById,
  exerciseIn,
  resolveExerciseId,
} from '../../data/program';

const ALL = WORKOUT_TYPES.flatMap((t) => PROGRAM[t].map((e) => ({ t, e })));

describe('program-abc.json — מבנה', () => {
  it('שלושה אימונים, שבעה תרגילים בכל אחד, עם כותרת', () => {
    for (const t of WORKOUT_TYPES) {
      expect(PROGRAM[t]).toHaveLength(7);
      expect(WORKOUT_TITLES[t].length).toBeGreaterThan(0);
    }
  });

  it('id ייחודי בתוך כל אימון', () => {
    for (const t of WORKOUT_TYPES) {
      const ids = PROGRAM[t].map((e) => e.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('אותו id בשני אימונים — זהות זהה, רק סטים/טווח יכולים להיות שונים', () => {
    const seen = new Map<string, (typeof ALL)[number]['e']>();
    for (const { e } of ALL) {
      const first = seen.get(e.id);
      if (!first) {
        seen.set(e.id, e);
        continue;
      }
      for (const k of [
        'name',
        'short',
        'machine',
        'muscle',
        'type',
        'unilateral',
        'isTimed',
        'bodyweightOnly',
        'assisted',
        'videoUrl',
      ] as const) {
        expect(e[k], `${e.id}.${k}`).toEqual(first[k]);
      }
    }
    // הכפילות המכוונת: כפיפת ברכיים ב-A וב-B, ופשיטת מרפקים ב-B וב-C
    expect(exerciseIn('A', 'leg-curl')?.sets).toBe(2);
    expect(exerciseIn('B', 'leg-curl')?.sets).toBe(3);
    expect(exerciseIn('C', 'leg-curl')).toBeUndefined();
    expect(exerciseIn('B', 'triceps-pushdown')?.sets).toBe(2);
    expect(exerciseIn('C', 'triceps-pushdown')?.sets).toBe(2);
  });

  it('id של תרגיל פרוש לא מתנגש עם התוכנית', () => {
    const active = new Set(ALL.map(({ e }) => e.id));
    for (const r of RETIRED) expect(active.has(r.id), r.id).toBe(false);
    expect(new Set(RETIRED.map((r) => r.id)).size).toBe(RETIRED.length);
  });
});

describe('program-abc.json — תוכן כל תרגיל', () => {
  const everyExercise = [...ALL.map(({ e }) => e), ...RETIRED];

  it('type קיים ב-TYPE_CONFIG, טווח תקין, לפחות סט אחד, שם קצר ושרירים', () => {
    for (const e of everyExercise) {
      expect(e.type in TYPE_CONFIG, e.id).toBe(true);
      expect(e.repRangeMin, e.id).toBeGreaterThan(0);
      expect(e.repRangeMin, e.id).toBeLessThanOrEqual(e.repRangeMax);
      expect(e.sets, e.id).toBeGreaterThanOrEqual(1);
      expect(e.short.length, e.id).toBeGreaterThan(0);
      expect(e.muscles.length, e.id).toBeGreaterThan(0);
      expect(e.muscle.length, e.id).toBeGreaterThan(0);
    }
  });

  it('reps כטקסט תואם ל-repRangeMin/Max', () => {
    for (const { e } of ALL) {
      const nums = e.reps.match(/\d+/g)?.map(Number) ?? [];
      expect(nums[0], `${e.id} reps="${e.reps}"`).toBe(e.repRangeMin);
      expect(nums[nums.length - 1], `${e.id} reps="${e.reps}"`).toBe(e.repRangeMax);
      if (e.reps.includes('שנ')) expect(e.isTimed, e.id).toBe(true);
      if (/לרגל|לצד|ליד/.test(e.reps)) expect(e.unilateral, e.id).toBe(true);
    }
  });

  it('effort הוא "RIR n" או null — "—" מנורמל', () => {
    for (const { e } of ALL) {
      expect(e.effort === null || /^RIR \d(-\d)?$/.test(e.effort), `${e.id} effort=${e.effort}`).toBe(
        true,
      );
    }
    expect(exerciseById('plank')?.effort).toBeNull();
    expect(exerciseById('side-bend')?.effort).toBeNull();
    expect(exerciseById('leg-press')?.effort).toBe('RIR 2');
    // מפרט פרוש נשאר בלי הנחיית מאמץ
    expect(exerciseById('machine-hip-thrust')?.effort).toBeNull();
  });

  it('videoUrl הוא https או null; תרגיל פרוש בלי סרטון', () => {
    for (const { e } of ALL) {
      expect(e.videoUrl === null || e.videoUrl.startsWith('https://'), e.id).toBe(true);
    }
    for (const r of RETIRED) expect(r.videoUrl).toBeNull();
  });

  it('note ריק הוא null, לא מחרוזת ריקה', () => {
    for (const e of everyExercise) {
      if (e.note !== null) expect(e.note.trim().length, e.id).toBeGreaterThan(0);
    }
    expect(exerciseById('db-rdl')?.note).toContain('הינג');
  });

  it('משקל גוף ותרגילי זמן — בלי מכונה; סיוע רק בגרוויטון', () => {
    for (const e of everyExercise) {
      if (e.bodyweightOnly) expect(e.machine, e.id).toBeNull();
      if (e.assisted) expect(e.id).toBe('assisted-pull-up');
    }
    expect(exerciseById('assisted-pull-up')?.assisted).toBe(true);
    expect(exerciseById('assisted-pull-up')?.bodyweightOnly).toBe(false);
    // שלב 4: פלאנק הוא תרגיל זמן שנושא משקל (פלטה) — לא משקל-גוף-בלבד.
    expect(exerciseById('plank')?.isTimed).toBe(true);
    expect(exerciseById('plank')?.bodyweightOnly).toBe(false);
    expect(exerciseById('plank')?.machine).toBeNull();
  });
});

describe('program-abc.json — mode (3/10/2026)', () => {
  it('A7 פלאנק במצב שימור: 3×60 שנ׳, משקל גוף כברירת מחדל, שדה המשקל נשאר; כל השאר בהתקדמות', () => {
    const plank = exerciseIn('A', 'plank')!;
    expect(plank).toMatchObject({ mode: 'maintain', sets: 3, repRangeMin: 60, repRangeMax: 60, isTimed: true, bodyweightOnly: false, step: 2.5 });
    expect(plank.reps).toBe("60 שנ'");
    // הזהות לא השתנתה — המפתח להיסטוריה
    expect(plank.id).toBe('plank');
    expect(plank.name).toBe('בטן- פלאנק סטטי');
    for (const { e } of ALL) {
      if (e.id !== 'plank') expect(e.mode, e.id).toBe('progress');
    }
    for (const e of [...ALTERNATES, ...RETIRED]) expect(e.mode, e.id).toBe('progress');
  });
});

describe('program-abc.json — C2 מכונת חתירה (3/10/2026)', () => {
  it('C2 הוא חתירה- מכונה ייעודית: 3×10–12, RIR 2, "דרגה אחת"; שני ב-C; שאר C לא השתנה', () => {
    const c2 = PROGRAM.C[1]!;
    expect(c2).toMatchObject({ id: 'machine-row', name: 'חתירה- מכונה ייעודית', sets: 3, repRangeMin: 10, repRangeMax: 12, effort: 'RIR 2', step: null, unilateral: false, mode: 'progress' });
    expect(c2.reps).toBe('10-12');
    // סרטון — אותו שדה ואותו מבנה כמו בשאר התרגילים (קישור Drive, בלי מזהה נפרד)
    expect(c2.videoUrl).toBe('https://drive.google.com/file/d/1NCYrfcRlUn67BIusBODNTh7TMFrtaYnn/view?usp=share_link');
    expect(c2.videoUrl).toMatch(/^https:\/\/drive\.google\.com\/file\/d\/[A-Za-z0-9_-]+\/view/);
    expect(c2.note).toMatch(/הסרטון מראה מכונה דומה, לא אותו דגם\.$/);
    expect(exerciseIn('C', 'machine-row')).toBe(c2);
    expect(exerciseIn('C', 'db-single-arm-row')).toBeUndefined();
    expect(PROGRAM.C.map((e) => e.id)).toEqual(['machine-hip-abduction', 'machine-row', 'db-incline-bench-press', 'leg-press', 'db-lateral-raise-standing', 'triceps-pushdown', 'cable-torso-rotation']);
    // machine-row כבר לא במאגר — הוא תרגיל בתוכנית; הפולי התחתון ב-B עדיין מציע אותו כחלופה
    expect(ALTERNATES.some((a) => a.id === 'machine-row')).toBe(false);
    expect(alternatesFor('seated-cable-row').map((a) => a.id)).toContain('machine-row');
  });

  it('החתירה עם משקולת יד נשארת באותו מזהה ושם, במאגר, וחלופה ראשונה של C2 — ההיסטוריה ממשיכה', () => {
    const db = exerciseById('db-single-arm-row')!;
    expect(db).toMatchObject({ id: 'db-single-arm-row', name: 'חתירה- הטיית גו עם מ.יד', short: 'חתירה מ.יד', step: 2.5, unilateral: true, sets: 3, repRangeMin: 10, repRangeMax: 12 });
    expect(ALTERNATES.some((a) => a.id === 'db-single-arm-row')).toBe(true);
    expect(RETIRED.some((r) => r.id === 'db-single-arm-row')).toBe(false);
    expect(resolveExerciseId('חתירה- הטיית גו עם מ.יד')).toBe('db-single-arm-row');
    expect(resolveExerciseId('חתירה- מכונה ייעודית')).toBe('machine-row');
    expect(alternatesFor('machine-row')[0]?.id).toBe('db-single-arm-row');
  });
});

describe('program-abc.json — step (שלב 4)', () => {
  it('לכל תרגיל בתוכנית step מספרי חיובי או null; ברירות המחדל לפי סוג הציוד', () => {
    for (const { e } of ALL) {
      expect(e.step === null || e.step > 0, e.id).toBe(true);
    }
    for (const id of ['db-bench-press', 'db-rdl', 'db-lateral-raise-seated', 'db-lateral-raise-standing', 'db-supinated-curl', 'db-single-arm-row', 'db-incline-bench-press']) {
      expect(exerciseById(id)?.step, id).toBe(2.5);
    }
    expect(exerciseById('leg-press')?.step).toBe(5);
    for (const id of ['lat-pulldown', 'seated-cable-row', 'face-pull', 'triceps-pushdown', 'cable-torso-rotation']) {
      expect(exerciseById(id)?.step, id).toBe(5);
    }
    for (const id of ['pec-deck', 'machine-hip-abduction', 'leg-extension', 'leg-curl']) {
      expect(exerciseById(id)?.step, id).toBeNull();
    }
    expect(exerciseById('plank')?.step).toBe(2.5);
    // תרגיל פרוש בלי step בקובץ → null
    for (const r of RETIRED) expect(r.step).toBeNull();
  });
});

describe('program-abc.json — חלופות (שלב 4.1)', () => {
  /** הרשימה מהמפרט: תא → שמות החלופות, בסדר. */
  const EXPECTED: Record<string, string[]> = {
    'leg-press': ['הק סקוואט', 'סקוואט- מכונה', 'גובלט סקוואט עם משקולת'],
    'db-bench-press': ["בנץ' פרס- מכונה", "בנץ' פרס"],
    'lat-pulldown': ['משיכה מפולי עליון- אחיזה צרה בישיבה', 'משיכה מפולי עליון- אחיזה רחבה בישיבה (סטודיו)', 'מתח- גרוויטון'],
    'leg-extension': ['סקוואט- סטטי נגד קיר'],
    'leg-curl': ['כפיפת ברכיים במכונה על הבטן', 'כפיפת ברכיים במכונה רגל-רגל'],
    'db-lateral-raise-seated': ['הרחקת כתף- כייבל קרוס יד אחת', 'הרחקת כתפיים- עמידה מ.יד'],
    plank: ['בטן- פלאנק צידי סטטי', 'בטן- כפיפות בטן עם חבל פולי עליון'],
    'db-rdl': ["היפ הינג'- סמית משין", 'דד-ליפט רומניין', 'פשיטת ירך בספסל רומי'],
    'seated-cable-row': ['חתירה- מכונה ייעודית', 'חתירה- מכונה ייעודית T-bar', 'חתירה- כייבל קרוס יד אחת'],
    'pec-deck': ['פרפר- כייבל קרוס', 'פרפר- תחתון כייבל קרוס'],
    'face-pull': ['הרחקה אופקית- מכונת פרפר', 'הרחקה אופקית- פולי גובה כתף', 'הרחקה אופקית עם משקולות יד'],
    'db-supinated-curl': ['כפיפת מרפקים- פולי תחתון מוט', 'כפיפת מרפקים- מ.יד מיד פוזישן', 'כפיפת מרפק- כיסא כומר מ.יד סופינציה'],
    'triceps-pushdown': ['פשיטת מרפקים- פולי עליון מוט', 'פשיטת מרפק- פולי עליון קיקבק', 'קיק בק- משקולות יד'],
    'machine-hip-abduction': ['בעמידה הרחקת ירך עם גומייה', 'בישיבה הרחקת ירך עם גומייה'],
    'machine-row': ['חתירה- הטיית גו עם מ.יד', 'חתירה- כייבל קרוס יד אחת', 'חתירה- מכונה ייעודית T-bar'],
    'db-incline-bench-press': ["בנץ' פרס עליון- מכונה", "בנץ' פרס עליון"],
    'db-lateral-raise-standing': ['הרחקת כתף- כייבל קרוס יד אחת', 'הרחקת כתפיים- ישיבה מ.יד'],
    'cable-torso-rotation': ['בטן- פלאנק צידי סטטי', 'בטן- כפיפת מותן צידית'],
  };

  it('לכל תא החלופות מהמפרט, בשמות ובסדר; כל מזהה נפתר', () => {
    for (const { e } of ALL) {
      expect(alternatesFor(e.id).map((a) => a.name), e.id).toEqual(EXPECTED[e.id]);
      for (const id of e.alternates) expect(exerciseById(id), `${e.id} → ${id}`).toBeDefined();
    }
    expect(alternatesFor('hack-squat')).toEqual([]);
  });

  it('A/B/C לא השתנו: אותם מזהים, סטים וטווחים', () => {
    const snapshot = (t: 'A' | 'B' | 'C') => PROGRAM[t].map((e) => `${e.id}:${e.sets}x${e.repRangeMin}-${e.repRangeMax}`);
    expect(snapshot('A')).toEqual(['leg-press:3x10-12', 'db-bench-press:3x8-12', 'lat-pulldown:3x10-12', 'leg-extension:2x12-15', 'leg-curl:2x10-12', 'db-lateral-raise-seated:3x12-15', 'plank:3x60-60']);
    expect(snapshot('B')).toEqual(['db-rdl:3x8-10', 'seated-cable-row:3x10-12', 'pec-deck:3x10-12', 'leg-curl:3x10-12', 'face-pull:3x15-20', 'db-supinated-curl:2x10-12', 'triceps-pushdown:2x12-15']);
    expect(snapshot('C')).toEqual(['machine-hip-abduction:3x15-20', 'machine-row:3x10-12', 'db-incline-bench-press:3x8-12', 'leg-press:3x10-12', 'db-lateral-raise-standing:3x12-15', 'triceps-pushdown:2x12-15', 'cable-torso-rotation:3x12-15']);
  });

  it('אין חלופה שהיא הלג-פרס 45° — הוא alias של leg-press, לא תרגיל נפרד', () => {
    const ids = new Set([...ALTERNATES.map((a) => a.id), ...ALL.flatMap(({ e }) => e.alternates)]);
    expect(ids.has('leg-press-45')).toBe(false);
    expect(ids.has('leg-press')).toBe(false);
    for (const a of ALTERNATES) expect(a.name, a.id).not.toMatch(/45/);
    expect(EXERCISE_ID_ALIASES['leg-press-45']).toBe('leg-press');
  });

  it('מזהים פרושים שתאמו בשם עברו למאגר החלופות — ההיסטוריה שלהם מתחברת', () => {
    const reused = ['single-arm-cable-row', 't-bar-row', 'assisted-pull-up', 'cable-crunch', 'side-bend'];
    for (const id of reused) {
      expect(ALTERNATES.some((a) => a.id === id), id).toBe(true);
      expect(RETIRED.some((r) => r.id === id), id).toBe(false);
      expect(exerciseById(id)?.id).toBe(id);
    }
    expect(RETIRED).toHaveLength(17);
    expect(exerciseById('assisted-pull-up')?.assisted).toBe(true);
    // מזהה חלופה לא מתנגש עם התוכנית או עם הפרושים
    const active = new Set(ALL.map(({ e }) => e.id));
    for (const a of ALTERNATES) {
      expect(active.has(a.id), a.id).toBe(false);
      expect(RETIRED.some((r) => r.id === a.id), a.id).toBe(false);
    }
    expect(new Set(ALTERNATES.map((a) => a.id)).size).toBe(ALTERNATES.length);
  });

  it('step לפי הכלל: משקולות יד 2.5, כבל 5, מכונת פלטות null, משקל גוף/זמן null; הערות במקומן', () => {
    const byId = (id: string) => ALTERNATES.find((a) => a.id === id)!;
    expect(byId('goblet-squat').step).toBe(2.5);
    expect(byId('cable-fly').step).toBe(5);
    expect(byId('hack-squat').step).toBeNull();
    expect(byId('wall-sit').step).toBeNull();
    expect(byId('side-plank-static').step).toBeNull();
    expect(byId('band-hip-abduction-seated').step).toBeNull();
    for (const id of ['hack-squat', 'machine-squat', 'goblet-squat', 'wall-sit']) expect(byId(id).note, id).toBe('עומק עד מקביל');
    for (const id of ['machine-chest-press', 'barbell-bench-press', 'machine-incline-chest-press', 'barbell-incline-bench-press']) expect(byId(id).note, id).toBe('מרפקים ב-45°');
    expect(byId('barbell-rdl').note).toBe('מהמתקן, לא מהרצפה');
    for (const a of ALTERNATES) {
      if (a.isTimed) {
        expect(a.repRangeMin, a.id).toBe(30);
        expect(a.repRangeMax, a.id).toBe(45);
      }
      if (a.bodyweightOnly || a.isTimed) expect(a.step, a.id).toBeNull();
    }
  });
});

describe('שמות ישנים', () => {
  it('כל alias מצביע ל-id קיים — בתוכנית או בפרושים', () => {
    for (const [name, id] of Object.entries(EXERCISE_ALIASES)) {
      expect(exerciseById(id), `${name} → ${id}`).toBeDefined();
    }
  });

  it('alias של מזהה מצביע למזהה קיים, והמזהה הישן עצמו כבר לא קיים בשום מקום', () => {
    for (const [from, to] of Object.entries(EXERCISE_ID_ALIASES)) {
      expect(exerciseById(to), `${from} → ${to}`).toBeDefined();
      expect(exerciseById(from), from).toBeUndefined();
    }
    expect(EXERCISE_ID_ALIASES['leg-press-45']).toBe('leg-press');
  });

  it('exerciseById נותן את המופע הראשון בתוכנית, ואחריו פרושים', () => {
    expect(exerciseById('leg-curl')?.sets).toBe(2);
    expect(exerciseById('chest-press')?.type).toBe('compound');
    expect(exerciseById('no-such-exercise')).toBeUndefined();
  });
});
