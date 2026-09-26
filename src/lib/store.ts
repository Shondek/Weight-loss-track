/**
 * שכבת האחסון היחידה של האפליקציה. שום מודול אחר לא נוגע ב-IndexedDB או
 * ב-localStorage. כל שאר המודולים ב-src/lib/ הם טהורים.
 *
 * סדר עדיפויות: IndexedDB → localStorage → זיכרון בלבד.
 * כישלון כתיבה לא נבלע: הוא מדווח החוצה כדי שהממשק יציג באנר מפורש.
 */

import { get as idbGet, set as idbSet, del as idbDel } from 'idb-keyval';
import { emptyDb, type DB, type QuarantineItem } from '../types';
import {
  parseCheckins,
  parseCustomFoods,
  parseDays,
  parseEntries,
  parseFavorites,
  parseQuarantine,
  parseSettings,
  parseStandaloneCardio,
  parseTargets,
  parseWaist,
  parseWeights,
  parseWorkouts,
  type Rejection,
} from './schema';
import { mergeQuarantine, quarantineFromRejections } from './quarantine';

export const STORAGE_KEYS = {
  weights: 'fatloss:weights',
  workouts: 'fatloss:workouts',
  waist: 'fatloss:waist',
  checkins: 'fatloss:checkins',
  standaloneCardio: 'fatloss:cardio-standalone',
  settings: 'fatloss:settings',
  customFoods: 'fatloss:customFoods',
  entries: 'fatloss:entries',
  targets: 'fatloss:targets',
  favorites: 'fatloss:favorites',
  /** מטא-נתונים של ימי תזונה (שלב 3): סגור / ארוחת שישי. */
  days: 'fatloss:days',
  /** רשומות שנדחו בקריאה. נכתב לפני כל שמירה של מפתח שנדחו ממנו רשומות. */
  quarantine: 'fatloss:quarantine',
} as const;

/**
 * מפתחות גיבוי. נפרדים מ-`STORAGE_KEYS` כדי שלא ייכנסו ל-`DbKey`, ל-`persistAll`
 * ולתצוגת המפתחות. נכתבים פעם אחת ולעולם לא נדרסים.
 */
export const BACKUP_KEYS = {
  /** `fatloss:workouts` כפי שהיה לפני ההמרה ל-`schemaVersion: 2`. */
  workoutsV1: 'fatloss:workouts:v1',
} as const;

/**
 * מטא-נתונים של האחסון. לא נתון משתמש: לא ב-DbKey, לא בגיבוי.
 * `lsMigrated` — ראה `Marker`.
 */
export const META_KEYS = {
  lsMigrated: 'fatloss:meta:ls-migrated',
} as const;

export type DbKey = keyof typeof STORAGE_KEYS;

/**
 * סמן "המיגרציה מ-localStorage הושלמה" (סיכון #4). נכתב גם ל-IndexedDB
 * וגם ל-localStorage אחרי שהמיגרציה הישנה (M1) רצה בהצלחה פעם אחת.
 *
 * כשהוא קיים באחד משני המקומות, מפתחות הנתונים לעולם לא נקראים יותר
 * מ-localStorage: ערך ישן שם לא יכול להחליף בשקט את הנוכחי אם IndexedDB
 * פונה. `keys` — המפתחות שהיה להם ערך ב-IndexedDB כשהסמן נכתב (ומתעדכן
 * בכל שמירה ראשונה של מפתח): מפתח שברשימה ונעלם = נתונים חסרים; מפתח
 * שלא ברשימה (למשל תזונה אצל מי שלא רשם אכילה) פשוט ריק, בלי אזעקה.
 * ערכי localStorage הישנים לא נמחקים לעולם.
 */
export type Marker = { at: string; keys: string[] };

let marker: Marker | null = null;

/** לבדיקות: הסמן שנטען או נכתב בסשן הזה. */
export function currentMarker(): Marker | null {
  return marker;
}

/**
 * רשומות האימון שלא הומרו, גולמיות. `persist('workouts')` כותב אותן חזרה
 * אחרי הרשומות התקינות בכל שמירה — כך הן שורדות גם עריכה של אימון אחר.
 * מתעדכן ב-`loadDB` וב-`persistAll` בלבד.
 */
