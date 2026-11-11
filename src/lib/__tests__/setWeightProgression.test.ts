/**
 * משקל שונה לסט (שלב 7, PR 2) — הקלט של כללי ההתקדמות.
 *
 * הכללים R1–R6 עצמם לא השתנו. משתנה רק הקלט: סשן עם כמה משקלים מחושב
 * מהסטים במשקל הנמוך ביותר (החזרות וה-RIR שלהם), כאילו זה משקל העבודה,
 * וההצעה מסומנת "אשר בעצמך". סשן במשקל אחד — בדיוק כמו תמיד (וה-snapshot
 * של ההצעות, שכולו סשנים אחידים, לא זז).
 */
import { describe, expect, it } from 'vitest';
import type { LoggedExercise, LoggedSet, Rir } from '../../types';
import { exerciseIn } from '../../data/program';
import { MIXED_WEIGHTS_NOTE, suggestNext, type Session } from '../progression';
import { le } from './helpers';

/** "כפיפת ברכיים" באימון B: 3×10–12, RIR 2, step null. חתירת כבל: 3×10–12, RIR 2, step 5. */
const CURL = 'leg-curl';
const ROW = 'seated-cable-row';
const curlSpec = exerciseIn('B', CURL)!;
const rowSpec = exerciseIn('B', ROW)!;

/** תרגיל עם משקל לכל סט: [משקל, חזרות]. */
function mixed(id: string, pairs: [number | null, number][], rir?: Rir): LoggedExercise {
  const base = le(id, null, pairs.map(([, r]) => r));
  const sets: LoggedSet[] = pairs.map(([weight, reps]) => ({ weight, reps, seconds: null }));
  return rir === undefined ? { ...base, sets } : { ...base, sets, rir };
}
const session = (d: string, ex: LoggedExercise): Session => ({ d, ex });

