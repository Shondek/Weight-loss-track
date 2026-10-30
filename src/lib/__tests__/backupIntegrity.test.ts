/**
 * שלב 0 — אמינות גיבוי ושחזור.
 *
 * golden-file: `fixtures/backup-golden-before.json` יוצא מ-`goldenDb()` בגרסה
 * שלפני השינוי (ייצוא עם הזחה, בלי `profile`). הוא מוקפא. הבדיקות כאן
 * מוודאות שהוא נטען בלי שינוי, שהייצוא החדש זהה לו אחרי parse פרט לשדה
 * החדש, שה-round-trip סגור, ושהשדות החדשים מתנהגים כמתוכנן.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { emptyDb, type DB } from '../../types';
import { backupJson, buildBackup, BACKUP_VERSION, toBackupProfile } from '../exportText';
import { parseBackupProfile, parseDb } from '../schema';
import { lastBackupAfterImport, mergeDb, recordCount } from '../db';
import { profileConflict, verifyBackup } from '../backup';
import { goldenDb } from './fixtures/goldenDb';

const AT = '2026-09-08T05:00:00.000Z';
const GOLDEN_PATH = new URL('./fixtures/backup-golden-before.json', import.meta.url);
const golden = () => readFileSync(GOLDEN_PATH, 'utf-8');

/** כל המפתחות של המסד, בלי הגדרות — לספירות. */
const ARRAY_KEYS = [
  'weights',
  'workouts',
  'legacyWorkouts',
  'waist',
  'checkins',
  'standaloneCardio',
  'customFoods',
  'entries',
  'targets',
  'favorites',
  'days',
  'creatine',
  'quarantine',
] as const;

const countsOf = (db: DB) => Object.fromEntries(ARRAY_KEYS.map((k) => [k, db[k].length]));

describe('golden-file: הגיבוי מלפני השינוי', () => {
  it('הקובץ המוקפא הוא הפורמט הישן: עם הזחה, בלי profile, 16 מפתחות', () => {
    const text = golden();
    expect(text).toContain('\n');
    const obj = JSON.parse(text) as Record<string, unknown>;
    expect(Object.keys(obj)).toEqual([
      'v',
      'exported',
      'weights',
      'workouts',
      'legacyWorkouts',
      'waist',
      'checkins',
      'standaloneCardio',
      'settings',
      'customFoods',
      'entries',
      'targets',
      'favorites',
      'days',
      'creatine',
      'quarantine',
    ]);
    expect(obj).not.toHaveProperty('profile');
  });

  it('נטען בגרסה החדשה בלי שינוי: אותן ספירות, אותן רשומות, פרופיל לא ידוע', () => {
    const r = parseDb(JSON.parse(golden()));
    const db = goldenDb();
    expect(countsOf(r.db)).toEqual(countsOf(db));
    expect(r.db).toEqual(db);
    // האימון הישן שלא הומר נשאר "אימון ישן" — זו לא דחייה חדשה.
    expect(r.rejected).toEqual([{ section: 'אימונים', reason: 'תאריך לא תקין — נשמר כאימון ישן', count: 1 }]);
    expect(r.profile).toBeUndefined();
  });

  it('הייצוא החדש (קומפקטי, עם profile) זהה לגולדן אחרי parse, פרט לשדה profile', () => {
    const before = JSON.parse(golden()) as Record<string, unknown>;
    const after = JSON.parse(backupJson(goldenDb(), AT, null)) as Record<string, unknown>;
    expect(after.profile).toBe('default');
    const { profile: _p, ...afterWithout } = after;
    expect(afterWithout).toEqual(before);
    // סדר המפתחות הקיימים לא זז; החדש אחרון.
    expect(Object.keys(after)).toEqual([...Object.keys(before), 'profile']);
  });

  it('אף שדה קיים לא השתנה: parse של הגולדן ושל הייצוא החדש נותן אותו מסד', () => {
    expect(parseDb(JSON.parse(backupJson(goldenDb(), AT, 'partner'))).db).toEqual(parseDb(JSON.parse(golden())).db);
  });
});

describe('ייצוא קומפקטי', () => {
  it('בלי רווחים והזחה, ואותו תוכן בדיוק כמו buildBackup', () => {
    const db = goldenDb();
    const text = backupJson(db, AT, null);
    expect(text).not.toContain('\n');
    expect(text).not.toContain('  ');
    expect(JSON.parse(text)).toEqual(buildBackup(db, AT, null));
  });

  it('קטן מהפורמט עם הזחה על אותו מסד', () => {
    const db = goldenDb();
    const compact = backupJson(db, AT, null).length;
    const pretty = JSON.stringify(buildBackup(db, AT, null), null, 2).length;
    expect(compact).toBeLessThan(pretty * 0.75);
  });
});

