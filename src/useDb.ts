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
};

export type DbApi = DbState & {
  /** מעדכן מפתח אחד ושומר. אם השמירה נכשלת — הערך נשאר במסך והבאנר עולה. */
  update: <K extends DbKey>(key: K, next: DB[K]) => Promise<boolean>;
  replaceAll: (next: DB) => Promise<boolean>;
  wipe: () => Promise<boolean>;
  dismissNotices: () => void;
  dismissErrors: () => void;
};

const WRITE_HELP = 'ייצא גיבוי ממסך "נתונים" לפני שתמשיך.';

export function useDb(): DbApi {
  const [state, setState] = useState<DbState>({
    db: emptyDb(),
    loading: true,
    backend: 'memory',
    notices: [],
    errors: [],
  });
  const mounted = useRef(true);

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
        });
      }
    })();
    return () => {
      mounted.current = false;
    };
  }, []);

  const fail = useCallback((message: string) => {
    setState((s) =>
      s.errors.includes(message) ? s : { ...s, errors: [...s.errors, message] },
    );
  }, []);

  const update = useCallback(
    async <K extends DbKey>(key: K, next: DB[K]): Promise<boolean> => {
      setState((s) => ({ ...s, db: { ...s.db, [key]: next } }));
      try {
        await persist(key, next);
        return true;
      } catch (err) {
        fail(
          `${err instanceof StoreWriteError ? err.message : String(err)}. ${WRITE_HELP}`,
        );
        return false;
      }
    },
    [fail],
  );

  const replaceAll = useCallback(
    async (next: DB): Promise<boolean> => {
      setState((s) => ({ ...s, db: next }));
      try {
        await persistAll(next);
        return true;
      } catch (err) {
        fail(
          `${err instanceof StoreWriteError ? err.message : String(err)}. ${WRITE_HELP}`,
        );
        return false;
      }
    },
    [fail],
  );

  const wipe = useCallback(async (): Promise<boolean> => {
    setState((s) => ({ ...s, db: emptyDb() }));
    try {
      await wipeAll();
      return true;
    } catch (err) {
      fail(`מחיקת הנתונים נכשלה: ${err instanceof Error ? err.message : String(err)}`);
      return false;
    }
  }, [fail]);

  const dismissNotices = useCallback(
    () => setState((s) => ({ ...s, notices: [] })),
    [],
  );
  const dismissErrors = useCallback(() => setState((s) => ({ ...s, errors: [] })), []);

  return { ...state, update, replaceAll, wipe, dismissNotices, dismissErrors };
}
