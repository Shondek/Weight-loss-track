import { useId, useState } from 'react';
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
import { mmss } from '../hooks/timerCore';
import { ChipSelect, Num } from '../ui';

/** חימום: 6–10 דקות בנגיעה אחת. משך אחר — "אחר" פותח את שדה הדקות, כמו קודם. */
const WARMUP_MINUTES = [6, 7, 8, 9, 10] as const;
type WarmupChoice = (typeof WARMUP_MINUTES)[number] | 'other';
const WARMUP_OPTIONS: readonly { value: WarmupChoice; label: string }[] = [
  ...WARMUP_MINUTES.map((m) => ({ value: m, label: String(m) })),
  { value: 'other', label: 'אחר' },
];

/** אירובי: ספירה לאחור לפי הדקות שבשדה, או סטופר (עד תקרת הדקות). */
export type CardioTimerMode = 'countdown' | 'stopwatch';
export const CARDIO_TIMER_OPTIONS: readonly { value: CardioTimerMode; label: string }[] = [
  { value: 'countdown', label: 'ספירה לאחור' },
  { value: 'stopwatch', label: 'סטופר' },
];

/** השעון החי של ריצה פעילה — מהטיימר של האפליקציה (מבוסס זמן סיום). */
export type CardioClock = { elapsedSec: number; remainingSec: number; stopwatch: boolean };

/** "12:34 עברו · נשארו 17:26" — השעון בתוך כרטיס הריצה. */
export function CardioClockLine({ clock }: { clock: CardioClock }) {
  return (
    <p className="cardio__clock" role="timer" aria-label={`עברו ${mmss(clock.elapsedSec)}${clock.stopwatch ? '' : `, נשארו ${mmss(clock.remainingSec)}`}`}>
      <Num className="cardio__clock-main">{mmss(clock.elapsedSec)}</Num>
      <span className="cardio__clock-sub">
        עברו
        {!clock.stopwatch && (
          <>
            {' · נשארו '}
            <Num>{mmss(clock.remainingSec)}</Num>
          </>
        )}
      </span>
    </p>
  );
}

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
  /** `stopwatch` — ריצה בלי זמן יעד (סטופר); אחרת ספירה לאחור לפי הדקות שבשדה. */
  onStartSession?: ((stopwatch: boolean) => void) | undefined;
  /** השעון החי של הריצה הפעילה (מהטיימר). חסר = לא מוצג. */
  clock?: CardioClock | null | undefined;
  onSessionChange?: ((patch: { incline?: number | null; speed?: number | null }) => void) | undefined;
  onFinishSession?: (() => void) | undefined;
  /** אירובי שכבר נרשם: פותח את הסיכום לעריכה. */
  onEditSummary?: (() => void) | undefined;
  /** דקות שנשארו בתקציב השבועי (שלב 4). null = לא מוצג (חימום). */
  remainingMinutes?: number | null | undefined;
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
  remainingMinutes = null,
  onSessionChange,
  onFinishSession,
  onEditSummary,
  clock = null,
}: Props) {
  const groupId = useId();
  const cardio = cardioOf(log);
  const { mode, minutes } = cardio;
  /** חימום: "אחר" נבחר — שדה הדקות פתוח. מתחיל פתוח רק כשהמשך השמור אינו 6–10. */
  const [otherMinutes, setOtherMinutes] = useState(() => !(WARMUP_MINUTES as readonly number[]).includes(minutes));
  /** אירובי סיום: ספירה לאחור או סטופר. בחירה במסך בלבד, עד "התחל". */
  const [timerMode, setTimerMode] = useState<CardioTimerMode>('countdown');
  const stopwatch = detailed === true && timerMode === 'stopwatch';
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
          {running.plannedMinutes >= CARDIO_MAX_MINUTES ? (
            'סטופר'
          ) : (
            <>
              <span className="num">{running.plannedMinutes}</span> דק׳ מתוכננות
            </>
          )}
        </p>
        {clock && <CardioClockLine clock={clock} />}
        <p className="tiny muted" style={{ margin: 'var(--sp-1) 0 0' }}>
          כל שינוי שיפוע או מהירות נרשם עם חותמת זמן. אין השהיה. בסיום הדקות מתמלאות לפי הזמן שעבר.
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

        {detailed ? (
          <ChipSelect<CardioTimerMode>
            label={`טיימר — ${log.n}`}
            hideLabel
            className="cardio__timer"
            options={CARDIO_TIMER_OPTIONS}
            value={timerMode}
            clearable={false}
            onChange={(v) => v && setTimerMode(v)}
          />
        ) : (
          <ChipSelect<WarmupChoice>
            label={`דקות — ${log.n}`}
            hideLabel
            columns={WARMUP_OPTIONS.length}
            options={WARMUP_OPTIONS}
            value={otherMinutes ? 'other' : (minutes as WarmupChoice)}
            clearable={false}
            onChange={(v) => {
              if (v === 'other') setOtherMinutes(true);
              else if (v !== null) {
                setOtherMinutes(false);
                setMinutes(v);
              }
            }}
          />
        )}

        {(detailed ? !stopwatch : otherMinutes) && (
          <div className="cardio__minutes">
            <NumberField
              label={detailed ? `דקות — ${log.n}` : `דקות אחרות — ${log.n}`}
              hideLabel
              value={minutes}
              onChange={setMinutes}
              min={0}
              max={CARDIO_MAX_MINUTES}
              placeholder="דק׳"
            />
            <span className="tiny muted">דק׳</span>
          </div>
        )}

        <button
          type="button"
          className="btn btn--primary"
          disabled={(!stopwatch && minutes <= 0) || (detailed && sessionBusy)}
          onClick={() => {
            if (detailed) {
              onStartSession?.(stopwatch);
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

      {detailed && remainingMinutes !== null && (
        <p className={`tiny${remainingMinutes === 0 ? ' wk-budget--over' : ' muted'}`} style={{ margin: 'var(--sp-2) 0 0' }}>
          {remainingMinutes === 0 ? 'התקציב השבועי נוצל' : <>נשארו <span className="num">{remainingMinutes}</span> דק׳ השבוע</>}
        </p>
      )}

      <p className="tiny muted" style={{ margin: 'var(--sp-3) 0 0' }}>
        {detailed
          ? sessionBusy
            ? 'ריצת אירובי אחרת פעילה — סיים אותה קודם.'
            : stopwatch
              ? `לא נרשם. סטופר — בלי זמן יעד (עד ${CARDIO_MAX_MINUTES} דק׳); "סיים" ממלא את הדקות לפי הזמן שעבר.`
              : 'לא נרשם. "התחל" פותח ריצה; הרשומה נכתבת רק מהסיכום.'
          : done === null
            ? 'לא נרשם'
            : `נרשם: ${cardioModeLabel(mode)} · ${done} דק׳`}
      </p>
    </div>
  );
}