describe('כלל ההצעה — סשן עם כמה משקלים מחושב מהמשקל הנמוך ביותר', () => {
  it('85/80/80: הבסיס 80, והחזרות של שני הסטים ב-80 בלבד', () => {
    const s = suggestNext([session('2026-11-09', mixed(ROW, [[85, 10], [80, 11], [80, 10]], 2))], rowSpec)!;
    // הסטים ב-80: 11, 10 → R6: אותו משקל, +1 בסט הנמוך (10 → 11).
    expect(s).toMatchObject({ rule: 'R6', action: 'same', weight: 80, repTarget: 11, basisWeight: 80, mixedWeights: true });
    expect(s.reason).toContain('10 → 11');
    expect(s.reason).toContain(MIXED_WEIGHTS_NOTE);
    // הסט הכבד (85×10) לא נכנס לחישוב: בלעדיו ההצעה זהה, חוץ מהסימון.
    const only80 = suggestNext([session('2026-11-09', mixed(ROW, [[80, 11], [80, 10]], 2))], rowSpec)!;
    expect({ ...s, mixedWeights: false, reason: s.reason.replace(` · ${MIXED_WEIGHTS_NOTE}`, '') }).toEqual(only80);
  });

  it('80/80/75: הבסיס 75 — הסט האחרון בלבד, וה-RIR שלו', () => {
    // הסט ב-75 בתקרה (12) עם RIR 2 → R1: +5, היעד חוזר ל-10.
    const top = suggestNext([session('2026-11-09', mixed(ROW, [[80, 12], [80, 12], [75, 12]], 2))], rowSpec)!;
    expect(top).toMatchObject({ rule: 'R1', action: 'up', weight: 80, repTarget: 10, basisWeight: 75, mixedWeights: true, rirUnknown: false });
    // אותו דבר עם RIR 1 (מתחת לסף 2) → R5: נשארים ב-75.
    const notClean = suggestNext([session('2026-11-09', mixed(ROW, [[80, 12], [80, 12], [75, 12]], 1))], rowSpec)!;
    expect(notClean).toMatchObject({ rule: 'R5', action: 'same', weight: 75, basisWeight: 75, mixedWeights: true });
    // הסט ב-75 מתחת לרצפה (9 < 10), פעם אחת → R6 ב-75.
    const below = suggestNext([session('2026-11-09', mixed(ROW, [[80, 10], [80, 10], [75, 9]], 2))], rowSpec)!;
    expect(below).toMatchObject({ rule: 'R6', weight: 75, repTarget: 10, mixedWeights: true });
  });

  it('80/85/80: הבסיס 80 — הסט הראשון והאחרון; הסט הכבד באמצע לא נכנס', () => {
    // 80×12, 85×8, 80×12, RIR 2 → שני הסטים ב-80 בתקרה → R1: 85.
    const s = suggestNext([session('2026-11-09', mixed(ROW, [[80, 12], [85, 8], [80, 12]], 2))], rowSpec)!;
    expect(s).toMatchObject({ rule: 'R1', action: 'up', weight: 85, repTarget: 10, basisWeight: 80, mixedWeights: true, rirUnknown: false });
    // ה-8 חזרות ב-85 (מתחת לרצפה) לא מפעילות R6/R3 — הן לא במשקל העבודה.
    expect(s.reason).not.toContain('מתחת');
  });

  it('סשן אחיד: בדיוק כמו היום — בלי סימון ובלי שורה', () => {
    const uniform = mixed(ROW, [[80, 11], [80, 11], [80, 10]], 2);
    const s = suggestNext([session('2026-11-09', uniform)], rowSpec)!;
    expect(s).toMatchObject({ rule: 'R6', weight: 80, repTarget: 11, basisWeight: 80, mixedWeights: false });
    expect(s.reason).not.toContain(MIXED_WEIGHTS_NOTE);
    // זהה לתרגיל שנבנה כמו בכל הבדיקות הקיימות (משקל אחד לכל הסטים).
    expect(s).toEqual(suggestNext([session('2026-11-09', { ...le(ROW, 80, [11, 11, 10]), rir: 2 })], rowSpec));
  });

  it('ה-RIR שייך לסט האחרון: כשהוא לא במשקל הנמוך — ה-RIR לא ידוע לסטים האלה', () => {
    // 80×12, 80×12, ואז עלייה ל-85×8 עם RIR 0. ה-RIR 0 מתאר את הסט ב-85, לא את ה-80.
    const s = suggestNext([session('2026-11-09', mixed(ROW, [[80, 12], [80, 12], [85, 8]], 0))], rowSpec)!;
    expect(s).toMatchObject({ rule: 'R1', action: 'up', weight: 85, basisWeight: 80, mixedWeights: true, rirUnknown: true });
  });

  it('R3 (שני אימונים מתחת לרצפה) נבדק מול המשקל הנמוך', () => {
    const history = [
      session('2026-11-02', { ...le(ROW, 80, [10, 9, 9]), rir: 1 }),
      session('2026-11-09', mixed(ROW, [[85, 8], [80, 9], [80, 9]], 1)),
    ];
    expect(suggestNext(history, rowSpec)).toMatchObject({ rule: 'R3', action: 'down', weight: 70, basisWeight: 80, mixedWeights: true });
    // אם הסשן הקודם היה במשקל אחר (85) — זה לא "אותו משקל פעמיים", ולכן R6.
    const other = [session('2026-11-02', { ...le(ROW, 85, [9, 9, 9]), rir: 1 }), history[1]!];
    expect(suggestNext(other, rowSpec)).toMatchObject({ rule: 'R6', weight: 80 });
  });

  it('תרגיל בלי step (כפיפת ברכיים): "דרגה אחת למעלה" מהמשקל הנמוך', () => {
    const s = suggestNext([session('2026-11-09', mixed(CURL, [[85, 12], [80, 12], [80, 12]], 2))], curlSpec)!;
    expect(s).toMatchObject({ rule: 'R1', action: 'up', weight: null, basisWeight: 80, mixedWeights: true });
  });
});
