import { useId, useState } from 'react';
import { dayName, formatDMY, isValidISO } from '../lib/date';
import type { ISODate } from '../types';

type Props = {
  label: string;
  value: ISODate;
  onChange: (d: ISODate) => void;
  max?: ISODate | undefined;
  min?: ISODate | undefined;
  /**
   * מכווץ לשורה אחת ("היום · יום שני · 07/09/2026 · שנה") שנפתחת לפקד
   * המלא רק בטאפ. לשדות שכמעט תמיד נשארים על ברירת המחדל.
   */
  collapsible?: boolean | undefined;
  /** נדרש ל-collapsible: כדי לכתוב "היום" במקום שם היום. */
  today?: ISODate | undefined;
};

/**
 * שדה תאריך.
 * הפורמט שמוצג בתוך input[type=date] נקבע ע"י שפת הדפדפן ולא ע"י הדף, ולכן
 * מודפס מתחתיו הד בעברית — שלא תהיה אי-בהירות בין 09/08 ל-08/09.
 */
export default function DateField({ label, value, onChange, max, min, collapsible, today }: Props) {
  const id = useId();
  const [open, setOpen] = useState(false);

  // אותו הד בעברית בשני המצבים: יום בשבוע ותאריך מלא.
  const echo = (
    <>
      יום {dayName(value)} · <span className="num">{formatDMY(value)}</span>
    </>
  );

  if (collapsible && !open) {
    return (
      <div>
        <span className="label visually-hidden">{label}</span>
        <button
          type="button"
          className="btn btn--quiet datefield__summary"
          aria-expanded={false}
          aria-label={`${label}: ${value === today ? 'היום, ' : ''}יום ${dayName(value)} ${formatDMY(value)}. שנה`}
          onClick={() => setOpen(true)}
        >
          {value === today && <span className="strong">היום · </span>}
          {echo}
          <span className="muted"> · שנה</span>
        </button>
      </div>
    );
  }

  return (
    <div>
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type="date"
        value={value}
        max={max}
        min={min}
        autoFocus={collapsible}
        onChange={(e) => {
          if (!isValidISO(e.target.value)) return;
          onChange(e.target.value);
          // אחרי בחירה השדה חוזר לשורה אחת עם התאריך החדש.
          if (collapsible) setOpen(false);
        }}
      />
      <p className="tiny muted" style={{ margin: '4px 0 0' }}>
        {echo}
      </p>
    </div>
  );
}
