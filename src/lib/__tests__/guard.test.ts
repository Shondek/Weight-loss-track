import { describe, expect, it, vi } from 'vitest';
import { guardedRun, hasNutritionKeys, isConfirmed, nutritionErasure, REPLACE_WORD, WIPE_WORD } from '../guard';
import { emptyDb, type DB } from '../../types';

const db = (over: Partial<DB> = {}): DB => ({ ...emptyDb(), ...over });

describe('שער לפעולות הרסניות (סיכון #3)', () => {
  it('החלפה בלי "החלף" מוקלד — replaceAll לא נקרא, וגם הגיבוי לא', async () => {
    const run = vi.fn(async () => true);
    const backup = vi.fn(() => true);
    for (const typed of ['', 'החלף ', 'מחק', 'replace']) {
      const r = await guardedRun({ typed: typed === 'החלף ' ? 'החלפ' : typed, word: REPLACE_WORD, backup, run });
      expect(r).toEqual({ ok: false, reason: 'not-confirmed', detail: null });
    }
    expect(run).not.toHaveBeenCalled();
    expect(backup).not.toHaveBeenCalled();
    // רווחים מסביב נסלחים; המילה עצמה לא.
    expect(isConfirmed(' החלף ', REPLACE_WORD)).toBe(true);
    expect(isConfirmed('החלף!', REPLACE_WORD)).toBe(false);
  });

  it('הגיבוי האוטומטי זורק — ההחלפה מבוטלת ו-replaceAll לא נקרא', async () => {
    const run = vi.fn(async () => true);
    const r = await guardedRun({
      typed: REPLACE_WORD,
      word: REPLACE_WORD,
      backup: () => {
        throw new Error('download blocked');
      },
      run,
    });
    expect(r).toEqual({ ok: false, reason: 'backup-failed', detail: 'download blocked' });
    expect(run).not.toHaveBeenCalled();
  });

  it('הגיבוי מחזיר false (downloadText נכשל בשקט) — גם אז מבוטל', async () => {
    const run = vi.fn(async () => true);
    const r = await guardedRun({ typed: WIPE_WORD, word: WIPE_WORD, backup: () => false, run });
    expect(r).toEqual({ ok: false, reason: 'backup-failed', detail: null });
    expect(run).not.toHaveBeenCalled();
  });

  it('"מחק" מוקלד + גיבוי הצליח — המחיקה רצה, אחרי הגיבוי', async () => {
    const order: string[] = [];
    const r = await guardedRun({
      typed: WIPE_WORD,
      word: WIPE_WORD,
      backup: () => {
        order.push('backup');
        return true;
      },
      run: async () => {
        order.push('wipe');
        return true;
      },
    });
    expect(r).toEqual({ ok: true, value: true });
    expect(order).toEqual(['backup', 'wipe']);
  });
});

describe('אזהרת מחיקת תזונה בהחלפה', () => {
  const withNutrition = db({
    entries: [
      {
        id: 'e1',
        d: '2026-09-01',
        ts: 1,
        meal: 'lunch',
        foodId: '12345678',
        grams: 100,
        ref: { name: 'x', kcal: 100, protein: 10, carbs: null, fat: null, fiber: null },
      },
    ],
    targets: [{ from: '2026-09-01', kcal: 1900, protein: 190, carbs: 100, fat: 60 }],
  });

  it('קובץ בלי מפתחות תזונה (גיבוי v1) כשיש תזונה במכשיר — ספירות למחיקה', () => {
    const v1 = { v: 1, weights: [], workouts: [] };
    expect(hasNutritionKeys(v1)).toBe(false);
    expect(nutritionErasure(withNutrition, v1)).toEqual({ entries: 1, customFoods: 0, targets: 1, favorites: 0 });
  });

  it('קובץ עם מפתחות תזונה (גם ריקים) — אין אזהרה', () => {
    expect(hasNutritionKeys({ v: 2, entries: [] })).toBe(true);
    expect(nutritionErasure(withNutrition, { v: 2, entries: [], customFoods: [] })).toBeNull();
  });

  it('אין תזונה במכשיר — אין אזהרה גם על קובץ ישן', () => {
    expect(nutritionErasure(emptyDb(), { v: 1, weights: [] })).toBeNull();
  });

  it('קלט שאינו אובייקט — נחשב "בלי תזונה"', () => {
    expect(hasNutritionKeys('junk')).toBe(false);
    expect(hasNutritionKeys([1])).toBe(false);
    expect(nutritionErasure(withNutrition, null)).not.toBeNull();
  });
});