describe('round-trip: ייצוא → ייבוא → ייצוא', () => {
  it('מסד → JSON → parseDb → JSON: המסד שווה, והקובץ זהה בייט-בייט אחרי הנרמול הראשון', () => {
    const db = goldenDb();
    const first = backupJson(db, AT, 'partner');
    const restored = parseDb(JSON.parse(first));
    expect(restored.db).toEqual(db);
    expect(restored.profile).toBe('partner');
    // באפליקציה כל נתון עובר את הפרסר בטעינה, ולכן סדר המפתחות בתוך רשומה
    // הוא תמיד של הפרסר. הקובץ הראשון כאן נבנה מרשומות שנכתבו ביד — שווה
    // בתוכן, לא בהכרח בסדר המפתחות.
    const second = backupJson(restored.db, AT, restored.profile);
    expect(JSON.parse(second)).toEqual(JSON.parse(first));
    // מכאן והלאה — זהות מלאה של המחרוזת: ייצוא → wipe → ייבוא → ייצוא.
    const third = backupJson(parseDb(JSON.parse(second)).db, AT, 'partner');
    expect(third).toBe(second);
    expect(backupJson(parseDb(JSON.parse(third)).db, AT, 'partner')).toBe(third);
  });

  it('גם דרך מסד ריק (wipe) ומיזוג: ריק ⊕ קובץ = הקובץ', () => {
    const db = goldenDb();
    const file = parseDb(JSON.parse(backupJson(db, AT, null)));
    const merged = mergeDb(emptyDb(), file.db);
    // מיזוג לתוך ריק: כל הרשומות חוזרות; soundEnabled הוא של המכשיר (ריק → ברירת מחדל),
    // ו-lastBackup null כי למכשיר הריק אין גיבוי — ראו lastBackupAfterImport.
    expect(countsOf(merged)).toEqual(countsOf(db));
    expect({ ...merged, settings: db.settings }).toEqual(db);
    expect(merged.settings.lastBackup).toBeNull();
  });
});

describe('שדה profile', () => {
  it('buildBackup בלי פרופיל לא כותב את השדה — המבנה של היום', () => {
    expect(buildBackup(goldenDb(), AT)).not.toHaveProperty('profile');
    expect(JSON.parse(backupJson(goldenDb(), AT))).not.toHaveProperty('profile');
  });

  it("null → 'default', 'partner' → 'partner', תמיד אחרון", () => {
    expect(toBackupProfile(null)).toBe('default');
    expect(toBackupProfile('partner')).toBe('partner');
    const keys = Object.keys(buildBackup(goldenDb(), AT, 'partner'));
    expect(keys[keys.length - 1]).toBe('profile');
  });

  it('parseBackupProfile: default/partner מזוהים, חסר או זבל = לא ידוע', () => {
    expect(parseBackupProfile('default')).toBeNull();
    expect(parseBackupProfile('partner')).toBe('partner');
    expect(parseBackupProfile(undefined)).toBeUndefined();
    expect(parseBackupProfile('shon')).toBeUndefined();
    expect(parseBackupProfile(1)).toBeUndefined();
    expect(parseDb({ v: 2, profile: 'partner' }).profile).toBe('partner');
    expect(parseDb({ v: 2 }).profile).toBeUndefined();
  });

  it('profileConflict: רק כשהקובץ אומר משהו, והוא שונה מהמכשיר', () => {
    expect(profileConflict(undefined, null)).toBe(false);
    expect(profileConflict(undefined, 'partner')).toBe(false);
    expect(profileConflict(null, null)).toBe(false);
    expect(profileConflict('partner', 'partner')).toBe(false);
    expect(profileConflict('partner', null)).toBe(true);
    expect(profileConflict(null, 'partner')).toBe(true);
  });

  it('פרופיל שגוי לא דוחה שום רשומה — הוא רמז לאזהרה בלבד', () => {
    const obj = JSON.parse(backupJson(goldenDb(), AT, null)) as Record<string, unknown>;
    obj.profile = 'someone-else';
    const r = parseDb(obj);
    expect(r.profile).toBeUndefined();
    expect(countsOf(r.db)).toEqual(countsOf(goldenDb()));
  });
});

