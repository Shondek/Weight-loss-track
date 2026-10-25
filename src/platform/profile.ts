/**
 * קריאה וכתיבה של פרופיל המכשיר (`fatloss:profile`) — ראה data/profile.ts.
 *
 * נוגע באחסון ישירות ולא דרך store.ts בכוונה: store.ts מייבא את הסכמה,
 * שמייבאת את התוכנית, שקוראת את הפרופיל — ייבוא מעגלי. המודול הזה הוא
 * עלה, ו-main.tsx קורא לו לפני שהאפליקציה נטענת בכלל.
 *
 * אותו דפוס כמו סמן המיגרציה: הערך נכתב לשני המקומות ונקרא מהראשון
 * שיש בו ערך. אם אחד מהם נמחק (לחץ אחסון) — השני עדיין קובע, והעותק
 * החסר משוחזר. בלי זה מכשיר של בת הזוג היה נופל בשקט לתוכנית של שון.
 */

import { get as idbGet, set as idbSet, del as idbDel } from 'idb-keyval';
import { PROFILE_STORAGE_KEY, parseProfile, setActiveProfile, type Profile } from '../data/profile';

function readLocal(): Profile | null {
  try {
    const raw = window.localStorage.getItem(PROFILE_STORAGE_KEY);
    return raw === null ? null : parseProfile(JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
}

function writeLocal(p: Profile | null): void {
  try {
    if (p === null) window.localStorage.removeItem(PROFILE_STORAGE_KEY);
    else window.localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(p));
  } catch {
    /* localStorage חסום — העותק ב-IndexedDB עדיין קובע */
  }
}

async function readIdb(): Promise<Profile | null | undefined> {
  try {
    if (typeof indexedDB === 'undefined') return undefined;
    return parseProfile(await idbGet(PROFILE_STORAGE_KEY));
  } catch {
    return undefined;
  }
}

async function writeIdb(p: Profile | null): Promise<void> {
  try {
    if (typeof indexedDB === 'undefined') return;
    if (p === null) await idbDel(PROFILE_STORAGE_KEY);
    else await idbSet(PROFILE_STORAGE_KEY, p);
  } catch {
    /* IndexedDB חסום — העותק ב-localStorage עדיין קובע */
  }
}

/**
 * טוען את הפרופיל וקובע אותו כפעיל. IndexedDB קודם; אם אין בו — localStorage.
 * עותק שחסר באחד המקומות משוחזר מהשני (best-effort). כישלון בכל מקום =
 * אין פרופיל = ההתנהגות של היום.
 */
export async function loadProfile(): Promise<Profile | null> {
  const fromIdb = await readIdb();
  const fromLocal = readLocal();
  const profile = fromIdb ?? fromLocal;
  if (profile !== null && fromLocal === null) writeLocal(profile);
  if (profile !== null && fromIdb === null) await writeIdb(profile);
  setActiveProfile(profile);
  return profile;
}

/**
 * כותב את הפרופיל לשני המקומות. `null` מוחק את המפתח (חזרה לברירת המחדל).
 * הקורא אחראי לרענן את הדף — התוכנית נבחרת בזמן טעינת המודול.
 */
export async function writeProfile(p: Profile | null): Promise<void> {
  writeLocal(p);
  await writeIdb(p);
}
