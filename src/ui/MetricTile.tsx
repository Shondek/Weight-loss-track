import type { ReactNode } from 'react';
import Icon, { type IconComponent } from './Icon';

type Props = {
  label: ReactNode;
  icon?: IconComponent | undefined;
  /** הערך המעוצב ("96.5", "116", "—"). */
  value: ReactNode;
  /** יחידה או מכנה ליד הערך: 'ס"מ', "/ 170". */
  unit?: ReactNode;
  /** הערך קיים אבל אינו של השבוע/היום — מוצג בצבע משני. */
  dim?: boolean | undefined;
  /** צ'יפ סטטוס מתחת לערך. */
  chip?: ReactNode;
  /** פס התקדמות (חלבון מול יעד). */
  bar?: ReactNode;
  /** שורה שקטה בתחתית: "קודם 97.0 · 22/10". */
  sub?: ReactNode;
  /** עם `onTap` כל האריח הוא כפתור (אזור מגע מלא). */
  onTap?: (() => void) | undefined;
  /** תיאור הפעולה לקורא מסך, למשל "מותניים — לטופס המדידה". */
  tapLabel?: string | undefined;
  className?: string | undefined;
};

/**
 * אריח מדד החלטה: תווית, ערך גדול, צ'יפ סטטוס ושורה שקטה. שני אריחים
 * זה לצד זה הם "שורת מדדי ההחלטה" מתחת לגיבור. נגיעה מובילה לטופס.
 */
export default function MetricTile({ label, icon, value, unit, dim, chip, bar, sub, onTap, tapLabel, className }: Props) {
  const body = (
    <>
      <span className="tile__label">
        {icon && <Icon icon={icon} size={16} />}
        {label}
      </span>
      <span className={dim ? 'tile__value tile__value--dim' : 'tile__value'}>
        {value}
        {unit && <span className="tile__unit">{unit}</span>}
      </span>
      {bar}
      {chip}
      {sub && <span className="tile__sub">{sub}</span>}
    </>
  );
  const cls = ['tile', onTap ? 'tile--tap' : '', className ?? ''].filter(Boolean).join(' ');
  if (onTap) {
    return (
      <button type="button" className={cls} onClick={onTap} aria-label={tapLabel}>
        {body}
      </button>
    );
  }
  return <div className={cls}>{body}</div>;
}