describe('lastBackup אחרי ייבוא — לעולם לא עדכני ממה שהוא באמת', () => {
  it('המוקדם מבין המכשיר והקובץ; null אם אחד מהם null', () => {
    expect(lastBackupAfterImport('2026-08-20', '2026-09-01')).toBe('2026-08-20');
    expect(lastBackupAfterImport('2026-09-01', '2026-08-20')).toBe('2026-08-20');
    expect(lastBackupAfterImport('2026-08-20', '2026-08-20')).toBe('2026-08-20');
    expect(lastBackupAfterImport(null, '2026-09-01')).toBeNull();
    expect(lastBackupAfterImport('2026-09-01', null)).toBeNull();
    expect(lastBackupAfterImport(null, null)).toBeNull();
  });

  it('mergeDb: קובץ עם תאריך מאוחר לא משתיק את התזכורת', () => {
    const local: DB = { ...emptyDb(), settings: { programStart: null, soundEnabled: false, lastBackup: '2026-08-20' } };
    const newerFile: DB = { ...emptyDb(), settings: { programStart: null, soundEnabled: true, lastBackup: '2026-09-01' } };
    expect(mergeDb(local, newerFile).settings.lastBackup).toBe('2026-08-20');
    const olderFile: DB = { ...emptyDb(), settings: { programStart: null, soundEnabled: true, lastBackup: '2026-08-10' } };
    expect(mergeDb(local, olderFile).settings.lastBackup).toBe('2026-08-10');
    expect(mergeDb(local, emptyDb()).settings.lastBackup).toBeNull();
  });
});

describe('verifyBackup — קריאה חזרה של הקובץ לפני הודעת ההצלחה', () => {
  it('ייצוא אמיתי עובר, עם מספר הרשומות הכולל', () => {
    const db = goldenDb();
    const v = verifyBackup(backupJson(db, AT, null), db);
    expect(v).toEqual({ ok: true, records: ARRAY_KEYS.reduce((n, k) => n + db[k].length, 0) });
    // recordCount סופר פחות מפתחות (יעדים/מועדפים/ימים/הסגר אינם "רשומות") — האימות מחמיר יותר.
    expect((v as { records: number }).records).toBeGreaterThan(recordCount(db));
  });

  it('רשומה שנפלה מהקובץ מתגלה', () => {
    const db = goldenDb();
    const obj = JSON.parse(backupJson(db, AT, null)) as { entries: unknown[]; weights: unknown[] };
    obj.entries.pop();
    const v = verifyBackup(JSON.stringify(obj), db);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.problems).toEqual(['רישומי אכילה: 3 בקובץ, 4 במכשיר']);
  });

  it('רשומה שהפרסר ידחה (ולכן לא תחזור) מתגלה כחוסר', () => {
    const db = goldenDb();
    const obj = JSON.parse(backupJson(db, AT, null)) as { weights: { d: string; w: number }[] };
    obj.weights[0]!.w = 999; // מחוץ לטווח → נדחית → נכנסת להסגר
    const v = verifyBackup(JSON.stringify(obj), db);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.problems).toEqual(['שקילות: 8 בקובץ, 9 במכשיר', 'הסגר: 2 בקובץ, 1 במכשיר']);
  });

  it('הגדרות שונות, גרסה שונה, ו-JSON שבור — נכשלים', () => {
    const db = goldenDb();
    const obj = JSON.parse(backupJson(db, AT, null)) as { settings: { lastBackup: string | null }; v: number };
    obj.settings.lastBackup = null;
    const v1 = verifyBackup(JSON.stringify(obj), db);
    expect(v1.ok).toBe(false);
    if (!v1.ok) expect(v1.problems).toEqual(['ההגדרות בקובץ שונות מאלה שבמכשיר']);

    const v2 = verifyBackup(JSON.stringify({ ...JSON.parse(backupJson(db, AT, null)), v: 1 }), db);
    expect(v2.ok).toBe(false);
    if (!v2.ok) expect(v2.problems[0]).toBe(`גרסת קובץ 1 במקום ${BACKUP_VERSION}`);

    const v3 = verifyBackup('{not json', db);
    expect(v3.ok).toBe(false);
    if (!v3.ok) expect(v3.problems[0]).toMatch(/^הקובץ אינו JSON תקין/);
  });

  it('מסד ריק מייצא קובץ שעובר אימות עם 0 רשומות', () => {
    expect(verifyBackup(backupJson(emptyDb(), AT, null), emptyDb())).toEqual({ ok: true, records: 0 });
  });
});
