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
 *
 * ההחלטה עצמה (סדר, timeout, כישלון = ברירת מחדל) ב-lib/profileBoot.ts,
 * טהור ונבדק; כאן רק החיבור לאחסון האמיתי.
 */

import { get as idbGet, set as idbSet, del as idbDel } from 'idb-keyval';
import { PROFILE_STORAGE_KEY, setActiveProfile, type Profile } from '../data/profile';
import { resolveProfile } from '../lib/profileBoot';

/** ערך גולמי מ-localStorage; זורק כשהאחסון חסום (resolveProfile בולע). */
function readLocal(): unknown {
  const raw = window.localStorage.getItem(PROFILE_STORAGE_KEY);
  return raw === null ? null : (JSON.parse(raw) as unknown);
}

function writeLocal(p: Profile | null): void {
  try {
    if (p === null) window.localStorage.removeItem(PROFILE_STORAGE_KEY);
    else window.localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(p));
  } catch {
    /* localStorage חסום — העותק ב-IndexedDB עדיין קובע */
  }
}

/** `null` = ענה ואין מפתח; זורק כשאין IndexedDB או שהקריאה נכשלה. */
async function readIdb(): Promise<unknown> {
  if (typeof indexedDB === 'undefined') throw new Error('no indexedDB');
  return (await idbGet(PROFILE_STORAGE_KEY)) ?? null;
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
 * טוען את הפרופיל וקובע אותו כפעיל. כל כישלון — שגיאה, אחסון חסום, קריאה
 * שלא חוזרת תוך כשנייה, ערך לא מוכר — נותן `null`: ההתנהגות של היום.
 */
export async function loadProfile(): Promise<Profile | null> {
  const profile = await resolveProfile({
    idb: readIdb,
    local: readLocal,
    healIdb: (p) => writeIdb(p),
    healLocal: (p) => writeLocal(p),
  });
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
