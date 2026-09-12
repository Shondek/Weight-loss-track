import { useId } from 'react';
import type { CardioLog, CardioMode, LoggedExercise } from '../types';
import {
  CARDIO_INCLINE_MAX,
  CARDIO_MAX_MINUTES,
  CARDIO_MODES,
  CARDIO_SPEED_MAX,
  CARDIO_STEP,
} from '../data/config';
import {
  cardioGaugeText,
  cardioMinutesDone,
  cardioModeLabel,
  cardioOf,
  markCardioDone,
  patchCardio,
} from '../lib/workouts';
import NumberField from './NumberField';
import Stepper from './Stepper';

type Props = {
  log: LoggedExercise;
  onChange: (next: LoggedExercise) => void;
  /** מפעיל ספירה לאחור של `minutes` דקות. */
  onStart: (minutes: number) => void;
  /** שדות שיפוע ומהירות. לאירובי סיום; החימום מסתפק במכשיר ודקות. */
  detailed?: boolean | undefined;
  /**
   * מה למלא כשמחליפים מכשיר: הרישום האחרון באותו מכשיר. null = אין —
   * ואז הערכים שבשדות נשארים. חל רק כל עוד לא נלחץ "התחל".
   */
  defaultsFor?: ((mode: CardioMode) => CardioLog | null) | undefined;
};

/**
 * חימום / אירובי סיום: בחירת מכשיר, דקות, ו"התחל".
 *
 * "התחל" הוא מה שרושם את הביצוע — עד אז השורה ריקה ולא הופכת אימון
 * שנפתח בטעות לרשומה. אחרי שנרשם, שינוי הדקות מעדכן את הרשומה.
 */
export default function CardioFocus({ log, onChange, onStart, detailed, defaultsFor }: Props) {
  const groupId = useId();
  const cardio = cardioOf(log);
  const { mode, minutes } = cardio;
  const done = cardioMinutesDone(log);

  const setMode = (m: CardioMode) => {
    const defaults = done === null && defaultsFor ? defaultsFor(m) : null;
    onChange(
      patchCardio(
        log,
        defaults
          ? {
              mode: m,
              minutes: defaults.minutes,
              incline: defaults.incline ?? null,
              speed: defaults.speed ?? null,
            }
          : { mode: m },
      ),
    );
  };
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

      {detailed && (
        <div className="row cardio__gauges">
          <Stepper
            label="שיפוע"
            unit="%"
            value={cardio.incline ?? null}
            onChange={(incline) => onChange(patchCardio(log, { incline }))}
            step={CARDIO_STEP}
            min={0}
            max={CARDIO_INCLINE_MAX}
            decimals={1}
            placeholder="0.0"
          />
          <Stepper
            label="מהירות"
            unit='קמ"ש'
            value={cardio.speed ?? null}
            onChange={(speed) => onChange(patchCardio(log, { speed }))}
            step={CARDIO_STEP}
            min={0}
            max={CARDIO_SPEED_MAX}
            decimals={1}
            placeholder="0.0"
          />
        </div>
      )}

      <p className="tiny muted" style={{ margin: 'var(--sp-3) 0 0' }}>
        {done === null
          ? 'לא נרשם'
          : `נרשם: ${cardioModeLabel(mode)} · ${done} דק׳${
              detailed && cardioGaugeText(cardio.incline, cardio.speed)
                ? ` · ${cardioGaugeText(cardio.incline, cardio.speed)}`
                : ''
            }`}
      </p>
    </div>
  );
}
