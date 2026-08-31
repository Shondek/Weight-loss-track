/**
 * שכבת האחסון היחידה של האפליקציה. שום מודול אחר לא נוגע ב-IndexedDB או
 * ב-localStorage. כל שאר המודולים ב-src/lib/ הם טהורים.
 *
 * סדר עדיפויות: IndexedDB → localStorage → זיכרון בלבד.
 * כישלון כתיבה לא נבלע: הוא מדווח החוצה כדי שהממשק יציג באנר מפורש.
 */

import { get as idbGet, set as idbSet, del as idbDel } from 'idb-keyval';
import { emptyDb, type DB } from '../types';
import { parseSettings, parseWeights, parseWorkouts, parseWaist, parseCheckins } from './schema';

export const STORAGE_KEYS = {
  weights: 'fatloss:weights',
  workouts: 'fatloss:workouts',
  waist: 'fatloss:waist',
  checkins: 'fatloss:checkins',
  settings: 'fatloss:settings',
} as const;

export type DbKey = keyof typeof STORAGE_KEYS;

export const KEY_LABELS: Record<DbKey, string> = {
  weights: 'שקילות',
  workouts: 'אימונים',
  waist: 'מותניים',
  checkins: "צ'ק-אין",
  settings: 'הגדרות',
};

export type Backend = 'indexeddb' | 'localstorage' | 'memory';

export class StoreWriteError extends Error {
  readonly key: DbKey;
  constructor(key: DbKey, cause: unknown) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    super(`שמירת ${KEY_LABELS[key]} נכשלה: ${detail}`);
    this.name = 'StoreWriteError';
    this.key = key;
  }
}

let backend: Backend = 'memory';
const memory = new Map<string, unknown>();

export function currentBackend(): Backend {
  return backend;
}

// ---------- גישה גולמית לפי backend ----------

function lsAvailable(): boolean {
  try {
    const probe = '__fatloss_probe__';
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    return true;
  } catch {
    return false;
  }
}

async function idbAvailable(): Promise<boolean> {
  try {
    if (typeof indexedDB === 'undefined') return false;
    const probe = 'fatloss:__probe__';
    await idbSet(probe, 1);
    await idbDel(probe);
    return true;
  } catch {
    return false;
  }
}

async function rawGet(storageKey: string): Promise<unknown> {
  switch (backend) {
    case 'indexeddb': {
      const v = await idbGet(storageKey);
      return v ?? readLocalStorage(storageKey);
    }
    case 'localstorage':
      return readLocalStorage(storageKey);
    default:
      return memory.get(storageKey);
  }
}

async function rawSet(storageKey: string, value: unknown): Promise<void> {
  memory.set(storageKey, value);
  if (backend === 'indexeddb') {
    await idbSet(storageKey, value);
    return;
  }
  if (backend === 'localstorage') {
    window.localStorage.setItem(storageKey, JSON.stringify(value));
  }
}

function readLocalStorage(storageKey: string): unknown {
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (raw === null) return undefined;
    return JSON.parse(raw) as unknown;
  } catch {
    return undefined;
  }
}

// ---------- API ציבורי ----------

export type LoadResult = {
  db: DB;
  backend: Backend;
  /** הודעות שקטות להצגה פעם אחת, למשל מיגרציה מהגרסה הישנה. */
  notices: string[];
  /** קריאה שנכשלה — הנתון עלול להיות חסר. */
  readErrors: string[];
};

/**
 * טוען את כל הנתונים. גם קורא, אם צריך, את המפתחות של גרסת ה-HTML הישנה
 * ישירות מ-localStorage (אותם שמות מפתח בדיוק) ומעביר אותם ל-IndexedDB.
 */
export async function loadDB(): Promise<LoadResult> {
  const notices: string[] = [];
  const readErrors: string[] = [];

  if (await idbAvailable()) backend = 'indexeddb';
  else if (typeof window !== 'undefined' && lsAvailable()) {
    backend = 'localstorage';
    notices.push('IndexedDB אינו זמין. הנתונים נשמרים ב-localStorage.');
  } else {
    backend = 'memory';
    notices.push(
      'האחסון במכשיר חסום. הנתונים יישמרו בזיכרון בלבד וייעלמו בסגירת הדף — ייצא גיבוי.',
    );
  }

  const db: DB = emptyDb();
  const migrated: string[] = [];

  for (const key of Object.keys(STORAGE_KEYS) as DbKey[]) {
    const storageKey = STORAGE_KEYS[key];
    let raw: unknown;
    try {
      raw = await rawGet(storageKey);
    } catch (err) {
      readErrors.push(
        `קריאת ${KEY_LABELS[key]} נכשלה: ${err instanceof Error ? err.message : String(err)}`,
      );
      raw = undefined;
    }

    // מיגרציה מהגרסה הישנה: אותם מפתחות, אבל ב-localStorage.
    let fromLegacy = false;
    if (raw === undefined && backend === 'indexeddb') {
      const legacy = readLocalStorage(storageKey);
      if (legacy !== undefined) {
        raw = legacy;
        fromLegacy = true;
      }
    }

    switch (key) {
      case 'weights': {
        const r = parseWeights(raw);
        db.weights = r.ok;
        if (fromLegacy && r.ok.length) migrated.push(`${r.ok.length} שקילות`);
        break;
      }
      case 'workouts': {
        const r = parseWorkouts(raw);
        db.workouts = r.ok;
        if (fromLegacy && r.ok.length) migrated.push(`${r.ok.length} אימונים`);
        break;
      }
      case 'waist': {
        const r = parseWaist(raw);
        db.waist = r.ok;
        if (fromLegacy && r.ok.length) migrated.push(`${r.ok.length} מדידות מותניים`);
        break;
      }
      case 'checkins': {
        const r = parseCheckins(raw);
        db.checkins = r.ok;
        if (fromLegacy && r.ok.length) migrated.push(`${r.ok.length} צ'ק-אינים`);
        break;
      }
      case 'settings':
        db.settings = parseSettings(raw);
        break;
    }

    if (fromLegacy) {
      // מעתיקים ל-IndexedDB אבל לא מוחקים את המקור, כדי שהגרסה הישנה
      // תמשיך לעבוד אם צריך לחזור אליה.
      try {
        await rawSet(storageKey, raw);
      } catch {
        /* המיגרציה היא best-effort; הנתונים כבר בזיכרון */
      }
    }
  }

  if (migrated.length) {
    notices.push(`יובאו מהגרסה הקודמת: ${migrated.join(' · ')}.`);
  }

  return { db, backend, notices, readErrors };
}

/** שומר מפתח אחד. זורק StoreWriteError אם הכתיבה נכשלה. */
export async function persist<K extends DbKey>(key: K, value: DB[K]): Promise<void> {
  try {
    await rawSet(STORAGE_KEYS[key], value);
  } catch (err) {
    throw new StoreWriteError(key, err);
  }
}

/** שומר את כל בסיס הנתונים (ייבוא / מחיקה גורפת). */
export async function persistAll(db: DB): Promise<void> {
  for (const key of Object.keys(STORAGE_KEYS) as DbKey[]) {
    await persist(key, db[key]);
  }
}

/** מוחק הכול, כולל שאריות של הגרסה הישנה ב-localStorage. */
export async function wipeAll(): Promise<void> {
  await persistAll(emptyDb());
  for (const storageKey of Object.values(STORAGE_KEYS)) {
    try {
      if (backend === 'indexeddb') await idbDel(storageKey);
      window.localStorage.removeItem(storageKey);
    } catch {
      /* ignore */
    }
    memory.delete(storageKey);
  }
}
