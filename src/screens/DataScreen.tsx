import { useMemo, useState, type ReactNode } from 'react';
import type { ScreenProps } from './types';
import type { CustomFood, DB } from '../types';
import { parseDb, type DbParseResult } from '../lib/schema';
import { useFoodIndex } from '../useFoodIndex';
import CustomFoodEditor, { type EditorMode } from './CustomFoodEditor';
import TargetForm from '../components/TargetForm';
import { displayValues, fromCustom, removeCustomFood, upsertCustomFood } from '../lib/nutrition/foods';
import { targetFor, upsertTarget } from '../lib/nutrition/targets';
import { gramsWholeText, kcalText } from '../lib/nutrition/display';
import { mergeDb } from '../lib/db';
import { BACKUP_VERSION, backupJson } from '../lib/exportText';
import { currentBackend } from '../lib/store';
import { formatDM, formatDMY, toLocalISO, weekRangeLabel, weekStart } from '../lib/date';
import { firstDataDate, lastBackupAfterImport, programStartWeek, recordCount } from '../lib/db';
import { BACKUP_REMINDER_DAYS, daysSinceBackup, profileConflict, verifyBackup } from '../lib/backup';
import BackupSave from '../components/BackupSave';
import DateField from '../components/DateField';
import CopyBlock from '../components/CopyBlock';
import { downloadText, readFileAsText } from '../platform/download';
import { loadMealLibrary } from '../platform/mealLibrary';
import { isLibraryFoodId, mergeLibrary, type LibraryMerge } from '../lib/nutrition/library';
import { mergeQuarantine, quarantineCounts } from '../lib/quarantine';
import { guardedRun, isConfirmed, nutritionErasure, REPLACE_WORD, WIPE_WORD, type NutritionErasure } from '../lib/guard';
import { KEY_LABELS, type DbKey } from '../lib/store';
import { PERSIST_LABEL, usePersistStatus } from '../platform/storagePersist';
import { activeProfile, type Profile } from '../data/profile';
import { writeProfile } from '../platform/profile';
import { PROFILE_LABELS, SWITCH_BLOCKED_TEXT, canSwitchProfile, dataFeatures } from '../lib/profile';
import { Button, ChipSelect, Disclosure, Icon, ListRow, Num, SectionHeader, StatusChip, Surface, useToast, type ChipOption } from '../ui';
import { Database, HardDrive, Info, Pencil, Plus, Settings, ShieldAlert, Upload, UserRound, Utensils } from '../ui/icons';

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
  /** "גיבוי אחרון" אחרי הייבוא — המוקדם מבין המכשיר והקובץ, או null (שלב 0). */
  lastBackup: string | null;
};

/**
 * ייבוא שנעצר כי הפרופיל בקובץ שונה מזה של המכשיר (שלב 0). שום דבר לא
 * נכתב עד "ייבא בכל זאת"; "ביטול" משאיר את המסד כפי שהוא.
 */
type ProfileWarning = { result: DbParseResult; parsedJson: unknown; mode: Mode };

/** שם הפרופיל לאזהרה. `null` = אין פרופיל = שון. */
const profileName = (p: Profile | null): string => (p === null ? PROFILE_LABELS.default : PROFILE_LABELS[p]);

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

/** פרופיל המכשיר (data/profile.ts) — נקבע באתחול, לפני שהמסך נטען. */
const PROFILE = activeProfile();
const FEATURES = dataFeatures(PROFILE);

/** אפשרויות הפרופיל לצ'יפים. `null` (שון) מיוצג כ-'default' כי הצ'יפ צריך מפתח מחרוזת. */
type ProfileKey = 'default' | Profile;
const PROFILE_OPTIONS: readonly ChipOption<ProfileKey>[] = [
  { value: 'default', label: PROFILE_LABELS.default },
  { value: 'partner', label: PROFILE_LABELS.partner },
];

/** "לפני 3 ימים" / "היום" — לשורת הגיבוי האחרון. */
function agoText(days: number): string {
  if (days <= 0) return 'היום';
  if (days === 1) return 'אתמול';
  return `לפני ${days} ימים`;
}

/**
 * בחירת קובץ: כפתור בעברית במקום הכיתוב של הדפדפן (F21). ה-input עצמו שקוף
 * ומונח על הכפתור, כך שהנגיעה והמיקוד הם שלו — אותו `onChange` כמו קודם.
 */
