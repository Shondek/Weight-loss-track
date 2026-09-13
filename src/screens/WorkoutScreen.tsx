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
  exerciseById,
  exerciseIn,
  restSeconds,
} from '../data/program';
import { HISTORY_ROWS } from '../data/config';
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
import Choice from '../components/Choice';
import ConfirmButton from '../components/ConfirmButton';
import ExerciseFocus from '../components/ExerciseFocus';
import CardioFocus from '../components/CardioFocus';
import StandaloneCardioEditor from '../components/StandaloneCardioEditor';
import CardioSummary from '../components/CardioSummary';
import Sparkline from '../components/Sparkline';
import type { RestTimer } from '../hooks/useRestTimer';
import {
  readCardioSession,
  readEditor,
  readPrefs,
  writeCardioSession,
  writeEditor,
  writePrefs,
} from '../platform/uiState';

const HISTORY_COUNT = 12;
const PAIN_SCALE = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
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
                <div>{exerciseLine(e)}</div>
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
          <p className="tiny muted" style={{ margin: 0 }}>
            כאב: ברך <span className="num">{w.knee ?? DASH}</span> · כתף{' '}
            <span className="num">{w.shoulder ?? DASH}</span>
          </p>
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
  const [focus, setFocus] = useState(() => readEditor()?.focus ?? 0);
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
  const rows = open ? exercisesFor(open, db.workouts) : [];
  const current = rows[Math.min(focus, Math.max(0, rows.length - 1))] ?? null;
  /** מספור לתצוגה: חימום = 0, תרגילי הכוח 1..N, אירובי סיום = "א". */
  const strengthTotal = rows.filter((r) => !isCardio(r)).length;
  const dotLabel = (i: number): string => {
    const r = rows[i];
    if (!r) return '';
    if (r.exerciseId === WARMUP_ID) return '0';
    if (isCardio(r)) return 'א';
    return String(rows.slice(0, i + 1).filter((x) => !isCardio(x)).length);
  };

  // אימון שנמחק מבחוץ (ייבוא, מחיקה גורפת) לא נשאר פתוח על ריק.
  // מטפל גם במזהה שהוחזר מהאחסון ושייך לאימון שכבר לא קיים.
  useEffect(() => {
    if (openId && !db.workouts.some((w) => w.id === openId)) setOpenId(null);
  }, [openId, db.workouts]);

  useEffect(() => {
    writeEditor(openId ? { openId, focus } : null);
  }, [openId, focus]);

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
   * המפרט לתצוגה: קודם כפי שהוא באימון הזה (סטים/טווח יכולים להיות שונים
   * בין A ל-B), אחרת הזהות הכללית, ותרגיל שירד מהתוכנית עדיין ניתן לעריכה
   * לפי מה שנשמר איתו.
   */
  const specOf = (log: LoggedExercise): Exercise =>
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
      note: null,
      videoUrl: null,
    };

  /** פותח אימון חדש כטיוטה. לחיצה בטעות לא יוצרת אימון ריק בהיסטוריה. */
  const startWorkout = (t: WorkoutType) => {
    const d = defaultDate;
    setOpenId(null);
    setCardioOpen(null);
    setFocus(0);
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

  const deleteStandalone = (id: string) => {
    void store.update('standaloneCardio', removeStandalone(db.standaloneCardio, id));
    if (cardioOpen?.id === id) setCardioOpen(null);
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
    skipRestTimer();
  };

  /** פותח אימון קיים לעריכה ומעביר את התצוגה לשבוע שלו. */
  const editWorkout = (w: WorkoutEntry) => {
    setDraft(null);
    setCardioOpen(null);
    setOpenId(w.id);
    setWeek(weekStart(w.d));
    setExpanded(null);
    setFocus(0);
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
        onDelete={() => void store.update('workouts', removeWorkout(db.workouts, w.id))}
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
    timer.start(seconds, isLastSet ? 'מנוחה לפני התרגיל הבא' : 'מנוחה בין סטים');
  };

  /** חימום/אירובי: אותו טיימר, במשך שנקבע ידנית. אין מנוחה אחריו. */
  const onCardioStart = (ex: LoggedExercise, minutes: number) => {
    timer.start(minutes * 60, ex.n, 'countdown');
  };

  return (
    <div className="stack--loose">
      <p className="tiny muted" style={{ margin: 0 }}>
        {CONSTRAINTS}
      </p>

      <section className="section section--first">
        <WeekNav
          week={week}
          onChange={setWeek}
          today={today}
          weekNo={start ? weekNumber(start, week) : null}
        />
        <p className="sub" style={{ margin: 'var(--sp-4) 0 0' }}>
          <span className="num">{inWeek.length}</span> /{' '}
          <span className="num">{WORKOUTS_PER_WEEK}</span> אימונים השבוע · הבא בתור:{' '}
          <span className="strong">{upNext}</span>
        </p>
        {/* דקות, לא מפגשים. סיום מתוך האימונים, עצמאי מהמפתח שלו. */}
        <p className="sub" style={{ margin: 'var(--sp-1) 0 0' }}>
          אירובי: <span className="num">{cardioSum.total}</span> /{' '}
          <span className="num">{cardioSum.budget}</span> דק׳{' '}
          <span className="muted tiny">
            · סיום: <span className="num">{cardioSum.finisher}</span> · עצמאי:{' '}
            <span className="num">{cardioSum.standalone}</span>
          </span>
        </p>
        {/* האימונים של השבוע שנבחר. ההיסטוריה למטה מציגה רק את האחרונים,
            וזו הדרך להגיע לאימון ישן יותר — לנווט לשבוע שלו. */}
        {inWeek.length > 0 && (
          <ul className="list list--block" style={{ marginTop: 'var(--sp-3)' }}>
            {[...inWeek].reverse().map(renderRow('week'))}
          </ul>
        )}
        {/* אירובי עצמאי של השבוע — רשימה נפרדת, כי הוא לא אימון. */}
        {cardioInWeek.length > 0 && (
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

      {summary && (
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
      )}

      {!open && !cardioOpen && !summary && (
        <section className="section">
          <h2 style={{ marginBottom: 'var(--sp-3)' }}>אימון חדש</h2>
          <div className="choice choice--big">
            {WORKOUT_TYPES.map((t) => (
              <button
                key={t}
                type="button"
                className="choice__btn"
                aria-pressed={t === upNext}
                onClick={() => startWorkout(t)}
              >
                {t}
                {t === upNext && <span className="choice__hint">הבא בתור</span>}
              </button>
            ))}
            {/* לא אימון: שורה משלו, מקווקו, בלי "הבא בתור". */}
            <button
              type="button"
              className="choice__btn choice__btn--aside"
              aria-pressed={false}
              onClick={startStandalone}
            >
              אירובי — עצמאי
              <span className="choice__hint">לא נספר כאימון</span>
            </button>
          </div>
        </section>
      )}

      {cardioOpen && !summary && (
        <StandaloneCardioEditor
          value={cardioOpen}
          today={today}
          onChange={setCardioOpen}
          onClose={() => setCardioOpen(null)}
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

      {open && (
        <section className="section">
          <div className="section__head">
            <h2>
              אימון {open.t} · {WORKOUT_TITLES[open.t]} ·{' '}
              <span className="num">{formatDM(open.d)}</span>
            </h2>
            <button type="button" className="btn btn--quiet" onClick={closeEditor}>
              סגור
            </button>
          </div>

          <DateField
            label="תאריך האימון"
            value={open.d}
            max={today}
            onChange={(d) => patch({ ...open, d })}
          />

          {/* תרגיל אחד במוקד. הרצועה למעלה מאפשרת לדלג ולחזור. */}
          <div className="focusnav" role="group" aria-label="ניווט בין תרגילים">
            <span className="tiny muted grow">
              {current && isCardio(current) ? (
                current.n
              ) : (
                <>
                  תרגיל <span className="num">{dotLabel(focus)}</span> מתוך{' '}
                  <span className="num">{strengthTotal}</span>
                </>
              )}
            </span>
            <div className="focusnav__dots">
              {rows.map((r, i) => (
                <button
                  key={r.exerciseId}
                  type="button"
                  className={`focusnav__dot${i === focus ? ' is-current' : ''}${
                    hasData(r) ? ' is-done' : ''
                  }`}
                  aria-label={`${r.n}${hasData(r) ? ' — נרשם' : ''}`}
                  aria-current={i === focus}
                  onClick={() => setFocus(i)}
                >
                  {dotLabel(i)}
                </button>
              ))}
            </div>
          </div>

          {current && isCardio(current) && (
            <CardioFocus
              key={current.exerciseId}
              log={current}
              onChange={(next) => {
                patch({
                  ...open,
                  ex: rows.map((e) => (e.exerciseId === next.exerciseId ? next : e)),
                });
              }}
              onStart={(minutes) => onCardioStart(current, minutes)}
              detailed={current.exerciseId === FINISHER_ID}
              defaultsFor={
                current.exerciseId === FINISHER_ID
                  ? (mode) => lastFinisherCardio(db.workouts, mode, open.id)
                  : undefined
              }
              session={
                current.exerciseId === FINISHER_ID
                  ? sessionFor({ kind: 'finisher', workoutId: open.id, t: open.t, d: open.d })
                  : null
              }
              sessionBusy={session !== null}
              onStartSession={() => {
                const c = cardioOf(current);
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
                  cardioOf(current).mode,
                  cardioSegmentsOf(current),
                  cardioOf(current).steps ?? null,
                  true,
                )
              }
            />
          )}

          {current && !isCardio(current) && (
            <ExerciseFocus
              key={current.exerciseId}
              spec={specOf(current)}
              log={current}
              history={recentExercises(db.workouts, current.exerciseId, HISTORY_ROWS, open.id)}
              fullHistory={exerciseHistory(db.workouts, current.exerciseId).filter(
                (h) => h.workoutId !== open.id,
              )}
              onChange={(next) => {
                patch({
                  ...open,
                  ex: rows.map((e) =>
                    e.exerciseId === next.exerciseId ? next : e,
                  ),
                });
              }}
              onSetLogged={(i) => onSetLogged(current, i)}
              historyOpen={historyOpen}
              onToggleHistory={() => setHistoryOpen((v) => !v)}
            />
          )}

          <div className="row" style={{ marginTop: 'var(--sp-4)' }}>
            <button
              type="button"
              className="btn grow"
              disabled={focus === 0}
              onClick={() => setFocus((i) => Math.max(0, i - 1))}
            >
              הקודם
            </button>
            <button
              type="button"
              className="btn grow"
              disabled={focus >= rows.length - 1}
              onClick={() => setFocus((i) => Math.min(rows.length - 1, i + 1))}
            >
              {current && hasData(current) ? 'הבא' : 'דלג'}
            </button>
          </div>

          <div className="section" style={{ marginTop: 'var(--sp-5)' }}>
            <div className="stack">
              <Choice
                label="כאב ברך"
                scale
                options={PAIN_SCALE}
                value={open.knee}
                onChange={(knee) => patch({ ...open, knee })}
              />
              <Choice
                label="כאב כתף"
                scale
                options={PAIN_SCALE}
                value={open.shoulder}
                onChange={(shoulder) => patch({ ...open, shoulder })}
              />
            </div>
          </div>

          <div className="row" style={{ marginTop: 'var(--sp-4)' }}>
            <button type="button" className="btn btn--primary btn--block" onClick={closeEditor}>
              סיים
            </button>
            <ConfirmButton
              className="btn btn--danger"
              ariaLabel={`מחק אימון ${open.t} של ${formatDMY(open.d)}`}
              onConfirm={() => {
                void store.update('workouts', removeWorkout(db.workouts, open.id));
                setDraft(null);
                setOpenId(null);
              }}
            />
          </div>
          <p className="tiny muted" style={{ marginTop: 'var(--sp-2)' }}>
            {draft ? 'האימון יישמר ברגע שתזין נתון ראשון.' : 'כל שינוי נשמר מיד.'}
          </p>
        </section>
      )}

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
