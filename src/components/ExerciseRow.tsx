import type { LoggedExercise, LoggedSet } from '../types';
import type { Exercise } from '../data/program';
import type { ExerciseHistory } from '../lib/workouts';
import { emptySet, setValue } from '../lib/workouts';
import { getProgressionSuggestion } from '../lib/progression';
import { formatDM } from '../lib/date';
import { clean, DASH } from '../lib/format';
import Stepper from './Stepper';
import NumberField from './NumberField';

type Props = {
  spec: Exercise;
  log: LoggedExercise;
  onChange: (next: LoggedExercise) => void;
  /** הרישום הקודם של אותו תרגיל, לתווית "אחרון". */
  previous: ExerciseHistory | null;
  /** נקרא כשסט מקבל ערך — מפעיל את טיימר המנוחה. */
  onSetLogged?: ((setIndex: number) => void) | undefined;
};

const MAX_WEIGHT = 500;
const MAX_REPS = 999;
/** קפיצת כפתורי ה-± בשדה המשקל. נפרדת מתוספת ההתקדמות, שגסה יותר. */
const WEIGHT_STEP = 2.5;

function historyLabel(prev: ExerciseHistory): string {
  const values = prev.ex.sets.map((s) => {
    const v = setValue(s);
    return v === null ? DASH : String(v);
  });
  const weights = [...new Set(prev.ex.sets.map((s) => s.weight).filter((w) => w !== null))];
  const weight = weights.length === 1 ? `${clean(weights[0])} ק"ג` : null;
  return `אחרון: ${[weight, values.join('/')].filter(Boolean).join(' · ')} · ${formatDM(prev.d)}`;
}

export default function ExerciseRow({
  spec,
  log,
  onChange,
  previous,
  onSetLogged,
}: Props) {
  const timed = spec.isTimed;
  const usesWeight = !timed && !spec.bodyweightOnly;
  const suggestion = getProgressionSuggestion(log, previous?.ex ?? null);
  const perSide = spec.unilateral ? (spec.name.includes('חתיר') ? ' ליד' : ' לצד') : '';

  const patchSet = (i: number, patch: Partial<LoggedSet>) => {
    const sets = log.sets.length > i ? [...log.sets] : [...log.sets, emptySet()];
    const before = sets[i] ?? emptySet();
    const after = { ...before, ...patch };
    sets[i] = after;
    onChange({ ...log, sets });

    // המנוחה נפתחת רק כשסט עובר מריק למלא — לא בכל הקשה על המשקל,
    // ולא כשמתקנים ערך שכבר הוזן.
    const wasEmpty = before.reps === null && before.seconds === null;
    const nowFilled = after.reps !== null || after.seconds !== null;
    if (wasEmpty && nowFilled) onSetLogged?.(i);
  };

  return (
    <div className="exercise">
      <div className="row row--between row--baseline" style={{ marginBottom: 2 }}>
        <h3 className="grow">{spec.name}</h3>
        <span className="tiny muted">
          יעד{' '}
          <span className="num">
            {spec.repRangeMin}–{spec.repRangeMax}
          </span>
          {timed ? ' שנ׳' : ''}
          {perSide}
        </span>
      </div>

      {spec.machine && (
        <p className="tiny muted" style={{ margin: '0 0 var(--sp-2)', direction: 'ltr', textAlign: 'start' }}>
          {spec.machine}
        </p>
      )}

      {spec.note && (
        <p className="tiny" style={{ margin: '0 0 var(--sp-2)' }}>
          {spec.note}
        </p>
      )}

      <div className="stack--tight">
        {log.sets.map((s, i) => (
          <div className="row" key={i}>
            <span className="tiny muted" style={{ minWidth: 34 }}>
              סט {i + 1}
            </span>
            {usesWeight && (
              <div className="grow">
                <Stepper
                  label={`משקל, סט ${i + 1} — ${spec.name}`}
                  hideLabel
                  value={s.weight}
                  onChange={(weight) => patchSet(i, { weight })}
                  step={WEIGHT_STEP}
                  min={0}
                  max={MAX_WEIGHT}
                  decimals={1}
                  placeholder='ק"ג'
                />
              </div>
            )}
            <div style={{ width: usesWeight ? 92 : '100%' }}>
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

      {(previous || suggestion.kind !== 'none') && (
        <div className="stack--tight" style={{ marginTop: 'var(--sp-2)' }}>
          {previous && (
            <p className="tiny muted" style={{ margin: 0 }}>
              {historyLabel(previous)}
            </p>
          )}
          {suggestion.kind !== 'none' && (
            <p className="tiny" style={{ margin: 0 }}>
              {suggestion.text}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
