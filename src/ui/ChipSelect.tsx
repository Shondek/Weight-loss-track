import type { ReactNode } from 'react';

export type ChipOption<T extends string | number> = { value: T; label: ReactNode };

type Props<T extends string | number> = {
  label: string;
  hideLabel?: boolean | undefined;
  options: readonly ChipOption<T>[];
  value: T | null | undefined;
  onChange: (v: T | null) => void;
  /** נגיעה חוזרת בערך הנבחר מנקה אותו (ברירת מחדל: כן). */
  clearable?: boolean | undefined;
  /** רשת בעמודות קבועות (סולם 0–10 → 6), אחרת שורה שנשברת. */
  columns?: number | undefined;
  /** ברשת: צ'יפים של 48 במקום 44 — לסולמות שממלאים בשבת, לא בחדר כושר. */
  tall?: boolean | undefined;
  /** כל הצ'יפים מושבתים (למשל החלפת פרופיל במכשיר מלא). */
  disabled?: boolean | undefined;
  className?: string | undefined;
};

/**
 * בחירה מצ'יפים: ערך אחד מתוך כמה (RIR 0–4+, כאב 0–10). אזור מגע 48,
 * הנבחר במבטא עם טקסט כהה. בלי ערך ברירת מחדל — ריק עד נגיעה.
 */
export default function ChipSelect<T extends string | number>({ label, hideLabel, options, value, onChange, clearable = true, columns, tall, disabled, className }: Props<T>) {
  const cls = ['chips', columns ? 'chips--grid' : '', tall ? 'chips--tall' : '', className ?? ''].filter(Boolean).join(' ');
  return (
    <div role="group" aria-label={label} className="chipsel">
      {!hideLabel && <span className="chipsel__label">{label}</span>}
      <div className={cls} style={columns ? { ['--chips-cols' as string]: columns } : undefined}>
        {options.map((o) => {
          const on = value === o.value;
          return (
            <button key={String(o.value)} type="button" className="chipbtn" aria-pressed={on} disabled={disabled} onClick={() => onChange(on && clearable ? null : o.value)}>
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
