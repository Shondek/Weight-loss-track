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
import { formatDMY } from '../lib/date';
import DateField from './DateField';
import NumberField from './NumberField';
import Stepper from './Stepper';
import ConfirmButton from './ConfirmButton';

type Props = {
  value: StandaloneCardio;
  /** האם הרשומה כבר באחסון (עריכה) או חדשה (טיוטה במסך). */
  existing: boolean;
  today: ISODate;
  onChange: (next: StandaloneCardio) => void;
  onSave: () => void;
  onClose: () => void;
  onDelete: () => void;
  /** מה למלא כשמחליפים מכשיר: הרשומה האחרונה באותו מכשיר, או null. */
  defaultsFor: (mode: CardioMode) => StandaloneCardio | null;
};

/**
 * אירובי עצמאי — אינו אימון. הטופס נשמר בלחיצה מפורשת ולא בכל הקשה:
 * הוא נפתח כבר ממולא (מהאחרון או מברירות המחדל), ולכן "ריק = טיוטה" של
 * מסך האימון לא חל כאן — בלי כפתור, פתיחה בטעות הייתה יוצרת רשומה.
 */
export default function StandaloneCardioEditor({
  value,
  existing,
  today,
  onChange,
  onSave,
  onClose,
  onDelete,
  defaultsFor,
}: Props) {
  const groupId = useId();
  const noteId = useId();

  const setMode = (mode: CardioMode) => {
    const last = defaultsFor(mode);
    onChange(
      last
        ? { ...value, mode, minutes: last.minutes, incline: last.incline, speed: last.speed }
        : { ...value, mode },
    );
  };

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
            disabled={value.minutes <= 0}
            onClick={onSave}
          >
            {existing ? 'עדכן אירובי' : 'שמור אירובי'}
          </button>
          {existing && (
            <ConfirmButton
              className="btn btn--danger"
              ariaLabel={`מחק אירובי עצמאי של ${formatDMY(value.d)}`}
              onConfirm={onDelete}
            />
          )}
        </div>
      </div>
    </section>
  );
}
