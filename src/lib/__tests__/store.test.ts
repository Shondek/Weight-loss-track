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
      days: [],
      creatine: [],
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

describe('סמן המיגרציה — localStorage ישן לא חוזר (סיכון #4)', () => {
  const MARKER = 'fatloss:meta:ls-migrated';
  const LEGACY = [{ d: '2026-01-01', w: 90 }];

  it('סמן קיים + מפתח חסר ב-IndexedDB + ערך ישן ב-localStorage → לא נטען, לא נשמר, באנר', async () => {
    h.idb.set(MARKER, { at: '2026-09-13T00:00:00.000Z', keys: ['weights', 'waist'] });
    h.idb.set('fatloss:waist', [{ d: '2026-09-01', cm: 95 }]);
    ls.setItem('fatloss:weights', JSON.stringify(LEGACY));
    const s = await store();
    const res = await s.loadDB();

    expect(res.db.weights).toEqual([]);
    expect(res.db.waist).toHaveLength(1);
    expect(res.missingKeys).toEqual(['weights']);
    expect(res.readErrors[0]).toContain('נתונים חסרים באחסון');
    expect(res.notices.join('')).not.toContain('יובאו מהגרסה הקודמת');
    expect(h.setCalls).not.toContain('fatloss:weights');
    expect(h.idb.get('fatloss:weights')).toBeUndefined();

    await expect(s.persist('weights', [W_OK])).rejects.toBeInstanceOf(s.StoreWriteError);
    expect(h.idb.get('fatloss:weights')).toBeUndefined();
    // מפתח שלא חסר נשמר כרגיל, והערך הישן ב-localStorage לא נמחק.
    await s.persist('waist', res.db.waist);
    expect(ls.getItem('fatloss:weights')).toBe(JSON.stringify(LEGACY));

    // שחזור מפורש מגיבוי משחרר את החסימה.
    await s.persistAll({ ...res.db, weights: [W_OK] });
    expect(h.idb.get('fatloss:weights')).toEqual([W_OK]);
    expect(s.blockedKeys()).toEqual([]);
  });

  it('בלי סמן + IndexedDB ריק + localStorage מלא → המיגרציה הישנה עובדת וכותבת סמן', async () => {
    ls.setItem('fatloss:weights', JSON.stringify(LEGACY));
    const s = await store();
    const res = await s.loadDB();

    expect(res.db.weights).toEqual(LEGACY);
    expect(res.missingKeys).toEqual([]);
    expect(res.notices.join('')).toContain('יובאו מהגרסה הקודמת: 1 שקילות');
    expect(h.idb.get('fatloss:weights')).toEqual(LEGACY);
    // המקור לא נמחק.
    expect(ls.getItem('fatloss:weights')).toBe(JSON.stringify(LEGACY));

    const m = h.idb.get(MARKER) as { at: string; keys: string[] };
    expect(m.keys).toEqual(['weights']);
    expect(Date.parse(m.at)).not.toBeNaN();
    expect(JSON.parse(ls.getItem(MARKER)!)).toEqual(m);
    expect(s.currentMarker()).toEqual(m);

    // טעינה שנייה: הסמן קיים, הנתון ב-IndexedDB — בלי הודעת מיגרציה.
    vi.resetModules();
    const s2 = await store();
    const again = await s2.loadDB();
    expect(again.db.weights).toEqual(LEGACY);
    expect(again.notices).toEqual([]);
    expect(again.missingKeys).toEqual([]);
  });

  it('מכשיר שכבר מלא ב-IndexedDB בריצה הראשונה של הגרסה — הסמן נכתב מיד עם המפתחות הקיימים', async () => {
    h.idb.set('fatloss:weights', [W_OK]);
    h.idb.set('fatloss:entries', []);
    ls.setItem('fatloss:waist', JSON.stringify([{ d: '2026-01-01', cm: 100 }]));
    const s = await store();
    const res = await s.loadDB();
    // localStorage עדיין נקרא בפעם הראשונה (אין סמן) — זו המיגרציה הישנה.
    expect(res.db.waist).toHaveLength(1);
    const m = h.idb.get(MARKER) as { keys: string[] };
    expect(m.keys.sort()).toEqual(['entries', 'waist', 'weights']);

    // מכאן: ערך ישן ב-localStorage למפתח שלא ברשימה לא נטען ולא מפעיל אזעקה.
    vi.resetModules();
    ls.setItem('fatloss:checkins', JSON.stringify([{ weekStart: '2026-01-04', note: 'old' }]));
    const again = await (await store()).loadDB();
    expect(again.db.checkins).toEqual([]);
    expect(again.missingKeys).toEqual([]);
  });

  it('הסמן מכובד גם כשהוא רק ב-localStorage, ו-persist ראשון של מפתח מוסיף אותו לסמן', async () => {
    ls.setItem(MARKER, JSON.stringify({ at: '2026-09-13T00:00:00.000Z', keys: ['weights'] }));
    ls.setItem('fatloss:weights', JSON.stringify(LEGACY));
    const s = await store();
    const res = await s.loadDB();
    expect(res.db.weights).toEqual([]);
    expect(res.missingKeys).toEqual(['weights']);

    await s.persist('checkins', []);
    expect((h.idb.get(MARKER) as { keys: string[] }).keys).toEqual(['weights', 'checkins']);
  });

  it('"מחק הכול" מוחק גם את הסמן, והטעינה הבאה לא מדווחת על נתונים חסרים', async () => {
    h.idb.set('fatloss:weights', [W_OK]);
    const s = await store();
    await s.loadDB();
    expect(h.idb.get(MARKER)).toBeDefined();
    await s.wipeAll();
    expect(h.idb.get(MARKER)).toBeUndefined();
    expect(ls.getItem(MARKER)).toBeNull();

    vi.resetModules();
    const again = await (await store()).loadDB();
    expect(again.missingKeys).toEqual([]);
    expect(again.readErrors).toEqual([]);
  });
});

