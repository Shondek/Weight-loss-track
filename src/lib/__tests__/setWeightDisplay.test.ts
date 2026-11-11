/**
 * משקל שונה לסט (שלב 7, PR 2) — תצוגה ונתונים. אין שדה חדש: המשקל כבר נשמר
 * לכל סט. מה שנבדק כאן: סשן עם כמה משקלים מוצג סט-סט בסיכום השבועי ובדוח
 * לצ'אט, הסט הכבד נשאר בהיסטוריה ובגרף, וגיבוי עם משקלים שונים נקרא בלי
 * אובדן. הקלט של כללי ההתקדמות — ב-setWeightProgression.test.ts.
 */
import { describe, expect, it } from 'vitest';
import { emptyDb, type DB, type LoggedExercise, type LoggedSet, type Rir } from '../../types';
import { exerciseHistory, hasMixedWeights, lastWeightOf, openingWeight, perSetText, progressPoints, progressValue, topWeightOf } from '../workouts';
import { parseDb } from '../schema';
import { MIXED_WEIGHTS_SUMMARY_NOTE, buildWeeklySummary } from '../weeklySummary';
import { exerciseText, workoutText } from '../weekSummary';
import { backupJson, buildChatReport } from '../exportText';
import { le, wk } from './helpers';

/** "כפיפת ברכיים" ו"חתירת כבל" — שני תרגילים של אימון B, 3 סטים. */
const CURL = 'leg-curl';
const ROW = 'seated-cable-row';

/** תרגיל עם משקל לכל סט: [משקל, חזרות]. */
function mixed(id: string, pairs: [number | null, number][], rir?: Rir): LoggedExercise {
  const base = le(id, null, pairs.map(([, r]) => r));
  const sets: LoggedSet[] = pairs.map(([weight, reps]) => ({ weight, reps, seconds: null }));
  return rir === undefined ? { ...base, sets } : { ...base, sets, rir };
}

describe('תצוגה — סשן עם כמה משקלים מוצג סט-סט', () => {
  const heavy = mixed(CURL, [[85, 10], [80, 11], [80, 10]], 2);
  const uniform = { ...le(CURL, 80, [11, 10, 10]), rir: 2 as Rir };

  it('perSetText: "85×10 · 80×11 · 80×10"; סשן במשקל אחד → null', () => {
    expect(perSetText(heavy)).toBe('85×10 · 80×11 · 80×10');
    expect(perSetText(uniform)).toBeNull();
    expect(hasMixedWeights(heavy)).toBe(true);
    expect(hasMixedWeights(uniform)).toBe(false);
    // סט שלא בוצע לא נספר: משקל שמולא מראש בסט ריק אינו "משקל אחר".
    const partial: LoggedExercise = { ...uniform, sets: [{ weight: 80, reps: 11, seconds: null }, { weight: 75, reps: null, seconds: null }] };
    expect(perSetText(partial)).toBeNull();
  });

  it('הדוח לצ\'אט: "כפיפת ברכיים 85×10 · 80×11 · 80×10"; אחיד — כמו היום', () => {
    expect(exerciseText(heavy)).toBe('כפיפת ברכיים 85×10 · 80×11 · 80×10');
    expect(exerciseText(uniform)).toBe('כפיפת ברכיים 80×11,10,10');
    expect(exerciseText(mixed(ROW, [[42.5, 12], [40, 12]]))).toBe('חתירת כבל 42.5×12 · 40×12');
    const w = wk('2026-11-09-x-B', '2026-11-09', 'B', [heavy, { ...le(ROW, 45, [12, 12, 11]), rir: 2 }]);
    expect(workoutText(w)).toBe('כפיפת ברכיים 85×10 · 80×11 · 80×10 · חתירת כבל 45×12,12,11');
  });

  function dbWith(ex: LoggedExercise): DB {
    const db = emptyDb();
    db.settings = { ...db.settings, programStart: '2026-11-08' };
    db.workouts = [wk('2026-11-09-x-B', '2026-11-09', 'B', [ex])];
    return db;
  }

  it('הסיכום השבועי: השורה מפורשת, עם "אשר בעצמך"; אחיד — בלי שינוי', () => {
    const lineOf = (db: DB) => buildWeeklySummary(db, '2026-11-08').split('\n').find((l) => l.includes('כפיפת ברכיים'));
    expect(MIXED_WEIGHTS_SUMMARY_NOTE).toBe('משקלים שונים — אשר בעצמך');
    expect(lineOf(dbWith(heavy))).toBe('  כפיפת ברכיים 85×10 · 80×11 · 80×10 · RIR 2 · הבא: 80 ק״ג · 11 חזרות (R6) · משקלים שונים — אשר בעצמך');
    expect(lineOf(dbWith(uniform))).toBe('  כפיפת ברכיים 80×11,10,10 · RIR 2 · הבא: 80 ק״ג · 11 חזרות (R6)');
  });

  it('הדוח לצ\'אט המלא מכיל את השורה המפורשת', () => {
    expect(buildChatReport(dbWith(heavy), '2026-11-08', '2026-11-11')).toContain('כפיפת ברכיים 85×10 · 80×11 · 80×10');
    expect(buildChatReport(dbWith(uniform), '2026-11-08', '2026-11-11')).toContain('כפיפת ברכיים 80×11,10,10');
  });
});

