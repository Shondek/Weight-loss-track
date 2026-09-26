/**
 * שכבת האחסון עם idb-keyval ו-localStorage מדומים. כל בדיקה מקבלת מודול
 * store.ts טרי (vi.resetModules), כי הוא מחזיק מצב ברמת המודול.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DB } from '../../types';

const h = vi.hoisted(() => ({
  idb: new Map<string, unknown>(),
  failSet: null as ((key: string) => boolean) | null,
  setCalls: [] as string[],
}));

vi.mock('idb-keyval', () => ({
  get: async (k: string) => h.idb.get(k),
  set: async (k: string, v: unknown) => {
    h.setCalls.push(k);
    if (h.failSet?.(k)) throw new Error('QuotaExceededError');
    h.idb.set(k, v);
  },
  del: async (k: string) => {
    h.idb.delete(k);
  },
}));

function fakeLocalStorage() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => {
      m.set(k, String(v));
    },
    removeItem: (k: string) => {
      m.delete(k);
    },
    clear: () => m.clear(),
    key: (i: number) => [...m.keys()][i] ?? null,
    get length() {
      return m.size;
    },
  };
}

type LS = ReturnType<typeof fakeLocalStorage>;
let ls: LS;

beforeEach(() => {
  h.idb.clear();
  h.failSet = null;
  h.setCalls.length = 0;
  ls = fakeLocalStorage();
  (globalThis as { window?: unknown }).window = { localStorage: ls };
  (globalThis as { indexedDB?: unknown }).indexedDB = {};
  vi.resetModules();
});

afterEach(() => {
  delete (globalThis as { window?: unknown }).window;
  delete (globalThis as { indexedDB?: unknown }).indexedDB;
});

const store = () => import('../store');
const exportText = () => import('../exportText');

const W_OK = { d: '2026-09-01', w: 80 };
const W_BAD = { d: '2026-09-02', w: 500 };

describe('הסגר — רשומה שנדחתה לא נעלמת (סיכון #1)', () => {
  it('משקל של 500 ק"ג נכנס להסגר, שורד persist ומופיע בגיבוי', async () => {
    h.idb.set('fatloss:weights', [W_OK, W_BAD]);
    const s = await store();
    const res = await s.loadDB();

    expect(res.backend).toBe('indexeddb');
    expect(res.db.weights).toEqual([W_OK]);
    expect(res.quarantined).toBe(1);
    expect(res.readErrors).toEqual([]);
    expect(res.db.quarantine).toHaveLength(1);
    expect(res.db.quarantine[0]).toMatchObject({ key: 'weights', raw: W_BAD, fp: JSON.stringify(W_BAD) });
    expect(res.db.quarantine[0]?.reason).toContain('20–400');

    // ההסגר נכתב לפני שמישהו שמר משהו.
    expect(h.idb.get('fatloss:quarantine')).toEqual(res.db.quarantine);
    expect(h.setCalls.filter((k) => k === 'fatloss:weights')).toHaveLength(0);

    await s.persist('weights', res.db.weights);
    expect(h.idb.get('fatloss:weights')).toEqual([W_OK]);
    expect(h.idb.get('fatloss:quarantine')).toEqual(res.db.quarantine);

    const { buildBackup } = await exportText();
    expect(buildBackup(res.db, '2026-09-13T00:00:00.000Z').quarantine).toEqual(res.db.quarantine);

    // טעינה חוזרת: אותו פריט לא מוכפל.
    vi.resetModules();
    const s2 = await store();
    const again = await s2.loadDB();
    expect(again.quarantined).toBe(0);
    expect(again.db.quarantine).toHaveLength(1);
  });

  it('אם כתיבת ההסגר נכשלת — המפתח חסום לשמירה והשגיאה מדווחת', async () => {
    h.idb.set('fatloss:weights', [W_OK, W_BAD]);
    h.failSet = (k) => k === 'fatloss:quarantine';
    const s = await store();
    const res = await s.loadDB();

    expect(res.db.weights).toEqual([W_OK]);
    expect(res.readErrors).toHaveLength(1);
    expect(res.readErrors[0]).toContain('הסגר');
    expect(s.blockedKeys()).toEqual(['weights']);
    expect(h.idb.get('fatloss:quarantine')).toBeUndefined();

    await expect(s.persist('weights', res.db.weights)).rejects.toBeInstanceOf(s.StoreWriteError);
    // הדיסק לא נגע: הרשומה השבורה עדיין שם, ולא נמחקה.
    expect(h.idb.get('fatloss:weights')).toEqual([W_OK, W_BAD]);
    // מפתח אחר לא נחסם.
    await s.persist('waist', []);
    expect(h.idb.get('fatloss:waist')).toEqual([]);
  });

  it('רישום אכילה ומדידת מותניים שנדחו — אותו מסלול', async () => {
    const waistBad = { d: '2026-09-02', cm: 500 };
    const entryBad = { id: 'e1', d: '2026-09-02', ts: 1, meal: 'lunch', foodId: 'bad-id', grams: 100, ref: {} };
    h.idb.set('fatloss:waist', [{ d: '2026-09-01', cm: 95 }, waistBad]);
    h.idb.set('fatloss:entries', [entryBad]);
    const s = await store();
    const res = await s.loadDB();

    expect(res.db.waist).toHaveLength(1);
    expect(res.db.entries).toHaveLength(0);
    expect(res.quarantined).toBe(2);
    expect(res.db.quarantine.map((q) => [q.key, q.raw])).toEqual([
      ['waist', waistBad],
      ['entries', entryBad],
    ]);

    await s.persist('waist', res.db.waist);
    await s.persist('entries', res.db.entries);
    expect(h.idb.get('fatloss:quarantine')).toHaveLength(2);

    const { buildBackup } = await exportText();
    const b = buildBackup(res.db, '2026-09-13T00:00:00.000Z');
    expect(b.quarantine?.map((q) => q.key)).toEqual(['waist', 'entries']);
  });

  it('persistAll (ייבוא) כותב את ההסגר ראשון ומשחרר חסימה', async () => {
    h.idb.set('fatloss:weights', [W_OK, W_BAD]);
    h.failSet = (k) => k === 'fatloss:quarantine';
    const s = await store();
    const res = await s.loadDB();
    expect(s.blockedKeys()).toEqual(['weights']);

    h.failSet = null;
    await s.persistAll(res.db);
    expect(h.setCalls.indexOf('fatloss:quarantine')).toBeLessThan(h.setCalls.indexOf('fatloss:weights'));
    expect(s.blockedKeys()).toEqual([]);
    expect(h.idb.get('fatloss:quarantine')).toHaveLength(1);
    expect(h.idb.get('fatloss:weights')).toEqual([W_OK]);
  });

  it('"מחק הכול" מוחק גם את ההסגר — הנתיב המפורש היחיד', async () => {
    h.idb.set('fatloss:weights', [W_BAD]);
    const s = await store();
    await s.loadDB();
    expect(h.idb.get('fatloss:quarantine')).toHaveLength(1);
    await s.wipeAll();
    expect(h.idb.get('fatloss:quarantine')).toBeUndefined();
  });
});

describe('ייבוא גיבוי מלפני שלב 2 (בלי quarantine)', () => {
  const OLD_BACKUP = {
    v: 2,
    exported: '2026-09-05T05:00:00.000Z',
    weights: [W_OK],
    workouts: [],
    legacyWorkouts: [],
    waist: [{ d: '2026-09-01', cm: 95 }],
    checkins: [],
    standaloneCardio: [],
    settings: { programStart: null, soundEnabled: false, lastBackup: '2026-09-05' },
    customFoods: [],
    entries: [],
    targets: [{ from: '2026-09-01', kcal: 1900, protein: 190, carbs: 100, fat: 60 }],
    favorites: [{ foodId: '12345678', grams: 100 }],
  };

  it('parseDb — זהה להתנהגות הקיימת, עם הסגר ריק', async () => {
    const { parseDb } = await import('../schema');
    const r = parseDb(OLD_BACKUP);
    const { quarantine, ...rest } = r.db;
    expect(quarantine).toEqual([]);
    expect(rest).toEqual({
      weights: OLD_BACKUP.weights,
      workouts: [],
      legacyWorkouts: [],
      waist: OLD_BACKUP.waist,
      checkins: [],
      standaloneCardio: [],
      settings: OLD_BACKUP.settings,
      customFoods: [],
      entries: [],
      targets: OLD_BACKUP.targets,
      favorites: OLD_BACKUP.favorites,
    });
    expect(r.rejected).toEqual([]);
  });

  it('מיזוג לתוך DB עם הסגר קיים — ההסגר לא מתכווץ', async () => {
    const { parseDb } = await import('../schema');
    const { mergeDb } = await import('../db');
    const { emptyDb } = await import('../../types');
    const q = { key: 'weights', raw: W_BAD, reason: 'x', at: '2026-09-10T00:00:00.000Z', fp: JSON.stringify(W_BAD) };
    const current: DB = { ...emptyDb(), quarantine: [q] };
    const merged = mergeDb(current, parseDb(OLD_BACKUP).db);
    expect(merged.quarantine).toEqual([q]);
    expect(merged.weights).toEqual([W_OK]);
  });

  it('רשומה שבורה בקובץ הייבוא עצמו נכנסת להסגר של התוצאה', async () => {
    const { parseDb } = await import('../schema');
    const r = parseDb({ ...OLD_BACKUP, weights: [W_OK, W_BAD] });
    expect(r.db.weights).toEqual([W_OK]);
    expect(r.db.quarantine.map((x) => [x.key, x.raw])).toEqual([['weights', W_BAD]]);
    // גיבוי עם הסגר — מתמזג לפי טביעת אצבע, לא מכפיל.
    const r2 = parseDb({ ...OLD_BACKUP, weights: [W_OK, W_BAD], quarantine: r.db.quarantine });
    expect(r2.db.quarantine).toHaveLength(1);
  });
});
