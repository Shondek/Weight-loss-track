/**
 * תזכורת גיבוי. מודול טהור.
 *
 * הנתונים נשמרים על המכשיר בלבד, ומחיקת האפליקציה או ניקוי נתוני האתר
 * מוחקים אותם. אין ענן שיציל. לכן האפליקציה עוקבת מתי יוצא גיבוי מלא
 * לאחרונה, ומזכירה כשעבר יותר מדי זמן — או כשמעולם לא יוצא.
 */

import type { DB, ISODate, Settings } from '../types';
import type { Profile } from '../data/profile';
import { diffDays } from './date';
import { recordCount } from './db';
import { BACKUP_VERSION } from './exportText';
import { parseDb } from './schema';

/** אחרי כמה ימים בלי גיבוי מופיעה התזכורת. שבוע = צ'ק-אין אחד (שלב 2, סיכון #5). */
export const BACKUP_REMINDER_DAYS = 7;

/** מספר הימים מאז הגיבוי האחרון, או null אם מעולם לא יוצא. */
export function daysSinceBackup(settings: Settings, today: ISODate): number | null {
  return settings.lastBackup ? diffDays(settings.lastBackup, today) : null;
}

/**
 * האם להציג תזכורת גיבוי.
 * רק כשיש מה לגבות; אפליקציה ריקה לא מציקה. גיבוי מהעתיד (שעון שהוזז
 * אחורה) נחשב עדכני — מספר ימים שלילי אינו סיבה לתזכורת.
 */
export function needsBackupReminder(db: DB, today: ISODate): boolean {
  if (recordCount(db) === 0) return false;
  const days = daysSinceBackup(db.settings, today);
  return days === null || days >= BACKUP_REMINDER_DAYS;
}

// ---------- שלב 0 — אמינות גיבוי ושחזור ----------

/**
 * האם הפרופיל שבקובץ שונה מזה של המכשיר. `undefined` בקובץ = השדה חסר
 * (גיבוי ישן) → אין התנגשות, ההתנהגות של היום. ההתנגשות היא אזהרה ולא
 * חסימה: התרגילים המשותפים לשתי התוכניות חולקים `id`, ולכן ייבוא של
 * פרופיל אחר מערבב היסטוריה והצעות משקל.
 */
export function profileConflict(fileProfile: Profile | null | undefined, deviceProfile: Profile | null): boolean {
  return fileProfile !== undefined && fileProfile !== deviceProfile;
}

export type BackupVerification =
  | { ok: true; records: number }
  | { ok: false; problems: string[] };

const VERIFY_LABELS: Record<Exclude<keyof DB, 'settings'>, string> = {
  weights: 'שקילות',
  workouts: 'אימונים',
  legacyWorkouts: 'אימונים ישנים',
  waist: 'מותניים',
  checkins: "צ'ק-אין",
  standaloneCardio: 'אירובי עצמאי',
  customFoods: 'מזונות שלי',
  entries: 'רישומי אכילה',
  targets: 'יעדי תזונה',
  favorites: 'מועדפים',
  days: 'ימים',
  creatine: 'קריאטין',
  quarantine: 'הסגר',
};

/**
 * אימות קובץ גיבוי מול בסיס הנתונים שממנו נוצר: קוראים את הטקסט חזרה
 * דרך אותו פרסר של הייבוא, ומשווים את מספר הרשומות בכל מפתח ואת ההגדרות.
 * רץ אחרי יצירת הקובץ ולפני הודעת ההצלחה; רק גיבוי שעבר מעדכן `lastBackup`.
 * לא בודק שוויון עמוק של כל רשומה — זה תפקיד בדיקות ה-round-trip.
 */
export function verifyBackup(json: string, db: DB): BackupVerification {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (err) {
    return { ok: false, problems: [`הקובץ אינו JSON תקין: ${err instanceof Error ? err.message : String(err)}`] };
  }
  const v = (parsed as { v?: unknown } | null)?.v;
  const problems: string[] = [];
  if (v !== BACKUP_VERSION) problems.push(`גרסת קובץ ${String(v)} במקום ${BACKUP_VERSION}`);

  const r = parseDb(parsed);
  let records = 0;
  for (const key of Object.keys(VERIFY_LABELS) as (keyof typeof VERIFY_LABELS)[]) {
    const expected = db[key].length;
    const got = r.db[key].length;
    records += expected;
    if (got !== expected) problems.push(`${VERIFY_LABELS[key]}: ${got} בקובץ, ${expected} במכשיר`);
  }
  const s = db.settings;
  const t = r.db.settings;
  if (s.programStart !== t.programStart || s.soundEnabled !== t.soundEnabled || s.lastBackup !== t.lastBackup) {
    problems.push('ההגדרות בקובץ שונות מאלה שבמכשיר');
  }
  return problems.length === 0 ? { ok: true, records } : { ok: false, problems };
}
