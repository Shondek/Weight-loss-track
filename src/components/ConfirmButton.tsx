import { useEffect, useRef, useState } from 'react';

type Props = {
  onConfirm: () => void;
  label?: string | undefined;
  confirmLabel?: string | undefined;
  className?: string | undefined;
  /** תיאור לקורא מסך, למשל "מחק שקילה של 01/09" */
  ariaLabel?: string | undefined;
};

const RESET_MS = 5000;

/** מחיקה בשני שלבים: לחיצה ראשונה מבקשת אישור, שנייה מבצעת. */
export default function ConfirmButton({
  onConfirm,
  label = 'מחק',
  confirmLabel = 'אישור מחיקה',
  className = 'btn btn--quiet',
  ariaLabel,
}: Props) {
  const [armed, setArmed] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    return () => {
      if (timer.current !== undefined) window.clearTimeout(timer.current);
    };
  }, []);

  const click = () => {
    if (armed) {
      if (timer.current !== undefined) window.clearTimeout(timer.current);
      setArmed(false);
      onConfirm();
      return;
    }
    setArmed(true);
    timer.current = window.setTimeout(() => setArmed(false), RESET_MS);
  };

  return (
    <button
      type="button"
      className={`${className}${armed ? ' err' : ''}`}
      onClick={click}
      aria-label={ariaLabel}
    >
      {armed ? confirmLabel : label}
    </button>
  );
}
