import { useState } from 'react';
import type { CardioMode, CardioSegment } from '../types';
import {
  CARDIO_INCLINE_MAX,
  CARDIO_MAX_MINUTES,
  CARDIO_SPEED_MAX,
  CARDIO_STEP,
} from '../data/config';
import { totalMinutes } from '../lib/cardioSession';
import { cardioModeLabel } from '../lib/workouts';
import NumberField from './NumberField';
import Stepper from './Stepper';
import ConfirmButton from './ConfirmButton';

const MAX_STEPS = 100_000;

type Props = {
  title: string;
  mode: CardioMode;
  initialSegments: CardioSegment[];
  initialSteps: number | null;
  /** "הריצה נחתכה ב-30 דק׳ — לא נלחץ סיים" וכדומה. */
  notice?: string | undefined;
  onSave: (segments: CardioSegment[], steps: number | null) => void;
  /** תמיד גלוי, לצד "שמור". */
  onCancel: () => void;
  /** רק לרשומה שכבר באחסון. */
  onDelete?: (() => void) | undefined;
};

/**
 * סיכום ריצת אירובי — המקטעים כפי שנגזרו מחותמות הזמן, ניתנים לעריכה
 * לפני השמירה. שום דבר לא נכתב לאחסון עד "שמור"; "בטל" תמיד גלוי.
 * משותף לאירובי סיום ולאירובי עצמאי.
 */
export default function CardioSummary({
  title,
  mode,
  initialSegments,
  initialSteps,
  notice,
  onSave,
  onCancel,
  onDelete,
}: Props) {
  const [segments, setSegments] = useState<CardioSegment[]>(() =>
    initialSegments.map((x) => ({ ...x })),
  );
  const [steps, setSteps] = useState<number | null>(initialSteps);

  const total = totalMinutes(segments);
  const valid = segments.length > 0 && segments.every((x) => x.minutes > 0);

  const patch = (i: number, p: Partial<CardioSegment>) =>
    setSegments((list) => list.map((x, j) => (j === i ? { ...x, ...p } : x)));
  const remove = (i: number) => setSegments((list) => list.filter((_, j) => j !== i));
  const add = () =>
    setSegments((list) => {
      const last = list[list.length - 1];
      return [...list, last ? { ...last } : { minutes: 5, incline: null, speed: null }];
    });

  return (
    <section className="section section--aside cardio-summary" aria-label={title}>
      <div className="section__head">
        <h2>{title}</h2>
        <span className="tiny muted">{cardioModeLabel(mode)}</span>
      </div>
      {notice && (
        <p className="notice" style={{ margin: '0 0 var(--sp-3)' }}>
          {notice}
        </p>
      )}
      <p className="sub" style={{ margin: '0 0 var(--sp-3)' }}>
        סה״כ <span className="num">{total}</span> דק׳ ·{' '}
        <span className="num">{segments.length}</span> מקטעים
      </p>

      <ol className="cardio-summary__list" aria-label="מקטעים">
        {segments.map((seg, i) => (
          <li key={i} className="cardio-summary__seg">
            <div className="row row--between row--baseline">
              <span className="tiny muted">
                מקטע <span className="num">{i + 1}</span>
              </span>
              <ConfirmButton ariaLabel={`מחק מקטע ${i + 1}`} onConfirm={() => remove(i)} />
            </div>
            <NumberField
              label={`דקות, מקטע ${i + 1}`}
              value={seg.minutes}
              onChange={(v) => patch(i, { minutes: v ?? 0 })}
              min={0}
              max={CARDIO_MAX_MINUTES}
              placeholder="דק׳"
            />
            <div className="row cardio__gauges">
              <Stepper
                label={`שיפוע, מקטע ${i + 1}`}
                unit="%"
                value={seg.incline}
                onChange={(incline) => patch(i, { incline })}
                step={CARDIO_STEP}
                min={0}
                max={CARDIO_INCLINE_MAX}
                decimals={1}
                placeholder="0.0"
              />
              <Stepper
                label={`מהירות, מקטע ${i + 1}`}
                unit='קמ"ש'
                value={seg.speed}
                onChange={(speed) => patch(i, { speed })}
                step={CARDIO_STEP}
                min={0}
                max={CARDIO_SPEED_MAX}
                decimals={1}
                placeholder="0.0"
              />
            </div>
          </li>
        ))}
      </ol>
      <button type="button" className="btn btn--quiet" onClick={add}>
        + הוסף מקטע
      </button>

      <div style={{ marginTop: 'var(--sp-4)' }}>
        <NumberField
          label="צעדי הליכון"
          value={steps}
          onChange={setSteps}
          min={0}
          max={MAX_STEPS}
          placeholder="ריק = לא נספר"
        />
      </div>

      <div className="row" style={{ marginTop: 'var(--sp-4)' }}>
        <button
          type="button"
          className="btn btn--primary btn--block"
          disabled={!valid}
          onClick={() => onSave(segments, steps)}
        >
          שמור
        </button>
        <button type="button" className="btn" onClick={onCancel}>
          בטל
        </button>
        {onDelete && (
          <ConfirmButton className="btn btn--danger" ariaLabel={`מחק — ${title}`} onConfirm={onDelete} />
        )}
      </div>
      <p className="tiny muted" style={{ margin: 'var(--sp-2) 0 0' }}>
        הרשומה נכתבת רק בלחיצה על "שמור".
      </p>
    </section>
  );
}
