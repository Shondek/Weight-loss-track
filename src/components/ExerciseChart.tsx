import { useRef, useState } from 'react';
import type { ISODate } from '../types';
import { diffDays, formatDM } from '../lib/date';
import { clean } from '../lib/format';
import { useElementWidth } from './useElementWidth';

export type ProgressPoint = { d: ISODate; value: number };

type Props = {
  /** מהישן לחדש. הציור הופך אותם — הזמן זורם מימין לשמאל. */
  points: ProgressPoint[];
  /** 'ק״ג' / 'שנ׳' / 'חזרות' — לכיתוב בלבד. */
  unit: string;
  label: string;
};

const H = 132;
const PAD_TOP = 22;
const PAD_BOTTOM = 22;
const PAD_X = 14;
const R = 3;
const HIT = 16;

/**
 * התקדמות של תרגיל אחד לאורך זמן: ערך (משקל / שניות / חזרות) מול תאריך.
 * המרחק האופקי הוא זמן אמיתי, לא מספר סידורי — שבועיים בלי אימון נראים
 * כפער. אותה שפה של WeeklyChart: דיו בלבד, בלי צירים, בלי אנימציה.
 * נגיעה בנקודה מציגה את התאריך והערך שלה; ברירת המחדל היא האחרונה.
 */
export default function ExerciseChart({ points, unit, label }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const width = useElementWidth(box);
  const [picked, setPicked] = useState<number | null>(null);

  let body = null;
  if (width > 40 && points.length >= 2) {
    const values = points.map((p) => p.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min || 1;
    const first = points[0]!;
    const totalDays = diffDays(first.d, points[points.length - 1]!.d) || 1;
    const innerW = width - PAD_X * 2;
    const innerH = H - PAD_TOP - PAD_BOTTOM;

    const xy = points.map((p) => {
      const t = diffDays(first.d, p.d) / totalDays;
      const x = width - PAD_X - t * innerW;
      const y = PAD_TOP + (1 - (p.value - min) / span) * innerH;
      return { x, y, ...p };
    });
    const sel = xy[picked ?? xy.length - 1] ?? xy[xy.length - 1]!;
    const anchor = sel.x < width * 0.25 ? 'start' : sel.x > width * 0.75 ? 'end' : 'middle';

    body = (
      <svg
        width={width}
        height={H}
        viewBox={`0 0 ${width} ${H}`}
        role="img"
        aria-label={`${label}: ${points.map((p) => `${formatDM(p.d)} ${clean(p.value)}`).join(', ')}`}
        style={{ display: 'block', overflow: 'visible' }}
      >
        <polyline
          points={xy.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')}
          fill="none"
          stroke="var(--ink)"
          strokeWidth="1.25"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {xy.map((p, i) => (
          <g key={`${p.d}-${i}`}>
            <circle
              cx={p.x}
              cy={p.y}
              r={R}
              fill={p === sel ? 'var(--ink)' : 'var(--paper)'}
              stroke="var(--ink)"
              strokeWidth="1.25"
            />
            {/* אזור נגיעה גדול מהנקודה, שקוף. */}
            <circle
              cx={p.x}
              cy={p.y}
              r={HIT}
              fill="transparent"
              style={{ cursor: 'pointer' }}
              onClick={() => setPicked(i)}
            />
          </g>
        ))}
        <text
          x={sel.x}
          y={sel.y - R - 6}
          fontSize="12"
          fill="var(--ink)"
          textAnchor={anchor}
          direction="ltr"
          style={{ fontVariantNumeric: 'tabular-nums' }}
        >
          {formatDM(sel.d)} · {clean(sel.value)}
        </text>
        <text
          x={width - PAD_X}
          y={H - 4}
          fontSize="11"
          fill="var(--ink-3)"
          textAnchor="end"
          direction="ltr"
        >
          {formatDM(first.d)}
        </text>
        <text x={PAD_X} y={H - 4} fontSize="11" fill="var(--ink-3)" textAnchor="start" direction="ltr">
          {formatDM(points[points.length - 1]!.d)}
        </text>
      </svg>
    );
  }

  const values = points.map((p) => p.value);
  return (
    <div>
      <div ref={box} style={{ minHeight: points.length >= 2 ? H : 0 }}>
        {body}
      </div>
      {points.length >= 2 && (
        <p className="tiny muted" style={{ margin: '4px 0 0' }}>
          טווח <span className="num">{clean(Math.min(...values))}</span>–
          <span className="num">{clean(Math.max(...values))}</span> {unit} ·{' '}
          <span className="num">{points.length}</span> אימונים · נגיעה בנקודה מציגה אותה. הזמן
          זורם מימין לשמאל.
        </p>
      )}
    </div>
  );
}
