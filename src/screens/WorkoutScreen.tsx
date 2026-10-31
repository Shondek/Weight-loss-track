import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ScreenProps } from './types';
import { useWeek } from '../useWeek';
import {
  WORKOUT_SCHEMA_VERSION,
  type CardioMode,
  type CardioSegment,
  type LoggedExercise,
  type StandaloneCardio,
  type WorkoutEntry,
  type WorkoutType,
} from '../types';
import type { Exercise } from '../data/program';
import {
  CONSTRAINTS,
  WORKOUTS_PER_WEEK,
  WORKOUT_TITLES,
  WORKOUT_TYPES,
  alternatesFor,
  exerciseById,
  exerciseIn,
  restSeconds,
} from '../data/program';
import { HISTORY_ROWS } from '../data/config';
import { activeProfile } from '../data/profile';
import { workoutFeatures } from '../lib/profile';
import { suggestNext } from '../lib/progression';
import {
  blankLoggedExercise,
  cardioMinutesDone,
  cardioModeLabel,
  lastExercise,
  moveToEnd,
  openingWeight,
  orderOf,
  reorderLike,
  swapExercise,
  swappedFromLabel,
} from '../lib/workouts';
import type { AlternateOption } from '../components/ExerciseFocus';
import {
  cardioDetailLine,
  cardioLine,
  cardioOf,
  cardioSegmentsOf,
  exerciseHistory,
  finishCardio,
  exercisesFor,
  hasData,
  isCardio,
  lastWeightOf,
  isTimedExercise,
  isWorkoutEmpty,
  lastFinisherCardio,
  FINISHER_ID,
  makeWorkoutId,
  nextType,
  prefilledExercises,
  rotationWorkouts,
  recentExercises,
  setPerformed,
  setValue,
  skippedExercises,
  sortableStamp,
  strengthExercises,
  removeWorkout,
  sortWorkouts,
  upsertWorkout,
  workoutsInWeek,
  WARMUP_ID,
} from '../lib/workouts';
import {
  blankStandalone,
  cardioWeek,
  finishStandalone,
  lastStandalone,
  makeStandaloneId,
  removeStandalone,
  standaloneDetailLine,
  standaloneInWeek,
  standaloneLine,
  upsertStandalone,
  remainingMinutes,
} from '../lib/cardio';
import {
  deriveSegments,
  endOf,
  isExpired,
  recordChange,
  segmentsOf,
  startSession,
  type CardioSession,
  type CardioSessionTarget,
} from '../lib/cardioSession';
import { compareISO, dayLetter, formatDM, formatDMY, weekEnd, weekNumber, weekStart } from '../lib/date';
import { programStartWeek } from '../lib/db';
import { clean, DASH } from '../lib/format';
import WeekNav from '../components/WeekNav';
import DateField from '../components/DateField';
import ConfirmButton from '../components/ConfirmButton';
import ExerciseFocus from '../components/ExerciseFocus';
import CardioFocus from '../components/CardioFocus';
import StandaloneCardioEditor from '../components/StandaloneCardioEditor';
import CardioSummary from '../components/CardioSummary';
import Sparkline from '../components/Sparkline';
import type { RestTimer } from '../hooks/useRestTimer';
import { useWakeLock } from '../hooks/useWakeLock';
import { Button, ChipSelect, Disclosure, ListRow, Num, ProgressSegments, SectionHeader, Sheet, StatusChip, Surface, Toast, useToast, type Segment } from '../ui';
import { ChevronLeft, ChevronRight, Timer } from '../ui/icons';
import {
  readCardioSession,
  readEditor,
  readPrefs,
  writeCardioSession,
  writeEditor,
  writePrefs,
} from '../platform/uiState';

const HISTORY_COUNT = 12;
/**
 * מה המסך מציג לפי פרופיל המכשיר (lib/profile.ts). בלי פרופיל — הכול,
 * כמו היום. בת הזוג: בלי תזכורת הברך/הכתף, בלי שדות הכאב, בלי אירובי
 * (שורת הסיום, הכרטיס העצמאי, התקציב) ובלי המונה "n/3".
 */
const FEATURES = workoutFeatures(activeProfile());
/** סולם הכאב 0–10 — אותו סולם ואותם שדות (`knee`, `shoulder`) כמו קודם. בלי ברירת מחדל. */
const PAIN_SCALE = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((v) => ({ value: v, label: String(v) }));
/** כל כמה זמן בודקים אם ריצה פעילה עברה את הדדליין (חיתוך אוטומטי). */
const SESSION_CHECK_MS = 5000;

/**
 * הסיכום הפתוח: מה שנגזר מריצה (session), רישום ידני, או עריכה של רשומה
 * קיימת. השמירה ממנו היא הנתיב היחיד שכותב אירובי עם מקטעים.
 */
type SummaryState = {
  target: CardioSessionTarget;
  mode: CardioMode;
  segments: CardioSegment[];
  steps: number | null;
  /** הרשומה כבר באחסון — "מחק" זמין, ביטול לא מוחק כלום. */
  existing: boolean;
  /** נגזר מריצה שנחתכה בדדליין בלי "סיים". */
  cut: boolean;
};

/** חותמת זמן ממוינת + אקראיות, כדי שסדר המזהים ישקף סדר יצירה. */
function newId(): string {
  const c = globalThis.crypto;
  const rand =
    c && typeof c.randomUUID === 'function'
      ? c.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `${sortableStamp(Date.now())}-${rand}`;
}

/**
 * שורת סיכום לתרגיל אחד: משקל אחד כשכולם זהים, רשימה כשהם משתנים
 * (רשומות ישנות עם משקל שונה בכל סט). חימום/אירובי: "חימום · אופניים · 10 דק׳".
 */
function exerciseLine(e: LoggedExercise): string {
  if (isCardio(e)) return cardioLine(e) ?? e.n;
  const performed = e.sets.filter(setPerformed);
  const values = performed
    .map((s) => {
      const v = setValue(s);
      return v === null ? DASH : String(v);
    })
    .join(',');
  if (isTimedExercise(e)) return `${e.n} ${values} שנ׳`;
  if (e.bodyweightOnly) return `${e.n} ${values}`;
  const weights = [...new Set(performed.map((s) => s.weight))];
  const w =
    weights.length === 1
      ? weights[0] === null || weights[0] === undefined
        ? DASH
        : clean(weights[0])
      : performed.map((s) => (s.weight === null ? DASH : clean(s.weight))).join(',');
  return `${e.n} ${w}×${values}`;
}

type RowProps = {
  w: WorkoutEntry;
  workouts: readonly WorkoutEntry[];
  expanded: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
};

/**
 * שורת אימון ברשימה: כותרת שנפתחת לפירוט, וכפתור עריכה.
 * משמשת גם ברשימת השבוע הנבחר וגם בהיסטוריה, כדי ששתיהן יתנהגו זהה.
 */
