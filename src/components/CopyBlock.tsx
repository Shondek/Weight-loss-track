import { useRef, useState } from 'react';
import { copyText, selectAll } from '../platform/clipboard';

type Props = {
  text: string;
  label: string;
  /** כפתור ראשי או משני */
  primary?: boolean | undefined;
  /** תווית לתיבת הטקסט שנפתחת */
  boxLabel: string;
  /** נקרא רק כשההעתקה האוטומטית הצליחה. העתקה ידנית לא נחשבת — אין דרך לדעת שקרתה. */
  onCopied?: (() => void) | undefined;
};

type State = 'idle' | 'copied' | 'manual';

/**
 * כפתור העתקה עם נפילה ידנית.
 * אם ההעתקה נכשלה (קורה ב-iOS מסוימים) נפתחת תיבת טקסט מסומנת ולא
 * הודעת שגיאה סתמית.
 */
export default function CopyBlock({ text, label, primary, boxLabel, onCopied }: Props) {
  const [state, setState] = useState<State>('idle');
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLTextAreaElement>(null);

  const run = async () => {
    const ok = await copyText(text);
    if (ok) {
      setState('copied');
      window.setTimeout(() => setState('idle'), 2500);
      onCopied?.();
      return;
    }
    setState('manual');
    setOpen(true);
    window.setTimeout(() => selectAll(box.current), 0);
  };

  return (
    <div className="stack--tight">
      <div className="row">
        <button
          type="button"
          className={`btn btn--block${primary ? ' btn--primary' : ''}`}
          onClick={() => void run()}
        >
          {state === 'copied' ? 'הועתק' : label}
        </button>
        <button
          type="button"
          className="btn btn--quiet"
          aria-expanded={open}
          onClick={() => {
            setOpen(!open);
            if (!open) window.setTimeout(() => selectAll(box.current), 0);
          }}
        >
          {open ? 'הסתר' : 'הצג'}
        </button>
      </div>

      {state === 'manual' && (
        <p className="small err" style={{ margin: 0 }}>
          ההעתקה האוטומטית נחסמה. הטקסט מסומן למטה — העתק ידנית.
        </p>
      )}

      {open && (
        <div>
          <label htmlFor="copy-box" className="visually-hidden">
            {boxLabel}
          </label>
          <textarea
            id="copy-box"
            ref={box}
            className="export-box"
            readOnly
            value={text}
            onFocus={(e) => e.currentTarget.select()}
            dir="rtl"
          />
          <p className="tiny muted" style={{ margin: '4px 0 0' }}>
            <span className="num">{text.length}</span> תווים
          </p>
        </div>
      )}
    </div>
  );
}
