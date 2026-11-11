/**
 * ממצא 3 (שלב 7): בדיקת גרסה חדשה גם בחזרה מהרקע. כאן רק הלוגיקה של "מתי
 * לבדוק" — בלי DOM ובלי service worker אמיתי.
 */
import { describe, expect, it } from 'vitest';
import { UPDATE_CHECK_MIN_MS, createUpdateCheck } from '../appUpdate';

function setup(over: Partial<{ visible: boolean; online: boolean; fail: boolean }> = {}) {
  const state = { now: 1_000_000, visible: over.visible ?? true, online: over.online ?? true, calls: 0 };
  const check = createUpdateCheck({
    update: () => {
      state.calls++;
      return over.fail ? Promise.reject(new Error('offline')) : Promise.resolve();
    },
    now: () => state.now,
    isVisible: () => state.visible,
    isOnline: () => state.online,
  });
  return { state, check };
}

describe('בדיקת עדכון בחזרה מהרקע', () => {
  it('מיד אחרי הרישום לא בודקים שוב — register() כבר בדק', () => {
    const { state, check } = setup();
    expect(check()).toBe(false);
    expect(state.calls).toBe(0);
  });

  it('חזרה למסך אחרי דקה ומעלה: בדיקה אחת', () => {
    const { state, check } = setup();
    state.now += UPDATE_CHECK_MIN_MS;
    expect(check()).toBe(true);
    expect(state.calls).toBe(1);
  });

  it('visibilitychange + pageshow + focus ברצף = בדיקה אחת, לא שלוש', () => {
    const { state, check } = setup();
    state.now += 5 * 60_000;
    expect([check(), check(), check()]).toEqual([true, false, false]);
    expect(state.calls).toBe(1);
    // חזרה נוספת אחרי שעה ברקע — שוב בדיקה אחת.
    state.now += 60 * 60_000;
    expect(check()).toBe(true);
    expect(state.calls).toBe(2);
  });

  it('הדף ברקע (hidden): לא בודקים; בחזרה — כן', () => {
    const { state, check } = setup({ visible: false });
    state.now += 10 * 60_000;
    expect(check()).toBe(false);
    state.visible = true;
    expect(check()).toBe(true);
    expect(state.calls).toBe(1);
  });

  it('בלי רשת לא בודקים, והניסיון לא נספר — כשהרשת חוזרת בודקים מיד', () => {
    const { state, check } = setup({ online: false });
    state.now += 10 * 60_000;
    expect(check()).toBe(false);
    expect(state.calls).toBe(0);
    state.online = true;
    expect(check()).toBe(true);
  });

  it('בדיקה שנכשלה לא מפילה כלום, וננסה שוב בחזרה הבאה', async () => {
    const { state, check } = setup({ fail: true });
    state.now += 2 * 60_000;
    expect(check()).toBe(true);
    await Promise.resolve();
    state.now += 2 * 60_000;
    expect(check()).toBe(true);
    expect(state.calls).toBe(2);
  });
});
