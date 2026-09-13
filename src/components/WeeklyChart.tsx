import { useRef } from 'react';
import type { WeekSummary } from '../lib/weights';
import { formatDM } from '../lib/date';
import { useElementWidth } from './useElementWidth';

type Props = { weeks: WeekSummary[] };

const H = 96;
const PAD_TOP = 12;
const PAD_BOTTOM = 24;
const PAD_X = 10;
/** שוליים בצד שמאל לתוויות הערך (גבול עליון ותחתון של הציר). */
const GUTTER = 40;
const R = 3;
/**
 * רצפה לטווח ציר ה-Y, בק"ג. בלי רצפה, 0.3 ק"ג על פני שמונה שבועות נראים
 * כמו מדרון; המסך הזה אמור להראות "משקל תקוע" כתקוע.
 */
const MIN_SPAN = 1;

/**
 * ממוצעים שבועיים בלבד — לא שקילות יומיות.
 * שבוע חלקי מסומן בנקודה חלולה. בלי צבע, בלי אנימציה, בלי צירים.
 * הזמן זורם מימין לשמאל, כמו שאר הממשק.
 */
export default function WeeklyChart({ weeks }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const width = useElementWidth(box);

  const points = weeks.filter((w): w is WeekSummary & { avg: number } => w.avg !== null);

  let body = null;
  if (width > 40 && points.length >= 2) {
    const values = points.map((p) => p.avg);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = Math.max(max - min, MIN_SPAN);
    // כשהרצפה גוברת, הסדרה ממורכזת בתוך הטווח. lo/hi הם גבולות הציר,
    // ושווים בדיוק ל-min/max כשהרצפה לא נדרשה.
    const lo = min - (span - (max - min)) / 2;
    const hi = lo + span;
    const innerW = width - PAD_X - GUTTER;
    const innerH = H - PAD_TOP - PAD_BOTTOM;

    // x=0 הוא הימני ביותר (השבוע המוקדם) — כיוון הזמן ב-RTL.
    const xy = points.map((p, i) => {
      const t = points.length === 1 ? 0 : i / (points.length - 1);
      const x = width - PAD_X - t * innerW;
      const y = PAD_TOP + (1 - (p.avg - lo) / span) * innerH;
      return { x, y, complete: p.complete, week: p.weekStart, avg: p.avg };
    });

    body = (
      <svg
        className="chart"
        width={width}
        height={H}
        viewBox={`0 0 ${width} ${H}`}
        role="img"
        aria-label={`ממוצעים שבועיים: ${points
          .map((p) => `${formatDM(p.weekStart)} ${p.avg.toFixed(2)}${p.complete ? '' : ' חלקי'}`)
          .join(', ')}`}
      >
        <polyline
          points={xy.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')}
          fill="none"
          stroke="var(--ink)"
          strokeWidth="1.25"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {xy.map((p) => (
          <circle
            key={p.week}
            cx={p.x}
            cy={p.y}
            r={R}
            fill={p.complete ? 'var(--ink)' : 'var(--paper)'}
            stroke="var(--ink)"
            strokeWidth="1.25"
          />
        ))}
        <text
          x={width - PAD_X}
          y={H - 4}
          fontSize="11"
          fill="var(--ink-3)"
          textAnchor="end"
          direction="ltr"
        >
          {formatDM(points[0]!.weekStart)}
        </text>
        <text x={GUTTER} y={H - 4} fontSize="11" fill="var(--ink-3)" textAnchor="start" direction="ltr">
          {formatDM(points[points.length - 1]!.weekStart)}
        </text>
        {/* גבולות הציר. בלי קווי רשת — רק שני מספרים שנותנים קנה מידה. */}
        <text className="num chart__value" x={0} y={PAD_TOP + 4} textAnchor="start" direction="ltr">
          {hi.toFixed(2)}
        </text>
        <text
          className="num chart__value"
          x={0}
          y={PAD_TOP + innerH + 4}
          textAnchor="start"
          direction="ltr"
        >
          {lo.toFixed(2)}
        </text>
      </svg>
    );
  }

  return (
    <div ref={box} style={{ minHeight: H }}>
      {body}
    </div>
  );
}
