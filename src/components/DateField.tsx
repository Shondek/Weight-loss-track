import { useId } from 'react';
import { dayName, formatDMY, isValidISO } from '../lib/date';
import type { ISODate } from '../types';

type Props = {
  label: string;
  value: ISODate;
  onChange: (d: ISODate) => void;
  max?: ISODate | undefined;
  min?: ISODate | undefined;
};

/**
 * שדה תאריך.
 * הפורמט שמוצג בתוך input[type=date] נקבע ע"י שפת הדפדפן ולא ע"י הדף, ולכן
 * מודפס מתחתיו הד בעברית — שלא תהיה אי-בהירות בין 09/08 ל-08/09.
 */
export default function DateField({ label, value, onChange, max, min }: Props) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type="date"
        value={value}
        max={max}
        min={min}
        onChange={(e) => {
          if (isValidISO(e.target.value)) onChange(e.target.value);
        }}
      />
      <p className="tiny muted" style={{ margin: '4px 0 0' }}>
        יום {dayName(value)} · <span className="num">{formatDMY(value)}</span>
      </p>
    </div>
  );
}
