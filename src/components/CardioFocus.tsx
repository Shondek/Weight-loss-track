import { useId } from 'react';
import type { CardioMode, LoggedExercise } from '../types';
import { CARDIO_MAX_MINUTES, CARDIO_MODES } from '../data/config';
import {
  cardioMinutesDone,
  cardioModeLabel,
  cardioOf,
  markCardioDone,
  patchCardio,
} from '../lib/workouts';
import NumberField from './NumberField';

type Props = {
  log: LoggedExercise;
  onChange: (next: LoggedExercise) => void;
  /** מפעיל ספירה לאחור של `minutes` דקות. */
  onStart: (minutes: number) => void;
};

/**
 * חימום / אירובי סיום: בחירת מכשיר, דקות, ו"התחל".
 *
 * "התחל" הוא מה שרושם את הביצוע — עד אז השורה ריקה ולא הופכת אימון
 * שנפתח בטעות לרשומה. אחרי שנרשם, שינוי הדקות מעדכן את הרשומה.
 */
export default function CardioFocus({ log, onChange, onStart }: Props) {
  const groupId = useId();
  const { mode, minutes } = cardioOf(log);
  const done = cardioMinutesDone(log);

  const setMode = (m: CardioMode) => onChange(patchCardio(log, { mode: m }));
  const setMinutes = (v: number | null) => onChange(patchCardio(log, { minutes: v ?? 0 }));

  return (
    <div className="focus">
      <h3 className="focus__name">{log.n}</h3>

      <div className="cardio">
        <div role="group" aria-labelledby={groupId} className="choice cardio__mode">
          <span id={groupId} className="visually-hidden">
            מכשיר — {log.n}
          </span>
          {CARDIO_MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              className="choice__btn"
              aria-pressed={mode === m.id}
              onClick={() => setMode(m.id)}
            >
              {m.label}
            </button>
          ))}
        </div>

        <div className="cardio__minutes">
          <NumberField
            label={`דקות — ${log.n}`}
            hideLabel
            value={minutes}
            onChange={setMinutes}
            min={0}
            max={CARDIO_MAX_MINUTES}
            placeholder="דק׳"
          />
          <span className="tiny muted">דק׳</span>
        </div>

        <button
          type="button"
          className="btn btn--primary"
          disabled={minutes <= 0}
          onClick={() => {
            onChange(markCardioDone(log, minutes));
            onStart(minutes);
          }}
        >
          התחל
        </button>
      </div>

      <p className="tiny muted" style={{ margin: 'var(--sp-3) 0 0' }}>
        {done === null
          ? 'לא נרשם'
          : `נרשם: ${cardioModeLabel(mode)} · ${done} דק׳`}
      </p>
    </div>
  );
}
