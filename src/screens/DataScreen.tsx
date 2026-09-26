import { useMemo, useRef, useState } from 'react';
import type { ScreenProps } from './types';
import type { DB } from '../types';
import { parseDb, type DbParseResult } from '../lib/schema';
import { mergeDb } from '../lib/db';
import { backupJson } from '../lib/exportText';
import { currentBackend } from '../lib/store';
import { formatDM, formatDMY, toLocalISO, weekRangeLabel, weekStart } from '../lib/date';
import { firstDataDate, programStartWeek, recordCount } from '../lib/db';
import { daysSinceBackup } from '../lib/backup';
import DateField from '../components/DateField';
import CopyBlock from '../components/CopyBlock';
import { downloadText, readFileAsText } from '../platform/download';
import { loadMealLibrary } from '../platform/mealLibrary';
import { isLibraryFoodId, mergeLibrary, type LibraryMerge } from '../lib/nutrition/library';
import { mergeQuarantine, quarantineCounts } from '../lib/quarantine';
import { guardedRun, isConfirmed, nutritionErasure, REPLACE_WORD, WIPE_WORD, type NutritionErasure } from '../lib/guard';
import { KEY_LABELS, type DbKey } from '../lib/store';
import { PERSIST_LABEL, usePersistStatus } from '../platform/storagePersist';

type Mode = 'merge' | 'replace';

type LibraryState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'done'; merge: Omit<LibraryMerge, 'list'>; rejected: DbParseResult['rejected']; total: number };

type ImportReport = {
  mode: Mode;
  counts: DbParseResult['counts'];
  rejected: DbParseResult['rejected'];
  totalBefore: number;
  totalAfter: number;
};

const DASH_TEXT = '—';

/** החלפה שנעצרה על אזהרת מחיקת תזונה — ממתינה לאישור מוקלד שני. */
type PendingReplace = { result: DbParseResult; erasure: NutritionErasure };

const NUTRITION_LABELS: Record<keyof NutritionErasure, string> = {
  entries: 'רישומי אכילה',
  customFoods: 'מזונות שלי',
  targets: 'יעדי תזונה',
  favorites: 'מועדפים',
};

const BACKUP_FAILED = 'הגיבוי האוטומטי לא יצא — הפעולה בוטלה ושום דבר לא השתנה. ייצא גיבוי ידנית ונסה שוב.';

const BACKEND_LABEL: Record<string, string> = {
  indexeddb: 'IndexedDB',
  localstorage: 'localStorage (גיבוי — IndexedDB לא זמין)',
  memory: 'זיכרון בלבד — הנתונים ייעלמו בסגירת הדף',
};

const total = recordCount;

/** "לפני 3 ימים" / "היום" — לשורת הגיבוי האחרון. */
function agoText(days: number): string {
  if (days <= 0) return 'היום';
  if (days === 1) return 'אתמול';
  return `לפני ${days} ימים`;
}

