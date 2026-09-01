import { useEffect, useMemo, useState } from 'react';
import type { ScreenProps } from './types';
import { useWeek } from '../useWeek';
import type { LoggedExercise, WorkoutEntry, WorkoutType } from '../types';
import {
  CONSTRAINTS,
  WORKOUTS_PER_WEEK,
  WORKOUT_TYPES,
  exerciseById,
  restSeconds,
} from '../data/program';
import {
  exerciseHistory,
  exercisesFor,
  hasData,
  lastWeightOf,
  isTimedExercise,
  isWorkoutEmpty,
  lastExercise,
  makeWorkoutId,
  nextType,
  prefilledExercises,
  previousRecord,
  setPerformed,
  setValue,
  sortableStamp,
  removeWorkout,
  sortWorkouts,
  upsertWorkout,
  workoutsInWeek,
} from '../lib/workouts';
import { compareISO, dayLetter, formatDM, formatDMY, weekEnd, weekNumber, weekStart } from '../lib/date';
import { programStartWeek } from '../lib/db';
import { clean, DASH } from '../lib/format';
import { getProgressionSuggestion } from '../lib/progression';
import WeekNav from '../components/WeekNav';
import DateField from '../components/DateField';
import Choice from '../components/Choice';
import ConfirmButton from '../components/ConfirmButton';
import ExerciseFocus from '../components/ExerciseFocus';
import Sparkline from '../components/Sparkline';
import RestTimerBar from '../components/RestTimerBar';
import { useRestTimer } from '../hooks/useRestTimer';

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

/** שורת סיכום לתרגיל אחד: משקל אחד כשכולם זהים, רשימה כשהם משתנים. */
function exerciseLine(e: LoggedExercise): string {
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

/** ההמלצה מחושבת כאן ולא נשמרה — לכן היא נכונה גם אחרי שינוי בלוגיקה. */
function SuggestionLine({
  ex,
  previous,
}: {
  ex: LoggedExercise;
  previous: LoggedExercise | null;
}) {
  const suggestion = getProgressionSuggestion(ex, previous);
  if (suggestion.kind === 'none') return null;
  return (
    <p className="tiny muted" style={{ margin: '2px 0 0' }}>
      {suggestion.text}
    </p>
  );
}

export default function WorkoutScreen({ store, today }: ScreenProps) {
  const { db } = store;
  const [week, setWeek] = useWeek(today);
  /** אימון חדש שעדיין אין בו נתונים — קיים רק במסך, לא באחסון. */
  const [draft, setDraft] = useState<WorkoutEntry | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [focus, setFocus] = useState(0);
  const timer = useRestTimer(db.settings.soundEnabled);

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

  // אימון שנמחק מבחוץ (ייבוא, מחיקה גורפת) לא נשאר פתוח על ריק.
  useEffect(() => {
    if (openId && !db.workouts.some((w) => w.id === openId)) setOpenId(null);
  }, [openId, db.workouts]);

  const defaultDate = compareISO(week, weekStart(today)) === 0 ? today : weekEnd(week);

  /** תרגיל שירד מהתוכנית עדיין ניתן לעריכה, לפי מה שנשמר איתו. */
  const specOf = (log: LoggedExercise) =>
    exerciseById(log.exerciseId) ?? {
      id: log.exerciseId,
      name: log.n,
      short: log.n,
      machine: null,
      muscles: [],
      type: log.type,
      sets: log.sets.length,
      repRangeMin: log.targetRepMin,
      repRangeMax: log.targetRepMax,
      unilateral: false,
      isTimed: isTimedExercise(log),
      bodyweightOnly: log.bodyweightOnly,
      note: null,
    };

  /** פותח אימון חדש כטיוטה. לחיצה בטעות לא יוצרת אימון ריק בהיסטוריה. */
  const startWorkout = (t: WorkoutType) => {
    const d = defaultDate;
    setOpenId(null);
    setFocus(0);
    setDraft({
      id: makeWorkoutId(d, t, newId()),
      d,
      t,
      ex: prefilledExercises(db.workouts, t),
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

  /**
   * הזנת סט פותחת מנוחה אוטומטית.
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
              אימון {open.t} · <span className="num">{formatDM(open.d)}</span>
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
              תרגיל <span className="num">{focus + 1}</span> מתוך{' '}
              <span className="num">{rows.length}</span>
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
                  {i + 1}
                </button>
              ))}
            </div>
          </div>

          {current && (
            <ExerciseFocus
              key={current.exerciseId}
              spec={specOf(current)}
              log={current}
              previous={lastExercise(db.workouts, current.exerciseId, open.id)}
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
        <h2 style={{ marginBottom: 'var(--sp-3)' }}>היסטוריה</h2>
        {history.length === 0 ? (
          <p className="muted small" style={{ margin: 0 }}>
            אין אימונים.
          </p>
        ) : (
          <ul className="list list--block">
            {history.map((w) => (
              <li key={w.id}>
                <div className="row">
                  <button
                    type="button"
                    className="btn btn--quiet grow"
                    style={{ justifyContent: 'flex-start', textAlign: 'start' }}
                    aria-expanded={expanded === w.id}
                    onClick={() => setExpanded(expanded === w.id ? null : w.id)}
                  >
                    <span className="num">{formatDM(w.d)}</span>
                    <span className="muted tiny">{dayLetter(w.d)}</span>
                    <span className="strong">{w.t}</span>
                    <span className="muted tiny">
                      {w.ex.filter(hasData).length} תרגילים
                    </span>
                  </button>
                  <button
                    type="button"
                    className="btn btn--quiet"
                    onClick={() => {
                      setDraft(null);
                      setOpenId(w.id);
                      setWeek(weekStart(w.d));
                      setExpanded(null);
                      setFocus(0);
                    }}
                  >
                    ערוך
                  </button>
                </div>
                {expanded === w.id && (
                  <div className="stack--tight" style={{ padding: 'var(--sp-2) 0' }}>
                    <ul className="list list--block small">
                      {w.ex.filter(hasData).map((e) => (
                        <li key={e.exerciseId}>
                          <div>{exerciseLine(e)}</div>
                          <SuggestionLine
                            ex={e}
                            previous={
                              previousRecord(db.workouts, e.exerciseId, {
                                d: w.d,
                                id: w.id,
                              })?.ex ?? null
                            }
                          />
                          <Sparkline
                            label={`מגמת ${e.n}`}
                            values={exerciseHistory(db.workouts, e.exerciseId)
                              .map((h) => lastWeightOf(h.ex))
                              .filter((v): v is number => v !== null)}
                          />
                        </li>
                      ))}
                    </ul>
                    <p className="tiny muted" style={{ margin: 0 }}>
                      כאב: ברך <span className="num">{w.knee ?? DASH}</span> · כתף{' '}
                      <span className="num">{w.shoulder ?? DASH}</span>
                    </p>
                    <ConfirmButton
                      ariaLabel={`מחק אימון ${w.t} של ${formatDMY(w.d)}`}
                      onConfirm={() =>
                        void store.update('workouts', removeWorkout(db.workouts, w.id))
                      }
                    />
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <RestTimerBar
        timer={timer}
        soundEnabled={db.settings.soundEnabled}
        onToggleSound={(soundEnabled) =>
          void store.update('settings', { ...db.settings, soundEnabled })
        }
      />
    </div>
  );
}
