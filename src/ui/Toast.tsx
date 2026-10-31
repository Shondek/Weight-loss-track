import type { ReactNode } from 'react';
import Icon from './Icon';
import { Undo2 } from './icons';

type Props = {
  children: ReactNode;
  /** כיתוב הפעולה, למשל "בטל". בלי פעולה — טוסט תצוגה בלבד. */
  actionLabel?: string | undefined;
  onAction?: (() => void) | undefined;
  /**
   * `static` — בתוך הזרימה (כמו טוסט הביטול במסך התזונה היום).
   * ברירת המחדל: צף מעל הניווט התחתון.
   */
  placement?: 'fixed' | 'static' | undefined;
};

/**
 * טוסט: בהיר על כהה, הודעה קצרה + פעולה אחת בקצה. בשלב הזה הרכיב קיים
 * בספרייה בלבד; ההתנהגות (מתי מופיע, כמה זמן) לא מחוברת עדיין.
 */
export default function Toast({ children, actionLabel, onAction, placement = 'fixed' }: Props) {
  return (
    <div className={placement === 'static' ? 'toast toast--static' : 'toast'} role="status">
      <span className="toast__msg">{children}</span>
      {actionLabel && onAction && (
        <button type="button" className="toast__action" onClick={onAction}>
          <Icon icon={Undo2} size={16} />
          {actionLabel}
        </button>
      )}
    </div>
  );
}