export default function DataScreen({ store, today }: ScreenProps) {
  const { db } = store;
  const [raw, setRaw] = useState('');
  const [mode, setMode] = useState<Mode>('merge');
  const [report, setReport] = useState<ImportReport | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [wipeStep, setWipeStep] = useState(0);
  const [wipeText, setWipeText] = useState('');
  const [wipeError, setWipeError] = useState<string | null>(null);
  /** אישור מוקלד להחלפה; נדרש לפני שהקובץ בכלל נקרא. */
  const [replaceText, setReplaceText] = useState('');
  const [pending, setPending] = useState<PendingReplace | null>(null);
  const [pendingText, setPendingText] = useState('');
  const replaceReady = mode === 'merge' || isConfirmed(replaceText, REPLACE_WORD);
  const fileInput = useRef<HTMLInputElement>(null);
  const [library, setLibrary] = useState<LibraryState>({ status: 'idle' });
  const libraryCount = db.customFoods.filter((f) => isLibraryFoodId(f.id)).length;

  const json = useMemo(() => backupJson(db, new Date().toISOString()), [db]);
  const start = useMemo(() => programStartWeek(db), [db]);
  const firstData = useMemo(() => firstDataDate(db), [db]);
  const sinceBackup = daysSinceBackup(db.settings, today);
  const quarantineByKey = useMemo(() => quarantineCounts(db.quarantine), [db.quarantine]);
  const persist = usePersistStatus();

  /** גיבוי מלא יצא מהמכשיר — הורדה או העתקה שהצליחה. מזין את התזכורת. */
  const markBackedUp = () => {
    if (db.settings.lastBackup === today) return;
    void store.update('settings', { ...db.settings, lastBackup: today });
  };

  /**
   * הגיבוי האוטומטי שלפני פעולה הרסנית: אותו JSON מלא, בשם שמסביר למה.
   * לא מעדכן lastBackup: ההגדרות ממילא מוחלפות/נמחקות מיד אחריו.
   */
  const autoBackup = (what: 'replace' | 'wipe'): boolean =>
    downloadText(`fatloss-before-${what}-${toLocalISO(new Date())}.json`, json);

  /** הדוח מוצג גם אם השמירה נכשלה — הנתונים בזיכרון ומסומנים "לא נשמרו" בבאנר. */
  const finishImport = (result: DbParseResult, next: DB, before: number) => {
    setReport({
      mode,
      counts: result.counts,
      rejected: result.rejected,
      totalBefore: before,
      totalAfter: total(next),
    });
    setRaw('');
    setReplaceText('');
    setPending(null);
    setPendingText('');
  };

  /**
   * החלפה: אישור מוקלד → גיבוי אוטומטי → כתיבה. אם אחד השניים הראשונים
   * לא מתקיים, replaceAll לא נקרא (lib/guard.ts).
   */
  const applyReplace = async (result: DbParseResult, typed: string) => {
    const before = total(db);
    // ההסגר מתמזג גם בהחלפה — הוא לעולם לא מתכווץ.
    const next: DB = { ...result.db, quarantine: mergeQuarantine(db.quarantine, result.db.quarantine) };
    const r = await guardedRun({
      typed,
      word: REPLACE_WORD,
      backup: () => autoBackup('replace'),
      run: () => store.replaceAll(next),
    });
    if (!r.ok) {
      setImportError(r.reason === 'not-confirmed' ? `הקלד "${REPLACE_WORD}" כדי לאשר החלפה.` : BACKUP_FAILED);
      return;
    }
    finishImport(result, next, before);
  };

  const runImport = (text: string) => {
    setReport(null);
    setImportError(null);
    setPending(null);
    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(text);
    } catch {
      setImportError('הקובץ אינו JSON תקין.');
      return;
    }
    const result = parseDb(parsedJson);

    if (mode === 'merge') {
      const before = total(db);
      const next = mergeDb(db, result.db);
      void store.replaceAll(next);
      finishImport(result, next, before);
      return;
    }

    // החלפה בקובץ בלי תזונה כשיש תזונה במכשיר: אזהרה מפורשת + אישור שני.
    const erasure = nutritionErasure(db, parsedJson);
    if (erasure) {
      setPending({ result, erasure });
      setPendingText('');
      return;
    }
    void applyReplace(result, replaceText);
  };

  /** "מחק הכול": אישור מוקלד → גיבוי אוטומטי → מחיקה. */
  const runWipe = async () => {
    setWipeError(null);
    const r = await guardedRun({
      typed: wipeText,
      word: WIPE_WORD,
      backup: () => autoBackup('wipe'),
      run: () => store.wipe(),
    });
    if (!r.ok) {
      setWipeError(r.reason === 'not-confirmed' ? `הקלד "${WIPE_WORD}" כדי לאשר.` : BACKUP_FAILED);
      return;
    }
    setWipeStep(0);
    setWipeText('');
    setReport(null);
  };

  /**
   * ספריית המנות מהאתר עצמו — מיזוג בלבד: פריט ספרייה קיים מתעדכן, מזון
   * שלי אחר לא נוגע, רישומים קודמים לא משתנים. ריצה חוזרת: 0 נוספו, 0 עודכנו.
   */
  const loadLibrary = async () => {
    setLibrary({ status: 'loading' });
    try {
      const parsed = parseDb(await loadMealLibrary());
      if (parsed.counts.customFoods === 0) throw new Error('הקובץ שנטען אינו מכיל מזונות');
      const { list, ...merge } = mergeLibrary(db.customFoods, parsed.db.customFoods);
      if (merge.added > 0 || merge.updated > 0) await store.update('customFoods', list);
      setLibrary({ status: 'done', merge, rejected: parsed.rejected, total: list.filter((f) => isLibraryFoodId(f.id)).length });
    } catch (err) {
      setLibrary({ status: 'error', message: err instanceof Error ? err.message : String(err) });
    }
  };

  const pickFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      runImport(await readFileAsText(file));
    } catch (err) {
      setImportError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="stack--loose">
      <section className="section section--first">
        <h2 style={{ marginBottom: 'var(--sp-3)' }}>מצב</h2>
        <ul className="list list--block small">
          <li>
            אחסון: {BACKEND_LABEL[currentBackend()] ?? currentBackend()}
          </li>
          <li>
            {/* navigator.storage.persisted() — האם הדפדפן התחייב לא לפנות את נתוני האתר. */}
            אחסון קבוע: {PERSIST_LABEL[persist]}
          </li>
          <li>
            שקילות <span className="num">{db.weights.length}</span> · אימונים{' '}
            <span className="num">{db.workouts.length}</span>
            {db.legacyWorkouts.length > 0 && (
              <>
                {' '}
                (+<span className="num">{db.legacyWorkouts.length}</span> ישנים)
              </>
            )}{' '}
            · מותניים{' '}
            <span className="num">{db.waist.length}</span> · צ'ק-אין{' '}
            <span className="num">{db.checkins.length}</span> · אירובי עצמאי{' '}
            <span className="num">{db.standaloneCardio.length}</span>
          </li>
          <li>
            רישומי אכילה <span className="num">{db.entries.length}</span> · מזונות שלי{' '}
            <span className="num">{db.customFoods.length}</span> · יעדי תזונה{' '}
            <span className="num">{db.targets.length}</span> · מועדפים{' '}
            <span className="num">{db.favorites.length}</span> · ימים סגורים{' '}
            <span className="num">{db.days.filter((x) => x.closed).length}</span>
          </li>
          <li>
            {/* רשומות שנדחו בקריאה ונשמרו גולמיות במקום להיעלם. אין עריכה ואין מחיקה. */}
            רשומות בהסגר: <span className="num">{db.quarantine.length}</span>
            {db.quarantine.length > 0 && (
              <span className="tiny muted">
                {' '}
                (
                {Object.entries(quarantineByKey)
                  .map(([k, n]) => `${KEY_LABELS[k as DbKey] ?? k} ${n}`)
                  .join(' · ')}
                )
              </span>
            )}
          </li>
        </ul>
      </section>

      <section className="section">
        <div className="section__head">
          <h2>ספריית המנות</h2>
          <span className="tiny muted">
            <span className="num">{libraryCount}</span> פריטים במכשיר
          </span>
        </div>
        <div className="stack">
          <p className="small muted" style={{ margin: 0 }}>
            המנות, הבלוקים והתוספות של "התפריט שלי". מיזוג בלבד: פריט קיים מתעדכן, מזון שלי אחר לא נוגע,
            רישומים קודמים לא משתנים.
          </p>
          <button
            type="button"
            className="btn btn--primary btn--block"
            disabled={library.status === 'loading'}
            onClick={() => void loadLibrary()}
          >
            {library.status === 'loading' ? 'טוען…' : 'טען את ספריית המנות'}
          </button>
          {library.status === 'error' && (
            <p className="banner banner--error" role="alert" style={{ margin: 0 }}>
              {library.message}
            </p>
          )}
          {library.status === 'done' && (
            <div className="banner stack--tight" role="status">
              <p style={{ margin: 0 }}>
                נוספו <span className="num">{library.merge.added}</span> · עודכנו{' '}
                <span className="num">{library.merge.updated}</span> · ללא שינוי{' '}
                <span className="num">{library.merge.unchanged}</span> · בספרייה{' '}
                <span className="num">{library.total}</span>
              </p>
              {library.rejected.length > 0 && (
                <ul className="list list--block tiny">
                  {library.rejected.map((r) => (
                    <li key={`${r.section}-${r.reason}`}>
                      {r.section}: <span className="num">{r.count}</span> — {r.reason}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </section>

      <section className="section">
        <div className="section__head">
          <h2>תחילת התוכנית</h2>
          <span className="tiny muted">שבוע 1</span>
        </div>
        <div className="stack">
          <p className="small muted" style={{ margin: 0 }}>
            קובע רק את מספר השבוע בכותרת הדוח לצ'אט. אינו משפיע על שום חישוב.
          </p>
          <p className="sub" style={{ margin: 0 }}>
            כרגע:{' '}
            <span className="num">
              {start ? weekRangeLabel(start) : DASH_TEXT}
            </span>{' '}
            {db.settings.programStart ? '(נקבע ידנית)' : '(אוטומטי — מהנתון הראשון)'}
          </p>
          <DateField
            label="בחר תאריך בשבוע 1"
            value={db.settings.programStart ?? start ?? today}
            max={today}
            onChange={(d) =>
              void store.update('settings', { ...db.settings, programStart: weekStart(d) })
            }
          />
          {db.settings.programStart && (
            <button
              type="button"
              className="btn btn--quiet"
              onClick={() =>
                void store.update('settings', { ...db.settings, programStart: null })
              }
            >
              חזרה לאוטומטי
              {firstData ? ` (${formatDM(weekStart(firstData))})` : ''}
            </button>
          )}
        </div>
      </section>

      <section className="section">
        <div className="section__head">
          <h2>ייצוא</h2>
          <span className="tiny muted">
            <span className="num">{json.length}</span> תווים
          </span>
        </div>
        <div className="stack">
          <button
            type="button"
            className="btn btn--block"
            onClick={() => {
              const ok = downloadText(`fatloss-${toLocalISO(new Date())}.json`, json);
              if (!ok) setImportError('ההורדה נחסמה. השתמש ב"העתק JSON מלא".');
              else markBackedUp();
            }}
          >
            הורד קובץ גיבוי
          </button>
          <CopyBlock
            text={json}
            label="העתק JSON מלא"
            boxLabel="גיבוי JSON"
            onCopied={markBackedUp}
          />
          <p className={`small${sinceBackup === null && total(db) > 0 ? ' err' : ' muted'}`} style={{ margin: 0 }}>
            גיבוי אחרון:{' '}
            {db.settings.lastBackup ? (
              <>
                <span className="num">{formatDMY(db.settings.lastBackup)}</span>
                {sinceBackup !== null ? ` (${agoText(sinceBackup)})` : ''}
              </>
            ) : (
              'אין עדיין'
            )}
          </p>
          <p className="tiny muted" style={{ margin: 0 }}>
            הכול נשמר על המכשיר בלבד. אין חשבון ואין ענן — גיבוי הוא באחריותך.
          </p>
        </div>
      </section>

      <section className="section">
        <h2 style={{ marginBottom: 'var(--sp-3)' }}>ייבוא</h2>
        <div className="stack">
          <div role="group" aria-label="אופן הייבוא">
            <span className="label">אופן הייבוא</span>
            <div className="choice">
              <button
                type="button"
                className="choice__btn"
                aria-pressed={mode === 'merge'}
                onClick={() => setMode('merge')}
              >
                מיזוג
              </button>
              <button
                type="button"
                className="choice__btn"
                aria-pressed={mode === 'replace'}
                onClick={() => setMode('replace')}
              >
                החלפה
              </button>
            </div>
            <p className="tiny muted" style={{ margin: '4px 0 0' }}>
              {mode === 'merge'
                ? 'רשומה מיובאת גוברת על אותו תאריך/מזהה. שום דבר קיים לא נמחק.'
                : 'כל הנתונים הקיימים יימחקו ויוחלפו בקובץ. לפני כן יורד אוטומטית גיבוי מלא של המצב הנוכחי.'}
            </p>
          </div>

          {mode === 'replace' && (
            <div>
              <label htmlFor="replace-word">הקלד "{REPLACE_WORD}" כדי לאפשר החלפה</label>
              <input
                id="replace-word"
                type="text"
                value={replaceText}
                onChange={(e) => setReplaceText(e.target.value)}
                autoComplete="off"
              />
            </div>
          )}

          <div>
            <label htmlFor="import-file">קובץ JSON</label>
            <input
              id="import-file"
              ref={fileInput}
              type="file"
              accept="application/json,.json,text/plain"
              disabled={!replaceReady}
              onChange={(e) => {
                void pickFile(e.target.files?.[0]);
                e.target.value = '';
              }}
            />
          </div>

          <div>
            <label htmlFor="import-text">או הדבק JSON</label>
            <textarea
              id="import-text"
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
              placeholder='{"v":1,"weights":[...],"workouts":[...]}'
              dir="ltr"
              style={{ minHeight: 120 }}
            />
          </div>

          <button
            type="button"
            className="btn btn--primary btn--block"
            disabled={raw.trim() === '' || !replaceReady}
            onClick={() => runImport(raw)}
          >
            ייבא מהטקסט
          </button>

          {pending && (
            <div className="banner banner--error stack--tight" role="alert">
              <p className="strong" style={{ margin: 0 }}>
                הקובץ אינו מכיל נתוני תזונה. החלפה תמחק מהמכשיר:
              </p>
              <p style={{ margin: 0 }}>
                {(Object.keys(NUTRITION_LABELS) as (keyof NutritionErasure)[])
                  .filter((k) => pending.erasure[k] > 0)
                  .map((k) => `${NUTRITION_LABELS[k]} ${pending.erasure[k]}`)
                  .join(' · ')}
              </p>
              <div>
                <label htmlFor="replace-word-again">הקלד "{REPLACE_WORD}" שוב כדי למחוק אותם ולהחליף</label>
                <input
                  id="replace-word-again"
                  type="text"
                  value={pendingText}
                  onChange={(e) => setPendingText(e.target.value)}
                  autoComplete="off"
                />
              </div>
              <div className="row">
                <button
                  type="button"
                  className="btn btn--danger btn--block"
                  disabled={!isConfirmed(pendingText, REPLACE_WORD)}
                  onClick={() => void applyReplace(pending.result, pendingText)}
                >
                  החלף ומחק תזונה
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={() => {
                    setPending(null);
                    setPendingText('');
                  }}
                >
                  ביטול
                </button>
              </div>
            </div>
          )}

          {importError && (
            <p className="banner banner--error" role="alert" style={{ margin: 0 }}>
              {importError}
            </p>
          )}

          {report && (
            <div className="banner stack--tight" role="status">
              <p style={{ margin: 0 }}>
                {report.mode === 'merge' ? 'מוזג' : 'הוחלף'}: שקילות{' '}
                <span className="num">{report.counts.weights}</span> · אימונים{' '}
                <span className="num">{report.counts.workouts}</span> · מותניים{' '}
                <span className="num">{report.counts.waist}</span> · צ'ק-אין{' '}
                <span className="num">{report.counts.checkins}</span> · אירובי עצמאי{' '}
                <span className="num">{report.counts.standaloneCardio}</span>
              </p>
              <p style={{ margin: 0 }}>
                רישומי אכילה <span className="num">{report.counts.entries}</span> · מזונות שלי{' '}
                <span className="num">{report.counts.customFoods}</span> · יעדי תזונה{' '}
                <span className="num">{report.counts.targets}</span> · מועדפים{' '}
                <span className="num">{report.counts.favorites}</span>
              </p>
              <p style={{ margin: 0 }}>
                סה"כ רשומות: <span className="num">{report.totalBefore}</span> →{' '}
                <span className="num">{report.totalAfter}</span>
              </p>
              {report.rejected.length === 0 ? (
                <p style={{ margin: 0 }}>לא נדחתה אף רשומה.</p>
              ) : (
                <>
                  <p style={{ margin: 0 }}>נדחו:</p>
                  <ul className="list list--block tiny">
                    {report.rejected.map((r) => (
                      <li key={`${r.section}-${r.reason}`}>
                        {r.section}: <span className="num">{r.count}</span> — {r.reason}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          )}
        </div>
      </section>

      <section className="section">
        <h2 style={{ marginBottom: 'var(--sp-3)' }}>מחיקת הכול</h2>
        <div className="stack">
          {wipeStep === 0 && (
            <button
              type="button"
              className="btn btn--danger btn--block"
              onClick={() => setWipeStep(1)}
            >
              מחק את כל הנתונים
            </button>
          )}

          {wipeStep === 1 && (
            <>
              <p className="small err" style={{ margin: 0 }}>
                פעולה בלתי הפיכה. <span className="num">{total(db)}</span> רשומות יימחקו
                מהמכשיר. לפני המחיקה יורד אוטומטית גיבוי מלא; אם ההורדה נכשלת — לא נמחק דבר.
              </p>
              <div className="row">
                <button
                  type="button"
                  className="btn btn--danger btn--block"
                  onClick={() => setWipeStep(2)}
                >
                  הבנתי, המשך
                </button>
                <button type="button" className="btn" onClick={() => setWipeStep(0)}>
                  ביטול
                </button>
              </div>
            </>
          )}

          {wipeStep === 2 && (
            <>
              <div>
                <label htmlFor="wipe-word">הקלד "{WIPE_WORD}" כדי לאשר</label>
                <input
                  id="wipe-word"
                  type="text"
                  value={wipeText}
                  onChange={(e) => setWipeText(e.target.value)}
                  autoComplete="off"
                />
              </div>
              <div className="row">
                <button
                  type="button"
                  className="btn btn--danger btn--block"
                  disabled={!isConfirmed(wipeText, WIPE_WORD)}
                  onClick={() => void runWipe()}
                >
                  מחק הכול
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={() => {
                    setWipeStep(0);
                    setWipeText('');
                    setWipeError(null);
                  }}
                >
                  ביטול
                </button>
              </div>
              {wipeError && (
                <p className="banner banner--error" role="alert" style={{ margin: 0 }}>
                  {wipeError}
                </p>
              )}
            </>
          )}
        </div>
      </section>

      <p className="tiny muted" style={{ margin: 0 }}>
        היום: <span className="num">{today}</span> · גרסת נתונים{' '}
        <span className="num">1</span>
        {total(db) === 0 ? ' · ריק' : ''}
      </p>
    </div>
  );
}
