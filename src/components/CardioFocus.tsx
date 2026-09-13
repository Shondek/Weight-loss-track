import { useId } from 'react';
import type { CardioLog, CardioMode, LoggedExercise } from '../types';
import {
  CARDIO_INCLINE_MAX,
  CARDIO_MAX_MINUTES,
  CARDIO_MODES,
  CARDIO_SPEED_MAX,
  CARDIO_STEP,
} from '../data/config';
import { currentValues, type CardioSession } from '../lib/cardioSession';
import {
  cardioDetailLine,
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
  /** חימום: מפעיל ספירה לאחור של `minutes` דקות ורושם מיד. */
  onStart: (minutes: number) => void;
  /** שדות שיפוע ומהירות + ריצה עם מקטעים. לאירובי סיום; החימום מסתפק במכשיר ודקות. */
  detailed?: boolean | undefined;
  /**
   * מה למלא כשמחליפים מכשיר: הרישום האחרון באותו מכשיר. null = אין —
   * ואז הערכים שבשדות נשארים. חל רק כל עוד לא התחילה ריצה.
   */
  defaultsFor?: ((mode: CardioMode) => CardioLog | null) | undefined;
  /**
   * ריצה פעילה שמכוונת לשורה הזו (אירובי סיום בלבד). כשיש — השדות
   * רושמים שינויים עם חותמת זמן, ו"סיים" פותח את הסיכום.
   */
  session?: CardioSession | null | undefined;
  /** ריצה אחרת פעילה (אימון אחר / עצמאי) — אי אפשר להתחיל שנייה. */
  sessionBusy?: boolean | undefined;
  onStartSession?: (() => void) | undefined;
  onSessionChange?: ((patch: { incline?: number | null; speed?: number | null }) => void) | undefined;
  onFinishSession?: (() => void) | undefined;
  /** אירובי שכבר נרשם: פותח את הסיכום לעריכה. */
  onEditSummary?: (() => void) | undefined;
};

/**
 * חימום / אירובי סיום.
 *
 * חימום: בחירת מכשיר, דקות, ו"התחל" — שהוא מה שרושם את הביצוע.
 * אירובי סיום (detailed): "התחל" פותח ריצה בחותמות זמן ולא כותב כלום;
 * שינויי שיפוע/מהירות תוך כדי נרשמים כאירועים; "סיים" פותח סיכום, ורק
 * השמירה משם כותבת את הרשומה (ראה lib/cardioSession.ts).
 */
export default function CardioFocus({
  log,
  onChange,
  onStart,
  detailed,
  defaultsFor,
  session,
  sessionBusy,
  onStartSession,
  onSessionChange,
  onFinishSession,
  onEditSummary,
}: Props) {
  const groupId = useId();
  const cardio = cardioOf(log);
  const { mode, minutes } = cardio;
  const done = cardioMinutesDone(log);
  const running = detailed && session ? session : null;
  const live = running ? currentValues(running) : null;

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

  // ---- אירובי סיום שכבר נרשם: קריאה בלבד + עריכת הסיכום ----
  if (detailed && done !== null && !running) {
    const detail = cardioDetailLine(log);
    return (
      <div className="focus">
        <h3 className="focus__name">{log.n}</h3>
        <p className="sub" style={{ margin: 'var(--sp-3) 0 0' }}>
          נרשם: {cardioModeLabel(mode)} · <span className="num">{done}</span> דק׳
          {cardioGaugeText(cardio.incline, cardio.speed)
            ? ` · ${cardioGaugeText(cardio.incline, cardio.speed)}`
            : ''}
        </p>
        {detail && (
          <p className="tiny muted" style={{ margin: 'var(--sp-1) 0 0' }}>
            {detail}
          </p>
        )}
        <button
          type="button"
          className="btn"
          style={{ marginTop: 'var(--sp-3)' }}
          onClick={onEditSummary}
        >
          ערוך סיכום
        </button>
      </div>
    );
  }

  // ---- ריצה פעילה ----
  if (running && live) {
    return (
      <div className="focus">
        <h3 className="focus__name">{log.n}</h3>
        <p className="sub" style={{ margin: 'var(--sp-3) 0 0' }}>
          רץ · {cardioModeLabel(running.mode)} ·{' '}
          <span className="num">{running.plannedMinutes}</span> דק׳ מתוכננות
        </p>
        <p className="tiny muted" style={{ margin: 'var(--sp-1) 0 0' }}>
          כל שינוי שיפוע או מהירות נרשם עם חותמת זמן. אין השהיה.
        </p>
        <div className="row cardio__gauges">
          <Stepper
            label="שיפוע"
            unit="%"
            value={live.incline}
            onChange={(incline) => onSessionChange?.({ incline })}
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
            onChange={(speed) => onSessionChange?.({ speed })}
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
          onClick={onFinishSession}
        >
          סיים
        </button>
      </div>
    );
  }

  // ---- לפני התחלה (חימום: תמיד; אירובי סיום: עד "התחל") ----
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
          disabled={minutes <= 0 || (detailed && sessionBusy)}
          onClick={() => {
            if (detailed) {
              onStartSession?.();
              return;
            }
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
        {detailed
          ? sessionBusy
            ? 'ריצת אירובי אחרת פעילה — סיים אותה קודם.'
            : 'לא נרשם. "התחל" פותח ריצה; הרשומה נכתבת רק מהסיכום.'
          : done === null
            ? 'לא נרשם'
            : `נרשם: ${cardioModeLabel(mode)} · ${done} דק׳`}
      </p>
    </div>
  );
}