function WorkoutRow({ w, workouts, expanded, onToggle, onEdit, onDelete }: RowProps) {
  const skipped = skippedExercises(w);
  return (
    <li>
      <div className="row">
        <button
          type="button"
          className="btn btn--quiet grow"
          style={{ justifyContent: 'flex-start', textAlign: 'start' }}
          aria-expanded={expanded}
          onClick={onToggle}
        >
          <span className="num">{formatDM(w.d)}</span>
          <span className="muted tiny">{dayLetter(w.d)}</span>
          <span className="strong">{w.t}</span>
          <span className="muted tiny">
            {strengthExercises(w).filter(hasData).length} תרגילים
          </span>
        </button>
        <button type="button" className="btn btn--quiet btn--outlined" onClick={onEdit}>
          ערוך
        </button>
      </div>
      {expanded && (
        <div className="stack--tight" style={{ padding: 'var(--sp-2) 0' }}>
          <ul className="list list--block small">
            {w.ex.filter(hasData).map((e) => (
              <li key={e.exerciseId}>
                <div>
                  {exerciseLine(e)}
                  {swappedFromLabel(e) && <span className="tiny wk-swapped"> · {swappedFromLabel(e)}</span>}
                </div>
                {isCardio(e) && cardioDetailLine(e) && (
                  <p className="tiny muted" style={{ margin: 0 }}>
                    {cardioDetailLine(e)}
                  </p>
                )}
                {!isCardio(e) && (
                  <Sparkline
                    label={`מגמת ${e.n}`}
                    values={exerciseHistory(workouts, e.exerciseId)
                      .map((h) => lastWeightOf(h.ex))
                      .filter((v): v is number => v !== null)}
                  />
                )}
              </li>
            ))}
          </ul>
          {skipped.length > 0 && (
            <p className="tiny muted" style={{ margin: 0 }}>
              דולגו: {skipped.map((e) => e.n).join(', ')}
            </p>
          )}
          {FEATURES.pain && (
            <p className="tiny muted" style={{ margin: 0 }}>
              כאב: ברך <span className="num">{w.knee ?? DASH}</span> · כתף{' '}
              <span className="num">{w.shoulder ?? DASH}</span>
            </p>
          )}
          <ConfirmButton
            ariaLabel={`מחק אימון ${w.t} של ${formatDMY(w.d)}`}
            onConfirm={onDelete}
          />
        </div>
      )}
    </li>
  );
}

type Props = ScreenProps & { timer: RestTimer };

