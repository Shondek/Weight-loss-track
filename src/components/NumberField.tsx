import { useEffect, useId, useRef, useState } from 'react';

type Props = {
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
  min: number;
  max: number;
  placeholder?: string | undefined;
  suffix?: string | undefined;
};

/** שדה מספר שלם קטן (חזרות / שניות). בלי כפתורים — רק הקלדה מהירה. */
export default function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  placeholder,
  suffix,
}: Props) {
  const id = useId();
  const [text, setText] = useState(() => (value === null ? '' : String(value)));
  const typing = useRef(false);

  useEffect(() => {
    if (typing.current) return;
    setText(value === null ? '' : String(value));
  }, [value]);

  return (
    <div>
      <label htmlFor={id} className="tiny">
        {label}
        {suffix ? ` (${suffix})` : ''}
      </label>
      <input
        id={id}
        type="number"
        inputMode="numeric"
        step={1}
        min={min}
        max={max}
        value={text}
        placeholder={placeholder}
        onChange={(e) => {
          typing.current = true;
          const raw = e.target.value;
          setText(raw);
          const t = raw.trim();
          if (t === '') {
            onChange(null);
            return;
          }
          const n = Number(t);
          if (!Number.isFinite(n)) return;
          onChange(Math.min(max, Math.max(min, Math.round(n))));
        }}
        onBlur={() => {
          typing.current = false;
          setText(value === null ? '' : String(value));
        }}
      />
    </div>
  );
}
