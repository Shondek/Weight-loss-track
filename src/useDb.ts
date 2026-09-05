/**
 * הגשר היחיד בין הקומפוננטות לאחסון. מחזיק את בסיס הנתונים בזיכרון,
 * כותב דרך store.ts, ואוסף כישלונות כתיבה לבאנר שגיאה.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { emptyDb, type DB } from './types';
import {
  currentBackend,
  loadDB,
  persist,
  persistAll,
  wipeAll,
  StoreWriteError,
  type Backend,
  type DbKey,
} from './lib/store';

export type DbState = {
  db: DB;
  loading: boolean;
  backend: Backend;
  notices: string[];
  /** כישלונות כתיבה שעדיין לא נוקו. מוצגים כבאנר. */
  errors: string[];
  /**
   * מפתחות שקיימים בזיכרון אבל לא הגיעו לדיסק.
   * הערך נשאר על המסך בכוונה — כדי שאפשר יהיה לייצא גיבוי — ולכן
   * חייב להיות סימן קבוע שהוא עדיין לא שמור. סימן שאפשר לסגור לא מספיק.
   */
  dirtyKeys: DbKey[];
};

export type DbApi = DbState & {
  /** מעדכן מפתח אחד ושומר. אם השמירה נכשלת — הערך נשאר במסך והמפתח מסומן. */
  update: <K extends DbKey>(key: K, next: DB[K]) => Promise<boolean>;
  replaceAll: (next: DB) => Promise<boolean>;
  wipe: () => Promise<boolean>;
  /** מנסה לשמור שוב את מה שנכשל. שימושי אחרי שפינו מקום במכשיר. */
  retrySave: () => Promise<boolean>;
  dismissNotices: () => void;
  dismissErrors: () => void;
};

const WRITE_HELP = 'ייצא גיבוי ממסך "נתונים" לפני שתמשיך.';

const ALL_KEYS: DbKey[] = [
  'weights',
  'workouts',
  'waist',
  'checkins',
  'settings',
  'customFoods',
  'entries',
  'targets',
  'favorites',
];

export function useDb(): DbApi {
  const [state, setState] = useState<DbState>({
    db: emptyDb(),
    loading: true,
    backend: 'memory',
    notices: [],
    errors: [],
    dirtyKeys: [],
  });
  const mounted = useRef(true);
  // retrySave צריך את המצב העדכני בלי להיבנות מחדש בכל רינדור
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    mounted.current = true;
    void (async () => {
      try {
        const res = await loadDB();
        if (!mounted.current) return;
        setState({
          db: res.db,
          loading: false,
          backend: res.backend,
          notices: res.notices,
          errors: res.readErrors,
          dirtyKeys: [],
        });
      } catch (err) {
        if (!mounted.current) return;
        setState({
          db: emptyDb(),
          loading: false,
          backend: currentBackend(),
          notices: [],
          errors: [
            `טעינת הנתונים נכשלה: ${err instanceof Error ? err.message : String(err)}`,
          ],
          dirtyKeys: [],
        });
      }
    })();
    return () => {
      mounted.current = false;
    };
  }, []);

  const markFailed = useCallback((keys: DbKey[], err: unknown) => {
    const message = `${err instanceof StoreWriteError ? err.message : String(err)}. ${WRITE_HELP}`;
    setState((s) => ({
      ...s,
      errors: s.errors.includes(message) ? s.errors : [...s.errors, message],
      dirtyKeys: [...new Set([...s.dirtyKeys, ...keys])],
    }));
  }, []);

  const markSaved = useCallback((keys: DbKey[]) => {
    setState((s) =>
      s.dirtyKeys.some((k) => keys.includes(k))
        ? { ...s, dirtyKeys: s.dirtyKeys.filter((k) => !keys.includes(k)) }
        : s,
    );
  }, []);

  const update = useCallback(
    async <K extends DbKey>(key: K, next: DB[K]): Promise<boolean> => {
      setState((s) => ({ ...s, db: { ...s.db, [key]: next } }));
      try {
        await persist(key, next);
        markSaved([key]);
        return true;
      } catch (err) {
        markFailed([key], err);
        return false;
      }
    },
    [markFailed, markSaved],
  );

  const replaceAll = useCallback(
    async (next: DB): Promise<boolean> => {
      setState((s) => ({ ...s, db: next }));
      try {
        await persistAll(next);
        markSaved(ALL_KEYS);
        return true;
      } catch (err) {
        markFailed(ALL_KEYS, err);
        return false;
      }
    },
    [markFailed, markSaved],
  );

  const wipe = useCallback(async (): Promise<boolean> => {
    setState((s) => ({ ...s, db: emptyDb() }));
    try {
      await wipeAll();
      markSaved(ALL_KEYS);
      return true;
    } catch (err) {
      markFailed(ALL_KEYS, err);
      return false;
    }
  }, [markFailed, markSaved]);

  /** שומר מחדש רק את מה שלא הגיע לדיסק. */
  const retrySave = useCallback(async (): Promise<boolean> => {
    const { db, dirtyKeys } = stateRef.current;
    if (dirtyKeys.length === 0) return true;
    let allOk = true;
    for (const key of dirtyKeys) {
      try {
        await persist(key, db[key]);
        markSaved([key]);
      } catch (err) {
        markFailed([key], err);
        allOk = false;
      }
    }
    return allOk;
  }, [markFailed, markSaved]);

  const dismissNotices = useCallback(
    () => setState((s) => ({ ...s, notices: [] })),
    [],
  );
  const dismissErrors = useCallback(() => setState((s) => ({ ...s, errors: [] })), []);

  return { ...state, update, replaceAll, wipe, retrySave, dismissNotices, dismissErrors };
}
