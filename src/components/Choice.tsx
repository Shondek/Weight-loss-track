type Props = {
  label: string;
  options: number[];
  value: number | null;
  onChange: (v: number | null) => void;
  /** קליק על ערך שכבר נבחר מנקה אותו. */
  clearable?: boolean | undefined;
  hideLabel?: boolean | undefined;
  /** פריסת רשת אחידה, לסולמות ארוכים כמו 0–10. */
  scale?: boolean | undefined;
};

/**
 * בחירה מתוך כפתורים. לא סליידר ולא הקלדה — כל אזור מגע 44px.
 */
export default function Choice({
  label,
  options,
  value,
  onChange,
  clearable = true,
  hideLabel,
  scale,
}: Props) {
  return (
    <div role="group" aria-label={label}>
      {!hideLabel && <span className="label">{label}</span>}
      <div className={scale ? 'choice choice--scale' : 'choice'}>
        {options.map((o) => {
          const on = value === o;
          return (
            <button
              key={o}
              type="button"
              className="choice__btn"
              aria-pressed={on}
              onClick={() => onChange(on && clearable ? null : o)}
            >
              {o}
            </button>
          );
        })}
      </div>
    </div>
  );
}
