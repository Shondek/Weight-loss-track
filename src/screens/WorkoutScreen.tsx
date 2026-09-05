import { useEffect, useMemo, useState } from 'react';
import type { ScreenProps } from './types';
import { useWeek } from '../useWeek';
import {
  WORKOUT_SCHEMA_VERSION,
  type LoggedExercise,
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
  cardioLine,
  exerciseHistory,
  exercisesFor,
  hasData,
  isCardio,
  lastWeightOf,
  isTimedExercise,
  isWorkoutEmpty,
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
import { compareISO, dayLetter, formatDM, formatDMY, weekEnd, weekNumber, weekStart } from '../lib/date';
import { programStartWeek } from '../lib/db';
import { clean, DASH } from '../lib/format';
import WeekNav from '../components/WeekNav';
import DateField from '../components/DateField';
import Choice from '../components/Choice';
import ConfirmButton from '../components/ConfirmButton';
import ExerciseFocus from '../components/ExerciseFocus';
import CardioFocus from '../components/CardioFocus';
import Sparkline from '../components/Sparkline';
import type { RestTimer } from '../hooks/useRestTimer';
import { readEditor, writeEditor } from '../platform/uiState';

const HISTORY_COUNT = 12;
const PAIN_SCALE = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

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
        <button type="button" className="btn btn--quiet" onClick={onEdit}>
          ערוך
        </button>
      </div>
      {expanded && (
        <div className="stack--tight" style={{ padding: 'var(--sp-2) 0' }}>
          <ul className="list list--block small">
            {w.ex.filter(hasData).map((e) => (
              <li key={e.exerciseId}>
                <div>{exerciseLine(e)}</div>
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

  const start = useMemo(() => programStartWeek(db), [db]);
  const inWeek = useMemo(() => workoutsInWeek(db.workouts, week), [db.workouts, week]);
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
    setFocus(0);
    setDraft({
      schemaVersion: WORKOUT_SCHEMA_VERSION,
      id: makeWorkoutId(d, t, newId()),
      d,
      t,
      ex: prefilledExercises(db.workouts, t, d),
      knee: null,
      shoulder: null,
    });
  };

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
    timer.skip();
  };

  /** פותח אימון קיים לעריכה ומעביר את התצוגה לשבוע שלו. */
  const editWorkout = (w: WorkoutEntry) => {
    setDraft(null);
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
        {/* האימונים של השבוע שנבחר. ההיסטוריה למטה מציגה רק את האחרונים,
            וזו הדרך להגיע לאימון ישן יותר — לנווט לשבוע שלו. */}
        {inWeek.length > 0 && (
          <ul className="list list--block" style={{ marginTop: 'var(--sp-3)' }}>
            {[...inWeek].reverse().map(renderRow('week'))}
          </ul>
        )}
      </section>

      {!open && (
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
          </div>
        </section>
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
