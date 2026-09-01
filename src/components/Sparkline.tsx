import { useRef } from 'react';
import { useElementWidth } from './useElementWidth';

type Props = {
  /** מהישן לחדש. הציור הופך אותם, כי הזמן זורם מימין לשמאל. */
  values: number[];
  label: string;
};

const H = 28;
const PAD = 4;
const R = 2;

/**
 * מגמה זעירה של תרגיל בודד. בלי צירים, בלי צבע, בלי אנימציה —
 * אותה שפה של WeeklyChart, בגודל שנכנס בשורת היסטוריה.
 */
export default function Sparkline({ values, label }: Props) {
  const box = useRef<HTMLSpanElement>(null);
  const width = useElementWidth(box);

  let body = null;
  if (width > 24 && values.length >= 2) {
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min || 1;
    const innerW = width - PAD * 2;
    const innerH = H - PAD * 2;

    const pts = values.map((v, i) => {
      const t = i / (values.length - 1);
      // i=0 הוא הישן ביותר ולכן הימני ביותר
      const x = width - PAD - t * innerW;
      const y = PAD + (1 - (v - min) / span) * innerH;
      return { x, y };
    });
    const last = pts[pts.length - 1];

    body = (
      <svg
        width={width}
        height={H}
        viewBox={`0 0 ${width} ${H}`}
        role="img"
        aria-label={`${label}: ${values.join(', ')}`}
        style={{ display: 'block', overflow: 'visible' }}
      >
        <polyline
          points={pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')}
          fill="none"
          stroke="var(--ink-2)"
          strokeWidth="1.25"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {last && <circle cx={last.x} cy={last.y} r={R} fill="var(--ink)" />}
      </svg>
    );
  }

  return (
    <span ref={box} style={{ display: 'block', minHeight: values.length >= 2 ? H : 0 }}>
      {body}
    </span>
  );
}