let legacyWorkoutsRaw: unknown[] = [];

export const KEY_LABELS: Record<DbKey, string> = {
  weights: 'שקילות',
  workouts: 'אימונים',
  waist: 'מותניים',
  checkins: "צ'ק-אין",
  standaloneCardio: 'אירובי עצמאי',
  settings: 'הגדרות',
  customFoods: 'מזונות שלי',
  entries: 'רישומי אכילה',
  targets: 'יעדי תזונה',
  favorites: 'מועדפים',
  days: 'ימים',
  quarantine: 'הסגר',
};

/**
 * מפתחות שאסור לשמור בסשן הזה, והסיבה. נכנסים לכאן כשההסגר של רשומות
 * שנדחו מהמפתח לא נכתב לדיסק: שמירה של המערך המסונן הייתה מוחקת אותן
 * סופית (סיכון #1). `persist` זורק עליהם; `persistAll` (ייבוא מפורש)
 * משחרר אותם אחרי שההסגר נכתב.
 */
const blocked = new Map<DbKey, string>();

/** לבדיקות ולתצוגה: המפתחות החסומים כרגע. */
export function blockedKeys(): DbKey[] {
  return [...blocked.keys()];
}

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

/**
 * קריאה גולמית. ב-IndexedDB אין נפילה ל-localStorage: הנפילה הזו הייתה
 * מה שאפשר לנתון ישן לחזור (סיכון #4). המיגרציה החד-פעמית מ-localStorage
 * קוראת אותו במפורש ב-`loadDB`, ורק כשאין סמן.
 */
