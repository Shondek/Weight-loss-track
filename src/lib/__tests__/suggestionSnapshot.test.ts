/**
 * רגרסיה: ההצעה (R1–R6) לכל תרגיל בתוכנית ובמאגר החלופות, בתרחישים קבועים.
 * ה-snapshot נוצר לפני עדכון 3/10/2026 (A7 לשימור, C2 למכונת חתירה), ומוכיח
 * שההצעות לכל שאר התרגילים לא זזו. הפלאנק מוחרג בכוונה — ההצעה שלו השתנתה
 * במתכוון (מצב שימור), ונבדקת ב-progression.test.ts.
 */
import { describe, expect, it } from 'vitest';
import type { LoggedExercise, Rir } from '../../types';
import { ALTERNATES, PROGRAM, WORKOUT_TYPES, exerciseById } from '../../data/program';
import { suggestNext, type ProgressionSpec, type Session } from '../progression';
import { le } from './helpers';

const IDS = [...new Set([...WORKOUT_TYPES.flatMap((t) => PROGRAM[t].map((e) => e.id)), ...ALTERNATES.map((a) => a.id)])].filter(
  (id) => id !== 'plank',
);

function specOf(id: string): ProgressionSpec {
  const e = exerciseById(id)!;
  return { step: e.step, repRangeMin: e.repRangeMin, repRangeMax: e.repRangeMax, isTimed: e.isTimed, bodyweightOnly: e.bodyweightOnly };
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
    'שיא, RIR 0': [sess(id, '2026-09-24', w, fill(e.repRangeMax), 0)],
    'שיא, בלי RIR': [sess(id, '2026-09-24', w, fill(e.repRangeMax))],
    'שיא+2, RIR 2': [sess(id, '2026-09-24', w, fill(e.repRangeMax + 2), 2)],
    'סט אחד מתחת למינימום': [sess(id, '2026-09-24', w, below)],
    'שני אימונים מתחת למינימום': [sess(id, '2026-09-14', w, below), sess(id, '2026-09-24', w, below)],
    'אמצע הטווח': [sess(id, '2026-09-24', w, mid)],
    'משקל קטן, שיא, RIR 3': [sess(id, '2026-09-24', small, fill(e.repRangeMax), 3)],
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
