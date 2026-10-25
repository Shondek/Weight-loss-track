/**
 * מה פרופיל המכשיר משנה — מודול טהור. הפרופיל עצמו ב-data/profile.ts.
 *
 * בלי פרופיל (`null`) כל פונקציה כאן מחזירה את ההתנהגות של היום. פרופיל
 * `partner` = בת הזוג: אימונים, היסטוריה, גיבוי והגדרות בלבד.
 */

import type { DB } from '../types';
import type { Profile } from '../data/profile';

export type TabId = 'weight' | 'nutrition' | 'workout' | 'checkin' | 'data';

/** כל הלשוניות, בסדר ההצגה — זה הניווט של היום. */
export const ALL_TABS: readonly TabId[] = ['weight', 'nutrition', 'workout', 'checkin', 'data'];

/** הלשוניות שבת הזוג רואה: אימונים ונתונים (גיבוי, ייצוא, הגדרות). */
export const PARTNER_TABS: readonly TabId[] = ['workout', 'data'];

/** הלשוניות של הפרופיל, בסדר ההצגה. בלי פרופיל — כולן, כמו היום. */
export function visibleTabs(profile: Profile | null): readonly TabId[] {
  return profile === 'partner' ? PARTNER_TABS : ALL_TABS;
}

/** הלשונית שנפתחת בהפעלה: הראשונה שמוצגת. */
export function defaultTab(profile: Profile | null): TabId {
  return visibleTabs(profile)[0] ?? 'weight';
}

export const PROFILE_LABELS: Record<'default' | Profile, string> = {
  default: 'שון',
  partner: 'בת הזוג',
};

/** ההסבר כשההחלפה מושבתת. */
export const SWITCH_BLOCKED_TEXT = 'אפשר להחליף פרופיל רק במכשיר ריק';

/**
 * האם יש במכשיר רשומה כלשהי — מכל סוג. מחמיר יותר מ-`recordCount`
 * (db.ts): גם יעדים, מועדפים, ימים (צעדים), אימונים ישנים שלא הומרו והסגר
 * נחשבים, כי כל אחד מהם הוא עדות שמישהו כבר השתמש במכשיר הזה. ההגדרות
 * (צליל, תחילת תוכנית, תאריך גיבוי) אינן רשומה.
 */
export function deviceHasRecords(db: DB): boolean {
  return (
    db.weights.length > 0 ||
    db.workouts.length > 0 ||
    db.legacyWorkouts.length > 0 ||
    db.waist.length > 0 ||
    db.checkins.length > 0 ||
    db.standaloneCardio.length > 0 ||
    db.customFoods.length > 0 ||
    db.entries.length > 0 ||
    db.targets.length > 0 ||
    db.favorites.length > 0 ||
    db.days.length > 0 ||
    db.creatine.length > 0 ||
    db.quarantine.length > 0
  );
}

/**
 * שומר הבטיחות: החלפת פרופיל, לכל כיוון, מותרת רק כשאין במכשיר אף רשומה.
 * התרגילים המשותפים (לג-פרס, כפיפת ברכיים…) משתמשים באותו `id` בשתי
 * התוכניות, ולכן אימון של אחד היה נכנס להיסטוריה ולהצעות של השני.
 */
export function canSwitchProfile(db: DB): boolean {
  return !deviceHasRecords(db);
}

/**
 * מה מוצג בזרימת האימון. בלי פרופיל — הכול, כמו היום. בת הזוג: בלי
 * תזכורת הברך/הכתף של שון, בלי שדות הכאב, בלי אירובי (סיום, עצמאי,
 * תקציב) ובלי המונה "n/3" — אין לה ימים קבועים.
 */
export function workoutFeatures(profile: Profile | null): {
  constraints: boolean;
  pain: boolean;
  cardio: boolean;
  weeklyCounter: boolean;
} {
  const full = profile !== 'partner';
  return { constraints: full, pain: full, cardio: full, weeklyCounter: full };
}

/** מסך "נתונים": ניהול התזונה (ספריית מנות, מזונות שלי, יעד) רק בלי פרופיל. */
export function dataFeatures(profile: Profile | null): { nutrition: boolean } {
  return { nutrition: profile !== 'partner' };
}
