import { useId, useState } from 'react';
import type { LoggedExercise, LoggedSet, Rir } from '../types';
import type { Exercise } from '../data/program';
import { WEIGHT_STEP } from '../data/config';
import type { ExerciseHistory } from '../lib/workouts';
import { emptySet, hasData, lastWeightOf, progressPoints, setPerformed, setValue, swappedFromLabel } from '../lib/workouts';
import { formatDM } from '../lib/date';
import { clean, DASH } from '../lib/format';
import Stepper from './Stepper';
import NumberField from './NumberField';
import ExerciseChart from './ExerciseChart';
import { alternateHint, suggestionLabel, suggestionText, type Suggestion } from '../lib/progression';

/** חלופה שמוצעת ב"החלף": המפרט שלה והביצוע האחרון שלה (לפי המזהה שלה). */
export type AlternateOption = { spec: Exercise; last: ExerciseHistory | null };

type Props = {
  spec: Exercise;
  log: LoggedExercise;
  onChange: (next: LoggedExercise) => void;
  /** הביצועים האחרונים של התרגיל, מהחדש לישן. ריק = אין ביצוע קודם. */
  history: ExerciseHistory[];
  /** כל הביצועים של התרגיל, מהישן לחדש — לגרף ולרשימה המלאה. */
  fullHistory: ExerciseHistory[];
  /** נקרא כשסט עובר מריק למלא — מפעיל את טיימר המנוחה. */
  onSetLogged: (setIndex: number) => void;
  /**
   * האם "ביצועים קודמים" פתוח. חי מעל הקומפוננטה כדי שהבחירה תהיה אחת
   * לכל התרגילים ותישמר בין פתיחות (uiState), לא תתאפס במעבר תרגיל.
   */
  historyOpen: boolean;
  onToggleHistory: () => void;
  /** הצעה לאימון הזה מכללי ההתקדמות (lib/progression.ts). null = אין היסטוריה. */
  suggestion?: Suggestion | null | undefined;
  /** "דלג ואחזור" (שלב 4.1): מזיז את התרגיל לסוף האימון. חסר = לא מוצג. */
  onSkip?: (() => void) | undefined;
  /** "החלף" (שלב 4.1): החלופות לתא הזה. ריק/חסר = אין כפתור. */
  alternates?: readonly AlternateOption[] | undefined;
  /** נבחרה חלופה — מחליפה את התרגיל לאימון הזה בלבד. */
  onSwap?: ((alt: Exercise) => void) | undefined;
  /** מחזיר את התרגיל המקורי לתא. מוצג רק בשורה שהוחלפה ועדיין בלי נתונים. */
  onUnswap?: (() => void) | undefined;
};

const MAX_WEIGHT = 500;
const MAX_REPS = 999;
const RIR_OPTIONS: readonly Rir[] = [0, 1, 2, 3, 4];

/** "לרגל" לתרגילי רגליים, "ליד" לתרגילי ידיים, "לצד" לשאר. */
function sideLabel(spec: Exercise): string {
  if (!spec.unilateral) return '';
  if (spec.muscles.some((m) => m.includes('גב') || m.includes('מעוינים'))) return 'ליד';
  if (spec.muscles.some((m) => m.includes('ישבן') || m.includes('ארבע'))) return 'לרגל';
  return 'לצד';
}

/**
 * שורת היסטוריה: "03/09 · 40 ק״ג · 12,12,10". נתונים בלבד — בלי פרשנות.
 * רשומה ישנה עם משקל שונה בכל סט מציגה את כולם, כדי לא להסתיר דבר.
 */
