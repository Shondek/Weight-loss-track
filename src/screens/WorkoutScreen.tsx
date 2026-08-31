import { useEffect, useMemo, useState } from 'react';
import type { ScreenProps } from './types';
import { useWeek } from '../useWeek';
import type { ExerciseLog, WorkoutEntry, WorkoutType } from '../types';
import {
  CONSTRAINTS,
  PROGRAM,
  WORKOUTS_PER_WEEK,
  WORKOUT_TYPES,
  isTimed,
  specFor,
} from '../data/program';
import {
  hasData,
  isWorkoutEmpty,
  lastExercise,
  makeWorkoutId,
  nextType,
  prefilledExercises,
  sortableStamp,
  removeWorkout,
  sortWorkouts,
  upsertWorkout,
  workoutsInWeek,
} from '../lib/workouts';
import { compareISO, dayLetter, formatDM, formatDMY, weekEnd, weekNumber, weekStart } from '../lib/date';
import { programStartWeek } from '../lib/db';
import { clean, DASH } from '../lib/format';
import WeekNav from '../components/WeekNav';
import DateField from '../components/DateField';
import Choice from '../components/Choice';
import ConfirmButton from '../components/ConfirmButton';
import ExerciseRow from '../components/ExerciseRow';

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

/** תרגילי התוכנית + תרגילים שנרשמו בעבר ואינם בתוכנית הנוכחית. */
function exercisesFor(entry: WorkoutEntry, all: readonly WorkoutEntry[]): ExerciseLog[] {
  const planned = PROGRAM[entry.t];
  const byName = new Map(entry.ex.map((e) => [e.n, e]));
  const rows: ExerciseLog[] = planned.map((spec) => {
    const existing = byName.get(spec.n);
    if (existing) return existing;
    // שורה שלא נשמרה עדיין — מאכלסים את המשקל האחרון כברירת מחדל.
    return {
      n: spec.n,
      w: spec.kind === 'time' ? null : (lastExercise(all, spec.n, entry.id)?.w ?? null),
      r: [null, null, null],
    };
  });
  const plannedNames = new Set(planned.map((s) => s.n));
  for (const e of entry.ex) if (!plannedNames.has(e.n) && hasData(e)) rows.push(e);
  return rows;
}

function summaryLine(entry: WorkoutEntry): string {
  const parts = entry.ex.filter(hasData).map((e) => {
    const sets = e.r.map((v) => (v === null ? DASH : String(v))).join(',');
    if (isTimed(e.n)) return `${e.n} ${sets} שנ׳`;
    return `${e.n} ${e.w === null ? DASH : clean(e.w)}×${sets}`;
  });
  return parts.length ? parts.join(' · ') : 'לא נרשמו תרגילים';
}

export default function WorkoutScreen({ store, today }: ScreenProps) {
  const { db } = store;
  const [week, setWeek] = useWeek(today);
  /** אימון חדש שעדיין אין בו נתונים — קיים רק במסך, לא באחסון. */
  const [draft, setDraft] = useState<WorkoutEntry | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const start = useMemo(() => programStartWeek(db), [db]);
  const inWeek = useMemo(() => workoutsInWeek(db.workouts, week), [db.workouts, week]);
  const upNext = useMemo(() => nextType(db.workouts), [db.workouts]);
  const history = useMemo(
    () => sortWorkouts(db.workouts).slice(-HISTORY_COUNT).reverse(),
    [db.workouts],
  );

  const stored = openId ? (db.workouts.find((w) => w.id === openId) ?? null) : null;
  const open = draft ?? stored;

  // אימון שנמחק מבחוץ (ייבוא, מחיקה גורפת) לא נשאר פתוח על ריק.
  useEffect(() => {
    if (openId && !db.workouts.some((w) => w.id === openId)) setOpenId(null);
  }, [openId, db.workouts]);

  const defaultDate = compareISO(week, weekStart(today)) === 0 ? today : weekEnd(week);

  /** פותח אימון חדש כטיוטה. לחיצה בטעות לא יוצרת אימון ריק בהיסטוריה. */
  const startWorkout = (t: WorkoutType) => {
    const d = defaultDate;
    setOpenId(null);
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

          {exercisesFor(open, db.workouts).map((log) => {
            const spec = specFor(log.n) ?? {
              n: log.n,
              short: log.n,
              kind: 'reps' as const,
              min: 8,
              max: 12,
              step: 2.5,
              increment: 5,
            };
            return (
              <ExerciseRow
                key={log.n}
                spec={spec}
                log={log}
                previous={lastExercise(db.workouts, log.n, open.id)}
                onChange={(next) => {
                  const others = exercisesFor(open, db.workouts).map((e) =>
                    e.n === next.n ? next : e,
                  );
                  patch({ ...open, ex: others });
                }}
              />
            );
          })}

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
                    }}
                  >
                    ערוך
                  </button>
                </div>
                {expanded === w.id && (
                  <div className="stack--tight" style={{ padding: 'var(--sp-2) 0' }}>
                    <p className="small" style={{ margin: 0 }}>
                      {summaryLine(w)}
                    </p>
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
    </div>
  );
}
