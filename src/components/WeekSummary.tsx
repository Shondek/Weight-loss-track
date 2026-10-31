import type { ISODate } from '../types';
import type { WeekReport } from '../lib/weekSummary';
import { WEEK_LENGTH } from '../lib/weights';
import { compareISO, dayLetter, formatDM, weekDays } from '../lib/date';
import { DASH } from '../lib/format';
import { ListRow, Num, SectionHeader, StatusChip } from '../ui';
import { confidenceOf } from './confidence';

type Props = { report: WeekReport; today: ISODate };

function fixed(v: number | null, digits: number): string {
  return v === null ? DASH : v.toFixed(digits);
}

/** מלאות השבוע כמילה + צבע (F20): "מלא 7/7", "חלקי 5/7", "אין שקילות". */
function fullnessChip(count: number) {
  const level = confidenceOf(count);
  if (count === 0) return <StatusChip tone="missing">אין שקילות</StatusChip>;
  return (
    <StatusChip tone={level === 'high' ? 'done' : level === 'mid' ? 'partial' : 'missing'}>
      {level === 'high' ? 'מלא' : 'חלקי'} <Num>{count}/{WEEK_LENGTH}</Num>
    </StatusChip>
  );
}

/**
 * סיכום השבוע במסך — אותם נתונים שהדוח לצ'אט מכיל, לקריאה בלי להעתיק.
 * אריחים לחמשת המספרים, ואחריהם מקטעים ברורים: שקילות השבוע, אימונים,
 * אירובי עצמאי, חסר. שבוע חלקי נאמר במפורש (צ'יפ), ושורת "שינוי" פשוט לא
 * מציגה מספר בו — אותם כללים של הדוח. הנתונים: `buildWeekSummary` בלבד.
 */
export default function WeekSummary({ report, today }: Props) {
  const { weight, waist, workouts, cardio, gaps } = report;
  const cur = weight.current;
  const prev = weight.previous;

  let changeValue = DASH;
  let changeNote = '';
  if (weight.change) {
    const c = weight.change;
    changeValue =
      c.direction === 'same'
        ? '0.00'
        : `${c.direction === 'down' ? '−' : '+'}${c.drop.toFixed(2)}`;
    changeNote = c.direction === 'same' ? 'ללא שינוי' : `${c.pct.toFixed(2)}%`;
  } else if (weight.noComparison === 'current-partial') {
    changeNote = `השבוע חלקי (${cur.count}/${WEEK_LENGTH})`;
  } else if (weight.noComparison === 'previous-partial') {
    changeNote = `שבוע קודם חלקי (${prev.count}/${WEEK_LENGTH})`;
  }

  return (
    <div className="stack">
      <div className="stats" role="list">
        {/* המלאות (7/7, 4–6, פחות) כמילה בצ'יפ — לא צבע מסגרת לבד. */}
        <div className="stat stat--wide" role="listitem">
          <span className="stat__label">ממוצע השבוע</span>
          <span className="stat__row">
            <span className="stat__value num">{fixed(cur.avg, 2)}</span>
            {fullnessChip(cur.count)}
          </span>
        </div>
        <div className="stat" role="listitem">
          <span className="stat__label">שינוי מהשבוע הקודם</span>
          <span className="stat__value num">{changeValue}</span>
          <span className="stat__note">
            {changeNote || `קודם ${fixed(prev.avg, 2)}`}
          </span>
        </div>
        <div className="stat" role="listitem">
          <span className="stat__label">מותניים</span>
          <span className="stat__value num">{fixed(waist.now, 1)}</span>
          <span className="stat__note num">קודם {fixed(waist.previous, 1)}</span>
        </div>
        <div className="stat" role="listitem">
          <span className="stat__label">אימונים</span>
          <span className="stat__value num">
            {workouts.done}/{workouts.planned}
          </span>
          <span className="stat__note">
            {workouts.items.length ? workouts.items.map((w) => w.t).join(' · ') : DASH}
          </span>
        </div>
        {/* אירובי בדקות, לא במפגשים — ולא חלק מ"אימונים". */}
        <div className="stat" role="listitem">
          <span className="stat__label">אירובי (דק׳)</span>
          <span className="stat__value num">
            {cardio.total}/{cardio.budget}
          </span>
          <span className="stat__note num">
            סיום {cardio.finisher} · עצמאי {cardio.standalone}
            {cardio.steps !== null ? ` · ${cardio.steps.toLocaleString('en-US')} צעדים` : ''}
          </span>
        </div>
      </div>

      <div>
        <SectionHeader level={3} title="שקילות השבוע" aside={<Num>{cur.count}/{WEEK_LENGTH}</Num>} />
        <div className="week-grid" aria-label="שקילות השבוע">
          {weekDays(report.week).map((d, i) => {
            const v = cur.days[i] ?? null;
            const future = compareISO(d, today) > 0;
            return (
              <div
                key={d}
                className={`day${d === today ? ' day--today' : ''}${future ? ' day--future' : ''}`}
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
      </div>

      <div>
        <SectionHeader
          level={3}
          title="אימונים"
          aside={
            <>
              כאב: ברך <Num>{workouts.knee ?? DASH}</Num> · כתף <Num>{workouts.shoulder ?? DASH}</Num>
            </>
          }
        />
        {workouts.items.length === 0 ? (
          <p className="muted small" style={{ margin: 0 }}>
            לא נרשמו אימונים השבוע.
          </p>
        ) : (
          <div className="listrows">
            {workouts.items.map((w) => (
              <ListRow
                key={w.id}
                title={
                  <>
                    <span className="strong">{w.t}</span> · <Num>{formatDM(w.d)}</Num>{' '}
                    <span className="muted tiny">{dayLetter(w.d)}</span>
                  </>
                }
                sub={
                  <>
                    {w.text}
                    {w.skipped.length > 0 && <> · דולגו: {w.skipped.join(', ')}</>}
                  </>
                }
                wrap
              />
            ))}
          </div>
        )}
        {/* אימון D (אופציונלי, 25/10/2026): לא ב-n/3 — רשימה משלו. */}
        {workouts.optional.length > 0 && (
          <div className="listrows" style={{ marginTop: 'var(--sp-2)' }}>
            {workouts.optional.map((w) => (
              <ListRow
                key={w.id}
                title={
                  <>
                    <span className="muted">אימון D</span> · <Num>{formatDM(w.d)}</Num>{' '}
                    <span className="muted tiny">{dayLetter(w.d)}</span>
                  </>
                }
                sub={
                  <>
                    {w.text}
                    {w.skipped.length > 0 && <> · דולגו: {w.skipped.join(', ')}</>}
                  </>
                }
                wrap
              />
            ))}
          </div>
        )}
      </div>

      {cardio.standaloneItems.length > 0 && (
        <div>
          <SectionHeader level={3} title="אירובי עצמאי" />
          <div className="listrows">
            {cardio.standaloneItems.map((e) => (
              <ListRow
                key={e.id}
                title={
                  <>
                    <Num>{formatDM(e.d)}</Num> <span className="muted tiny">{dayLetter(e.d)}</span> — {e.text}
                  </>
                }
                sub={[e.detail, e.note.trim() !== '' ? e.note : null].filter(Boolean).join(' · ') || undefined}
                wrap
              />
            ))}
          </div>
        </div>
      )}

      <p className="small" style={{ margin: 0 }}>
        <span className="muted">חסר:</span> {gaps.length ? gaps.join(' · ') : DASH}
      </p>
    </div>
  );
}
