import { useEffect, useId, useRef, useState } from 'react';
import Icon from './Icon';
import { Minus, Plus } from './icons';

type Props = {
  label: string;
  /** הערך המוצג (ביחידה הנוכחית: גרמים או מספר יחידות). */
  value: number;
  onChange: (v: number) => void;
  step: number;
  min: number;
  max: number;
  /** ספרות אחרי הנקודה בתצוגה ובעיגול (0 לגרמים שלמים, 1 ל"1.5 כף"). */
  decimals: number;
  /** היחידה שליד המספר: "ג׳", "כף", "מנה". */
  unit?: string | undefined;
  /** `decimal` ליחידות עם חצאים, `numeric` לשלמים. */
  inputMode?: 'decimal' | 'numeric' | undefined;
};

function toText(v: number, decimals: number): string {
  const r = Math.round(v * 10 ** decimals) / 10 ** decimals;
  return decimals > 0 ? String(Number(r.toFixed(decimals))) : String(r);
}

function parse(text: string): number | null {
  const t = text.trim().replace(',', '.');
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/**
 * סטפר גדול לחלונית הכמות: −/+ של 56px משני צידי מספר גדול שהוא גם שדה
 * הקלדה (inputmode מתאים), והיחידה לידו. LTR בפנים — מינוס תמיד משמאל.
 * הקלדה לא נדרסת באמצע; ערך מחוץ לטווח נחתך בלחיצה על −/+ וביציאה מהשדה.
 */
export default function QtyStepper({ label, value, onChange, step, min, max, decimals, unit, inputMode = 'decimal' }: Props) {
  const id = useId();
  const [text, setText] = useState(() => toText(value, decimals));
  const typing = useRef(false);

  useEffect(() => {
    if (typing.current) return;
    setText(toText(value, decimals));
  }, [value, decimals]);

  const clamp = (n: number) => Math.min(max, Math.max(min, n));
  const commit = (n: number) => onChange(Math.round(clamp(n) * 10 ** decimals) / 10 ** decimals);

  const bump = (delta: number) => {
    typing.current = false;
    const next = clamp(Math.round((value + delta) * 10 ** decimals) / 10 ** decimals);
    commit(next);
    setText(toText(next, decimals));
  };

  const stepLabel = toText(step, decimals);
  return (
    <div className="qty" role="group" aria-label={label}>
      <button type="button" className="qty__btn" onClick={() => bump(-step)} disabled={value <= min} aria-label={`פחות ${stepLabel}`}>
        <Icon icon={Minus} size={24} />
      </button>
      <label className="qty__field" htmlFor={id}>
        <input
          id={id}
          className="qty__input num"
          type="number"
          inputMode={inputMode}
          step={step}
          min={min}
          max={max}
          value={text}
          aria-label={label}
          onFocus={(e) => e.currentTarget.select()}
          onChange={(e) => {
            typing.current = true;
            setText(e.target.value);
            const n = parse(e.target.value);
            if (n !== null && n >= min && n <= max) commit(n);
          }}
          onBlur={() => {
            typing.current = false;
            setText(toText(value, decimals));
          }}
        />
        {unit && <span className="qty__unit">{unit}</span>}
      </label>
      <button type="button" className="qty__btn" onClick={() => bump(step)} disabled={value >= max} aria-label={`יותר ${stepLabel}`}>
        <Icon icon={Plus} size={24} />
      </button>
    </div>
  );
}