function historyText(h: ExerciseHistory, timed: boolean, usesWeight: boolean, bodyweightStart = false): string {
  const performed = h.ex.sets.filter(setPerformed);
  const values = performed
    .map((s) => {
      const v = setValue(s);
      return v === null ? DASH : String(v);
    })
    .join(',');
  const parts = [formatDM(h.d)];
  if (usesWeight) {
    const weights = performed.map((s) => (s.weight === null ? DASH : clean(s.weight)));
    const distinct = new Set(weights);
    // תרגיל זמן שנרשם בלי משקל (פלאנק ישן) = משקל גוף, לא "—". משקל גוף
    // כפתיחה (A6): ריק או 0 = משקל גוף.
    const bodyweight = (s: LoggedSet) => s.weight === null || (bodyweightStart && s.weight === 0);
    if ((timed || bodyweightStart) && performed.length > 0 && performed.every(bodyweight)) parts.push('משקל גוף');
    else parts.push(`${distinct.size === 1 ? (weights[0] ?? DASH) : weights.join(',')} ק״ג`);
  }
  parts.push(timed ? `${values} שנ׳` : values);
  return parts.join(' · ');
}

export default function ExerciseFocus({
  spec,
  log,
  onChange,
  history,
  fullHistory,
  onSetLogged,
  historyOpen,
  onToggleHistory,
  suggestion = null,
  onSkip,
  alternates = [],
  onSwap,
  onUnswap,
}: Props) {
  const timed = spec.isTimed;
  // תרגיל זמן עם משקל (פלאנק + פלטה): שדה משקל אופציונלי; ריק = משקל גוף.
  const usesWeight = !spec.bodyweightOnly;
  const side = sideLabel(spec);
  const weight = lastWeightOf(log);
  const [showAll, setShowAll] = useState(false);
  const [swapOpen, setSwapOpen] = useState(false);
  const historyId = useId();
  const altsId = useId();
  const swapped = swappedFromLabel(log);
  const hint = alternateHint(suggestion, log.swappedFrom !== undefined);
  const canSwap = onSwap !== undefined && alternates.length > 0 && log.swappedFrom === undefined;
  const canUnswap = onUnswap !== undefined && log.swappedFrom !== undefined && !hasData(log);
  const measure = timed ? 'seconds' : usesWeight ? 'weight' : 'reps';
  const unit = timed ? 'שנ׳' : usesWeight ? 'ק״ג' : 'חזרות';
  const points = progressPoints(fullHistory, measure);

  /**
   * משקל אחד לתרגיל. במודל הוא עדיין נשמר לכל סט — אותו ערך בכולם —
   * כדי שרשומות קיימות (עם משקל שונה בכל סט) ימשיכו להיקרא.
   */
  const setWeight = (w: number | null) => {
    onChange({ ...log, sets: log.sets.map((s) => ({ ...s, weight: w })) });
  };

  /** RIR בסט האחרון: לחיצה חוזרת מנקה. אופציונלי — לא חוסם שמירה. */
  const setRir = (v: Rir) => {
    const { rir: current, ...rest } = log;
    onChange(current === v ? rest : { ...rest, rir: v });
  };

  const patchSet = (i: number, patch: Partial<LoggedSet>) => {
    const sets = log.sets.length > i ? [...log.sets] : [...log.sets, emptySet()];
    const before = sets[i] ?? emptySet();
    const after = { ...before, ...patch };
    sets[i] = after;
    onChange({ ...log, sets });

    // המנוחה נפתחת רק במעבר מריק למלא — לא כשמתקנים ערך שכבר הוזן.
    if (!setPerformed(before) && setPerformed(after)) onSetLogged(i);
  };

  return (
    <div className="focus">
      <h3 className="focus__name">
        {spec.name}
        {spec.videoUrl && (
          // קישור רגיל בלבד: בלי preload, בלי אימות, בלי iframe. בלי videoUrl
          // לא מרונדר כלום, כך שהתרגיל נראה זהה.
          <a
            className="focus__video"
            href={spec.videoUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`סרטון הדגמה — ${spec.name}`}
            title="סרטון הדגמה"
          >
            ▶
          </a>
        )}
      </h3>

      {swapped && (
        <p className="tiny wk-swapped" style={{ margin: 0 }}>
          {swapped}
        </p>
      )}

      <div className="row row--between row--baseline focus__meta">
        <span className="tiny muted grow" style={{ direction: 'ltr', textAlign: 'start' }}>
          {spec.machine ?? 'משקל גוף'}
        </span>
        <span className="tiny muted">
          יעד{' '}
          <span className="num">
            {log.sets.length}×{spec.repRangeMin}
            {spec.repRangeMin === spec.repRangeMax ? '' : `–${spec.repRangeMax}`}
          </span>
          {timed ? ' שנ׳' : ''}
          {side ? ` ${side}` : ''}
          {spec.effort ? ` · ${spec.effort}` : ''}
        </span>
      </div>

      <p className="tiny muted focus__muscles">{spec.muscles.join(' · ')}</p>

      {spec.note && <p className="focus__note small">{spec.note}</p>}

      {/*
        היסטוריה לקריאה בלבד, מקופלת: הכותרת תמיד גלויה ואומרת כמה יש
        (או "אין"), התוכן נפתח בלחיצה. הגרף ו"כל ההיסטוריה" מקוננים בפנים.
      */}
      <div className="focus__history">
        <button
          type="button"
          className="btn btn--quiet focus__history-toggle"
          aria-expanded={historyOpen}
          aria-controls={historyId}
          onClick={onToggleHistory}
        >
          <span className="grow" style={{ textAlign: 'start' }}>
            ביצועים קודמים
            {history.length === 0 ? (
              <span className="muted"> · אין</span>
            ) : (
              <>
                {' '}
                (<span className="num">{fullHistory.length}</span>)
              </>
            )}
          </span>
          <span aria-hidden="true">{historyOpen ? '▾' : '▸'}</span>
        </button>

        {historyOpen && history.length > 0 && (
          <div id={historyId} aria-label={`ביצועים קודמים — ${spec.name}`}>
            <ul className="list list--block tiny muted">
              {history.map((h) => (
                <li key={h.workoutId} className="num">
                  {historyText(h, timed, usesWeight, spec.bodyweightStart)}
                </li>
              ))}
            </ul>
            {fullHistory.length >= 2 && (
              <button
                type="button"
                className="btn btn--quiet"
                aria-expanded={showAll}
                onClick={() => setShowAll((v) => !v)}
              >
                {showAll ? 'הסתר' : 'כל ההיסטוריה'} (<span className="num">{fullHistory.length}</span>)
              </button>
            )}
            {showAll && (
              <div className="stack--tight" style={{ marginTop: 'var(--sp-2)' }}>
                <ExerciseChart points={points} unit={unit} label={`התקדמות ${spec.name}`} />
                <ul className="list list--block tiny muted" aria-label={`כל הביצועים — ${spec.name}`}>
                  {[...fullHistory].reverse().map((h) => (
                    <li key={h.workoutId} className="num">
                      {historyText(h, timed, usesWeight, spec.bodyweightStart)}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>

      {/* חלופה בלי היסטוריה משלה: הנחיה במקום כלל. */}
      {hint && (
        <div className="wk-suggest wk-suggest--unknown" role="note">
          <span className="small">{hint}</span>
        </div>
      )}

      {/* הצעה לאימון הבא — מוצגת בלבד; השדה מתמלא רק בלחיצה על "השתמש". */}
      {suggestion && (
        <div className={`wk-suggest wk-suggest--${suggestion.rirUnknown ? 'unknown' : suggestion.action}`} role="note">
          <div className="wk-suggest__head">
            <span className="grow">
              {suggestion.rule === 'M' ? (
                // מצב שימור: "60 שנ׳ × 3 · שימור" — בלי משקל ובלי תג כלל.
                <>
                  הצעה: <span className="num strong">{suggestionText(suggestion, spec)}</span>
                </>
              ) : (
                <>
                  הצעה: <span className="num strong">{suggestionLabel(suggestion, spec).weight}</span> ·{' '}
                  <span className="num">{suggestionLabel(suggestion, spec).reps}</span>
                  <span className="tiny muted"> · {suggestion.rule}</span>
                </>
              )}
            </span>
            {usesWeight && suggestion.weight !== null && (
              <button type="button" className="btn btn--quiet btn--outlined" onClick={() => setWeight(suggestion.weight)}>
                השתמש
              </button>
            )}
          </div>
          <p className="tiny muted" style={{ margin: 0 }}>
            {suggestion.reason}
            {suggestion.rirUnknown && <span className="wk-suggest__warn"> · RIR לא נרשם — אשר בעצמך</span>}
          </p>
        </div>
      )}

      <div className="focus__entry">
        {usesWeight && (
          <div className="focus__weight">
            <Stepper
              label={`משקל — ${spec.name}`}
              value={weight}
              onChange={setWeight}
              step={WEIGHT_STEP}
              min={0}
              max={MAX_WEIGHT}
              decimals={1}
              unit='ק"ג'
              placeholder={timed || spec.bodyweightStart ? 'משקל גוף' : 'ק"ג'}
            />
          </div>
        )}

        <div className="focus__sets">
          {log.sets.map((s, i) => (
            <div className="focus__set" key={i}>
              <span className="focus__setno tiny muted">סט {i + 1}</span>
              <div className="focus__reps">
                <NumberField
                  label={`${timed ? 'שניות' : 'חזרות'}, סט ${i + 1} — ${spec.name}`}
                  hideLabel
                  value={timed ? s.seconds : s.reps}
                  onChange={(v) => patchSet(i, timed ? { seconds: v } : { reps: v })}
                  min={0}
                  max={MAX_REPS}
                  placeholder={timed ? 'שנ׳' : 'חזרות'}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* RIR בסט האחרון — הקלט שכללי ההתקדמות צריכים (R1/R5). */}
      <div className="wk-rir" role="group" aria-label={`חזרות ברזרבה בסט האחרון — ${spec.name}`}>
        <span className="tiny muted">חזרות ברזרבה בסט האחרון</span>
        <div className="nut-chips">
          {RIR_OPTIONS.map((v) => (
            <button key={v} type="button" className="nut-chip" aria-pressed={log.rir === v} onClick={() => setRir(v)}>
              {v === 4 ? '4+' : v}
            </button>
          ))}
        </div>
      </div>

      {(onSkip || canSwap || canUnswap) && (
        <div className="wk-actions">
          {onSkip && (
            <button type="button" className="btn btn--quiet btn--outlined" onClick={onSkip}>
              דלג ואחזור
            </button>
          )}
          {canSwap && (
            <button
              type="button"
              className="btn btn--quiet btn--outlined"
              aria-expanded={swapOpen}
              aria-controls={altsId}
              onClick={() => setSwapOpen((v) => !v)}
            >
              החלף
            </button>
          )}
          {canUnswap && (
            <button type="button" className="btn btn--quiet btn--outlined" onClick={onUnswap}>
              בטל החלפה
            </button>
          )}
        </div>
      )}

      {/* "החלף": רשימת החלופות לתא — שם, הערה, והביצוע האחרון של החלופה עצמה. */}
      {canSwap && swapOpen && (
        <ul id={altsId} className="list list--block wk-alts" aria-label={`חלופות ל-${spec.name}`}>
          {alternates.map((a) => (
            <li key={a.spec.id}>
              <button
                type="button"
                className="btn btn--quiet wk-alt"
                onClick={() => {
                  setSwapOpen(false);
                  onSwap?.(a.spec);
                }}
              >
                <span className="wk-alt__name">{a.spec.name}</span>
                {a.spec.note && <span className="tiny muted">{a.spec.note}</span>}
                <span className="tiny muted num">
                  {a.last ? `אחרון: ${historyText(a.last, a.spec.isTimed, !a.spec.bodyweightOnly, a.spec.bodyweightStart)}` : 'אין ביצוע קודם'}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
