import type { ReactNode } from 'react';
import Icon from './Icon';
import { Plus } from './icons';

type Props = {
  /** המספר הגדול (חלבון במנה). */
  value: ReactNode;
  unit?: ReactNode;
  /** השם — עד שתי שורות, ואז שלוש נקודות. */
  title: ReactNode;
  /** שורה שקטה: הכמות. */
  sub?: ReactNode;
  onTap: () => void;
  /** תיאור הפעולה לקורא מסך. */
  tapLabel?: string | undefined;
  className?: string | undefined;
};

/**
 * אריח גישה מהירה (מועדפים): ערך גדול במבטא, שם בשתי שורות לכל היותר,
 * כמות, וסימן + בפינה. כל האריח הוא כפתור אחד (≥96px).
 */
export default function QuickTile({ value, unit, title, sub, onTap, tapLabel, className }: Props) {
  return (
    <button type="button" className={className ? `qtile ${className}` : 'qtile'} onClick={onTap} aria-label={tapLabel}>
      <span className="qtile__top">
        <span className="qtile__value num">
          {value}
          {unit && <small className="qtile__unit">{unit}</small>}
        </span>
        <span className="qtile__plus" aria-hidden="true">
          <Icon icon={Plus} size={16} />
        </span>
      </span>
      <span className="qtile__title">{title}</span>
      {sub && <span className="qtile__sub">{sub}</span>}
    </button>
  );
}
