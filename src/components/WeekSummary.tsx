import type { ISODate } from '../types';
import type { WeekReport } from '../lib/weekSummary';
import { WEEK_LENGTH } from '../lib/weights';
import { compareISO, dayLetter, formatDM, weekDays } from '../lib/date';
import { DASH } from '../lib/format';

type Props = { report: WeekReport; today: ISODate };

function fixed(v: number | null, digits: number): string {
  return v === null ? DASH : v.toFixed(digits);
}

/**
 * סיכום השבוע במסך — אותם נתונים שהדוח לצ'אט מכיל, לקריאה בלי להעתיק.
 * אריחים לארבעת המספרים, ואחריהם הפירוט. שבוע חלקי נאמר במפורש, ושורת
 * "שינוי" פשוט לא מציגה מספר בו — אותם כללים של הדוח.
 */
export default function WeekSummary({ report, today }: Props) {
  const { weight, waist, workouts, gaps } = report;
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
        <div className="stat" role="listitem">
          <span className="stat__label">ממוצע השבוע</span>
          <span className="stat__value num">{fixed(cur.avg, 2)}</span>
          <span className="stat__note num">
            {cur.count}/{WEEK_LENGTH} שקילות
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
          <span className="stat__label">אימונים</span>
          <span className="stat__value num">
            {workouts.done}/{workouts.planned}
          </span>
          <span className="stat__note">
            {workouts.items.length ? workouts.items.map((w) => w.t).join(' · ') : DASH}
          </span>
        </div>
        <div className="stat" role="listitem">
          <span className="stat__label">מותניים</span>
          <span className="stat__value num">{fixed(waist.now, 1)}</span>
          <span className="stat__note num">קודם {fixed(waist.previous, 1)}</span>
        </div>
      </div>

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

      <div>
        <p className="label" style={{ marginBottom: 'var(--sp-1)' }}>
          אימונים
        </p>
        {workouts.items.length === 0 ? (
          <p className="muted small" style={{ margin: 0 }}>
            לא נרשמו אימונים השבוע.
          </p>
        ) : (
          <ul className="list list--block small">
            {workouts.items.map((w) => (
              <li key={w.id}>
                <div>
                  <span className="num">{formatDM(w.d)}</span>{' '}
                  <span className="muted tiny">{dayLetter(w.d)}</span>{' '}
                  <span className="strong">{w.t}</span> — {w.text}
                </div>
                {w.skipped.length > 0 && (
                  <p className="tiny muted" style={{ margin: 0 }}>
                    דולגו: {w.skipped.join(', ')}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
        <p className="tiny muted" style={{ margin: 'var(--sp-1) 0 0' }}>
          כאב: ברך <span className="num">{workouts.knee ?? DASH}</span> · כתף{' '}
          <span className="num">{workouts.shoulder ?? DASH}</span>
        </p>
      </div>

      <p className="small" style={{ margin: 0 }}>
        <span className="muted">חסר:</span> {gaps.length ? gaps.join(' · ') : DASH}
      </p>
    </div>
  );
}