describe('היסטוריה וגרף — הסט הכבד נשאר', () => {
  const heavy = mixed(ROW, [[85, 10], [80, 11], [80, 10]], 2);

  it('הגרף מציג את המשקל הכבד של הסשן; סשן אחיד — כמו קודם', () => {
    expect(topWeightOf(heavy)).toBe(85);
    expect(progressValue(heavy, 'weight')).toBe(85);
    const uniform = le(ROW, 80, [11, 11, 10]);
    expect(progressValue(uniform, 'weight')).toBe(80);
    expect(progressValue(uniform, 'weight')).toBe(lastWeightOf(uniform));
    // ירידה בסט האחרון (80/80/75): הגרף נשאר על 80.
    expect(progressValue(mixed(ROW, [[80, 12], [80, 12], [75, 12]]), 'weight')).toBe(80);
  });

  it('שלושת הסטים נשארים בהיסטוריה, עם המשקל של כל אחד', () => {
    const workouts = [wk('2026-11-02-x-B', '2026-11-02', 'B', [le(ROW, 80, [10, 10, 10])]), wk('2026-11-09-x-B', '2026-11-09', 'B', [heavy])];
    const history = exerciseHistory(workouts, ROW);
    expect(history[1]!.ex.sets).toEqual([
      { weight: 85, reps: 10, seconds: null },
      { weight: 80, reps: 11, seconds: null },
      { weight: 80, reps: 10, seconds: null },
    ]);
    expect(progressPoints(history, 'weight').map((p) => p.value)).toEqual([80, 85]);
    // המשקל שאיתו נפתח האימון הבא: של הסט האחרון, כמו תמיד.
    expect(openingWeight(workouts, ROW)).toBe(80);
  });
});

describe('נתונים — אין שדה חדש, ואין מה לאבד', () => {
  const db = (): DB => {
    const out = emptyDb();
    out.workouts = [
      wk('2026-11-09-x-B', '2026-11-09', 'B', [mixed(ROW, [[85, 10], [80, 11], [80, 10]], 2), { ...le(CURL, 80, [11, 10, 10]), rir: 2 }]),
    ];
    return out;
  };

  it('סט נשמר בדיוק באותם שלושה שדות: weight, reps, seconds', () => {
    const exported = JSON.parse(backupJson(db(), '2026-11-11T08:00:00.000Z', null)) as { workouts: { ex: { sets: Record<string, unknown>[] }[] }[] };
    for (const ex of exported.workouts[0]!.ex) {
      for (const set of ex.sets) expect(Object.keys(set).sort()).toEqual(['reps', 'seconds', 'weight']);
    }
    expect(exported.workouts[0]!.ex[0]!.sets.map((s) => s.weight)).toEqual([85, 80, 80]);
  });

  it('ייצוא ← ייבוא: המשקל של כל סט חוזר בדיוק, בלי דחיות ובלי הסגר', () => {
    const text = backupJson(db(), '2026-11-11T08:00:00.000Z', null);
    const parsed = parseDb(JSON.parse(text));
    expect(parsed.db.workouts).toEqual(db().workouts);
    expect(parsed.db.quarantine).toEqual([]);
    // הלוך-חזור שני: אותו טקסט בדיוק.
    expect(backupJson(parsed.db, '2026-11-11T08:00:00.000Z', null)).toBe(text);
  });
});
