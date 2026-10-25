/**
 * פרופיל המכשיר — איזו תוכנית ואילו מסכים האפליקציה מציגה במכשיר הזה.
 *
 * מודול עלה בלי תלויות: `program.ts` קורא ממנו בזמן טעינת המודול כדי
 * לבחור את קובץ התוכנית, ולכן הערך חייב להיות ידוע *לפני* שהמודול הזה
 * מיובא. `main.tsx` טוען את הפרופיל מהאחסון (platform/profile.ts), קובע
 * אותו כאן, ורק אז מייבא את האפליקציה.
 *
 * `null` = אין פרופיל = ההתנהגות של היום, במלואה. `'partner'` = התוכנית
 * של בת הזוג (`program-partner.json`), אימונים בלבד.
 *
 * זה **לא** נתון משתמש: לא ב-`STORAGE_KEYS`, לא בגיבוי, לא בייבוא. ההחלפה
 * מותרת רק במכשיר ריק (lib/profile.ts), ולכן הפרופיל לעולם לא "מערבב"
 * היסטוריה של שני אנשים.
 */

export type Profile = 'partner';

/**
 * מפתח האחסון היחיד שנוסף. נכתב גם ל-IndexedDB וגם ל-localStorage (כמו
 * סמן המיגרציה), ונקרא מהראשון שבו הוא קיים.
 */
export const PROFILE_STORAGE_KEY = 'fatloss:profile';

let active: Profile | null = null;

/** ערך גולמי מהאחסון → פרופיל. כל דבר אחר = אין פרופיל. */
export function parseProfile(raw: unknown): Profile | null {
  return raw === 'partner' ? 'partner' : null;
}

/** הפרופיל הפעיל בסשן הזה. */
export function activeProfile(): Profile | null {
  return active;
}

/** נקרא פעם אחת באתחול (ובבדיקות). */
export function setActiveProfile(p: Profile | null): void {
  active = p;
}
