import { useId, useRef, useState } from 'react';
import { copyText, selectAll } from '../platform/clipboard';
import { Button } from '../ui';
import { Copy, Share2 } from '../ui/icons';

type Props = {
  text: string;
  label: string;
  /** כפתור ראשי או משני */
  primary?: boolean | undefined;
  /** תווית לתיבת הטקסט שנפתחת */
  boxLabel: string;
  /** נקרא רק כשההעתקה האוטומטית הצליחה. העתקה ידנית לא נחשבת — אין דרך לדעת שקרתה. */
  onCopied?: (() => void) | undefined;
  /**
   * "שתף" (שלב 6, FEATURES #10): `navigator.share` עם אותו טקסט בדיוק.
   * בדפדפן בלי שיתוף, או כשהשיתוף נכשל (לא בוטל), הכפתור מתנהג כמו "העתק".
   */
  share?: boolean | undefined;
};

type State = 'idle' | 'copied' | 'manual';

/** `navigator.share` לטקסט בלבד. `unsupported` = אין API; `cancelled` = המשתמש סגר את הגיליון. */
async function shareText(text: string): Promise<'shared' | 'cancelled' | 'failed' | 'unsupported'> {
  if (typeof navigator === 'undefined' || typeof navigator.share !== 'function') return 'unsupported';
  try {
    await navigator.share({ text });
    return 'shared';
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') return 'cancelled';
    return 'failed';
  }
}

/**
 * כפתור העתקה עם נפילה ידנית.
 * אם ההעתקה נכשלה (קורה ב-iOS מסוימים) נפתחת תיבת טקסט מסומנת ולא
 * הודעת שגיאה סתמית.
 */
export default function CopyBlock({ text, label, primary, boxLabel, onCopied, share }: Props) {
  const [state, setState] = useState<State>('idle');
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLTextAreaElement>(null);
  // כמה תיבות באותו מסך (סיכום שבועי, דוח, JSON) — מזהה ייחודי לכל אחת.
  const boxId = useId();

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

  const runShare = async () => {
    const r = await shareText(text);
    if (r === 'shared' || r === 'cancelled') return;
    // בלי תמיכה בשיתוף (או כשל שאינו ביטול): אותה התנהגות של "העתק".
    await run();
  };

  return (
    <div className="stack--tight">
      <div className="row">
        <Button variant={primary ? 'accent' : 'secondary'} block icon={Copy} onClick={() => void run()}>
          {state === 'copied' ? 'הועתק' : label}
        </Button>
        {share && (
          <Button icon={Share2} aria-label={`שתף — ${boxLabel}`} onClick={() => void runShare()}>
            שתף
          </Button>
        )}
        <Button variant="ghost" aria-expanded={open} onClick={() => {
          setOpen(!open);
          if (!open) window.setTimeout(() => selectAll(box.current), 0);
        }}>
          {open ? 'הסתר' : 'הצג'}
        </Button>
      </div>

      {state === 'manual' && (
        <p className="small err" style={{ margin: 0 }}>
          ההעתקה האוטומטית נחסמה. הטקסט מסומן למטה — העתק ידנית.
        </p>
      )}

      {open && (
        <div>
          <label htmlFor={boxId} className="visually-hidden">
            {boxLabel}
          </label>
          <textarea
            id={boxId}
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
