import { useState, type ReactNode } from 'react';
import type { LoggedExercise, LoggedSet, Rir } from '../types';
import type { Exercise } from '../data/program';
import { WEIGHT_STEP } from '../data/config';
import { restSeconds } from '../data/program';
import type { ExerciseHistory } from '../lib/workouts';
import { hasData, lastWeightOf, progressPoints, setPerformed, setValue, swappedFromLabel } from '../lib/workouts';
import { formatDM } from '../lib/date';
import { clean, DASH } from '../lib/format';
import ExerciseChart from './ExerciseChart';
import { alternateHint, suggestionLabel, suggestionText, type Suggestion } from '../lib/progression';
import { Button, ChipSelect, Disclosure, Icon, ListRow, Num, Sheet, StatusChip, Stepper, Surface } from '../ui';
import { ArrowLeftRight, Check, Flag, History, Pencil, Play, SkipForward } from '../ui/icons';

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
   * האם "פעם קודמת" פתוח. חי מעל הקומפוננטה כדי שהבחירה תהיה אחת לכל
   * התרגילים ותישמר בין פתיחות (uiState), לא תתאפס במעבר תרגיל.
   */
  historyOpen: boolean;
  onToggleHistory: () => void;
  /** הצעה לאימון הזה מכללי ההתקדמות (lib/progression.ts). null = אין היסטוריה. */
  suggestion?: Suggestion | null | undefined;
  /** שניות המנוחה בין סטים — לשורת המפרט בלבד. חסר = לפי סוג התרגיל. */
  restSec?: number | undefined;
  /** "דלג ואחזור": מזיז את התרגיל לסוף האימון. חסר = לא מוצג. */
  onSkip?: (() => void) | undefined;
  /** "החלף": החלופות לתא הזה. ריק/חסר = אין כפתור. */
  alternates?: readonly AlternateOption[] | undefined;
  /** נבחרה חלופה — מחליפה את התרגיל לאימון הזה בלבד. */
  onSwap?: ((alt: Exercise) => void) | undefined;
  /** מחזיר את התרגיל המקורי לתא. מוצג רק בשורה שהוחלפה ועדיין בלי נתונים. */
  onUnswap?: (() => void) | undefined;
  /** "התרגיל הבא" (או "לסיום" בתרגיל האחרון). חסר = בלי כפתור. */
  onNext?: (() => void) | undefined;
  nextLabel?: string | undefined;
};

const MAX_WEIGHT = 500;
const MAX_REPS = 999;
/** "4+" בתוך Num כדי שהפלוס לא יתהפך ב-RTL. */
const RIR_OPTIONS: readonly { value: Rir; label: ReactNode }[] = [
  { value: 0, label: '0' },
  { value: 1, label: '1' },
  { value: 2, label: '2' },
  { value: 3, label: '3' },
  { value: 4, label: <Num>4+</Num> },
];

/** "לרגל" לתרגילי רגליים, "ליד" לתרגילי ידיים, "לצד" לשאר. */
function sideLabel(spec: Exercise): string {
  if (!spec.unilateral) return '';
  if (spec.muscles.some((m) => m.includes('גב') || m.includes('מעוינים'))) return 'ליד';
  if (spec.muscles.some((m) => m.includes('ישבן') || m.includes('ארבע'))) return 'לרגל';
  return 'לצד';
}

