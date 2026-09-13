import { useId } from 'react';
import type { CardioMode, ISODate, StandaloneCardio } from '../types';
import { NOTE_MAX } from '../types';
import {
  CARDIO_INCLINE_MAX,
  CARDIO_MAX_MINUTES,
  CARDIO_MODES,
  CARDIO_SPEED_MAX,
  CARDIO_STEP,
} from '../data/config';
import { currentValues, type CardioSession } from '../lib/cardioSession';
import { cardioModeLabel } from '../lib/workouts';
import { formatDMY } from '../lib/date';
import DateField from './DateField';
import NumberField from './NumberField';
import Stepper from './Stepper';

type Props = {
  value: StandaloneCardio;
  today: ISODate;
  onChange: (next: StandaloneCardio) => void;
  onClose: () => void;
  /** מה למלא כשמחליפים מכשיר: הרשומה האחרונה באותו מכשיר, או null. */
  defaultsFor: (mode: CardioMode) => StandaloneCardio | null;
  /** ריצה פעילה שמכוונת לרשומה הזו. */
  session: CardioSession | null;
  /** ריצה אחרת פעילה — אי אפשר להתחיל שנייה. */
  sessionBusy: boolean;
  /** "התחל": ריצה בחותמות זמן. לא כותב כלום. */
  onStart: () => void;
  onSessionChange: (patch: { incline?: number | null; speed?: number | null }) => void;
  /** "סיים": פותח את הסיכום. */
  onFinish: () => void;
  /** "רישום ידני": סיכום עם מקטע אחד מהטופס, בלי ריצה. */
  onManual: () => void;
};

/**
 * אירובי עצמאי — אינו אימון. הטופס קובע תאריך/מכשיר/דקות/ערכים
 * התחלתיים; "התחל" פותח ריצה בחותמות זמן, "רישום ידני" מדלג ישר לסיכום.
 * בשני המסלולים הרשומה נכתבת רק מהסיכום — לא מכאן.
 */
export default function StandaloneCardioEditor({
  value,
  today,
  onChange,
  onClose,
  defaultsFor,
  session,
  sessionBusy,
  onStart,
  onSessionChange,
  onFinish,
  onManual,
}: Props) {
  const groupId = useId();
  const noteId = useId();
  const live = session ? currentValues(session) : null;

  const setMode = (mode: CardioMode) => {
    const last = defaultsFor(mode);
    onChange(
      last
        ? { ...value, mode, minutes: last.minutes, incline: last.incline, speed: last.speed }
        : { ...value, mode },
    );
  };

  if (session && live) {
    return (
      <section className="section section--aside">
        <div className="section__head">
          <h2>
            אירובי — עצמאי · <span className="num">{formatDMY(session.target.kind === 'standalone' ? session.target.d : value.d)}</span>
          </h2>
        </div>
        <p className="sub" style={{ margin: 0 }}>
          רץ · {cardioModeLabel(session.mode)} ·{' '}
          <span className="num">{session.plannedMinutes}</span> דק׳ מתוכננות
        </p>
        <p className="tiny muted" style={{ margin: 'var(--sp-1) 0 0' }}>
          כל שינוי שיפוע או מהירות נרשם עם חותמת זמן. אין השהיה. הריצה נחתכת
          בזמן שתוכנן גם אם לא תלחץ "סיים".
        </p>
        <div className="row cardio__gauges">
          <Stepper
            label="שיפוע"
            unit="%"
            value={live.incline}
            onChange={(incline) => onSessionChange({ incline })}
            step={CARDIO_STEP}
            min={0}
            max={CARDIO_INCLINE_MAX}
            decimals={1}
            placeholder="0.0"
          />
          <Stepper
            label="מהירות"
            unit='קמ"ש'
            value={live.speed}
            onChange={(speed) => onSessionChange({ speed })}
            step={CARDIO_STEP}
            min={0}
            max={CARDIO_SPEED_MAX}
            decimals={1}
            placeholder="0.0"
          />
        </div>
        <button
          type="button"
          className="btn btn--primary btn--block"
          style={{ marginTop: 'var(--sp-4)' }}
          onClick={onFinish}
        >
          סיים
        </button>
      </section>
    );
  }

  return (
    <section className="section section--aside">
      <div className="section__head">
        <h2>
          אירובי — עצמאי · <span className="num">{formatDMY(value.d)}</span>
        </h2>
        <button type="button" className="btn btn--quiet" onClick={onClose}>
          סגור
        </button>
      </div>
      <p className="tiny muted" style={{ margin: '0 0 var(--sp-3)' }}>
        אינו אימון — לא נספר ב"אימונים השבוע". נספר בדקות האירובי.
      </p>

      <div className="stack">
        <DateField
          label="תאריך"
          value={value.d}
          max={today}
          onChange={(d) => onChange({ ...value, d })}
        />

        <div role="group" aria-labelledby={groupId}>
          <span id={groupId} className="label">
            מכשיר
          </span>
          <div className="choice">
            {CARDIO_MODES.map((m) => (
              <button
                key={m.id}
                type="button"
                className="choice__btn"
                aria-pressed={value.mode === m.id}
                onClick={() => setMode(m.id)}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        <NumberField
          label="דקות"
          value={value.minutes}
          onChange={(v) => onChange({ ...value, minutes: v ?? 0 })}
          min={0}
          max={CARDIO_MAX_MINUTES}
          placeholder="דק׳"
        />

        <div className="row">
          <Stepper
            label="שיפוע"
            unit="%"
            value={value.incline}
            onChange={(incline) => onChange({ ...value, incline })}
            step={CARDIO_STEP}
            min={0}
            max={CARDIO_INCLINE_MAX}
            decimals={1}
            placeholder="0.0"
          />
          <Stepper
            label="מהירות"
            unit='קמ"ש'
            value={value.speed}
            onChange={(speed) => onChange({ ...value, speed })}
            step={CARDIO_STEP}
            min={0}
            max={CARDIO_SPEED_MAX}
            decimals={1}
            placeholder="0.0"
          />
        </div>

        <div>
          <label htmlFor={noteId}>הערה</label>
          <textarea
            id={noteId}
            value={value.note}
            maxLength={NOTE_MAX}
            onChange={(e) => onChange({ ...value, note: e.target.value.slice(0, NOTE_MAX) })}
          />
        </div>

        <div className="row">
          <button
            type="button"
            className="btn btn--primary btn--block"
            disabled={value.minutes <= 0 || sessionBusy}
            onClick={onStart}
          >
            התחל
          </button>
          <button
            type="button"
            className="btn"
            disabled={value.minutes <= 0}
            onClick={onManual}
          >
            רישום ידני
          </button>
        </div>
        <p className="tiny muted" style={{ margin: 0 }}>
          {sessionBusy
            ? 'ריצת אירובי אחרת פעילה — סיים אותה קודם.'
            : '"התחל" פותח ריצה בזמן אמת; "רישום ידני" מדלג לסיכום. הרשומה נכתבת רק מהסיכום.'}
        </p>
      </div>
    </section>
  );
}
