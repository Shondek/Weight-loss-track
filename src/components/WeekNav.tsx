import { addDays, compareISO, weekRangeLabel, weekStart } from '../lib/date';
import type { ISODate } from '../types';

type Props = {
  week: ISODate;
  onChange: (ws: ISODate) => void;
  today: ISODate;
  /** מספר השבוע בתוכנית, אם ידוע. */
  weekNo?: number | null | undefined;
};

/**
 * ניווט בין שבועות. שבוע עתידי חסום.
 * ב-RTL "אחורה בזמן" הוא ימינה, ולכן הכפתור הראשון (הימני) הוא הקודם.
 */
export default function WeekNav({ week, onChange, today, weekNo }: Props) {
  const current = weekStart(today);
  const atCurrent = week === current;
  const canForward = compareISO(week, current) < 0;

  return (
    <div className="stack--tight">
      <div className="weeknav">
        <button
          type="button"
          className="btn btn--step"
          aria-label="שבוע קודם"
          onClick={() => onChange(addDays(week, -7))}
        >
          ›
        </button>
        <div className="weeknav__label">
          {weekNo ? <span>שבוע {weekNo} · </span> : null}
          <span className="num">{weekRangeLabel(week)}</span>
        </div>
        <button
          type="button"
          className="btn btn--step"
          aria-label="שבוע הבא"
          disabled={!canForward}
          onClick={() => canForward && onChange(addDays(week, 7))}
        >
          ‹
        </button>
      </div>
      {!atCurrent && (
        <button type="button" className="btn btn--quiet" onClick={() => onChange(current)}>
          חזרה לשבוע הנוכחי
        </button>
      )}
    </div>
  );
}