function mmss(total: number): string {
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
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

/** "RIR 2" כשנרשם, אחרת ריק. */
function rirText(h: ExerciseHistory): string {
  return h.ex.rir === undefined ? '' : ` · RIR ${h.ex.rir === 4 ? '4+' : h.ex.rir}`;
}

/**
 * הערכים שממלאים את ה-steppers מראש (החלטה 3): ההצעה, ואם אין — הסשן
 * הקודם, ואם אין (סשן כיול) — ריק, וחייבים להזין. סט שכבר נרשם מציג את
 * מה שנרשם.
 */
function initialReps(log: LoggedExercise, timed: boolean, suggestion: Suggestion | null, prev: ExerciseHistory | undefined): (number | null)[] {
  return log.sets.map((s, i) => {
    const stored = timed ? s.seconds : s.reps;
    if (stored !== null) return stored;
    if (suggestion) return suggestion.repTarget;
    const p = prev?.ex.sets[i];
    if (p) return timed ? p.seconds : p.reps;
    return null;
  });
}

function initialWeight(log: LoggedExercise, usesWeight: boolean, suggestion: Suggestion | null): number | null {
  if (!usesWeight) return null;
  // תרגיל שכבר נרשם בו סט (המשך סשן, עריכת אימון עבר): המשקל שנרשם.
  if (hasData(log)) return lastWeightOf(log);
  // ההצעה; כשאין לה מספר ("דרגה אחת למעלה") — המשקל האחרון, שכבר מולא מראש.
  return suggestion?.weight ?? lastWeightOf(log);
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
  restSec,
  onSkip,
  alternates = [],
  onSwap,
  onUnswap,
  onNext,
  nextLabel = 'התרגיל הבא',
}: Props) {
  const timed = spec.isTimed;
  // תרגיל זמן עם משקל (פלאנק + פלטה): שדה משקל אופציונלי; ריק = משקל גוף.
  const usesWeight = !spec.bodyweightOnly;
  const side = sideLabel(spec);
  const prev = history[0];
  const [weight, setWeightDraft] = useState<number | null>(() => initialWeight(log, usesWeight, suggestion));
  const [reps, setReps] = useState<(number | null)[]>(() => initialReps(log, timed, suggestion, prev));
  /** סט שנרשם ונפתח לעריכה. */
  const [editing, setEditing] = useState<number | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [swapOpen, setSwapOpen] = useState(false);
  const swapped = swappedFromLabel(log);
  const hint = alternateHint(suggestion, log.swappedFrom !== undefined);
  const canSwap = onSwap !== undefined && alternates.length > 0 && log.swappedFrom === undefined;
  const canUnswap = onUnswap !== undefined && log.swappedFrom !== undefined && !hasData(log);
  const measure = timed ? 'seconds' : usesWeight ? 'weight' : 'reps';
  const unit = timed ? 'שנ׳' : usesWeight ? 'ק״ג' : 'חזרות';
  const points = progressPoints(fullHistory, measure);
  const performed = log.sets.map(setPerformed);
  const allLogged = performed.length > 0 && performed.every(Boolean);
  const nextIdx = performed.findIndex((p) => !p);
  const rirOpen = allLogged || log.rir !== undefined;

  /**
   * משקל אחד לתרגיל (R2). במודל הוא עדיין נשמר לכל סט — אותו ערך בכולם —
   * כדי שרשומות קיימות (עם משקל שונה בכל סט) ימשיכו להיקרא. השינוי נכתב
   * מיד, כמו קודם; המילוי מראש מההצעה נכתב רק ב"רשום" הראשון.
   */
  const setWeight = (w: number | null) => {
    setWeightDraft(w);
    onChange({ ...log, sets: log.sets.map((s) => ({ ...s, weight: w })) });
  };

  /** RIR בסט האחרון: לחיצה חוזרת מנקה. אופציונלי — לא חוסם שמירה. */
  const setRir = (v: Rir | null) => {
    const { rir: current, ...rest } = log;
    onChange(v === null || current === v ? rest : { ...rest, rir: v });
  };

  /**
   * "רשום": שומר את הערכים שמוצגים — המשקל לכל הסטים (R2) והחזרות לסט הזה.
   * המנוחה נפתחת רק במעבר מריק למלא — לא כשמתקנים ערך שכבר הוזן.
   */
  const logSet = (i: number) => {
    const v = reps[i] ?? null;
    if (v === null) return;
    const before = log.sets[i];
    if (!before) return;
    const sets = log.sets.map((s, j) => ({
      ...s,
      ...(usesWeight ? { weight } : {}),
      ...(j === i ? (timed ? { seconds: v } : { reps: v }) : {}),
    }));
    const after = sets[i]!;
    onChange({ ...log, sets });
    if (!setPerformed(before) && setPerformed(after)) onSetLogged(i);
  };

  /** עריכה של סט שנרשם: כל שינוי ב-stepper נכתב מיד, כמו השדה הקודם. */
  const editSet = (i: number, v: number | null) => {
    setReps((r) => r.map((x, j) => (j === i ? v : x)));
    const sets = log.sets.map((s, j) => (j === i ? { ...s, ...(timed ? { seconds: v } : { reps: v }) } : s));
    onChange({ ...log, sets });
  };

  const setDraft = (i: number, v: number | null) => setReps((r) => r.map((x, j) => (j === i ? v : x)));

  const sugLabel = suggestion ? suggestionLabel(suggestion, spec) : null;
  const sugTone = suggestion
    ? suggestion.rirUnknown
      ? 'partial'
      : suggestion.action === 'up'
        ? 'done'
        : suggestion.action === 'down'
          ? 'partial'
          : 'neutral'
    : 'missing';

  return (
    <div className="focus">
      <h2 className="focus__name">{spec.name}</h2>
      {swapped && (
        <p className="tiny wk-swapped focus__swapped">
          {swapped}
          {canUnswap && (
            <Button variant="ghost" onClick={onUnswap}>
              בטל החלפה
            </Button>
          )}
        </p>
      )}

      {/* המפרט: סטים × טווח · RIR · מנוחה · מכונה */}
      <p className="focus__spec">
        יעד{' '}
        <Num>
          {log.sets.length}×{spec.repRangeMin}
          {spec.repRangeMin === spec.repRangeMax ? '' : `–${spec.repRangeMax}`}
        </Num>
        {timed ? ' שנ׳' : ''}
        {side ? ` ${side}` : ''}
        {spec.effort ? ` · ${spec.effort}` : ''}
        {' · מנוחה '}
        <Num>{mmss(restSec ?? restSeconds(spec.type, false))}</Num>
        {spec.machine ? (
          <>
            {' · '}
            <Num>{spec.machine}</Num>
          </>
        ) : null}
      </p>
      <p className="tiny muted focus__muscles">{spec.muscles.join(' · ')}</p>

      {/* הערות הביצוע והסרטון — שורה אחת שנפתחת. */}
      {(spec.note || spec.videoUrl) && (
        <Disclosure title="הערות ביצוע וסרטון" lead={Pencil} className="focus__notes" keepMounted>
          {spec.note && <p className="focus__note small">{spec.note}</p>}
          {spec.videoUrl && (
            // קישור רגיל בלבד: בלי preload, בלי אימות, בלי iframe.
            <a
              className="btn btn--quiet focus__video"
              href={spec.videoUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`סרטון הדגמה — ${spec.name}`}
            >
              <Icon icon={Play} size={18} />
              סרטון הדגמה
            </a>
          )}
        </Disclosure>
      )}

      {/* פאנל ההצעה: ההצעה, הכלל, הסבר, והסשן הקודם בשורה אחת. */}
      <Surface as="div" variant="sunk" className={`wk-suggest wk-suggest--${sugTone}`} role="note" aria-label="הצעה">
        {suggestion && sugLabel ? (
          <>
            <div className="wk-suggest__head">
              <span className="wk-suggest__label">
                <Icon icon={Flag} size={16} />
                הצעה
              </span>
              <StatusChip tone={sugTone === 'neutral' ? 'neutral' : sugTone}>
                <Num>{suggestion.rule === 'M' ? 'שימור' : suggestion.rule}</Num>
              </StatusChip>
            </div>
            <p className="wk-suggest__value">
              {suggestion.rule === 'M' ? (
                // עברית עם מספרים — RTL רגיל, לא Num (שהיה הופך את סדר המילים).
                <span className="wk-suggest__text wk-hist">{suggestionText(suggestion, spec)}</span>
              ) : (
                <>
                  {suggestion.weight !== null && sugLabel.weight === `${clean(suggestion.weight)} ק״ג` ? (
                    <>
                      <Num>{clean(suggestion.weight)}</Num>
                      <span className="wk-suggest__unit">ק״ג</span>
                    </>
                  ) : (
                    <span className="wk-suggest__text">{sugLabel.weight}</span>
                  )}
                  <span className="wk-suggest__x">×</span>
                  <Num>{suggestion.repTarget}</Num>
                  <span className="wk-suggest__unit">{timed ? 'שנ׳' : 'חזרות'}</span>
                </>
              )}
            </p>
            <p className="tiny muted wk-suggest__reason">{suggestion.reason}</p>
            {suggestion.rirUnknown && <StatusChip tone="partial">RIR לא נרשם — אשר בעצמך</StatusChip>}
          </>
        ) : (
          <>
            <div className="wk-suggest__head">
              <span className="wk-suggest__label">
                <Icon icon={Flag} size={16} />
                {hint ? 'חלופה' : 'סשן כיול'}
              </span>
              <StatusChip tone="missing">אין היסטוריה</StatusChip>
            </div>
            <p className="small wk-suggest__reason">{hint ?? 'אין הצעה — הזן משקל וחזרות בעצמך, והאימון הבא כבר יקבל הצעה.'}</p>
          </>
        )}

        {prev && (
          <Disclosure
            className="wk-prev"
            lead={History}
            title={
              <>
                פעם קודמת · <Num>{formatDM(prev.d)}</Num>
              </>
            }
            summary={
              <span className="wk-hist">
                {historyText(prev, timed, usesWeight, spec.bodyweightStart).replace(`${formatDM(prev.d)} · `, '')}
                {rirText(prev)}
              </span>
            }
            open={historyOpen}
            onToggle={onToggleHistory}
          >
            <ul className="list list--block tiny muted" aria-label={`ביצועים קודמים — ${spec.name}`}>
              {history.map((h) => (
                <li key={h.workoutId} className="wk-hist">
                  {historyText(h, timed, usesWeight, spec.bodyweightStart)}
                  {rirText(h)}
                </li>
              ))}
            </ul>
            {fullHistory.length >= 2 && (
              <Button variant="ghost" aria-expanded={showAll} onClick={() => setShowAll((v) => !v)}>
                {showAll ? 'הסתר' : 'כל ההיסטוריה'} (<Num>{fullHistory.length}</Num>)
              </Button>
            )}
            {showAll && (
              <div className="stack--tight" style={{ marginTop: 'var(--sp-2)' }}>
                <ExerciseChart points={points} unit={unit} label={`התקדמות ${spec.name}`} />
                <ul className="list list--block tiny muted" aria-label={`כל הביצועים — ${spec.name}`}>
                  {[...fullHistory].reverse().map((h) => (
                    <li key={h.workoutId} className="wk-hist">
                      {historyText(h, timed, usesWeight, spec.bodyweightStart)}
                      {rirText(h)}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Disclosure>
        )}
      </Surface>

      {/* משקל אחד לכל הסטים (R2). תרגיל משקל גוף: בלי שדה. */}
      <div className="focus__weight">
        <span className="focus__weight-label">
          {usesWeight ? (
            <>
              משקל <span className="muted">· לכל הסטים</span>
            </>
          ) : (
            'משקל'
          )}
        </span>
        {usesWeight ? (
          <Stepper
            label={`משקל — ${spec.name}`}
            hideLabel
            value={weight}
            onChange={setWeight}
            step={WEIGHT_STEP}
            min={0}
            max={MAX_WEIGHT}
            decimals={1}
            unit='ק"ג'
            placeholder={timed || spec.bodyweightStart ? 'משקל גוף' : 'ק"ג'}
          />
        ) : (
          <span className="focus__bw">משקל גוף</span>
        )}
      </div>

      {/* שורת סט לכל סט: מספר, stepper חזרות, "רשום". הסט הבא — "רשום" ברוחב מלא, במבטא. */}
      <div className="focus__sets" role="group" aria-label={`סטים — ${spec.name}`}>
        {log.sets.map((s, i) => {
          const logged = performed[i] ?? false;
          const isNext = i === nextIdx;
          const value = timed ? s.seconds : s.reps;
          const draft = reps[i] ?? null;
          const unitWord = timed ? 'שניות' : 'חזרות';
          return (
            <div key={i} className={`set${logged ? ' is-done' : isNext ? ' is-next' : ''}`}>
              <div className="set__row">
                <span className="set__no num" aria-hidden="true">
                  {i + 1}
                </span>
                {logged && editing !== i ? (
                  <button
                    type="button"
                    className="set__done"
                    onClick={() => setEditing(i)}
                    aria-label={`סט ${i + 1} — נרשם ${usesWeight && s.weight !== null ? `${clean(s.weight)} × ` : ''}${value ?? DASH}${timed ? ' שנ׳' : ''}. ערוך`}
                  >
                    <Icon icon={Check} size={18} />
                    <Num>
                      {usesWeight && s.weight !== null ? `${clean(s.weight)} × ` : ''}
                      {value ?? DASH}
                    </Num>
                    {timed && <span className="tiny muted">שנ׳</span>}
                  </button>
                ) : (
                  <>
                    <div className="set__reps">
                      <Stepper
                        label={`${unitWord}, סט ${i + 1} — ${spec.name}`}
                        hideLabel
                        compact
                        value={logged ? value : draft}
                        onChange={(v) => (logged ? editSet(i, v) : setDraft(i, v))}
                        step={1}
                        min={0}
                        max={MAX_REPS}
                        decimals={0}
                        placeholder={timed ? 'שנ׳' : 'חזרות'}
                      />
                    </div>
                    {logged ? (
                      <Button variant="secondary" aria-label={`סיום עריכה — סט ${i + 1}`} onClick={() => setEditing(null)}>
                        <Icon icon={Check} size={18} />
                      </Button>
                    ) : isNext ? null : (
                      <Button variant="secondary" onClick={() => logSet(i)} disabled={draft === null} aria-label={`רשום סט ${i + 1}`}>
                        רשום
                      </Button>
                    )}
                  </>
                )}
              </div>
              {isNext && (
                <Button variant="accent" block tall className="set__log" onClick={() => logSet(i)} disabled={draft === null}>
                  <Icon icon={Check} size={20} />
                  רשום סט <Num>{i + 1}</Num>
                  {draft !== null && (
                    <span className="set__log-val">
                      <Num>
                        {usesWeight && weight !== null ? `${clean(weight)} × ` : ''}
                        {draft}
                      </Num>
                    </span>
                  )}
                </Button>
              )}
            </div>
          );
        })}
      </div>

      {/* RIR בסט האחרון — הקלט שכללי ההתקדמות צריכים (R1/R5). נפתח כשלב הבא אחרי הסט האחרון. */}
      {rirOpen && (
        <div className={`wk-rir${allLogged && log.rir === undefined ? ' is-due' : ''}`}>
          <ChipSelect<Rir>
            label="חזרות ברזרבה בסט האחרון"
            options={RIR_OPTIONS}
            value={log.rir ?? null}
            onChange={setRir}
          />
          {allLogged && log.rir === undefined && onNext && (
            <Button variant="ghost" onClick={onNext}>
              המשך בלי RIR
            </Button>
          )}
        </div>
      )}

      {/* "דלג ואחזור" ו"החלף" שקטים ליד "התרגיל הבא". */}
      <div className="wk-actions">
        {canSwap && (
          <Button variant="ghost" icon={ArrowLeftRight} aria-haspopup="dialog" onClick={() => setSwapOpen(true)}>
            החלף
          </Button>
        )}
        {onSkip && (
          <Button variant="ghost" icon={SkipForward} onClick={onSkip}>
            דלג ואחזור
          </Button>
        )}
        {onNext && (!allLogged || log.rir !== undefined) && (
          <Button variant={allLogged ? 'accent' : 'secondary'} className="grow" onClick={onNext}>
            {nextLabel}
          </Button>
        )}
      </div>

      {/* "החלף": רשימת החלופות לתא — שם, הערה, והביצוע האחרון של החלופה עצמה. */}
      {canSwap && swapOpen && (
        <Sheet title={`החלף — ${spec.name}`} onClose={() => setSwapOpen(false)}>
          <p className="tiny muted" style={{ margin: 0 }}>
            לאימון הזה בלבד. ההיסטוריה של החלופה נשמרת תחת השם שלה.
          </p>
          <div aria-label={`חלופות ל-${spec.name}`}>
            {alternates.map((a) => (
              <ListRow
                key={a.spec.id}
                title={a.spec.name}
                sub={
                  <>
                    {a.spec.note ? `${a.spec.note} · ` : ''}
                    <span className="num">
                      {a.last ? `אחרון: ${historyText(a.last, a.spec.isTimed, !a.spec.bodyweightOnly, a.spec.bodyweightStart)}` : 'אין ביצוע קודם'}
                    </span>
                  </>
                }
                onTap={() => {
                  setSwapOpen(false);
                  onSwap?.(a.spec);
                }}
              />
            ))}
          </div>
        </Sheet>
      )}
    </div>
  );
}
