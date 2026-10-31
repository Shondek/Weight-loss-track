import { useId, useState, type ReactNode } from 'react';
import Icon, { type IconComponent } from './Icon';
import { ChevronDown, ChevronUp } from './icons';

type Props = {
  title: ReactNode;
  /** שורה שקטה ליד הכותרת, למשל "אופניים · 10 דק׳ · לא נרשם". */
  summary?: ReactNode;
  lead?: IconComponent | undefined;
  /** בקצה, לפני החץ: צ'יפ סטטוס. */
  end?: ReactNode;
  /** מבוקר: `open` + `onToggle`. לא מבוקר: `defaultOpen`. */
  open?: boolean | undefined;
  onToggle?: (() => void) | undefined;
  defaultOpen?: boolean | undefined;
  /**
   * התוכן נשאר ב-DOM גם כשסגור (`hidden`) — לקישורים והערות שצריכים
   * להיות שם לקוראי מסך ולחיפוש, לא רק אחרי נגיעה.
   */
  keepMounted?: boolean | undefined;
  className?: string | undefined;
  children: ReactNode;
};

/**
 * שורה מקופלת שנפתחת בנגיעה: כותרת, סיכום שקט, חץ. אזור מגע מלא (48).
 * לחימום, להערות הביצוע ולסשן הקודם במסך האימון — דברים שצריכים להיות
 * נגישים בנגיעה אחת בלי לתפוס את המסך כשלא צריך אותם.
 */
export default function Disclosure({ title, summary, lead, end, open, onToggle, defaultOpen = false, keepMounted = false, className, children }: Props) {
  const id = useId();
  const [local, setLocal] = useState(defaultOpen);
  const isOpen = open ?? local;
  const toggle = onToggle ?? (() => setLocal((v) => !v));
  return (
    <div className={className ? `disc ${className}` : 'disc'}>
      <button type="button" className="disc__head" aria-expanded={isOpen} aria-controls={id} onClick={toggle}>
        {lead && (
          <span className="disc__lead">
            <Icon icon={lead} />
          </span>
        )}
        <span className="disc__body">
          <span className="disc__title">{title}</span>
          {summary && <span className="disc__sum">{summary}</span>}
        </span>
        {end && <span className="disc__end">{end}</span>}
        <span className="disc__chev">
          <Icon icon={isOpen ? ChevronUp : ChevronDown} />
        </span>
      </button>
      {(isOpen || keepMounted) && (
        <div id={id} className="disc__panel" hidden={!isOpen}>
          {children}
        </div>
      )}
    </div>
  );
}
