/**
 * האתחול (lib/profileBoot.ts): כל כישלון בקריאת הפרופיל = אין פרופיל =
 * ההתנהגות של היום. שגיאה · timeout · ערך לא מוכר — ואף פעם לא זריקה.
 */
import { describe, expect, it, vi } from 'vitest';
import { PROFILE_BOOT_TIMEOUT_MS, resolveProfile, type ProfileSources } from '../profileBoot';

const never = () => new Promise<unknown>(() => undefined);
const src = (over: Partial<ProfileSources>): ProfileSources => ({ idb: async () => null, local: () => null, ...over });

describe('resolveProfile — מסלולי הכישלון נותנים ברירת מחדל', () => {
  it('שגיאה: IndexedDB זורק (סינכרוני או ב-Promise) ו-localStorage זורק → null, בלי זריקה', async () => {
    await expect(resolveProfile(src({ idb: () => Promise.reject(new Error('idb')), local: () => { throw new Error('ls'); } }))).resolves.toBeNull();
    await expect(resolveProfile(src({ idb: () => { throw new Error('sync'); } }))).resolves.toBeNull();
  });

  it('timeout: IndexedDB לא עונה → ממשיכים אחרי timeoutMs בלי פרופיל (ברירת מחדל כשנייה)', async () => {
    expect(PROFILE_BOOT_TIMEOUT_MS).toBe(1000);
    vi.useFakeTimers();
    try {
      const p = resolveProfile(src({ idb: never }), 1000);
      let settled = false;
      void p.then(() => {
        settled = true;
      });
      await vi.advanceTimersByTimeAsync(999);
      expect(settled).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      expect(settled).toBe(true);
      await expect(p).resolves.toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('timeout: IndexedDB לא עונה אבל localStorage אומר partner → partner, ובלי לכתוב ל-IndexedDB מעל מה שאולי קיים', async () => {
    const healIdb = vi.fn(async () => undefined);
    await expect(resolveProfile(src({ idb: never, local: () => 'partner', healIdb }), 10)).resolves.toBe('partner');
    expect(healIdb).not.toHaveBeenCalled();
  });

  it('ערך לא מוכר: "shon" / 1 / {} / "PARTNER" בכל אחד מהמקומות → null', async () => {
    for (const bad of ['shon', 1, {}, 'PARTNER', ['partner'], true]) {
      await expect(resolveProfile(src({ idb: async () => bad }))).resolves.toBeNull();
      await expect(resolveProfile(src({ local: () => bad }))).resolves.toBeNull();
    }
  });

  it('שני המקומות ריקים → null; אין ריפוי', async () => {
    const healIdb = vi.fn(async () => undefined);
    const healLocal = vi.fn();
    await expect(resolveProfile(src({ healIdb, healLocal }))).resolves.toBeNull();
    expect(healIdb).not.toHaveBeenCalled();
    expect(healLocal).not.toHaveBeenCalled();
  });
});

describe('resolveProfile — המסלול התקין והריפוי', () => {
  it('partner ב-IndexedDB → partner; localStorage חסר → משוחזר', async () => {
    const healLocal = vi.fn();
    await expect(resolveProfile(src({ idb: async () => 'partner', healLocal }))).resolves.toBe('partner');
    expect(healLocal).toHaveBeenCalledWith('partner');
  });

  it('partner רק ב-localStorage ו-IndexedDB ענה "אין" → partner, ו-IndexedDB משוחזר', async () => {
    const healIdb = vi.fn(async () => undefined);
    await expect(resolveProfile(src({ local: () => 'partner', healIdb }))).resolves.toBe('partner');
    expect(healIdb).toHaveBeenCalledWith('partner');
  });

  it('ריפוי שנכשל לא מפיל את האתחול', async () => {
    await expect(
      resolveProfile(src({ idb: async () => 'partner', healLocal: () => { throw new Error('ls'); } })),
    ).resolves.toBe('partner');
    await expect(resolveProfile(src({ local: () => 'partner', healIdb: () => Promise.reject(new Error('idb')) }))).resolves.toBe('partner');
  });
});
