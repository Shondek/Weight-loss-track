import { useEffect, useId, type ReactNode } from 'react';
import Icon from './Icon';
import { X } from './icons';

type Props = {
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** `static` — לדף הערכה בלבד: מוצג בזרימה, בלי scrim. */
  placement?: 'fixed' | 'static' | undefined;
};

/**
 * חלונית שעולה מלמטה: ידית, כותרת, סגירה, תוכן. Escape ולחיצה על ה-scrim
 * סוגרים. בשלב הזה הרכיב קיים בספרייה בלבד — אף זרימה לא נפתחת בו עדיין.
 */
export default function Sheet({ title, onClose, children, placement = 'fixed' }: Props) {
  const titleId = useId();
  useEffect(() => {
    if (placement !== 'fixed') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, placement]);

  return (
    <>
      {placement === 'fixed' && <div className="scrim" onClick={onClose} aria-hidden="true" />}
      <div className={placement === 'static' ? 'sheet sheet--static' : 'sheet'} role="dialog" aria-modal={placement === 'fixed'} aria-labelledby={titleId}>
        <div className="sheet__handle" aria-hidden="true" />
        <div className="sheet__head">
          <h2 id={titleId} className="sheet__title">
            {title}
          </h2>
          <button type="button" className="btn btn--quiet" onClick={onClose} aria-label="סגור">
            <Icon icon={X} />
          </button>
        </div>
        {children}
      </div>
    </>
  );
}
