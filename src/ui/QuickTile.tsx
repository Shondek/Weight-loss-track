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
  /** "+" ככפתור נפרד (48px) שרושם בנגיעה אחת; בלעדיו ה-+ הוא סימן בלבד. */
  onAdd?: (() => void) | undefined;
  addLabel?: string | undefined;
  className?: string | undefined;
};

/**
 * אריח גישה מהירה (מועדפים): ערך גדול במבטא, שם בשתי שורות לכל היותר,
 * כמות, וסימן + בפינה. כל האריח הוא כפתור אחד (≥96px).
 */
export default function QuickTile({ value, unit, title, sub, onTap, tapLabel, onAdd, addLabel, className }: Props) {
  const body = (
    <>
      <span className="qtile__top">
        <span className="qtile__value num">
          {value}
          {unit && <small className="qtile__unit">{unit}</small>}
        </span>
        {!onAdd && (
          <span className="qtile__plus" aria-hidden="true">
            <Icon icon={Plus} size={16} />
          </span>
        )}
      </span>
      <span className="qtile__title">{title}</span>
      {sub && <span className="qtile__sub">{sub}</span>}
    </>
  );
  if (onAdd) {
    // שני כפתורים: גוף האריח (פותח) ו-"+" (רושם). לא כפתור בתוך כפתור.
    return (
      <div className={className ? `qtile qtile--split ${className}` : 'qtile qtile--split'}>
        <button type="button" className="qtile__tap" onClick={onTap} aria-label={tapLabel}>
          {body}
        </button>
        <button type="button" className="qtile__add" onClick={onAdd} aria-label={addLabel}>
          <Icon icon={Plus} size={20} />
        </button>
      </div>
    );
  }
  return (
    <button type="button" className={className ? `qtile ${className}` : 'qtile'} onClick={onTap} aria-label={tapLabel}>
      {body}
    </button>
  );
}
