import type { ReactNode } from 'react';
import Icon, { type IconComponent } from './Icon';
import { CircleCheck, Info, TriangleAlert } from './icons';

export type NoticeTone = 'reminder' | 'info' | 'danger';

type Props = {
  /** `reminder` (ענבר, ברירת מחדל — תזכורת הגיבוי), `info` (צפחה), `danger` (טרקוטה). */
  tone?: NoticeTone | undefined;
  /** אייקון משלו במקום ברירת המחדל של הטון. */
  icon?: IconComponent | undefined;
  /** פעולה בקצה (כפתור רפאים), למשל "ייצא". */
  action?: ReactNode;
  /** `role="status"` כברירת מחדל; `alert` להודעה שחייבת להישמע מיד. */
  role?: 'status' | 'alert' | 'note' | undefined;
  className?: string | undefined;
  children: ReactNode;
};

const ICON: Record<NoticeTone, IconComponent> = {
  reminder: TriangleAlert,
  info: Info,
  danger: CircleCheck,
};

/**
 * תזכורת: שורה שקטה עם פס צד דק — נתון, לא אזעקה. בצורת תזכורת הגיבוי
 * שמעל כל טאב: טקסט, ואופציונלית פעולה אחת בקצה.
 */
export default function Notice({ tone = 'reminder', icon, action, role = 'status', className, children }: Props) {
  const cls = ['notice', tone === 'reminder' ? '' : `notice--${tone}`, className ?? ''].filter(Boolean).join(' ');
  return (
    <div className={cls} role={role}>
      <span className="notice__icon">
        <Icon icon={icon ?? ICON[tone]} size={16} />
      </span>
      <span className="grow">{children}</span>
      {action}
    </div>
  );
}
