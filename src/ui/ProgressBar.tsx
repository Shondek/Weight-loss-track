export type BarTone = 'done' | 'partial' | 'missing' | 'accent';

type Props = {
  /** 0–1. ערך מעל 1 נחתך ל-1. */
  fraction: number;
  tone?: BarTone | undefined;
  /** סימון רצפה על הפס, 0–1. */
  floor?: number | undefined;
  label: string;
  valueNow: number;
  valueMax: number;
};

/**
 * פס התקדמות: מסילה על משטח 3, מילוי לפי הטון. ברירת המחדל מבטא; טוני
 * סטטוס כשהפס מקודד מלאות (חלבון מול יעד). אין טקסט בתוך הפס.
 */
export default function ProgressBar({ fraction, tone = 'accent', floor, label, valueNow, valueMax }: Props) {
  const width = Math.max(0, Math.min(1, fraction)) * 100;
  const floorPct = floor === undefined ? null : Math.max(0, Math.min(1, floor)) * 100;
  return (
    <div
      className={tone === 'accent' ? 'bar' : `bar bar--${tone}`}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={Math.round(valueMax)}
      aria-valuenow={Math.round(Math.min(valueNow, valueMax))}
    >
      <div className="bar__fill" style={{ width: `${width}%` }} />
      {floorPct !== null && <div className="bar__floor" style={{ insetInlineStart: `${floorPct}%` }} aria-hidden="true" />}
    </div>
  );
}
