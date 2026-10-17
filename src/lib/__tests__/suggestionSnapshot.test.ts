/**
 * רגרסיה: ההצעה (R1–R6) לכל תרגיל בתוכנית ובמאגר החלופות, בתרחישים קבועים.
 * ה-snapshot נוצר לפני עדכון 3/10/2026 (A7 לשימור, C2 למכונת חתירה), ומוכיח
 * שההצעות לכל שאר התרגילים לא זזו. הפלאנק מוחרג בכוונה — ההצעה שלו השתנתה
 * במתכוון (מצב שימור), ונבדקת ב-progression.test.ts.
 *
 * 6/10/2026: `back-extension` עבר מהמאגר ל-A6 עם מפרט חדש (3×12–15, step 2.5,
 * מתחיל במשקל גוף) — השורה שלו ב-snapshot השתנתה במתכוון, וזו השורה הקיימת
 * היחידה שהשתנתה; `floor-leg-raise` (B8, חזרות בלבד) נוסף. שניהם נבדקים
 * ב-programUpdate20261006.test.ts.
 *
 * 13/10/2026: B1 → `barbell-rdl` (מוט) ו-`db-rdl` (משקולות יד) למאגר — אותם שני
 * מזהים עם אותו מפרט (3×8–10; step 5 / 2.5) כמו קודם, ולכן אפס שורות השתנו.
 * נבדק ב-programUpdate20261013.test.ts.
 *
 * 16/10/2026: B5 → `reverse-pec-deck` (פרפר הפוך, מהמאגר לתוכנית) ו-`face-pull`
 * (חתירה בחבל) למאגר — שני המזהים כבר היו ב-snapshot עם אותו מפרט (3×15–20;
 * step null / 5), ולכן אפס שורות השתנו ואפס נוספו (56 → 56). נבדק
 * ב-programUpdate20261016.test.ts.
 *
 * 17/10/2026 — סף RIR לכל תא: המפרט כולל עכשיו `effort` (יעד ה-RIR של התא —
 * ולחלופה מהמאגר, של התא הראשון שמארח אותה, כמו בשורה שהוחלפה), ונוספו שני
 * תרחישים ב-RIR 1 בדיוק ("שיא, RIR 1" ו-"משקל קטן, שיא+2, RIR 1"). התרחישים
 * הקיימים (RIR 0 / 2 / 3 / בלי RIR) אינם תלויים בסף, ולכן אף שורה קיימת לא
 * השתנתה; בתרחישים החדשים תא עם סף 1 מקבל R1 (עלייה) במקום R5, ותא עם סף 2
 * מקבל R5 כמו קודם. נבדק ב-rirThreshold.test.ts.
 */
import { describe, expect, it } from 'vitest';
import type { LoggedExercise, Rir } from '../../types';
import { ALTERNATES, PROGRAM, WORKOUT_TYPES, exerciseById } from '../../data/program';
import { suggestNext, type ProgressionSpec, type Session } from '../progression';
import { le } from './helpers';

const IDS = [...new Set([...WORKOUT_TYPES.flatMap((t) => PROGRAM[t].map((e) => e.id)), ...ALTERNATES.map((a) => a.id)])].filter(
  (id) => id !== 'plank',
);

/**
 * המפרט כפי שהמסך והסיכום השבועי מעבירים אותו: כולל `mode` ו-`bodyweightStart`
 * (6/10/2026 — B8 בחזרות בלבד, A6 מתחיל במשקל גוף). לכל שאר התרגילים שניהם
 * ברירת המחדל (`progress`, false), ולכן הפלט שלהם זהה לזה שלפני השדות.
 */
function specOf(id: string): ProgressionSpec {
  const e = exerciseById(id)!;
  return { step: e.step, repRangeMin: e.repRangeMin, repRangeMax: e.repRangeMax, isTimed: e.isTimed, bodyweightOnly: e.bodyweightOnly, mode: e.mode, bodyweightStart: e.bodyweightStart, effort: effortFor(id) };
}

/**
 * יעד ה-RIR שממנו נגזר הסף (17/10/2026): לתא בתוכנית — ה-effort שלו (המופע
 * הראשון, כמו `exerciseById`); לחלופה מהמאגר — ה-effort של התא הראשון שמארח
 * אותה (הסף של שורה שהוחלפה הוא של התא); בלי תא מארח — null (סף 2).
 */
function effortFor(id: string): string | null {
  const cells = WORKOUT_TYPES.flatMap((t) => PROGRAM[t]);
  const own = cells.find((e) => e.id === id);
  if (own) return own.effort;
  return cells.find((e) => e.alternates.includes(id))?.effort ?? null;
}

/** משקל "רגיל" לתרגיל לפי סוג הציוד; משקל גוף/זמן → null. */
function weightFor(id: string): number | null {
  const e = exerciseById(id)!;
  if (e.bodyweightOnly || e.isTimed) return null;
  if (e.step === 2.5) return 15;
  if (e.step === 5) return 40;
  return 30;
}

function sess(id: string, d: string, weight: number | null, values: number[], rir?: Rir): Session {
  const ex: LoggedExercise = rir === undefined ? le(id, weight, values) : { ...le(id, weight, values), rir };
  return { d, ex };
}

function scenarios(id: string): Record<string, Session[]> {
  const e = exerciseById(id)!;
  const n = e.sets;
  const w = weightFor(id);
  const fill = (v: number) => Array.from({ length: n }, () => v);
  const below = [...fill(e.repRangeMin), e.repRangeMin - 1].slice(1, n + 1);
  const mid = fill(Math.floor((e.repRangeMin + e.repRangeMax) / 2));
  const small = w === null ? null : e.step === null ? 5 : e.step * 2;
  return {
    'שיא, RIR 2': [sess(id, '2026-09-24', w, fill(e.repRangeMax), 2)],
    'שיא, RIR 1': [sess(id, '2026-09-24', w, fill(e.repRangeMax), 1)],
    'שיא, RIR 0': [sess(id, '2026-09-24', w, fill(e.repRangeMax), 0)],
    'שיא, בלי RIR': [sess(id, '2026-09-24', w, fill(e.repRangeMax))],
    'שיא+2, RIR 2': [sess(id, '2026-09-24', w, fill(e.repRangeMax + 2), 2)],
    'סט אחד מתחת למינימום': [sess(id, '2026-09-24', w, below)],
    'שני אימונים מתחת למינימום': [sess(id, '2026-09-14', w, below), sess(id, '2026-09-24', w, below)],
    'אמצע הטווח': [sess(id, '2026-09-24', w, mid)],
    'משקל קטן, שיא, RIR 3': [sess(id, '2026-09-24', small, fill(e.repRangeMax), 3)],
    'משקל קטן, שיא+2, RIR 1': [sess(id, '2026-09-24', small, fill(e.repRangeMax + 2), 1)],
  };
}

describe('snapshot — ההצעות לכל התרגילים פרט לפלאנק', () => {
  it('כולל לג-פרס, בנץ׳ פרס, הרחקת כתפיים ופולי עליון', () => {
    for (const id of ['leg-press', 'db-bench-press', 'db-lateral-raise-seated', 'db-lateral-raise-standing', 'lat-pulldown']) {
      expect(IDS).toContain(id);
    }
  });

  for (const id of IDS) {
    it(id, () => {
      const out: Record<string, unknown> = {};
      for (const [name, history] of Object.entries(scenarios(id))) {
        out[name] = suggestNext(history, specOf(id));
      }
      expect(out).toMatchSnapshot();
    });
  }
});