async function rawGet(storageKey: string): Promise<unknown> {
  switch (backend) {
    case 'indexeddb':
      return idbGet(storageKey);
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

function parseMarker(v: unknown): Marker | null {
  if (typeof v === 'string' && v !== '') return { at: v, keys: [] };
  if (typeof v !== 'object' || v === null) return null;
  const at = (v as { at?: unknown }).at;
  const keys = (v as { keys?: unknown }).keys;
  if (typeof at !== 'string') return null;
  return { at, keys: Array.isArray(keys) ? keys.filter((k): k is string => typeof k === 'string') : [] };
}

/** הסמן מ-IndexedDB, ואם אין — מ-localStorage. קיים באחד מהם = קיים. */
async function readMarker(): Promise<Marker | null> {
  let fromIdb: unknown;
  try {
    fromIdb = await idbGet(META_KEYS.lsMigrated);
  } catch {
    fromIdb = undefined;
  }
  return parseMarker(fromIdb) ?? parseMarker(readLocalStorage(META_KEYS.lsMigrated));
}

/** כותב את הסמן לשני המקומות. best-effort: כישלון באחד לא מבטל את השני. */
async function writeMarker(m: Marker): Promise<void> {
  marker = m;
  try {
    await idbSet(META_KEYS.lsMigrated, m);
  } catch {
    /* IndexedDB מלא — העותק ב-localStorage עדיין מגן */
  }
  try {
    window.localStorage.setItem(META_KEYS.lsMigrated, JSON.stringify(m));
  } catch {
    /* localStorage חסום — העותק ב-IndexedDB עדיין מגן */
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
  /** כמה רשומות נכנסו להסגר בטעינה הזו (חדשות, אחרי איחוד). */
  quarantined: number;
  /**
   * מפתחות שהסמן אומר שהיו ב-IndexedDB ועכשיו אינם (סיכון #4). נטענו
   * ריקים, חסומים לשמירה בסשן הזה, והממשק חייב להציג באנר חוסם.
   */
  missingKeys: DbKey[];
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
  let workoutsRaw: unknown;
  let workoutsUpgraded = 0;
  /** דחיות לפי מפתח — הופכות להסגר אחרי הלולאה, לפני כל שמירה. */
  const rejectedBy = new Map<DbKey, Rejection[]>();
  const missingKeys: DbKey[] = [];
  blocked.clear();

  // הסמן רלוונטי רק כש-IndexedDB הוא האחסון: רק אז יש "מקור ישן" נפרד.
  marker = backend === 'indexeddb' ? await readMarker() : null;
  /** מפתחות שיש להם ערך ב-IndexedDB בסוף הטעינה — לסמן חדש. */
  const present: string[] = [];
  /** המיגרציה נחשבת מוצלחת רק אם כל קריאה וכל העתקה הצליחו. */
  let migrationOk = true;

  for (const key of Object.keys(STORAGE_KEYS) as DbKey[]) {
    const storageKey = STORAGE_KEYS[key];
    let raw: unknown;
    let readFailed = false;
    try {
      raw = await rawGet(storageKey);
    } catch (err) {
      readErrors.push(
        `קריאת ${KEY_LABELS[key]} נכשלה: ${err instanceof Error ? err.message : String(err)}`,
      );
      raw = undefined;
      readFailed = true;
      migrationOk = false;
    }

    let fromLegacy = false;
    if (raw === undefined && backend === 'indexeddb' && !readFailed) {
      if (marker === null) {
        // מיגרציה מהגרסה הישנה: אותם מפתחות, אבל ב-localStorage. רק פעם
        // אחת בחיי המכשיר — עד שהסמן נכתב.
        const legacy = readLocalStorage(storageKey);
        if (legacy !== undefined) {
          raw = legacy;
          fromLegacy = true;
        }
      } else if (marker.keys.includes(key)) {
        // היה כאן נתון, ועכשיו אין. לא קוראים מ-localStorage, לא שומרים
        // כלום מעל החור — רק מדווחים. שחזור מגיבוי משחרר (persistAll).
        missingKeys.push(key);
        blocked.set(key, 'נתונים חסרים באחסון — שחזר מגיבוי לפני שממשיכים');
      }
    }
    if (raw !== undefined && !fromLegacy) present.push(key);

    switch (key) {
      case 'weights': {
        const r = parseWeights(raw);
        db.weights = r.ok;
        rejectedBy.set('weights', r.rejected);
        if (fromLegacy && r.ok.length) migrated.push(`${r.ok.length} שקילות`);
        break;
      }
      case 'workouts': {
        const r = parseWorkouts(raw);
        db.workouts = r.ok;
        db.legacyWorkouts = r.unparsed;
        // רשומות שלמות שלא הומרו נשארות ב-legacyWorkouts; דחיות שדה (עם raw) → הסגר.
        rejectedBy.set('workouts', r.rejected);
        workoutsRaw = raw;
        workoutsUpgraded = r.upgraded;
        if (fromLegacy && r.ok.length) migrated.push(`${r.ok.length} אימונים`);
        break;
      }
      case 'waist': {
        const r = parseWaist(raw);
        db.waist = r.ok;
        rejectedBy.set('waist', r.rejected);
        if (fromLegacy && r.ok.length) migrated.push(`${r.ok.length} מדידות מותניים`);
        break;
      }
      case 'checkins': {
        const r = parseCheckins(raw);
        db.checkins = r.ok;
        rejectedBy.set('checkins', r.rejected);
        if (fromLegacy && r.ok.length) migrated.push(`${r.ok.length} צ'ק-אינים`);
        break;
      }
      case 'standaloneCardio': {
        // מפתח חדש: לפני שנוצר אין מה לקרוא, ו-parse על undefined מחזיר ריק.
        const r = parseStandaloneCardio(raw);
        db.standaloneCardio = r.ok;
        rejectedBy.set('standaloneCardio', r.rejected);
        break;
      }
      case 'settings':
        db.settings = parseSettings(raw);
        break;
      // מפתחות התזונה חדשים — אין להם גרסת HTML ישנה ואין מהם מיגרציה.
      case 'customFoods': {
        const r = parseCustomFoods(raw);
        db.customFoods = r.ok;
        rejectedBy.set('customFoods', r.rejected);
        break;
      }
      case 'entries': {
        const r = parseEntries(raw);
        db.entries = r.ok;
        rejectedBy.set('entries', r.rejected);
        break;
      }
      case 'targets': {
        const r = parseTargets(raw);
        db.targets = r.ok;
        rejectedBy.set('targets', r.rejected);
        break;
      }
      case 'favorites': {
        const r = parseFavorites(raw);
        db.favorites = r.ok;
        rejectedBy.set('favorites', r.rejected);
        break;
      }
      case 'days': {
        const r = parseDays(raw);
        db.days = r.ok;
        rejectedBy.set('days', r.rejected);
        break;
      }
      case 'quarantine':
        // סלחני ולא דוחה — ראה parseQuarantine.
        db.quarantine = parseQuarantine(raw);
        break;
    }

    if (fromLegacy) {
      // מעתיקים ל-IndexedDB אבל לא מוחקים את המקור, כדי שהגרסה הישנה
      // תמשיך לעבוד אם צריך לחזור אליה.
      try {
        await rawSet(storageKey, raw);
        present.push(key);
      } catch {
        /* המיגרציה היא best-effort; הנתונים כבר בזיכרון. הסמן לא ייכתב — הניסיון יחזור. */
        migrationOk = false;
      }
    }
  }

  if (migrated.length) {
    notices.push(`יובאו מהגרסה הקודמת: ${migrated.join(' · ')}.`);
  }

  // המיגרציה רצה בהצלחה (או שלא היה מה להעביר) — מכאן localStorage הוא
  // עבר. גם כשהמכשיר כבר מלא בנתונים ב-IndexedDB הסמן נכתב מיד.
  if (backend === 'indexeddb' && marker === null && migrationOk) {
    await writeMarker({ at: new Date().toISOString(), keys: present });
  }

  legacyWorkoutsRaw = db.legacyWorkouts.map((l) => l.raw);

  // הסגר קודם לכל שמירה. רק אחרי שהרשומות שנדחו כתובות לדיסק מותר לשמור
  // את המערכים המסוננים — אחרת השמירה הבאה הייתה מוחקת אותן (סיכון #1).
  const quarantined = await quarantineRejected(db, rejectedBy, readErrors);

  if (workoutsUpgraded > 0) {
    const notice = await upgradeWorkoutsOnDisk(workoutsRaw, db);
    if (notice) notices.push(`${workoutsUpgraded} ${notice}`);
  }

  if (missingKeys.length) {
    readErrors.push(
      `נתונים חסרים באחסון (${missingKeys.map((k) => KEY_LABELS[k]).join(' · ')}) — שחזר מגיבוי לפני שממשיכים.`,
    );
  }

  return { db, backend, notices, readErrors, quarantined, missingKeys };
}

/**
 * מכניס להסגר את הרשומות שנדחו בטעינה וכותב אותו לדיסק. מחזיר כמה
 * פריטים חדשים נוספו. אם הכתיבה נכשלת — כל מפתח שנדחו ממנו רשומות נחסם
 * לשמירה בסשן הזה, והשגיאה מדווחת לבאנר.
 */
async function quarantineRejected(
  db: DB,
  rejectedBy: ReadonlyMap<DbKey, readonly Rejection[]>,
  readErrors: string[],
): Promise<number> {
  const at = new Date().toISOString();
  const incoming: QuarantineItem[] = [];
  const sources: DbKey[] = [];
  for (const [key, rejected] of rejectedBy) {
    const items = quarantineFromRejections(key, rejected, at);
    if (items.length === 0) continue;
    incoming.push(...items);
    sources.push(key);
  }
  if (incoming.length === 0) return 0;

  const merged = mergeQuarantine(db.quarantine, incoming);
  const added = merged.length - db.quarantine.length;
  db.quarantine = merged;
  if (added === 0) return 0;

  try {
    await rawSet(STORAGE_KEYS.quarantine, merged);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    for (const key of sources) {
      blocked.set(key, `ההסגר לא נכתב לדיסק (${detail})`);
    }
    readErrors.push(
      `${added} רשומות שנדחו לא נכנסו להסגר: ${detail}. ${sources
        .map((k) => KEY_LABELS[k])
        .join(' · ')} לא יישמרו עד שתייצא גיבוי ותרענן.`,
    );
  }
  return added;
}

/**
 * המרה חד-פעמית של `fatloss:workouts` ל-`schemaVersion: 2`.
 *
 * 1. אם `fatloss:workouts:v1` עדיין לא קיים — כותבים אליו את המערך הגולמי,
 *    בדיוק כפי שנקרא. הכתיבה הזו קורית פעם אחת בחיי המכשיר.
 * 2. רק אחרי שהגיבוי קיים כותבים ל-`fatloss:workouts` את המערך המומר,
 *    והרשומות שלא הומרו אחריו כמו שהן.
 *
 * אם הגיבוי לא נכתב — לא נוגעים ב-`fatloss:workouts`. האפליקציה ממשיכה
 * לעבוד מההמרה שבזיכרון, והניסיון חוזר בטעינה הבאה.
 * מחזיר את סוף הודעת המשתמש, או null אם שום דבר לא נכתב.
 */
async function upgradeWorkoutsOnDisk(raw: unknown, db: DB): Promise<string | null> {
  let backupExists: boolean;
  try {
    backupExists = (await rawGet(BACKUP_KEYS.workoutsV1)) !== undefined;
  } catch {
    return null;
  }

  if (!backupExists) {
    try {
      await rawSet(BACKUP_KEYS.workoutsV1, raw);
    } catch {
      return null;
    }
  }

  try {
    await persist('workouts', db.workouts);
  } catch {
    return null;
  }
  return backupExists
    ? 'אימונים הומרו לפורמט החדש.'
    : 'אימונים הומרו לפורמט החדש; עותק של המקור נשמר.';
}

/** שומר מפתח אחד. זורק StoreWriteError אם הכתיבה נכשלה. */
export async function persist<K extends DbKey>(key: K, value: DB[K]): Promise<void> {
  const why = blocked.get(key);
  if (why !== undefined) throw new StoreWriteError(key, why);
  // האימונים שלא הומרו נכתבים תמיד בסוף אותו מפתח, כדי שלא ייעלמו בשמירה.
  const toWrite: unknown =
    key === 'workouts' && legacyWorkoutsRaw.length
      ? [...(value as DB['workouts']), ...legacyWorkoutsRaw]
      : value;
  try {
    await rawSet(STORAGE_KEYS[key], toWrite);
  } catch (err) {
    throw new StoreWriteError(key, err);
  }
  // מפתח שנכתב לראשונה נרשם בסמן: מעכשיו היעלמותו היא "נתונים חסרים".
  if (backend === 'indexeddb' && marker !== null && !marker.keys.includes(key)) {
    await writeMarker({ at: marker.at, keys: [...marker.keys, key] });
  }
}

/**
 * שומר את כל בסיס הנתונים (ייבוא / מחיקה גורפת). ההסגר נכתב ראשון: ייבוא
 * הוא הדרך היחידה שבה מפתח שנחסם (כי ההסגר לא נכתב) משתחרר, ורק אחרי
 * שההסגר בדיסק.
 */
export async function persistAll(db: DB): Promise<void> {
  legacyWorkoutsRaw = db.legacyWorkouts.map((l) => l.raw);
  blocked.delete('quarantine');
  await persist('quarantine', db.quarantine);
  blocked.clear();
  for (const key of Object.keys(STORAGE_KEYS) as DbKey[]) {
    if (key === 'quarantine') continue;
    await persist(key, db[key]);
  }
}

/**
 * מוחק הכול, כולל שאריות של הגרסה הישנה ב-localStorage וגיבוי ה-v1.
 * זה הנתיב היחיד שמוחק מפתח כלשהו, והוא נפתח רק מ"מחק הכול" המפורש.
 */
export async function wipeAll(): Promise<void> {
  await persistAll(emptyDb());
  for (const storageKey of [...Object.values(STORAGE_KEYS), ...Object.values(BACKUP_KEYS)]) {
    try {
      if (backend === 'indexeddb') await idbDel(storageKey);
      window.localStorage.removeItem(storageKey);
    } catch {
      /* ignore */
    }
    memory.delete(storageKey);
  }
  // הסמן נמחק איתם: אחרי מחיקה מפורשת אין "נתונים חסרים", והטעינה הבאה
  // כותבת סמן חדש. ערכי localStorage הישנים כבר נמחקו למעלה — זה הנתיב
  // המפורש היחיד שנוגע בהם.
  try {
    if (backend === 'indexeddb') await idbDel(META_KEYS.lsMigrated);
    window.localStorage.removeItem(META_KEYS.lsMigrated);
  } catch {
    /* ignore */
  }
  marker = null;
}
