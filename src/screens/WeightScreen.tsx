import { useMemo, useState } from 'react';
import type { ScreenProps } from './types';
import { useWeek } from '../useWeek';
import Stepper from '../components/Stepper';
import ConfirmButton from '../components/ConfirmButton';
import DateField from '../components/DateField';
import WeekNav from '../components/WeekNav';
import WeeklyChart from '../components/WeeklyChart';
import {
  addDays,
  compareISO,
  dayLetter,
  formatDM,
  formatDMY,
  weekDays,
  weekNumber,
} from '../lib/date';
import {
  daysSinceWaist,
  lastWaist,
  lastWeight,
  removeWaist,
  removeWeight,
  sortWeights,
  summarizeWeek,
  upsertWaist,
  upsertWeight,
  waistBeforeWeek,
  waistInWeek,
  weekChange,
  weeklyAverages,
  WAIST_REMINDER_DAYS,
  WEEK_LENGTH,
} from '../lib/weights';
import { MAX_WAIST, MAX_WEIGHT, MIN_WAIST, MIN_WEIGHT } from '../lib/schema';
import { programStartWeek } from '../lib/db';
import { DASH } from '../lib/format';

const RECENT_COUNT = 10;
const MIN_FULL_WEEKS_FOR_CHART = 3;

export default function WeightScreen({ store, today }: ScreenProps) {
  const { db } = store;
  const [week, setWeek] = useWeek(today);
  const [entryDate, setEntryDate] = useState(today);
  const [draft, setDraft] = useState<number | null>(null);
  const [waistDate, setWaistDate] = useState(today);
  const [waistDraft, setWaistDraft] = useState<number | null>(null);

  const weeks = useMemo(() => weeklyAverages(db.weights), [db.weights]);
  const current = useMemo(() => summarizeWeek(db.weights, week), [db.weights, week]);
  const previous = useMemo(
    () => summarizeWeek(db.weights, addDays(week, -7)),
    [db.weights, week],
  );
  const change = useMemo(() => weekChange(current, previous), [current, previous]);
  const start = useMemo(() => programStartWeek(db), [db]);
  const last = useMemo(() => lastWeight(db.weights), [db.weights]);

  // ברירת המחדל של השדה היא השקילה האחרונה: לאשר או לשנות, לא להקליד מחדש.
  const existing = db.weights.find((e) => e.d === entryDate) ?? null;
  const weightValue = draft ?? existing?.w ?? last?.w ?? null;

  const waistLast = useMemo(() => lastWaist(db.waist), [db.waist]);
  const waistExisting = db.waist.find((e) => e.d === waistDate) ?? null;
  const waistValue = waistDraft ?? waistExisting?.cm ?? waistLast?.cm ?? null;
  const sinceWaist = useMemo(() => daysSinceWaist(db.waist, today), [db.waist, today]);
  const waistThisWeek = useMemo(() => waistInWeek(db.waist, week), [db.waist, week]);
  const waistPrev = useMemo(() => waistBeforeWeek(db.waist, week), [db.waist, week]);

  const fullWeeks = weeks.filter((w) => w.complete).length;
  const recent = useMemo(() => sortWeights(db.weights).slice(-RECENT_COUNT).reverse(), [db.weights]);
  const missing = WEEK_LENGTH - current.count;

  const saveWeight = () => {
    if (weightValue === null) return;
    void store.update('weights', upsertWeight(db.weights, { d: entryDate, w: weightValue }));
    setDraft(null);
  };

  const saveWaist = () => {
    if (waistValue === null) return;
    void store.update('waist', upsertWaist(db.waist, { d: waistDate, cm: waistValue }));
    setWaistDraft(null);
  };

  return (
    <div className="stack--loose">
      {(sinceWaist === null || sinceWaist >= WAIST_REMINDER_DAYS) && db.weights.length > 0 && (
        <p className="notice" style={{ margin: 0 }}>
          {sinceWaist === null
            ? 'מותניים: אין עדיין מדידה.'
            : `מותניים: עברו ${sinceWaist} ימים מהמדידה האחרונה.`}
        </p>
      )}

      <section className="section section--first">
        <WeekNav
          week={week}
          onChange={setWeek}
          today={today}
          weekNo={start ? weekNumber(start, week) : null}
        />

        <div style={{ marginTop: 'var(--sp-4)' }}>
          <p className={`hero${current.avg === null ? ' hero--empty' : ''}`} style={{ margin: 0 }}>
            <span className="num">
              {current.avg === null ? DASH : current.avg.toFixed(2)}
            </span>
          </p>
          <p className="sub" style={{ margin: '6px 0 0' }}>
            <span className="num">{current.count}</span> מתוך{' '}
            <span className="num">{WEEK_LENGTH}</span> שקילות ·{' '}
            {current.complete ? 'שבוע מלא' : `חלקי (${current.count}/7)`}
          </p>

          <div className="stack--tight" style={{ marginTop: 'var(--sp-3)' }}>
            {current.complete ? (
              <>
                <p className="sub" style={{ margin: 0 }}>
                  שבוע קודם:{' '}
                  <span className="num">
                    {previous.avg === null ? DASH : previous.avg.toFixed(2)}
                  </span>{' '}
                  ({previous.count}/7)
                </p>
                <p style={{ margin: 0 }}>
                  {change ? (
                    <>
                      {change.direction === 'same'
                        ? 'ללא שינוי'
                        : `${change.direction === 'down' ? 'ירידה' : 'עלייה'} `}
                      {change.direction !== 'same' && (
                        <>
                          <span className="num">{change.drop.toFixed(2)}</span> ק"ג (
                          <span className="num">{change.pct.toFixed(2)}%</span>)
                        </>
                      )}
                    </>
                  ) : (
                    <span className="muted">
                      השבוע הקודם חלקי ({previous.count}/7) — אין השוואה
                    </span>
                  )}
                </p>
              </>
            ) : (
              <p className="muted" style={{ margin: 0 }}>
                חסרות <span className="num">{missing}</span>{' '}
                {missing === 1 ? 'שקילה' : 'שקילות'} להשוואה מול השבוע הקודם.
              </p>
            )}
          </div>
        </div>

        <div className="week-grid" style={{ marginTop: 'var(--sp-4)' }}>
          {weekDays(week).map((d, i) => {
            const v = current.days[i] ?? null;
            const isToday = d === today;
            const future = compareISO(d, today) > 0;
            return (
              <div
                key={d}
                className={`day${isToday ? ' day--today' : ''}${future ? ' day--future' : ''}`}
              >
                <span className="day__letter">{dayLetter(d)}</span>
                {v === null ? (
                  <span className="day__empty">{formatDM(d)}</span>
                ) : (
                  <span className="day__value">{v.toFixed(1)}</span>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <section className="section">
        <div className="section__head">
          <h2>שקילה</h2>
          {existing && <span className="tiny muted">נרשם כבר — שמירה תעדכן</span>}
        </div>
        <div className="stack">
          <DateField
            label="תאריך"
            value={entryDate}
            max={today}
            onChange={(d) => {
              setEntryDate(d);
              setDraft(null);
            }}
          />
          <Stepper
            label="משקל"
            unit='ק"ג'
            value={weightValue}
            onChange={setDraft}
            step={0.1}
            min={MIN_WEIGHT}
            max={MAX_WEIGHT}
            decimals={1}
            placeholder="0.0"
            hint={last ? `אחרון: ${last.w.toFixed(1)} · ${formatDM(last.d)}` : undefined}
          />
          <button
            type="button"
            className="btn btn--primary btn--block"
            disabled={weightValue === null}
            onClick={saveWeight}
          >
            {existing ? 'עדכן שקילה' : 'שמור שקילה'}
          </button>
        </div>
      </section>

      <section className="section">
        <div className="section__head">
          <h2>מותניים</h2>
          <span className="tiny muted">בוקר, בטבור, פעם בשבוע</span>
        </div>
        <div className="stack">
          <p className="sub" style={{ margin: 0 }}>
            השבוע:{' '}
            <span className="num">
              {waistThisWeek ? waistThisWeek.cm.toFixed(1) : DASH}
            </span>
            {waistPrev && (
              <>
                {' '}
                · קודם <span className="num">{waistPrev.cm.toFixed(1)}</span> (
                <span className="num">{formatDM(waistPrev.d)}</span>)
              </>
            )}
          </p>
          <DateField
            label="תאריך"
            value={waistDate}
            max={today}
            onChange={(d) => {
              setWaistDate(d);
              setWaistDraft(null);
            }}
          />
          <Stepper
            label="היקף מותניים"
            unit={'ס"מ'}
            value={waistValue}
            onChange={setWaistDraft}
            step={0.5}
            min={MIN_WAIST}
            max={MAX_WAIST}
            decimals={1}
            placeholder="0.0"
          />
          <div className="row">
            <button
              type="button"
              className="btn btn--block"
              disabled={waistValue === null}
              onClick={saveWaist}
            >
              {waistExisting ? 'עדכן מדידה' : 'שמור מדידה'}
            </button>
            {waistExisting && (
              <ConfirmButton
                className="btn btn--danger"
                ariaLabel={`מחק מדידת מותניים של ${formatDMY(waistDate)}`}
                onConfirm={() => void store.update('waist', removeWaist(db.waist, waistDate))}
              />
            )}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="section__head">
          <h2>ממוצעים שבועיים</h2>
          <span className="tiny muted">
            <span className="num">{fullWeeks}</span> שבועות מלאים
          </span>
        </div>
        {fullWeeks >= MIN_FULL_WEEKS_FOR_CHART ? (
          <>
            <WeeklyChart weeks={weeks} />
            <p className="tiny muted" style={{ margin: '4px 0 0' }}>
              נקודה חלולה = שבוע חלקי. הזמן זורם מימין לשמאל.
            </p>
          </>
        ) : (
          <p className="muted small" style={{ margin: 0 }}>
            הגרף נפתח אחרי <span className="num">{MIN_FULL_WEEKS_FOR_CHART}</span> שבועות
            מלאים. יש <span className="num">{fullWeeks}</span>.
          </p>
        )}
      </section>

      <section className="section">
        <h2 style={{ marginBottom: 'var(--sp-3)' }}>שקילות אחרונות</h2>
        {recent.length === 0 ? (
          <p className="muted small" style={{ margin: 0 }}>
            אין שקילות.
          </p>
        ) : (
          <ul className="list">
            {recent.map((e) => (
              <li key={e.d}>
                <span className="grow">
                  <span className="num">{formatDMY(e.d)}</span>{' '}
                  <span className="muted small">{dayLetter(e.d)}</span>
                </span>
                <span className="num strong">{e.w.toFixed(1)}</span>
                <ConfirmButton
                  ariaLabel={`מחק שקילה של ${formatDMY(e.d)}`}
                  onConfirm={() => void store.update('weights', removeWeight(db.weights, e.d))}
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
