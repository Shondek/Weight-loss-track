import { useEffect, useId, useRef, useState } from 'react';
import { round } from '../lib/format';
import Icon from './Icon';
import { Minus, Plus } from './icons';

type Props = {
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
  /** קפיצת הכפתורים −/+ */
  step: number;
  min: number;
  max: number;
  /** ספרות אחרי הנקודה בתצוגה ובעיגול */
  decimals: number;
  unit?: string | undefined;
  placeholder?: string | undefined;
  /** טקסט קטן מתחת לשדה, למשל "אחרון: 60 ק"ג · 12/12/10" */
  hint?: string | undefined;
  hideLabel?: boolean | undefined;
  /** −/+ של 44px במקום 48, לשורות צפופות. */
  compact?: boolean | undefined;
};

function toText(v: number | null, decimals: number): string {
  if (v === null) return '';
  return decimals > 0 ? v.toFixed(decimals) : String(v);
}

function parse(text: string): number | null {
  const t = text.trim().replace(',', '.');
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/**
 * סטפר: −/+ בגודל 48 משני צידי שדה מספרי, על משטח אחד.
 * הכיוון בתוך הרכיב הוא LTR כדי ש"מינוס" יהיה תמיד משמאל, כמו על ציר מספרים.
 * ההתנהגות (הקלדה, גבולות, עיגול, הד מלמעלה) זהה לרכיב הקודם.
 */
export default function Stepper({
  label,
  value,
  onChange,
  step,
  min,
  max,
  decimals,
  unit,
  placeholder,
  hint,
  hideLabel,
  compact,
}: Props) {
  const id = useId();
  const [text, setText] = useState(() => toText(value, decimals));
  const typing = useRef(false);

  // מסתנכרן מלמעלה רק כשהערך באמת שונה ממה שמוצג — כדי לא לדרוס הקלדה.
  useEffect(() => {
    if (typing.current) return;
    setText(toText(value, decimals));
  }, [value, decimals]);

  const commit = (next: number | null) => {
    if (next === null) {
      onChange(null);
      return;
    }
    const clamped = Math.min(max, Math.max(min, next));
    onChange(round(clamped, decimals));
  };

  const bump = (delta: number) => {
    typing.current = false;
    const base = value ?? parse(text) ?? 0;
    const next = round(base + delta, decimals);
    commit(next);
    setText(toText(Math.min(max, Math.max(min, next)), decimals));
  };

  const stepLabel = decimals > 0 ? step.toFixed(decimals) : String(step);

  return (
    <div>
      <label htmlFor={id} className={hideLabel ? 'visually-hidden' : undefined}>
        {label}
        {unit ? ` (${unit})` : ''}
      </label>
      <div className={compact ? 'stepper stepper--compact' : 'stepper'}>
        <button type="button" className="stepper__btn" onClick={() => bump(-step)} aria-label={`הפחת ${stepLabel}`}>
          <Icon icon={Minus} />
        </button>
        <input
          id={id}
          type="number"
          inputMode="decimal"
          step={step}
          min={min}
          max={max}
          value={text}
          placeholder={placeholder}
          // הערך מאוכלס מראש; טאפ ואז הקלדה מחליפים אותו במקום למחוק קודם.
          onFocus={(e) => e.currentTarget.select()}
          onChange={(e) => {
            typing.current = true;
            setText(e.target.value);
            commit(parse(e.target.value));
          }}
          onBlur={() => {
            typing.current = false;
            setText(toText(value, decimals));
          }}
        />
        <button type="button" className="stepper__btn" onClick={() => bump(step)} aria-label={`הוסף ${stepLabel}`}>
          <Icon icon={Plus} />
        </button>
      </div>
      {hint && (
        <p className="tiny muted" style={{ margin: '4px 0 0' }}>
          {hint}
        </p>
      )}
    </div>
  );
}
