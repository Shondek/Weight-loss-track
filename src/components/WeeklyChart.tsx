import { useRef } from 'react';
import type { WeekSummary } from '../lib/weights';
import { formatDM } from '../lib/date';
import { useElementWidth } from './useElementWidth';

type Props = { weeks: WeekSummary[] };

const H = 112;
const PAD_TOP = 12;
const PAD_BOTTOM = 24;
const PAD_X = 10;
/** שוליים בצד שמאל לתוויות הערך (גבול עליון ותחתון של הציר). */
const GUTTER = 40;
const R = 3;
const R_DAY = 1.75;
/**
 * רצפה לטווח ציר ה-Y, בק"ג. בלי רצפה, 0.3 ק"ג על פני שמונה שבועות נראים
 * כמו מדרון; המסך הזה אמור להראות "משקל תקוע" כתקוע.
 */
const MIN_SPAN = 1;

/**
 * ממוצעים שבועיים כקו מרווה (שבוע חלקי — נקודה חלולה), ושקילות יומיות
 * כנקודות צפחה קטנות סביבו. בלי קווי רשת, בלי אנימציה; שני מספרים בקצה
 * הציר נותנים קנה מידה. הזמן זורם מימין לשמאל, כמו שאר הממשק.
 */
export default function WeeklyChart({ weeks }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const width = useElementWidth(box);

  const points = weeks.filter((w): w is WeekSummary & { avg: number } => w.avg !== null);

  let body = null;
  if (width > 40 && points.length >= 2) {
    const daily = weeks.flatMap((w, i) => w.days.flatMap((v, j) => (v === null ? [] : [{ i, j, v }])));
    const values = [...points.map((p) => p.avg), ...daily.map((d) => d.v)];
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = Math.max(max - min, MIN_SPAN);
    // כשהרצפה גוברת, הסדרה ממורכזת בתוך הטווח. lo/hi הם גבולות הציר,
    // ושווים בדיוק ל-min/max כשהרצפה לא נדרשה.
    const lo = min - (span - (max - min)) / 2;
    const hi = lo + span;
    const innerW = width - PAD_X - GUTTER;
    const innerH = H - PAD_TOP - PAD_BOTTOM;
    const n = weeks.length;
    const step = n > 1 ? innerW / (n - 1) : 0;

    // x=0 הוא הימני ביותר (השבוע המוקדם) — כיוון הזמן ב-RTL. כל שבוע
    // תופס "צעד" אחד; הימים שלו פרוסים סביב מרכזו, ראשון מימין לשבת משמאל.
    const xOfWeek = (i: number) => width - PAD_X - i * step;
    const yOf = (v: number) => PAD_TOP + (1 - (v - lo) / span) * innerH;
    const xy = points.map((p) => {
      const i = weeks.indexOf(p);
      return { x: xOfWeek(i), y: yOf(p.avg), complete: p.complete, week: p.weekStart, avg: p.avg };
    });
    const dots = daily.map((d) => ({ x: xOfWeek(d.i) + ((3 - d.j) / 7) * step, y: yOf(d.v), key: `${d.i}-${d.j}` }));

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
        {dots.map((d) => (
          <circle key={d.key} cx={d.x} cy={d.y} r={R_DAY} fill="var(--slate)" opacity="0.7" />
        ))}
        <polyline
          points={xy.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')}
          fill="none"
          stroke="var(--sage)"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {xy.map((p) => (
          <circle
            key={p.week}
            cx={p.x}
            cy={p.y}
            r={R}
            fill={p.complete ? 'var(--sage)' : 'var(--card)'}
            stroke="var(--sage)"
            strokeWidth="2"
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
