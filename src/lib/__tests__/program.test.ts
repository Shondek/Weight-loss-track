/**
 * בדיקות על תוכן `program-abc.json` דרך ה-API של program.ts: הקובץ הוא
 * נתונים ידניים, ואלה הטעויות שקל לעשות בו.
 */

import { describe, it, expect } from 'vitest';
import {
  EXERCISE_ALIASES,
  EXERCISE_ID_ALIASES,
  PROGRAM,
  RETIRED,
  TYPE_CONFIG,
  WORKOUT_TITLES,
  WORKOUT_TYPES,
  exerciseById,
  exerciseIn,
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