function FilePick({ id, label, disabled, onFile }: { id: string; label: string; disabled: boolean; onFile: (f: File | undefined) => void }) {
  return (
    <div className={`filepick${disabled ? ' is-disabled' : ''}`}>
      <input
        id={id}
        type="file"
        className="filepick__input"
        accept="application/json,.json,text/plain"
        disabled={disabled}
        aria-label={label}
        onChange={(e) => {
          onFile(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
      <span className="btn btn--block filepick__btn" aria-hidden="true">
        {label}
      </span>
    </div>
  );
}

/** שורת ספירה בכרטיס "מצב": תווית, ומספר מבודד בקצה. */
function CountRow({ title, count, sub }: { title: string; count: number; sub?: ReactNode }) {
  return <ListRow title={title} sub={sub} end={<Num className="count">{count}</Num>} />;
}

export default function DataScreen({ store, today }: ScreenProps) {
  const { db } = store;
  const [raw, setRaw] = useState('');
  const [replaceRaw, setReplaceRaw] = useState('');
  /** איפה מוצג המשוב של הייבוא האחרון: בשחזור (מיזוג) או באזור המסוכן (החלפה). */
  const [feedbackMode, setFeedbackMode] = useState<Mode>('merge');
  const [report, setReport] = useState<ImportReport | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [wipeStep, setWipeStep] = useState(0);
  const [wipeText, setWipeText] = useState('');
  const [wipeError, setWipeError] = useState<string | null>(null);
  /** אישור מוקלד להחלפה; נדרש לפני שהקובץ בכלל נקרא. */
  const [replaceText, setReplaceText] = useState('');
  const [pending, setPending] = useState<PendingReplace | null>(null);
  const [pendingText, setPendingText] = useState('');
  const [profileWarning, setProfileWarning] = useState<ProfileWarning | null>(null);
  /** טוסט אחד לכל האפליקציה (שלב 5): "נשמר" להגדרות, "נמחק · בטל" למזון שלי. */
  const toast = useToast();
  /** תוצאת האימות של העתקת ה-JSON ללוח (שלב 0). */
  const [copyNote, setCopyNote] = useState<string | null>(null);
  const replaceReady = isConfirmed(replaceText, REPLACE_WORD);
  const [library, setLibrary] = useState<LibraryState>({ status: 'idle' });
  // ---------- ניהול תזונה (שלב 3: עבר לכאן ממסך התזונה) ----------
  const foodIndex = useFoodIndex(db.customFoods);
  const [editor, setEditor] = useState<{ existing: CustomFood | null; mode?: EditorMode } | null>(null);
  const [foodsOpen, setFoodsOpen] = useState(false);
  /** "פרטים" פר פריט: הערות טכניות (מזהי מאגר, גזירות) מוסתרות כברירת מחדל. */
  const [details, setDetails] = useState<Set<string>>(() => new Set());
  const [editingTarget, setEditingTarget] = useState(false);
  const [countsOpen, setCountsOpen] = useState(false);
  const target = useMemo(() => targetFor(db.targets, today), [db.targets, today]);
  const libraryCount = db.customFoods.filter((f) => isLibraryFoodId(f.id)).length;

  // קומפקטי, עם פרופיל המכשיר כשדה אחרון (שלב 0). התוכן זהה לפורמט הקודם.
  const json = useMemo(() => backupJson(db, new Date().toISOString(), PROFILE), [db]);
  const start = useMemo(() => programStartWeek(db), [db]);
  const firstData = useMemo(() => firstDataDate(db), [db]);
  const sinceBackup = daysSinceBackup(db.settings, today);
  const quarantineByKey = useMemo(() => quarantineCounts(db.quarantine), [db.quarantine]);
  const persist = usePersistStatus();
  /**
   * שומר הבטיחות (lib/profile.ts): החלפת פרופיל רק במכשיר ריק. הכתיבה
   * היא לשני המקומות (platform/profile.ts), ואז רענון — התוכנית נבחרת
   * בטעינת המודול.
   */
  const canSwitch = canSwitchProfile(db);
  const [switching, setSwitching] = useState(false);
  const switchProfile = async (p: Profile | null) => {
    if (!canSwitch || switching || p === PROFILE) return;
    setSwitching(true);
    await writeProfile(p);
    window.location.reload();
  };

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
  const finishImport = (result: DbParseResult, next: DB, before: number, mode: Mode) => {
    setReport({
      mode,
      counts: result.counts,
      rejected: result.rejected,
      totalBefore: before,
      totalAfter: total(next),
      lastBackup: next.settings.lastBackup,
    });
    setRaw('');
    setReplaceRaw('');
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
    // "גיבוי אחרון": המוקדם מבין המכשיר והקובץ (שלב 0). קודם הקובץ דרס את
    // המכשיר, ותאריך מאוחר מהקובץ השתיק את התזכורת בלי שיצא גיבוי של המכשיר הזה.
    const next: DB = {
      ...result.db,
      quarantine: mergeQuarantine(db.quarantine, result.db.quarantine),
      settings: {
        ...result.db.settings,
        lastBackup: lastBackupAfterImport(db.settings.lastBackup, result.db.settings.lastBackup),
      },
    };
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
    finishImport(result, next, before, 'replace');
  };

  const runImport = (text: string, mode: Mode) => {
    setFeedbackMode(mode);
    setReport(null);
    setImportError(null);
    setPending(null);
    setProfileWarning(null);
    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(text);
    } catch {
      setImportError('הקובץ אינו JSON תקין.');
      return;
    }
    const result = parseDb(parsedJson);

    // שלב 0: הקובץ נוצר בפרופיל אחר — עוצרים לפני כל כתיבה. קובץ בלי השדה
    // (גיבוי ישן) ממשיך כרגיל.
    if (profileConflict(result.profile, PROFILE)) {
      setProfileWarning({ result, parsedJson, mode });
      return;
    }
    continueImport(result, parsedJson, mode);
  };

  /** המשך הייבוא אחרי בדיקת הפרופיל (או אחרי "ייבא בכל זאת"). */
  const continueImport = (result: DbParseResult, parsedJson: unknown, mode: Mode) => {
    if (mode === 'merge') {
      const before = total(db);
      const next = mergeDb(db, result.db);
      void store.replaceAll(next);
      finishImport(result, next, before, 'merge');
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

  const pickFile = async (file: File | undefined, mode: Mode) => {
    if (!file) return;
    try {
      runImport(await readFileAsText(file), mode);
    } catch (err) {
      setFeedbackMode(mode);
      setImportError(err instanceof Error ? err.message : String(err));
    }
  };

  if (editor) {
    return (
      <CustomFoodEditor
        index={foodIndex.index}
        existing={editor.existing}
        initialMode={editor.mode}
        onSave={(food) => {
          void store.update('customFoods', upsertCustomFood(db.customFoods, food));
          setEditor(null);
        }}
        onCancel={() => setEditor(null)}
        onDelete={
          editor.existing
            ? () => {
                // אחרי האישור בשני שלבים: המחיקה נכתבת, ו"בטל" מחזיר את אותו
                // אובייקט בדיוק (אותו מזהה) — רישומים שמפנים אליו חוזרים להציג אותו.
                const food = editor.existing!;
                void store.update('customFoods', removeCustomFood(db.customFoods, food.id));
                setEditor(null);
                toast.undo(`נמחק · ${food.name}`, () => void store.update('customFoods', upsertCustomFood(store.latest().customFoods, food)));
              }
            : undefined
        }
      />
    );
  }

  /** המשוב של הייבוא (אזהרת פרופיל, אישור שני, שגיאה, דוח) — מוצג ליד הפעולה שהפעילה אותו. */
  const importFeedback = (mode: Mode) => (
    <>
      {profileWarning && profileWarning.mode === mode && (
        <div className="banner banner--error stack--tight" role="alert">
          <p className="strong" style={{ margin: 0 }}>
            הקובץ נוצר בפרופיל "{profileName(profileWarning.result.profile ?? null)}", והמכשיר הזה בפרופיל "{profileName(PROFILE)}".
          </p>
          <p style={{ margin: 0 }}>
            תרגילים משותפים לשתי התוכניות (לג-פרס, כפיפת ברכיים…) חולקים מזהה, ולכן ההיסטוריה והצעות המשקל
            יתערבבו. שום דבר עדיין לא השתנה.
          </p>
          <div className="row">
            <Button
              variant="danger"
              block
              onClick={() => {
                const w = profileWarning;
                setProfileWarning(null);
                continueImport(w.result, w.parsedJson, w.mode);
              }}
            >
              ייבא בכל זאת
            </Button>
            <Button onClick={() => setProfileWarning(null)}>ביטול</Button>
          </div>
        </div>
      )}

      {pending && mode === 'replace' && (
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
            <Button variant="danger" block disabled={!isConfirmed(pendingText, REPLACE_WORD)} onClick={() => void applyReplace(pending.result, pendingText)}>
              החלף ומחק תזונה
            </Button>
            <Button
              onClick={() => {
                setPending(null);
                setPendingText('');
              }}
            >
              ביטול
            </Button>
          </div>
        </div>
      )}

      {importError && feedbackMode === mode && (
        <p className="banner banner--error" role="alert" style={{ margin: 0 }}>
          {importError}
        </p>
      )}

      {report && report.mode === mode && (
        <div className="banner stack--tight" role="status">
          <p style={{ margin: 0 }}>
            {report.mode === 'merge' ? 'מוזג' : 'הוחלף'}: שקילות <Num>{report.counts.weights}</Num> · אימונים{' '}
            <Num>{report.counts.workouts}</Num> · מותניים <Num>{report.counts.waist}</Num> · צ'ק-אין{' '}
            <Num>{report.counts.checkins}</Num> · אירובי עצמאי <Num>{report.counts.standaloneCardio}</Num>
          </p>
          <p style={{ margin: 0 }}>
            רישומי אכילה <Num>{report.counts.entries}</Num> · מזונות שלי <Num>{report.counts.customFoods}</Num> · יעדי תזונה{' '}
            <Num>{report.counts.targets}</Num> · מועדפים <Num>{report.counts.favorites}</Num> · קריאטין{' '}
            <Num>{report.counts.creatine}</Num>
          </p>
          <p style={{ margin: 0 }}>
            סה"כ רשומות: <Num>{report.totalBefore}</Num> → <Num>{report.totalAfter}</Num>
          </p>
          <p style={{ margin: 0 }}>
            גיבוי אחרון אחרי הייבוא: {report.lastBackup ? <Num>{formatDMY(report.lastBackup)}</Num> : 'אין — ייצא גיבוי חדש של המצב המאוחד'}.
          </p>
          {report.rejected.length === 0 ? (
            <p style={{ margin: 0 }}>לא נדחתה אף רשומה.</p>
          ) : (
            <>
              <p style={{ margin: 0 }}>נדחו:</p>
              <ul className="list list--block tiny">
                {report.rejected.map((r) => (
                  <li key={`${r.section}-${r.reason}`}>
                    {r.section}: <Num>{r.count}</Num> — {r.reason}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </>
  );

  const backupChip =
    sinceBackup === null ? (
      total(db) > 0 ? (
        <StatusChip tone="missing">אין עדיין</StatusChip>
      ) : (
        <StatusChip tone="neutral">ריק</StatusChip>
      )
    ) : sinceBackup >= BACKUP_REMINDER_DAYS ? (
      <StatusChip tone="partial">{agoText(sinceBackup)}</StatusChip>
    ) : (
      <StatusChip tone="done">{agoText(sinceBackup)}</StatusChip>
    );

  return (
    <div className="stack--loose data">
      {/* ---------- 1. מצב: שורות ברורות, מספרים מבודדים בקצה ---------- */}
      <Surface aria-label="מצב">
        <SectionHeader title="מצב" />
        <div className="listrows">
          <ListRow lead={HardDrive} title="אחסון" end={<span className="data-val">{BACKEND_LABEL[currentBackend()] ?? currentBackend()}</span>} />
          {/* navigator.storage.persisted() — האם הדפדפן התחייב לא לפנות את נתוני האתר. */}
          <ListRow title="אחסון קבוע" end={<span className="data-val">{PERSIST_LABEL[persist]}</span>} />
          <Disclosure
            title="רשומות"
            summary={
              FEATURES.nutrition ? (
                <>
                  שקילות <Num>{db.weights.length}</Num> · אימונים <Num>{db.workouts.length}</Num> · רישומי אכילה <Num>{db.entries.length}</Num>
                </>
              ) : (
                <>
                  אימונים <Num>{db.workouts.length}</Num>
                </>
              )
            }
            end={<Num className="count">{total(db)}</Num>}
            open={countsOpen}
            onToggle={() => setCountsOpen((v) => !v)}
          >
            <div className="listrows">
              {FEATURES.nutrition && <CountRow title="שקילות" count={db.weights.length} />}
              <CountRow
                title="אימונים"
                count={db.workouts.length}
                sub={
                  db.legacyWorkouts.length > 0 ? (
                    <>
                      +<Num>{db.legacyWorkouts.length}</Num> ישנים
                    </>
                  ) : undefined
                }
              />
              {FEATURES.nutrition && (
                <>
                  <CountRow title="מותניים" count={db.waist.length} />
                  <CountRow title="צ'ק-אין" count={db.checkins.length} />
                  <CountRow title="אירובי עצמאי" count={db.standaloneCardio.length} />
                  <CountRow title="רישומי אכילה" count={db.entries.length} />
                  <CountRow title="מזונות שלי" count={db.customFoods.length} />
                  <CountRow title="יעדי תזונה" count={db.targets.length} />
                  <CountRow title="מועדפים" count={db.favorites.length} />
                  <CountRow title="ימים סגורים" count={db.days.filter((x) => x.closed).length} />
                  <CountRow title="קריאטין" count={db.creatine.length} />
                </>
              )}
            </div>
          </Disclosure>
          {/* רשומות שנדחו בקריאה ונשמרו גולמיות במקום להיעלם. אין עריכה ואין מחיקה. */}
          <CountRow
            title="רשומות בהסגר"
            count={db.quarantine.length}
            sub={
              db.quarantine.length > 0
                ? Object.entries(quarantineByKey)
                    .map(([k, n]) => `${KEY_LABELS[k as DbKey] ?? k} ${n}`)
                    .join(' · ')
                : undefined
            }
          />
        </div>
      </Surface>

      {/* ---------- 2. גיבוי ושחזור ---------- */}
      <Surface aria-label="גיבוי ושחזור">
        <SectionHeader
          title="גיבוי ושחזור"
          aside={
            <>
              <Num>{json.length}</Num> תווים
            </>
          }
        />
        <div className="stack">
          <ListRow lead={Database} title="גיבוי אחרון" sub={db.settings.lastBackup ? <Num>{formatDMY(db.settings.lastBackup)}</Num> : 'הכול נשמר על המכשיר בלבד'} end={backupChip} />
          <BackupSave json={json} db={db} filename={`fatloss-${toLocalISO(new Date())}.json`} primary onBackedUp={markBackedUp} />
          <CopyBlock
            text={json}
            label="העתק JSON מלא"
            boxLabel="גיבוי JSON"
            onCopied={() => {
              // גם הלוח עובר את אותו אימות: רק גיבוי שנקרא חזרה נכון נרשם.
              const v = verifyBackup(json, db);
              if (v.ok) {
                markBackedUp();
                setCopyNote(null);
              } else {
                setCopyNote(`הטקסט הועתק אבל לא עבר אימות: ${v.problems.join(' · ')}`);
              }
            }}
          />
          {copyNote && (
            <p className="small err" role="alert" style={{ margin: 0 }}>
              {copyNote}
            </p>
          )}
          <p className="tiny muted" style={{ margin: 0 }}>
            הכול נשמר על המכשיר בלבד. אין חשבון ואין ענן — גיבוי הוא באחריותך.
          </p>
        </div>

        <div className="section">
          <SectionHeader level={3} title="שחזור מגיבוי — מיזוג" aside="שום דבר קיים לא נמחק" />
          <div className="stack">
            <p className="tiny muted" style={{ margin: 0 }}>
              רשומה מיובאת גוברת על אותו תאריך/מזהה. שום דבר קיים לא נמחק. החלפה מלאה — באזור המסוכן למטה.
            </p>
            <FilePick id="import-file" label="בחר קובץ JSON" disabled={false} onFile={(f) => void pickFile(f, 'merge')} />
            <Disclosure title="או הדבק JSON" lead={Upload} keepMounted>
              <div className="stack--tight">
                <label htmlFor="import-text" className="visually-hidden">
                  JSON להדבקה
                </label>
                <textarea
                  id="import-text"
                  value={raw}
                  onChange={(e) => setRaw(e.target.value)}
                  placeholder='{"v":1,"weights":[...],"workouts":[...]}'
                  dir="ltr"
                  style={{ minHeight: 120 }}
                />
                <Button block disabled={raw.trim() === ''} onClick={() => runImport(raw, 'merge')}>
                  ייבא מהטקסט
                </Button>
              </div>
            </Disclosure>
            {importFeedback('merge')}
          </div>
        </div>
      </Surface>

      {/* ---------- 3. יעדים והגדרות ---------- */}
      <Surface aria-label="יעדים והגדרות">
        <SectionHeader title="יעדים והגדרות" />
        <div className="listrows">
          {FEATURES.nutrition && (
            <Disclosure
              title="יעד יומי"
              lead={Settings}
              summary={
                target ? (
                  <>
                    <Num>{kcalText(target.kcal)}</Num> קק"ל · <Num>{gramsWholeText(target.protein)}</Num> חלבון ·{' '}
                    <Num>{gramsWholeText(target.carbs)}</Num> פחמימה · <Num>{gramsWholeText(target.fat)}</Num> שומן
                  </>
                ) : (
                  'לא הוגדר'
                )
              }
              open={editingTarget}
              onToggle={() => setEditingTarget((v) => !v)}
            >
              <TargetForm
                current={target}
                today={today}
                onCancel={() => setEditingTarget(false)}
                onSave={(t) => {
                  void store.update('targets', upsertTarget(db.targets, t));
                  setEditingTarget(false);
                  toast.saved();
                }}
              />
            </Disclosure>
          )}
          <Disclosure
            title="תחילת התוכנית"
            summary={
              <>
                שבוע 1: <Num>{start ? weekRangeLabel(start) : DASH_TEXT}</Num>{' '}
                {db.settings.programStart ? '(נקבע ידנית)' : '(אוטומטי — מהנתון הראשון)'}
              </>
            }
          >
            <div className="stack">
              <p className="small muted" style={{ margin: 0 }}>
                קובע רק את מספר השבוע בכותרת הדוח לצ'אט. אינו משפיע על שום חישוב.
              </p>
              <DateField
                label="בחר תאריך בשבוע 1"
                value={db.settings.programStart ?? start ?? today}
                max={today}
                onChange={(d) => {
                  void store.update('settings', { ...db.settings, programStart: weekStart(d) });
                  toast.saved();
                }}
              />
              {db.settings.programStart && (
                <Button
                  variant="ghost"
                  onClick={() => {
                    void store.update('settings', { ...db.settings, programStart: null });
                    toast.saved();
                  }}
                >
                  חזרה לאוטומטי
                  {firstData ? ` (${formatDM(weekStart(firstData))})` : ''}
                </Button>
              )}
            </div>
          </Disclosure>
        </div>
      </Surface>

      {/* ניהול התזונה — רק בלי פרופיל. בת הזוג לא רואה תזונה בשום מסך. */}
      {FEATURES.nutrition && (
        <>
          {/* ---------- 4. המזונות שלי ---------- */}
          <Surface aria-label="המזונות שלי">
            <SectionHeader
              title="המזונות שלי"
              aside={
                <>
                  <Num>{db.customFoods.length}</Num> · מהספרייה <Num>{libraryCount}</Num>
                </>
              }
            />
            <div className="stack">
              <div className="row">
                <Button block icon={Plus} onClick={() => setEditor({ existing: null, mode: 'label' })}>
                  מזון מהתווית
                </Button>
                <Button block icon={Plus} onClick={() => setEditor({ existing: null, mode: 'recipe' })}>
                  מנה ממרכיבים
                </Button>
              </div>
              {db.customFoods.length > 0 && (
                <Disclosure
                  title="הרשימה"
                  lead={Utensils}
                  summary="נגיעה בשורה פותחת לעריכה"
                  end={<Num className="count">{db.customFoods.length}</Num>}
                  open={foodsOpen}
                  onToggle={() => setFoodsOpen((v) => !v)}
                >
                  <div className="listrows">
                    {db.customFoods.map((f) => {
                      const open = details.has(f.id);
                      const dv = displayValues(fromCustom(f));
                      return (
                        <div key={f.id}>
                          <ListRow
                            title={f.name}
                            wrap
                            sub={
                              <>
                                <Num>{kcalText(dv.kcal)}</Num> קק"ל · <Num>{gramsWholeText(dv.protein)}</Num> חלבון {dv.per}
                                {f.archived && ' · בארכיון'}
                              </>
                            }
                            end={<span className="listrow__hint"><Icon icon={Pencil} size={16} /></span>}
                            aria-label={`ערוך ${f.name}`}
                            onTap={() => setEditor({ existing: f })}
                            action={
                              <button
                                type="button"
                                className="listrow__add"
                                aria-expanded={open}
                                aria-label={`פרטים — ${f.name}`}
                                onClick={() =>
                                  setDetails((prev) => {
                                    const next = new Set(prev);
                                    if (next.has(f.id)) next.delete(f.id);
                                    else next.add(f.id);
                                    return next;
                                  })
                                }
                              >
                                <Icon icon={Info} size={18} />
                              </button>
                            }
                          />
                          {open && (
                            <p className="tiny muted data-food__details" style={{ margin: 0 }}>
                              {f.recipe ? 'מנה ממרכיבים' : 'מהתווית'}
                              {f.unitFood && ' · יחידה = 1 ג׳'} · מזהה <Num>{f.id}</Num>
                              {f.cat !== null && (
                                <>
                                  {' '}
                                  · קטגוריה <Num>{f.cat}</Num>
                                </>
                              )}
                              {f.note ? ` · ${f.note}` : ''}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </Disclosure>
              )}
              <p className="tiny muted" style={{ margin: 0 }}>
                מזון שנשמר כאן מופיע בחיפוש במסך התזונה. מנה: בונים פעם אחת ממרכיבים ורושמים בגרמים.
                {foodIndex.status === 'error' && <span className="err"> מאגר המזון לא נטען.</span>}
                {foodIndex.status === 'offline' && <span className="err"> מאגר המזון עוד לא נשמר במכשיר — פתח את האפליקציה פעם אחת עם חיבור.</span>}
              </p>
            </div>
          </Surface>

          {/* ---------- 5. ספריית המנות ---------- */}
          <Surface aria-label="ספריית המנות">
            <SectionHeader
              title="ספריית המנות"
              aside={
                <>
                  <Num>{libraryCount}</Num> פריטים במכשיר
                </>
              }
            />
            <div className="stack">
              <p className="small muted" style={{ margin: 0 }}>
                המנות, הבלוקים והתוספות של "התפריט שלי". מיזוג בלבד: פריט קיים מתעדכן, מזון שלי אחר לא נוגע,
                רישומים קודמים לא משתנים.
              </p>
              <Button variant="accent" block disabled={library.status === 'loading'} onClick={() => void loadLibrary()}>
                {library.status === 'loading' ? 'טוען…' : 'טען את ספריית המנות'}
              </Button>
              {library.status === 'error' && (
                <p className="banner banner--error" role="alert" style={{ margin: 0 }}>
                  {library.message}
                </p>
              )}
              {library.status === 'done' && (
                <div className="banner stack--tight" role="status">
                  <p style={{ margin: 0 }}>
                    נוספו <Num>{library.merge.added}</Num> · עודכנו <Num>{library.merge.updated}</Num> · ללא שינוי{' '}
                    <Num>{library.merge.unchanged}</Num> · בספרייה <Num>{library.total}</Num>
                  </p>
                  {library.rejected.length > 0 && (
                    <ul className="list list--block tiny">
                      {library.rejected.map((r) => (
                        <li key={`${r.section}-${r.reason}`}>
                          {r.section}: <Num>{r.count}</Num> — {r.reason}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          </Surface>
        </>
      )}

      {/* ---------- 6. פרופיל המכשיר ---------- */}
      <Surface aria-label="פרופיל המכשיר">
        <SectionHeader title="פרופיל המכשיר" aside={PROFILE === null ? PROFILE_LABELS.default : PROFILE_LABELS[PROFILE]} />
        <div className="stack">
          <p className="small muted" style={{ margin: 0 }}>
            קובע איזו תוכנית ואילו מסכים האפליקציה מציגה במכשיר הזה. ההגדרה נשמרת במכשיר בלבד,
            לא בגיבוי.
          </p>
          <ChipSelect<ProfileKey>
            label="פרופיל המכשיר"
            hideLabel
            options={PROFILE_OPTIONS}
            value={PROFILE === null ? 'default' : PROFILE}
            clearable={false}
            disabled={!canSwitch || switching}
            onChange={(v) => {
              if (v === null) return;
              void switchProfile(v === 'default' ? null : v);
            }}
          />
          {!canSwitch && (
            <p className="tiny muted" style={{ margin: 0 }}>
              <Icon icon={UserRound} size={14} /> {SWITCH_BLOCKED_TEXT}
            </p>
          )}
        </div>
      </Surface>

      {/* ---------- 7. אזור מסוכן: בתחתית, מופרד, מסגרת טרקוטה מקווקוות ---------- */}
      <Surface className="section--danger" aria-label="אזור מסוכן">
        <SectionHeader
          title={
            <span className="data-danger__title">
              <Icon icon={ShieldAlert} size={16} /> אזור מסוכן
            </span>
          }
          aside="החלפה · מחיקה"
        />
        <div className="stack">
          <SectionHeader level={3} title="ייבוא בהחלפה" />
          <p className="tiny muted" style={{ margin: 0 }}>
            כל הנתונים הקיימים יימחקו ויוחלפו בקובץ. לפני כן יורד אוטומטית גיבוי מלא של המצב הנוכחי.
          </p>
          <div>
            <label htmlFor="replace-word">הקלד "{REPLACE_WORD}" כדי לאפשר החלפה</label>
            <input id="replace-word" type="text" value={replaceText} onChange={(e) => setReplaceText(e.target.value)} autoComplete="off" />
          </div>
          <FilePick id="replace-file" label="בחר קובץ JSON להחלפה" disabled={!replaceReady} onFile={(f) => void pickFile(f, 'replace')} />
          <Disclosure title="או הדבק JSON" lead={Upload} keepMounted>
            <div className="stack--tight">
              <label htmlFor="replace-text" className="visually-hidden">
                JSON להחלפה
              </label>
              <textarea
                id="replace-text"
                value={replaceRaw}
                onChange={(e) => setReplaceRaw(e.target.value)}
                placeholder='{"v":1,"weights":[...],"workouts":[...]}'
                dir="ltr"
                style={{ minHeight: 120 }}
              />
              <Button variant="danger" block disabled={replaceRaw.trim() === '' || !replaceReady} onClick={() => runImport(replaceRaw, 'replace')}>
                החלף מהטקסט
              </Button>
            </div>
          </Disclosure>
          {importFeedback('replace')}
        </div>

        <div className="section stack">
          <SectionHeader level={3} title="מחיקת הכול" />
          {wipeStep === 0 && (
            <Button variant="danger" block onClick={() => setWipeStep(1)}>
              מחק את כל הנתונים
            </Button>
          )}

          {wipeStep === 1 && (
            <>
              <p className="small err" style={{ margin: 0 }}>
                פעולה בלתי הפיכה. <Num>{total(db)}</Num> רשומות יימחקו מהמכשיר. לפני המחיקה יורד אוטומטית גיבוי מלא; אם ההורדה נכשלת — לא נמחק דבר.
              </p>
              <div className="row">
                <Button variant="danger" block onClick={() => setWipeStep(2)}>
                  הבנתי, המשך
                </Button>
                <Button onClick={() => setWipeStep(0)}>ביטול</Button>
              </div>
            </>
          )}

          {wipeStep === 2 && (
            <>
              <div>
                <label htmlFor="wipe-word">הקלד "{WIPE_WORD}" כדי לאשר</label>
                <input id="wipe-word" type="text" value={wipeText} onChange={(e) => setWipeText(e.target.value)} autoComplete="off" />
              </div>
              <div className="row">
                <Button variant="danger" block disabled={!isConfirmed(wipeText, WIPE_WORD)} onClick={() => void runWipe()}>
                  מחק הכול
                </Button>
                <Button
                  onClick={() => {
                    setWipeStep(0);
                    setWipeText('');
                    setWipeError(null);
                  }}
                >
                  ביטול
                </Button>
              </div>
              {wipeError && (
                <p className="banner banner--error" role="alert" style={{ margin: 0 }}>
                  {wipeError}
                </p>
              )}
            </>
          )}
        </div>
      </Surface>

      <p className="tiny muted" style={{ margin: 0 }}>
        היום: <Num>{today}</Num> · גרסת נתונים <Num>{BACKUP_VERSION}</Num>
        {total(db) === 0 ? ' · ריק' : ''}
      </p>
    </div>
  );
}
