/**
 * פס התקדמות מול יעד. הצבע לפי אחוז מהיעד: ≥95% מרווה, 75–95% ענבר,
 * פחות — צפחה. `floor` — סימון רצפה (למשל 1,850 קק"ל) על הפס, כאחוז מהיעד.
 */

export type BarTone = 'high' | 'mid' | 'low';

export function toneOf(pct: number): BarTone {
  if (pct >= 0.95) return 'high';
  if (pct >= 0.75) return 'mid';
  return 'low';
}

type Props = {
  value: number;
  target: number;
  floor?: number | undefined;
  label: string;
};

export default function ProgressBar({ value, target, floor, label }: Props) {
  const pct = target > 0 ? value / target : 0;
  const width = Math.max(0, Math.min(1, pct)) * 100;
  const floorPct = floor !== undefined && target > 0 ? Math.max(0, Math.min(1, floor / target)) * 100 : null;
  return (
    <div
      className={`nut-bar nut-bar--${toneOf(pct)}`}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={Math.round(target)}
      aria-valuenow={Math.round(Math.min(value, target))}
    >
      <div className="nut-bar__fill" style={{ width: `${width}%` }} />
      {floorPct !== null && <div className="nut-bar__floor" style={{ insetInlineStart: `${floorPct}%` }} aria-hidden="true" />}
    </div>
  );
}
