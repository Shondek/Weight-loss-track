import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import Toast from './Toast';

/**
 * טוסט אחד לכל האפליקציה (שלב 5).
 *
 * - `show` מחליף את הטוסט הקודם: הטיימר שלו נעצר, וחלון ה"בטל" שלו נסגר.
 * - "בטל" מפעיל את הפעולה פעם אחת ומוריד את הטוסט.
 * - הטוסט צף מעל הניווט; כשפס הטיימר של האימון מוצג (`lifted`) הוא עולה
 *   מעליו — הם נערמים ולא מכסים זה את זה.
 *
 * הרשומה שנמחקה נשמרת בזיכרון בלבד (בסגירה של הפעולה), בלי מפתח אחסון.
 */

export type ToastSpec = {
  text: ReactNode;
  /** כיתוב הפעולה ("בטל"). בלי פעולה — טוסט תצוגה בלבד. */
  actionLabel?: string | undefined;
  onAction?: (() => void) | undefined;
  /** כמה זמן הטוסט מוצג. */
  ms: number;
};

export type ToastApi = {
  show: (spec: ToastSpec) => void;
  /** טוסט "נמחק · <מה> · בטל" ל-6 שניות. */
  undo: (text: ReactNode, onUndo: () => void) => void;
  /** טוסט "נשמר" ל-2 שניות, בלי פעולה. */
  saved: (text?: ReactNode) => void;
  dismiss: () => void;
};

/** "בטל" ל-6 שניות — כמו טוסט הביטול של מסך התזונה (שלב 4). */
export const UNDO_MS = 6000;
/** "נשמר" קצר, בלי פעולה. */
export const SAVED_MS = 2000;

const noop = () => undefined;
const ToastContext = createContext<ToastApi>({ show: noop, undo: noop, saved: noop, dismiss: noop });

export function useToast(): ToastApi {
  return useContext(ToastContext);
}

type Props = {
  children: ReactNode;
  /** פס הטיימר מוצג — הטוסט עולה מעליו. */
  lifted?: boolean | undefined;
};

export function ToastProvider({ children, lifted = false }: Props) {
  const [current, setCurrent] = useState<(ToastSpec & { key: number }) | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const seq = useRef(0);

  const clear = () => {
    if (timer.current !== undefined) window.clearTimeout(timer.current);
    timer.current = undefined;
  };

  const dismiss = useCallback(() => {
    clear();
    setCurrent(null);
  }, []);

  const show = useCallback((spec: ToastSpec) => {
    clear();
    seq.current += 1;
    setCurrent({ ...spec, key: seq.current });
    timer.current = window.setTimeout(() => {
      timer.current = undefined;
      setCurrent(null);
    }, spec.ms);
  }, []);

  useEffect(() => clear, []);

  const api = useMemo<ToastApi>(
    () => ({
      show,
      undo: (text, onUndo) => show({ text, actionLabel: 'בטל', onAction: onUndo, ms: UNDO_MS }),
      saved: (text = 'נשמר') => show({ text, ms: SAVED_MS }),
      dismiss,
    }),
    [show, dismiss],
  );

  const act = () => {
    const spec = current;
    dismiss();
    spec?.onAction?.();
  };

  return (
    <ToastContext.Provider value={api}>
      {children}
      {current && (
        <Toast
          key={current.key}
          actionLabel={current.onAction ? current.actionLabel : undefined}
          onAction={current.onAction ? act : undefined}
          lifted={lifted}
        >
          {current.text}
        </Toast>
      )}
    </ToastContext.Provider>
  );
}