describe('fatloss:days — אותו מסלול כמו כל מפתח (שלב 3)', () => {
  it('שורה שבורה נכנסת להסגר, התקינות נטענות ונשמרות, המפתח נרשם בסמן', async () => {
    const good = { d: '2026-09-25', closed: true };
    h.idb.set('fatloss:days', [good, { d: 'bad', closed: true }]);
    const s = await store();
    const res = await s.loadDB();
    expect(res.db.days).toEqual([good]);
    expect(res.quarantined).toBe(1);
    expect(res.db.quarantine[0]).toMatchObject({ key: 'days', raw: { d: 'bad', closed: true } });
    await s.persist('days', res.db.days);
    expect(h.idb.get('fatloss:days')).toEqual([good]);
    expect((h.idb.get('fatloss:meta:ls-migrated') as { keys: string[] }).keys).toContain('days');
    await s.wipeAll();
    expect(h.idb.get('fatloss:days')).toBeUndefined();
  });
});

describe('fatloss:creatine — אותו מסלול כמו כל מפתח', () => {
  it('שורה שבורה נכנסת להסגר, התקינות נטענות ונשמרות, המפתח נרשם בסמן, נמחק במחיקת הכול', async () => {
    const good = { d: '2026-09-27', taken: true, at: '2026-09-27T05:15:00.000Z', dose_g: 5 };
    h.idb.set('fatloss:creatine', [good, { d: '2026-09-28', taken: true, at: 'bad', dose_g: 5 }]);
    const s = await store();
    const res = await s.loadDB();
    expect(res.db.creatine).toEqual([good]);
    expect(res.quarantined).toBe(1);
    expect(res.db.quarantine[0]).toMatchObject({ key: 'creatine', raw: { d: '2026-09-28', taken: true, at: 'bad', dose_g: 5 } });
    await s.persist('creatine', res.db.creatine);
    expect(h.idb.get('fatloss:creatine')).toEqual([good]);
    expect((h.idb.get('fatloss:meta:ls-migrated') as { keys: string[] }).keys).toContain('creatine');
    await s.wipeAll();
    expect(h.idb.get('fatloss:creatine')).toBeUndefined();
  });

  it('מכשיר בלי המפתח: לא "נתונים חסרים", יומן ריק, ושמירה ראשונה מוסיפה אותו לסמן', async () => {
    h.idb.set('fatloss:weights', [{ d: '2026-09-27', w: 78.4 }]);
    const s = await store();
    const res = await s.loadDB();
    expect(res.db.creatine).toEqual([]);
    expect(res.missingKeys).toEqual([]);
    expect(h.idb.get('fatloss:weights')).toEqual([{ d: '2026-09-27', w: 78.4 }]);
  });
});
