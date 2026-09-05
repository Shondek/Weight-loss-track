import { useMemo, useRef, useState } from 'react';
import type { ScreenProps } from './types';
import { parseDb, type DbParseResult } from '../lib/schema';
import { mergeDb } from '../lib/db';
import { backupJson } from '../lib/exportText';
import { currentBackend, STORAGE_KEYS } from '../lib/store';
import { formatDM, formatDMY, toLocalISO, weekRangeLabel, weekStart } from '../lib/date';
import { firstDataDate, programStartWeek, recordCount } from '../lib/db';
import { daysSinceBackup } from '../lib/backup';
import DateField from '../components/DateField';
import CopyBlock from '../components/CopyBlock';
import { downloadText, readFileAsText } from '../platform/download';

type Mode = 'merge' | 'replace';

type ImportReport = {
  mode: Mode;
  counts: DbParseResult['counts'];
  rejected: DbParseResult['rejected'];
  totalBefore: number;
  totalAfter: number;
};

const WIPE_WORD = 'מחק';
const DASH_TEXT = '—';

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
  const fileInput = useRef<HTMLInputElement>(null);

  const json = useMemo(() => backupJson(db, new Date().toISOString()), [db]);
  const start = useMemo(() => programStartWeek(db), [db]);
  const firstData = useMemo(() => firstDataDate(db), [db]);
  const sinceBackup = daysSinceBackup(db.settings, today);

  /** גיבוי מלא יצא מהמכשיר — הורדה או העתקה שהצליחה. מזין את התזכורת. */
  const markBackedUp = () => {
    if (db.settings.lastBackup === today) return;
    void store.update('settings', { ...db.settings, lastBackup: today });
  };

  const runImport = (text: string) => {
    setReport(null);
    setImportError(null);
    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(text);
    } catch {
      setImportError('הקובץ אינו JSON תקין.');
      return;
    }
    const result = parseDb(parsedJson);
    const before = total(db);
    const next = mode === 'replace' ? result.db : mergeDb(db, result.db);
    void store.replaceAll(next);
    setReport({
      mode,
      counts: result.counts,
      rejected: result.rejected,
      totalBefore: before,
      totalAfter: total(next),
    });
    setRaw('');
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
            <span className="num">{db.checkins.length}</span>
          </li>
          <li>
            רישומי אכילה <span className="num">{db.entries.length}</span> · מזונות שלי{' '}
            <span className="num">{db.customFoods.length}</span> · יעדי תזונה{' '}
            <span className="num">{db.targets.length}</span> · מועדפים{' '}
            <span className="num">{db.favorites.length}</span>
          </li>
          <li className="muted tiny">
            מפתחות: {Object.values(STORAGE_KEYS).join(' · ')}
          </li>
        </ul>
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
                : 'כל הנתונים הקיימים יימחקו ויוחלפו בקובץ.'}
            </p>
          </div>

          <div>
            <label htmlFor="import-file">קובץ JSON</label>
            <input
              id="import-file"
              ref={fileInput}
              type="file"
              accept="application/json,.json,text/plain"
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
            disabled={raw.trim() === ''}
            onClick={() => runImport(raw)}
          >
            ייבא מהטקסט
          </button>

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
                <span className="num">{report.counts.checkins}</span>
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
                מהמכשיר. ייצא גיבוי קודם.
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
                  disabled={wipeText.trim() !== WIPE_WORD}
                  onClick={() => {
                    void store.wipe();
                    setWipeStep(0);
                    setWipeText('');
                    setReport(null);
                  }}
                >
                  מחק הכול
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={() => {
                    setWipeStep(0);
                    setWipeText('');
                  }}
                >
                  ביטול
                </button>
              </div>
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
