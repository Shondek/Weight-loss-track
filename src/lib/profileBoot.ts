/**
 * פתרון הפרופיל באתחול — מודול טהור. האחסון מוזרק כפונקציות, כדי שכל
 * מסלול כישלון ייבדק: שגיאה, קריאה שלא חוזרת, ערך לא מוכר.
 *
 * הכלל: **כל כישלון = אין פרופיל = ההתנהגות של היום.** הטלפון של שון
 * לעולם לא נתקע על מסך ריק בגלל הפרופיל — קריאה שנכשלת או נדחית נבלעת,
 * קריאה שלא חוזרת מוגבלת ב-`timeoutMs`, וערך שאינו `"partner"` הוא null.
 * הפונקציה לעולם לא זורקת.
 */

import { parseProfile, type Profile } from '../data/profile';

/** ברירת המחדל: בערך שנייה. IndexedDB בריא עונה בעשרות מילישניות. */
export const PROFILE_BOOT_TIMEOUT_MS = 1000;

export type ProfileSources = {
  /**
   * קריאה מ-IndexedDB. `null` = ענה ואין מפתח; זריקה = נכשל; Promise שלא
   * חוזר = מוגבל ב-timeout. (`undefined` נחשב "לא ענה".)
   */
  idb: () => Promise<unknown>;
  /** קריאה סינכרונית מ-localStorage. זריקה = נכשל. */
  local: () => unknown;
  /** כתיבה חזרה של עותק חסר — best-effort, לא ממתינים לה ולא תלויים בה. */
  healIdb?: ((p: Profile) => Promise<void>) | undefined;
  healLocal?: ((p: Profile) => void) | undefined;
};

/** `undefined` אם ה-Promise נדחה או לא חזר בזמן — ואז ממשיכים בלעדיו. */
function settle(run: () => Promise<unknown>, ms: number): Promise<unknown> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(undefined), ms);
    const done = (v: unknown) => {
      clearTimeout(timer);
      resolve(v);
    };
    try {
      run().then(done, () => done(undefined));
    } catch {
      done(undefined);
    }
  });
}

/**
 * IndexedDB קודם; אם אין בו ערך (או שלא ענה, או שנכשל) — localStorage.
 * עותק שחסר באחד המקומות משוחזר מהשני; ל-IndexedDB רק כשהוא ענה "אין" —
 * לא כשלא ענה בכלל, כדי לא לכתוב מעל מה שאולי קיים שם.
 */
export async function resolveProfile(sources: ProfileSources, timeoutMs = PROFILE_BOOT_TIMEOUT_MS): Promise<Profile | null> {
  const idbRaw = await settle(sources.idb, timeoutMs);
  let localRaw: unknown;
  try {
    localRaw = sources.local();
  } catch {
    localRaw = undefined;
  }
  const fromIdb = parseProfile(idbRaw);
  const fromLocal = parseProfile(localRaw);
  const profile = fromIdb ?? fromLocal;
  if (profile === null) return null;
  if (fromLocal === null) {
    try {
      sources.healLocal?.(profile);
    } catch {
      /* best-effort */
    }
  }
  if (fromIdb === null && idbRaw !== undefined) {
    try {
      void sources.healIdb?.(profile).catch(() => undefined);
    } catch {
      /* best-effort */
    }
  }
  return profile;
}
