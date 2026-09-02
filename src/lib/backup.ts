/**
 * תזכורת גיבוי. מודול טהור.
 *
 * הנתונים נשמרים על המכשיר בלבד, ומחיקת האפליקציה או ניקוי נתוני האתר
 * מוחקים אותם. אין ענן שיציל. לכן האפליקציה עוקבת מתי יוצא גיבוי מלא
 * לאחרונה, ומזכירה כשעבר יותר מדי זמן — או כשמעולם לא יוצא.
 */

import type { DB, ISODate, Settings } from '../types';
import { diffDays } from './date';
import { recordCount } from './db';

/** אחרי כמה ימים בלי גיבוי מופיעה התזכורת. שבועיים = שני צ'ק-אינים. */
export const BACKUP_REMINDER_DAYS = 14;

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