export default function WorkoutScreen({ store, today, timer }: Props) {
  const { db } = store;
  const [week, setWeek] = useWeek(today);
  /** אימון חדש שעדיין אין בו נתונים — קיים רק במסך, לא באחסון. */
  const [draft, setDraft] = useState<WorkoutEntry | null>(null);
  /**
   * האימון הפתוח והתרגיל שבמוקד נשמרים מחוץ לקומפוננטה, כדי שמעבר טאב
   * או רענון יחזירו אותך בדיוק למקום שבו היית באמצע אימון. הנתונים
   * עצמם ממילא נשמרים בכל הקשה — כאן מדובר רק במקום במסך.
   */
  const [openId, setOpenId] = useState<string | null>(() => readEditor()?.openId ?? null);
  const [expanded, setExpanded] = useState<string | null>(null);
  /**
   * אותו מפתח ואותו מבנה כמו קודם: `focus` הוא אינדקס בשורות האימון
   * (0 = חימום, 1..N כוח, האחרון = אירובי סיום). בתצוגת המוקד החימום הוא
   * שורה מקופלת בראש, ולכן 0 שנשמר בגרסה הקודמת נפתח על התרגיל הראשון עם
   * החימום פתוח — אותו מקום, אותו מידע.
   */
  const [focus, setFocus] = useState(() => readEditor()?.focus ?? 0);
  const [warmupOpen, setWarmupOpen] = useState(() => (readEditor()?.focus ?? 1) === 0);
  /** שורת התאריך פתוחה לעריכה. */
  const [dateOpen, setDateOpen] = useState(false);
  /** רשימת התרגילים (מהכותרת) פתוחה. */
  const [listOpen, setListOpen] = useState(false);
  /** "שנה" בשורת הכאב המכווצת: הסולמות פתוחים שוב גם אחרי דירוג מלא. במסך בלבד. */
  const [painEditOpen, setPainEditOpen] = useState(false);
  /** תרגילים שדולגו בסשן הזה ("דלג ואחזור") — לסימון "ממתין". במסך בלבד. */
  const [skippedIds, setSkippedIds] = useState<readonly string[]>([]);
  /**
   * אירובי עצמאי פתוח לעריכה. טיוטה במסך עד "שמור" — הטופס נפתח ממולא,
   * ולכן "ריק = טיוטה" של האימון לא חל כאן. `existing` = כבר באחסון.
   */
  const [cardioOpen, setCardioOpen] = useState<StandaloneCardio | null>(null);
  /** "ביצועים קודמים" פתוח/סגור — בחירה אחת לכל התרגילים, נשמרת בין פתיחות. */
  const [historyOpen, setHistoryOpen] = useState(() => readPrefs().historyOpen);
  /**
   * ריצת אירובי פעילה — חותמות זמן בלבד, ב-uiState. שורדת רענון וסגירה.
   * אחת בכל רגע. הרשומה נכתבת רק מהסיכום.
   */
  const [session, setSession] = useState<CardioSession | null>(() => readCardioSession());
  const [summary, setSummary] = useState<SummaryState | null>(null);
  /** "דלג ואחזור": הסדר שלפני הדילוג, לביטול. נעלם במעבר אימון. */
  const [skipUndo, setSkipUndo] = useState<{ ids: string[]; name: string } | null>(null);
  /**
   * טוסט אחד לכל האפליקציה (שלב 5): "נמחק · בטל" אחרי מחיקת אימון (אחרי
   * האישור הקיים) או אירובי עצמאי (בלי אישור), "נשמר" אחרי "סיים אימון".
   * "בטל" מחזיר את אותה רשומה בדיוק דרך upsert על ה-DB העדכני.
   */
  const toast = useToast();

  const start = useMemo(() => programStartWeek(db), [db]);
  // כוח בלבד. אירובי עצמאי חי ב-db.standaloneCardio ולא נכנס לכאן.
  const inWeek = useMemo(() => workoutsInWeek(db.workouts, week), [db.workouts, week]);
  const cardioInWeek = useMemo(
    () => standaloneInWeek(db.standaloneCardio, week),
    [db.standaloneCardio, week],
  );
  const cardioSum = useMemo(() => cardioWeek(db, week), [db, week]);
  const upNext = useMemo(() => nextType(db.workouts), [db.workouts]);
  const history = useMemo(
    () => sortWorkouts(db.workouts).slice(-HISTORY_COUNT).reverse(),
    [db.workouts],
  );

  const stored = openId ? (db.workouts.find((w) => w.id === openId) ?? null) : null;
  const open = draft ?? stored;
  // בלי אירובי (בת הזוג): שורת אירובי הסיום לא מוצגת ולא נשמרת. היא ממילא
  // ריקה עד "התחל" (לא נתון), ו-exercisesFor משלים אותה בכל קריאה.
  const rows = open
    ? exercisesFor(open, db.workouts).filter((r) => FEATURES.cardio || r.exerciseId !== FINISHER_ID)
    : [];
  const warmupRow = rows.find((r) => r.exerciseId === WARMUP_ID) ?? null;
  const finisherRow = rows.find((r) => r.exerciseId === FINISHER_ID) ?? null;
  /** תרגילי הכוח בסדר הביצוע (אינדקסים 1..N בשורות). */
  const strengthRows = rows.filter((r) => !isCardio(r));
  const strengthTotal = strengthRows.length;
  /** שלב הסיום: שורת האירובי כשיש, אחרת אחרי התרגיל האחרון. */
  const finishIndex = finisherRow ? rows.length - 1 : rows.length;
  /** האינדקס שבמוקד: 1..N תרגיל, finishIndex = סיום. 0 (חימום) → התרגיל הראשון. */
  const currentIndex = open ? Math.min(Math.max(focus, 1), finishIndex) : 0;
  const isFinish = open !== null && currentIndex >= finishIndex;
  const current = isFinish ? null : (rows[currentIndex] ?? null);
  /** מספר התרגיל לתצוגה: "תרגיל 3 מתוך 8". */
  const currentNo = current ? strengthRows.indexOf(current) + 1 : strengthTotal;
  useWakeLock(open !== null);

  // אימון שנמחק מבחוץ (ייבוא, מחיקה גורפת) לא נשאר פתוח על ריק.
  // מטפל גם במזהה שהוחזר מהאחסון ושייך לאימון שכבר לא קיים.
  useEffect(() => {
    if (openId && !db.workouts.some((w) => w.id === openId)) setOpenId(null);
  }, [openId, db.workouts]);

  useEffect(() => {
    writeEditor(openId ? { openId, focus } : null);
  }, [openId, focus]);

  /** מעבר תרגיל מתחיל מראש המסך — התרגיל החדש תמיד נראה מיד. */
  const openKey = open?.id ?? null;
  useEffect(() => {
    if (openKey) window.scrollTo({ top: 0 });
    setPainEditOpen(false);
  }, [openKey, currentIndex]);

  useEffect(() => {
    writePrefs({ historyOpen });
  }, [historyOpen]);

  useEffect(() => {
    writeCardioSession(session);
  }, [session]);

  /**
   * ריצה שנמצאה באחסון אחרי רענון: פותחים את המקום שלה במסך — האימון עם
   * שורת האירובי במוקד, או עורך העצמאי במצב ריצה. טיוטת אימון שאבדה
   * ברענון נבנית מחדש מהיעד (סוג ותאריך), באותו מזהה.
   */
  const restored = useRef(false);
  useEffect(() => {
    if (restored.current || !session) return;
    restored.current = true;
    const t = session.target;
    if (t.kind === 'finisher') {
      setCardioOpen(null);
      if (db.workouts.some((w) => w.id === t.workoutId)) {
        setDraft(null);
        setOpenId(t.workoutId);
      } else {
        setOpenId(null);
        setDraft({
          schemaVersion: WORKOUT_SCHEMA_VERSION,
          id: t.workoutId,
          d: t.d,
          t: t.t,
          ex: prefilledExercises(db.workouts, t.t),
          knee: null,
          shoulder: null,
        });
      }
      setFocus(Number.MAX_SAFE_INTEGER);
    } else {
      setDraft(null);
      setOpenId(null);
      setCardioOpen({
        id: t.id,
        d: t.d,
        mode: session.mode,
        minutes: session.plannedMinutes,
        incline: session.events[0]?.incline ?? null,
        speed: session.events[0]?.speed ?? null,
        note: t.note,
      });
    }
  }, [session, db.workouts]);

  /** ריצה שעברה את הדדליין בלי "סיים": הסיכום נפתח לבד, חתוך. */
  const openSummaryFromSession = useCallback(
    (s: CardioSession) => {
      const now = Date.now();
      const cut = isExpired(s, now);
      setSummary({
        target: s.target,
        mode: s.mode,
        segments: deriveSegments(s, endOf(s, now)),
        steps: null,
        existing: false,
        cut,
      });
      if (timer.kind === 'cardio') timer.skip();
    },
    [timer],
  );

  useEffect(() => {
    if (!session || summary) return;
    const check = () => {
      if (isExpired(session, Date.now())) openSummaryFromSession(session);
    };
    check();
    const id = window.setInterval(check, SESSION_CHECK_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') check();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [session, summary, openSummaryFromSession]);

  const defaultDate = compareISO(week, weekStart(today)) === 0 ? today : weekEnd(week);

  /**
   * שורה שהוחלפה (שלב 4.1): המפרט של החלופה, עם הסטים והטווח שנקבעו לתא
   * בזמן ההחלפה (נשמרים בשורה). כך גם ההצעה מחושבת על הטווח של התא.
   */
  const swappedSpecOf = (log: LoggedExercise): Exercise | undefined => {
    if (log.swappedFrom === undefined) return undefined;
    const alt = exerciseById(log.exerciseId);
    if (!alt) return undefined;
    return { ...alt, sets: log.sets.length, repRangeMin: log.targetRepMin, repRangeMax: log.targetRepMax };
  };

  /**
   * המפרט לתצוגה: קודם כפי שהוא באימון הזה (סטים/טווח יכולים להיות שונים
   * בין A ל-B), אחרת הזהות הכללית, ותרגיל שירד מהתוכנית עדיין ניתן לעריכה
   * לפי מה שנשמר איתו.
   */
  const specOf = (log: LoggedExercise): Exercise =>
    swappedSpecOf(log) ??
    (open ? exerciseIn(open.t, log.exerciseId) : undefined) ??
    exerciseById(log.exerciseId) ?? {
      id: log.exerciseId,
      name: log.n,
      short: log.n,
      machine: null,
      muscle: '',
      muscles: [],
      type: log.type,
      sets: log.sets.length,
      reps: '',
      repRangeMin: log.targetRepMin,
      repRangeMax: log.targetRepMax,
      effort: null,
      unilateral: false,
      isTimed: isTimedExercise(log),
      bodyweightOnly: log.bodyweightOnly,
      assisted: log.assisted,
      bodyweightStart: false,
      note: null,
      videoUrl: null,
      step: null,
      mode: 'progress',
      alternates: [],
    };

  /**
   * המפרט לכללי ההתקדמות: כמו `specOf`, אבל שורה שהוחלפה מקבלת את יעד ה-RIR
   * (`effort`) של התא שהוחלף — סף ה-RIR הוא של התא שבו ההצעה מוצגת, לא של
   * החלופה. התצוגה (`specOf`) לא משתנה.
   */
  const progressionSpecOf = (log: LoggedExercise): Exercise => {
    const spec = specOf(log);
    if (log.swappedFrom === undefined || !open) return spec;
    const slot = exerciseIn(open.t, log.swappedFrom);
    return slot ? { ...spec, effort: slot.effort } : spec;
  };

  /** פותח אימון חדש כטיוטה. לחיצה בטעות לא יוצרת אימון ריק בהיסטוריה. */
  const startWorkout = (t: WorkoutType) => {
    const d = defaultDate;
    setOpenId(null);
    setCardioOpen(null);
    setFocus(1);
    setWarmupOpen(false);
    setSkippedIds([]);
    setDraft({
      schemaVersion: WORKOUT_SCHEMA_VERSION,
      id: makeWorkoutId(d, t, newId()),
      d,
      t,
      ex: prefilledExercises(db.workouts, t),
      knee: null,
      shoulder: null,
    });
  };

  /** טיימר מנוחה/חימום נעצר עם העורך; ריצת אירובי חיה מחוץ לעורך ולא. */
  const skipRestTimer = () => {
    if (timer.kind !== 'cardio') timer.skip();
  };

  /** הכרטיס הרביעי. פותח טופס ממולא — לא כותב עד השמירה מהסיכום. */
  const startStandalone = () => {
    const d = defaultDate;
    setDraft(null);
    setOpenId(null);
    skipRestTimer();
    setCardioOpen(blankStandalone(db.standaloneCardio, d, makeStandaloneId(d, newId())));
  };

  /** מחיקת אירובי עצמאי: מיידית, "בטל" מחזיר את אותה רשומה. */
  const deleteStandalone = (id: string) => {
    const entry = db.standaloneCardio.find((e) => e.id === id);
    if (!entry) return;
    void store.update('standaloneCardio', removeStandalone(db.standaloneCardio, id));
    if (cardioOpen?.id === id) setCardioOpen(null);
    toast.undo(
      <>
        נמחק · אירובי <Num>{formatDM(entry.d)}</Num> · {standaloneLine(entry)}
      </>,
      () => void store.update('standaloneCardio', upsertStandalone(store.latest().standaloneCardio, entry)),
    );
  };

  /** מחיקת אימון שלם (אחרי האישור בשני שלבים): "בטל" מחזיר את אותה רשומה. */
  const deleteWorkout = (w: WorkoutEntry) => {
    void store.update('workouts', removeWorkout(db.workouts, w.id));
    toast.undo(
      <>
        נמחק · אימון {w.t} <Num>{formatDM(w.d)}</Num>
      </>,
      () => void store.update('workouts', upsertWorkout(store.latest().workouts, w)),
    );
  };

  // ---------- ריצת אירובי: התחלה, שינוי, סיום, סיכום ----------

  const sessionFor = (target: CardioSessionTarget): CardioSession | null => {
    if (!session) return null;
    const t = session.target;
    if (t.kind === 'finisher' && target.kind === 'finisher') {
      return t.workoutId === target.workoutId ? session : null;
    }
    if (t.kind === 'standalone' && target.kind === 'standalone') {
      return t.id === target.id ? session : null;
    }
    return null;
  };

  const beginSession = (
    target: CardioSessionTarget,
    mode: CardioMode,
    minutes: number,
    incline: number | null,
    speed: number | null,
    label: string,
  ) => {
    if (session || minutes <= 0) return;
    const next = startSession(target, mode, minutes, incline, speed, Date.now());
    setSession(next);
    timer.start(next.plannedMinutes * 60, label, 'cardio');
  };

  const changeSession = (patchValues: { incline?: number | null; speed?: number | null }) => {
    setSession((s) => (s ? recordChange(s, patchValues, Date.now()) : s));
  };

  const finishSession = () => {
    if (session) openSummaryFromSession(session);
  };

  /** רישום ידני / עריכת רשומה קיימת — סיכום בלי ריצה. */
  const openSummary = (
    target: CardioSessionTarget,
    mode: CardioMode,
    segments: CardioSegment[],
    steps: number | null,
    existing: boolean,
  ) => setSummary({ target, mode, segments, steps, existing, cut: false });

  const saveSummary = (segments: CardioSegment[], steps: number | null) => {
    if (!summary) return;
    const { target, mode } = summary;
    if (target.kind === 'standalone') {
      const entry = finishStandalone(
        { id: target.id, d: target.d, mode, note: target.note },
        segments,
        steps,
      );
      void store.update('standaloneCardio', upsertStandalone(db.standaloneCardio, entry));
      setCardioOpen(null);
    } else {
      const existingEntry =
        db.workouts.find((w) => w.id === target.workoutId) ??
        (draft?.id === target.workoutId ? draft : null) ??
        ({
          schemaVersion: WORKOUT_SCHEMA_VERSION,
          id: target.workoutId,
          d: target.d,
          t: target.t,
          ex: prefilledExercises(db.workouts, target.t),
          knee: null,
          shoulder: null,
        } satisfies WorkoutEntry);
      const entryRows = exercisesFor(existingEntry, db.workouts);
      patch({
        ...existingEntry,
        ex: entryRows.map((e) =>
          e.exerciseId === FINISHER_ID ? finishCardio(e, mode, segments, steps) : e,
        ),
      });
    }
    if (session && sessionFor(target)) setSession(null);
    if (timer.kind === 'cardio') timer.skip();
    setSummary(null);
  };

  /** ביטול: ריצה שנגזרה נזרקת; עריכה של רשומה קיימת פשוט נסגרת. */
  const cancelSummary = () => {
    if (!summary) return;
    if (!summary.existing && session && sessionFor(summary.target)) {
      setSession(null);
      if (timer.kind === 'cardio') timer.skip();
    }
    // ריצה/רישום ידני של עצמאי שבוטלו — גם הטופס נסגר, לא נשאר תלוי באוויר.
    if (!summary.existing && summary.target.kind === 'standalone') setCardioOpen(null);
    setSummary(null);
  };

  const summaryTitle = (t: CardioSessionTarget): string =>
    t.kind === 'standalone'
      ? `אירובי — עצמאי · ${formatDM(t.d)}`
      : `אירובי סיום · אימון ${t.t} · ${formatDM(t.d)}`;

  /**
   * כל שינוי נשמר מיד — אין כפתור שמירה שאפשר לשכוח באמצע אימון.
   * כל עוד האימון ריק לגמרי הוא נשאר טיוטה; אם רוקנו אימון שמור, הוא נמחק.
   */
  const patch = (next: WorkoutEntry) => {
    if (isWorkoutEmpty(next)) {
      setDraft(next);
      setOpenId(null);
      if (db.workouts.some((w) => w.id === next.id)) {
        void store.update('workouts', removeWorkout(db.workouts, next.id));
      }
      return;
    }
    setDraft(null);
    setOpenId(next.id);
    void store.update('workouts', upsertWorkout(db.workouts, next));
  };

  const closeEditor = () => {
    setDraft(null);
    setOpenId(null);
    setSkipUndo(null);
    setSkippedIds([]);
    setListOpen(false);
    skipRestTimer();
  };

  /**
   * "דלג ואחזור" (שלב 4.1): התרגיל שבמוקד עובר לסוף סדר הכוח. הסדר שנשמר
   * הוא הסדר שיבוצע; המוקד נשאר באותו אינדקס — כלומר עובר לתרגיל הבא.
   */
  const skipExercise = (ex: LoggedExercise) => {
    if (!open) return;
    setSkipUndo({ ids: orderOf(rows), name: ex.n });
    setSkippedIds((ids) => (ids.includes(ex.exerciseId) ? ids : [...ids, ex.exerciseId]));
    patch({ ...open, ex: moveToEnd(rows, ex.exerciseId) });
  };

  const undoSkip = () => {
    if (!open || !skipUndo) return;
    patch({ ...open, ex: reorderLike(rows, skipUndo.ids) });
    setSkippedIds((ids) => ids.filter((id) => !skipUndo.ids.includes(id) || rows.some((r) => r.exerciseId === id && hasData(r))));
    setSkipUndo(null);
  };

  /**
   * "החלף" (שלב 4.1): החלופות לתא של השורה — רק לשורה שלא הוחלפה, ובלי
   * תרגיל שכבר נמצא באימון הזה. הביצוע האחרון של כל חלופה לפי המזהה שלה.
   */
  const alternativesOf = (row: LoggedExercise): AlternateOption[] => {
    if (!open || row.swappedFrom !== undefined) return [];
    return alternatesFor(row.exerciseId)
      .filter((alt) => !rows.some((r) => r.exerciseId === alt.id))
      .map((alt) => ({ spec: alt, last: lastExercise(db.workouts, alt.id, open.id) }));
  };

  /** מחליף את תרגיל התא בחלופה, לאימון הזה בלבד. הרשומה: המזהה של החלופה + swappedFrom. */
  const swapTo = (row: LoggedExercise, alt: Exercise) => {
    if (!open) return;
    const next = swapExercise(specOf(row), alt, openingWeight(db.workouts, alt.id, open.id));
    setSkipUndo(null);
    patch({ ...open, ex: rows.map((e) => (e.exerciseId === row.exerciseId ? next : e)) });
  };

  /** מחזיר את התרגיל המקורי לתא (רק כשעוד לא נרשם דבר בחלופה). */
  const unswap = (row: LoggedExercise) => {
    if (!open || row.swappedFrom === undefined) return;
    const slot = exerciseIn(open.t, row.swappedFrom) ?? exerciseById(row.swappedFrom);
    if (!slot) return;
    const next = blankLoggedExercise(slot, openingWeight(db.workouts, slot.id, open.id));
    setSkipUndo(null);
    patch({ ...open, ex: rows.map((e) => (e.exerciseId === row.exerciseId ? next : e)) });
  };

  /** פותח אימון קיים לעריכה ומעביר את התצוגה לשבוע שלו. */
  const editWorkout = (w: WorkoutEntry) => {
    setDraft(null);
    setCardioOpen(null);
    setOpenId(w.id);
    setWeek(weekStart(w.d));
    setExpanded(null);
    setFocus(1);
    setWarmupOpen(false);
    setSkippedIds([]);
  };

  /**
   * אותו אימון יכול להופיע בשתי הרשימות (השבוע הנוכחי הוא גם "אחרון").
   * מפתח הפתיחה כולל את שם הרשימה, כדי שפתיחה באחת לא תפתח גם בשנייה.
   */
  const renderRow = (list: 'week' | 'history') => (w: WorkoutEntry) => {
    const key = `${list}:${w.id}`;
    return (
      <WorkoutRow
        key={w.id}
        w={w}
        workouts={db.workouts}
        expanded={expanded === key}
        onToggle={() => setExpanded(expanded === key ? null : key)}
        onEdit={() => editWorkout(w)}
        onDelete={() => deleteWorkout(w)}
      />
    );
  };

  /**
   * הזנת סט פותחת מנוחה אוטומטית. המשכים ב-src/data/config.ts.
   *
   * התנאי הוא `index + 1 === sets.length`, ולא `=== 3`. בתוכנית יש
   * תרגילים של 2 סטים (פשיטת ברך, פרפר, הרחקות, כפיפות, פלאנק צד),
   * ומספר קשיח היה משאיר אותם בלי מנוחה בין תרגילים לנצח.
   */
  const onSetLogged = (ex: LoggedExercise, setIndex: number) => {
    const isLastSet = setIndex + 1 === ex.sets.length;
    const seconds = restSeconds(ex.type, isLastSet);
    timer.start(seconds, isLastSet ? 'מנוחה לפני התרגיל הבא' : 'מנוחה');
  };

  /** חימום/אירובי: אותו טיימר, במשך שנקבע ידנית. אין מנוחה אחריו. */
  const onCardioStart = (ex: LoggedExercise, minutes: number) => {
    timer.start(minutes * 60, ex.n, 'countdown');
  };

  // ---------- תצוגה ----------

  /** מצב כל תרגיל לפס ההתקדמות ולרשימת התרגילים. */
  const segmentState = (r: LoggedExercise, i: number): Segment['state'] => {
    if (hasData(r)) return 'done';
    if (i === currentIndex) return 'current';
    if (skippedIds.includes(r.exerciseId) || i < currentIndex) return 'pending';
    return 'upcoming';
  };
  const segments: Segment[] = open
    ? [
        ...rows.map((r, i) => ({ r, i })).filter(({ r }) => !isCardio(r)).map(({ r, i }) => {
          const st = segmentState(r, i);
          const word = st === 'done' ? 'נרשם' : st === 'current' ? 'במוקד' : st === 'pending' ? 'ממתין' : 'עוד לא';
          return { key: r.exerciseId, state: st, label: `${r.n} — ${word}` };
        }),
        { key: '__finish', state: isFinish ? 'current' : 'upcoming', label: 'סיום' },
      ]
    : [];

  const warmupSummary = (() => {
    if (!warmupRow) return '';
    const c = cardioOf(warmupRow);
    const done = cardioMinutesDone(warmupRow);
    return done === null ? `${cardioModeLabel(c.mode)} · ${c.minutes} דק׳ · לא נרשם` : `${cardioModeLabel(c.mode)} · ${done} דק׳ · נרשם`;
  })();

  const painRated = open ? open.knee !== null || open.shoulder !== null : false;
  const painComplete = open ? open.knee !== null && open.shoulder !== null : false;

  /**
   * בלוק הכאב: שורה קומפקטית וגלויה, בלי ברירת מחדל (החלטה 2). בתצוגת
   * המוקד, אחרי ששני הערכים דורגו, מתכווץ לשורה אחת עם "שנה" (תצוגה בלבד,
   * אותם שדות). במסך הסיום תמיד מלא.
   */
  const painCollapsed = open && FEATURES.pain && !isFinish && painComplete && !painEditOpen && (
    <Surface as="div" className="surface--row wk-pain" aria-label="כאב">
      <ListRow
        title={
          <>
            כאב · ברך <Num>{open.knee ?? DASH}</Num> · כתף <Num>{open.shoulder ?? DASH}</Num>
          </>
        }
        end={
          <Button variant="ghost" onClick={() => setPainEditOpen(true)}>
            שנה
          </Button>
        }
      />
    </Surface>
  );

  const painBlock = painCollapsed || (open && FEATURES.pain && (
    <Surface aria-label="כאב" className="wk-pain">
      <SectionHeader
        level={3}
        title="כאב"
        aside={
          painRated ? (
            <StatusChip tone="done">
              ברך <Num>{open.knee ?? DASH}</Num> · כתף <Num>{open.shoulder ?? DASH}</Num>
            </StatusChip>
          ) : (
            <StatusChip tone="missing">לא דורג</StatusChip>
          )
        }
      />
      <div className="stack--tight">
        <ChipSelect<number> label="כאב ברך" options={PAIN_SCALE} value={open.knee} onChange={(knee) => patch({ ...open, knee })} columns={6} />
        <ChipSelect<number> label="כאב כתף" options={PAIN_SCALE} value={open.shoulder} onChange={(shoulder) => patch({ ...open, shoulder })} columns={6} />
      </div>
    </Surface>
  ));

  const finisherFocus = open && finisherRow && FEATURES.cardio && (
    <CardioFocus
      key={finisherRow.exerciseId}
      log={finisherRow}
      onChange={(next) => {
        patch({
          ...open,
          ex: rows.map((e) => (e.exerciseId === next.exerciseId ? next : e)),
        });
      }}
      onStart={(minutes) => onCardioStart(finisherRow, minutes)}
      detailed
      remainingMinutes={remainingMinutes(cardioWeek(db, weekStart(open.d)))}
      defaultsFor={(mode) => lastFinisherCardio(db.workouts, mode, open.id)}
      session={sessionFor({ kind: 'finisher', workoutId: open.id, t: open.t, d: open.d })}
      sessionBusy={session !== null}
      onStartSession={() => {
        const c = cardioOf(finisherRow);
        beginSession(
          { kind: 'finisher', workoutId: open.id, t: open.t, d: open.d },
          c.mode,
          c.minutes,
          c.incline ?? null,
          c.speed ?? null,
          'אירובי',
        );
      }}
      onSessionChange={changeSession}
      onFinishSession={finishSession}
      onEditSummary={() =>
        openSummary(
          { kind: 'finisher', workoutId: open.id, t: open.t, d: open.d },
          cardioOf(finisherRow).mode,
          cardioSegmentsOf(finisherRow),
          cardioOf(finisherRow).steps ?? null,
          true,
        )
      }
    />
  );

  const cardioSummaryEl = summary && (
    <CardioSummary
      key={`${summary.target.kind}:${summary.target.kind === 'standalone' ? summary.target.id : summary.target.workoutId}`}
      title={summaryTitle(summary.target)}
      mode={summary.mode}
      initialSegments={summary.segments}
      initialSteps={summary.steps}
      notice={
        summary.cut
          ? 'הריצה נחתכה בזמן שתוכנן — לא נלחץ "סיים". אפשר לתקן את המקטעים לפני השמירה.'
          : undefined
      }
      onSave={saveSummary}
      onCancel={cancelSummary}
      onDelete={
        summary.existing && summary.target.kind === 'standalone'
          ? () => {
              deleteStandalone(summary.target.kind === 'standalone' ? summary.target.id : '');
              setSummary(null);
            }
          : undefined
      }
    />
  );

  // ---------- סשן פעיל: תצוגת המוקד ----------
  if (open) {
    const performedRows = strengthRows.filter(hasData);
    const skippedRows = strengthRows.filter((r) => !hasData(r));
    const swappedRows = strengthRows.filter((r) => r.swappedFrom !== undefined);
    return (
      <div className="stack wk-session">
        {cardioSummaryEl}

        <header className="wk-head">
          <Button variant="ghost" icon={ChevronRight} aria-label="לתרגיל הקודם" disabled={currentIndex <= 1} onClick={() => setFocus(Math.max(1, currentIndex - 1))} />
          <button type="button" className="wk-head__title" aria-haspopup="dialog" aria-expanded={listOpen} onClick={() => setListOpen(true)}>
            <span className="top__eyebrow">
              אימון {open.t} · {WORKOUT_TITLES[open.t]} · <Num>{formatDM(open.d)}</Num>
            </span>
            <span className="wk-head__step">
              {isFinish ? (
                'סיום'
              ) : (
                <>
                  תרגיל <Num>{currentNo}</Num> מתוך <Num>{strengthTotal}</Num>
                </>
              )}
            </span>
          </button>
          <Button variant="ghost" icon={ChevronLeft} aria-label="לתרגיל הבא" disabled={currentIndex >= finishIndex} onClick={() => setFocus(Math.min(finishIndex, currentIndex + 1))} />
        </header>
        <ProgressSegments items={segments} label="התקדמות האימון" />

        <div className="row wk-meta">
          <Disclosure
            className="grow"
            title={
              <span className="tiny muted">
                תאריך <Num>{formatDMY(open.d)}</Num>
              </span>
            }
            open={dateOpen}
            onToggle={() => setDateOpen((v) => !v)}
          >
            <DateField label="תאריך האימון" value={open.d} max={today} onChange={(d) => patch({ ...open, d })} />
          </Disclosure>
          <Button variant="ghost" onClick={closeEditor}>
            סגור
          </Button>
        </div>

        {/* חימום: שורה מקופלת בראש הסשן. לא חוסמת את התרגיל הראשון. */}
        {warmupRow && (
          <Surface as="div" className="surface--row" aria-label="חימום">
            <Disclosure
              lead={Timer}
              title="חימום"
              summary={warmupSummary}
              end={cardioMinutesDone(warmupRow) === null ? undefined : <StatusChip tone="done">נרשם</StatusChip>}
              open={warmupOpen}
              onToggle={() => setWarmupOpen((v) => !v)}
            >
              <CardioFocus
                key={warmupRow.exerciseId}
                log={warmupRow}
                onChange={(next) => {
                  patch({
                    ...open,
                    ex: rows.map((e) => (e.exerciseId === next.exerciseId ? next : e)),
                  });
                }}
                onStart={(minutes) => onCardioStart(warmupRow, minutes)}
              />
            </Disclosure>
          </Surface>
        )}

        {skipUndo && (
          <Toast placement="static" actionLabel="בטל" onAction={undoSkip}>
            {skipUndo.name} — הועבר לסוף האימון
          </Toast>
        )}

        {current && !isFinish && (
          <Surface aria-label={`תרגיל ${currentNo} — ${current.n}`}>
            <ExerciseFocus
              key={current.exerciseId}
              spec={specOf(current)}
              log={current}
              history={recentExercises(db.workouts, current.exerciseId, HISTORY_ROWS, open.id)}
              fullHistory={exerciseHistory(db.workouts, current.exerciseId).filter((h) => h.workoutId !== open.id)}
              suggestion={suggestNext(
                exerciseHistory(db.workouts, current.exerciseId).filter((h) => h.workoutId !== open.id),
                progressionSpecOf(current),
              )}
              restSec={restSeconds(current.type, false)}
              onChange={(next) => {
                patch({
                  ...open,
                  ex: rows.map((e) => (e.exerciseId === next.exerciseId ? next : e)),
                });
              }}
              onSetLogged={(i) => onSetLogged(current, i)}
              historyOpen={historyOpen}
              onToggleHistory={() => setHistoryOpen((v) => !v)}
              onSkip={strengthTotal > 1 ? () => skipExercise(current) : undefined}
              alternates={alternativesOf(current)}
              onSwap={(alt) => swapTo(current, alt)}
              onUnswap={() => unswap(current)}
              onNext={() => setFocus(Math.min(finishIndex, currentIndex + 1))}
              nextLabel={currentIndex + 1 >= finishIndex ? 'לסיום' : 'התרגיל הבא'}
            />
          </Surface>
        )}

        {isFinish && (
          <Surface aria-label="סיום האימון">
            <SectionHeader
              title="סיום"
              aside={
                <>
                  <Num>{performedRows.length}</Num> / <Num>{strengthTotal}</Num> תרגילים
                </>
              }
            />
            {finisherFocus}
            <ul className="wk-summary list list--block small">
              <li>
                <span className="muted">בוצעו ({performedRows.length}):</span> {performedRows.length ? performedRows.map((e) => e.n).join(', ') : DASH}
              </li>
              {skippedRows.length > 0 && (
                <li>
                  <span className="muted">דולגו ({skippedRows.length}):</span> {skippedRows.map((e) => e.n).join(', ')}
                </li>
              )}
              {swappedRows.length > 0 && (
                <li>
                  <span className="muted">הוחלפו ({swappedRows.length}):</span>{' '}
                  {swappedRows.map((e) => `${e.n} (${swappedFromLabel(e) ?? ''})`).join(', ')}
                </li>
              )}
              {FEATURES.pain && (
                <li>
                  <span className="muted">כאב:</span>{' '}
                  {painRated ? (
                    <>
                      ברך <Num>{open.knee ?? DASH}</Num> · כתף <Num>{open.shoulder ?? DASH}</Num>
                    </>
                  ) : (
                    <span className="wk-summary__warn">לא דורג — נגיעה אחת למטה</span>
                  )}
                </li>
              )}
            </ul>
          </Surface>
        )}

        {painBlock}

        {isFinish && (
          <Surface as="div" aria-label="סיים אימון">
            <Button
              variant="accent"
              block
              tall
              onClick={() => {
                closeEditor();
                // טיוטה ריקה לא נשמרה — אין מה לאשר.
                if (!draft) toast.saved();
              }}
            >
              סיים אימון
            </Button>
            <div className="row" style={{ marginTop: 'var(--sp-3)' }}>
              <p className="tiny muted grow" style={{ margin: 0 }}>
                {draft ? 'האימון יישמר ברגע שתזין נתון ראשון.' : 'כל שינוי נשמר מיד.'}
              </p>
              <ConfirmButton
                className="btn btn--danger"
                ariaLabel={`מחק אימון ${open.t} של ${formatDMY(open.d)}`}
                onConfirm={() => {
                  // טיוטה (עוד לא באחסון) רק נסגרת; אימון שמור נמחק עם "בטל".
                  if (!draft) deleteWorkout(open);
                  setDraft(null);
                  setOpenId(null);
                }}
              />
            </div>
          </Surface>
        )}

        {listOpen && (
          <Sheet title={`אימון ${open.t} · התרגילים`} onClose={() => setListOpen(false)}>
            <div aria-label="רשימת התרגילים">
              {rows.map((r, i) => {
                if (isCardio(r)) return null;
                const st = segmentState(r, i);
                return (
                  <ListRow
                    key={r.exerciseId}
                    title={
                      <>
                        <Num>{strengthRows.indexOf(r) + 1}</Num> · {r.n}
                      </>
                    }
                    sub={hasData(r) ? exerciseLine(r).replace(`${r.n} `, '') : swappedFromLabel(r) ?? undefined}
                    end={
                      st === 'done' ? (
                        <StatusChip tone="done">נרשם</StatusChip>
                      ) : st === 'current' ? (
                        <StatusChip tone="accent">במוקד</StatusChip>
                      ) : st === 'pending' ? (
                        <StatusChip tone="partial">ממתין</StatusChip>
                      ) : undefined
                    }
                    onTap={() => {
                      setFocus(i);
                      setListOpen(false);
                    }}
                  />
                );
              })}
              <ListRow
                title="סיום"
                end={isFinish ? <StatusChip tone="accent">במוקד</StatusChip> : undefined}
                onTap={() => {
                  setFocus(finishIndex);
                  setListOpen(false);
                }}
              />
            </div>
          </Sheet>
        )}
      </div>
    );
  }

  // ---------- אין סשן פעיל: מסך פתיחה ----------
  return (
    <div className="stack--loose">
      {cardioSummaryEl}

      {!cardioOpen && !summary && (
        <Surface variant="hero" aria-label="אימון חדש" className="wk-start">
          <p className="top__eyebrow">הבא בתור</p>
          <Button variant="accent" block tall onClick={() => startWorkout(upNext)}>
            התחל אימון {upNext}
            <span className="wk-start__title">· {WORKOUT_TITLES[upNext]}</span>
          </Button>
          <div className="wk-start__other">
            <span className="tiny muted">אימון אחר:</span>
            {WORKOUT_TYPES.filter((t) => t !== upNext).map((t) => (
              <Button key={t} variant="secondary" onClick={() => startWorkout(t)} aria-label={`התחל אימון ${t}`}>
                {t}
                {/* D (25/10/2026): מחוץ לסבב — לעולם לא "הבא בתור" ולא נספר ב-n/3. */}
                {t === 'D' && <span className="tiny muted">· אופציונלי</span>}
              </Button>
            ))}
            {/* לא אימון: שורה משלו, בלי "הבא בתור". */}
            {FEATURES.cardio && (
              <Button variant="ghost" onClick={startStandalone}>
                אירובי — עצמאי
              </Button>
            )}
          </div>
          {FEATURES.constraints && (
            <p className="tiny muted" style={{ margin: 0 }}>
              {CONSTRAINTS}
            </p>
          )}
        </Surface>
      )}

      {cardioOpen && !summary && (
        <StandaloneCardioEditor
          value={cardioOpen}
          today={today}
          onChange={setCardioOpen}
          onClose={() => setCardioOpen(null)}
          remainingMinutes={remainingMinutes(cardioWeek(db, weekStart(cardioOpen.d)))}
          defaultsFor={(mode) => lastStandalone(db.standaloneCardio, mode)}
          session={sessionFor({ kind: 'standalone', id: cardioOpen.id, d: cardioOpen.d, note: cardioOpen.note })}
          sessionBusy={session !== null}
          onStart={() =>
            beginSession(
              { kind: 'standalone', id: cardioOpen.id, d: cardioOpen.d, note: cardioOpen.note },
              cardioOpen.mode,
              cardioOpen.minutes,
              cardioOpen.incline,
              cardioOpen.speed,
              'אירובי — עצמאי',
            )
          }
          onSessionChange={changeSession}
          onFinish={finishSession}
          onManual={() =>
            openSummary(
              { kind: 'standalone', id: cardioOpen.id, d: cardioOpen.d, note: cardioOpen.note },
              cardioOpen.mode,
              [{ minutes: cardioOpen.minutes, incline: cardioOpen.incline, speed: cardioOpen.speed }],
              null,
              false,
            )
          }
        />
      )}

      <section className="section">
        <WeekNav
          week={week}
          onChange={setWeek}
          today={today}
          weekNo={start ? weekNumber(start, week) : null}
        />
        <p className="sub" style={{ margin: 'var(--sp-4) 0 0' }}>
          {/* n/3 סופר את הסבב בלבד; אימון D (אופציונלי) מופיע ברשימה אבל לא במונה.
              בת הזוג: בלי ימים קבועים — רק "הבא בתור". */}
          {FEATURES.weeklyCounter && (
            <>
              <span className="num">{rotationWorkouts(inWeek).length}</span> /{' '}
              <span className="num">{WORKOUTS_PER_WEEK}</span> אימונים השבוע ·{' '}
            </>
          )}
          הבא בתור: <span className="strong">{upNext}</span>
        </p>
        {/* דקות, לא מפגשים. סיום מתוך האימונים, עצמאי מהמפתח שלו. */}
        {FEATURES.cardio && (
          <p className={`sub${cardioSum.over ? ' wk-budget--over' : ''}`} style={{ margin: 'var(--sp-1) 0 0' }}>
            אירובי <span className="num">{cardioSum.total}</span> /{' '}
            <span className="num">{cardioSum.budget}</span> דק׳{' '}
            {cardioSum.over && <span className="wk-budget__flag">· מעל התקציב השבועי</span>}
            <span className="muted tiny">
              · סיום: <span className="num">{cardioSum.finisher}</span> · עצמאי:{' '}
              <span className="num">{cardioSum.standalone}</span>
            </span>
          </p>
        )}
        {/* האימונים של השבוע שנבחר. ההיסטוריה למטה מציגה רק את האחרונים,
            וזו הדרך להגיע לאימון ישן יותר — לנווט לשבוע שלו. */}
        {inWeek.length > 0 && (
          <ul className="list list--block" style={{ marginTop: 'var(--sp-3)' }}>
            {[...inWeek].reverse().map(renderRow('week'))}
          </ul>
        )}
        {/* אירובי עצמאי של השבוע — רשימה נפרדת, כי הוא לא אימון. */}
        {FEATURES.cardio && cardioInWeek.length > 0 && (
          <ul className="list list--block small" style={{ marginTop: 'var(--sp-2)' }}>
            {[...cardioInWeek].reverse().map((e) => (
              <li key={e.id}>
                <div className="row">
                  <span className="grow">
                    <span className="num">{formatDM(e.d)}</span>{' '}
                    <span className="muted tiny">{dayLetter(e.d)}</span>{' '}
                    <span className="muted">אירובי</span> — {standaloneLine(e)}
                    {standaloneDetailLine(e) && (
                      <span className="tiny muted" style={{ display: 'block' }}>
                        {standaloneDetailLine(e)}
                      </span>
                    )}
                  </span>
                  <button
                    type="button"
                    className="btn btn--quiet"
                    onClick={() => {
                      setDraft(null);
                      setOpenId(null);
                      setCardioOpen(null);
                      openSummary(
                        { kind: 'standalone', id: e.id, d: e.d, note: e.note },
                        e.mode,
                        segmentsOf(e),
                        e.steps ?? null,
                        true,
                      );
                    }}
                  >
                    ערוך
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="section">
        <div className="section__head">
          <h2>היסטוריה</h2>
          {history.length > 0 && (
            <span className="tiny muted">
              <span className="num">{history.length}</span> אחרונים
            </span>
          )}
        </div>
        {history.length === 0 ? (
          <p className="muted small" style={{ margin: 0 }}>
            אין אימונים.
          </p>
        ) : (
          <ul className="list list--block">{history.map(renderRow('history'))}</ul>
        )}
      </section>

      {db.legacyWorkouts.length > 0 && (
        // רשומות שלא ניתן היה להמיר. קריאה בלבד: אין עריכה ואין מחיקה —
        // הן נשמרות כמו שהן ב-fatloss:workouts, וזמינות בגיבוי ה-JSON.
        <section className="section">
          <h2 style={{ marginBottom: 'var(--sp-3)' }}>
            אימונים ישנים שלא הומרו (<span className="num">{db.legacyWorkouts.length}</span>)
          </h2>
          <ul className="list list--block small">
            {db.legacyWorkouts.map((l, i) => (
              <li key={i} className="muted">
                אימון ישן · <span className="num">{legacyDate(l.d)}</span> · {l.reason}
              </li>
            ))}
          </ul>
          <p className="tiny muted" style={{ margin: 0 }}>
            הרשומות נשמרות כמו שהן ונכללות בגיבוי ה-JSON במסך "נתונים".
          </p>
        </section>
      )}
    </div>
  );
}

/** התאריך של רשומה ישנה כפי שהוא — לא עבר אימות, אז לא מפרסרים אותו. */
function legacyDate(d: string | null): string {
  if (d === null || d.trim() === '') return 'ללא תאריך';
  return d.length > 24 ? `${d.slice(0, 24)}…` : d;
}
