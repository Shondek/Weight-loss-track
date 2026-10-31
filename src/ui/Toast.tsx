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
  /** פס הטיימר מוצג — הטוסט הצף עולה מעליו (שלב 5). */
  lifted?: boolean | undefined;
};

/**
 * טוסט: בהיר על כהה, הודעה קצרה + פעולה אחת בקצה. תצוגה בלבד — ההתנהגות
 * (טוסט אחד בכל פעם, משך, "בטל") ב-ToastHost.
 */
export default function Toast({ children, actionLabel, onAction, placement = 'fixed', lifted = false }: Props) {
  const cls = ['toast', placement === 'static' ? 'toast--static' : '', lifted ? 'toast--lifted' : ''].filter(Boolean).join(' ');
  return (
    <div className={cls} role="status">
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
