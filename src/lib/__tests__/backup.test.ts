import { describe, it, expect } from 'vitest';
import { BACKUP_REMINDER_DAYS, daysSinceBackup, needsBackupReminder } from '../backup';
import { emptyDb, type DB } from '../../types';

function db(over: Partial<DB> = {}): DB {
  return { ...emptyDb(), ...over };
}

const withData = (lastBackup: string | null): DB =>
  db({
    weights: [{ d: '2026-08-01', w: 80 }],
    settings: { programStart: null, soundEnabled: true, lastBackup },
  });

describe('daysSinceBackup', () => {
  it('null כשמעולם לא גובה', () => {
    expect(daysSinceBackup(emptyDb().settings, '2026-09-02')).toBeNull();
  });

  it('סופר ימים קלנדריים', () => {
    expect(daysSinceBackup({ ...emptyDb().settings, lastBackup: '2026-09-02' }, '2026-09-02')).toBe(0);
    expect(daysSinceBackup({ ...emptyDb().settings, lastBackup: '2026-08-19' }, '2026-09-02')).toBe(14);
  });
});

describe('needsBackupReminder', () => {
  it('אפליקציה ריקה לא מציקה, גם בלי גיבוי', () => {
    expect(needsBackupReminder(emptyDb(), '2026-09-02')).toBe(false);
  });

  it('יש נתונים ומעולם לא גובה — כן', () => {
    expect(needsBackupReminder(withData(null), '2026-09-02')).toBe(true);
  });

  it('הסף הוא בדיוק BACKUP_REMINDER_DAYS', () => {
    expect(BACKUP_REMINDER_DAYS).toBe(14);
    expect(needsBackupReminder(withData('2026-08-20'), '2026-09-02')).toBe(false); // 13
    expect(needsBackupReminder(withData('2026-08-19'), '2026-09-02')).toBe(true); // 14
  });

  it('גיבוי "מהעתיד" (שעון שהוזז) נחשב עדכני', () => {
    expect(needsBackupReminder(withData('2026-09-10'), '2026-09-02')).toBe(false);
  });

  it('גם צ׳ק-אין לבדו הוא נתון ששווה גיבוי', () => {
    const only = db({
      checkins: [
        {
          weekStart: '2026-08-30',
          adherence: 7,
          hunger: null,
          energy: null,
          sleepHours: null,
          unplannedSnackDays: null,
          note: '',
        },
      ],
    });
    expect(needsBackupReminder(only, '2026-09-02')).toBe(true);
  });
});
