import type { LoggedExercise, LoggedSet } from '../types';
import type { Exercise } from '../data/program';
import type { ExerciseHistory } from '../lib/workouts';
import { emptySet, setPerformed, setValue } from '../lib/workouts';
import { getProgressionSuggestion } from '../lib/progression';
import { formatDM } from '../lib/date';
import { clean, DASH } from '../lib/format';
import Stepper from './Stepper';
import NumberField from './NumberField';

type Props = {
  spec: Exercise;
  log: LoggedExercise;
  onChange: (next: LoggedExercise) => void;
  previous: ExerciseHistory | null;
  /** נקרא כשסט עובר מריק למלא — מפעיל את טיימר המנוחה. */
  onSetLogged: (setIndex: number) => void;
};

const MAX_WEIGHT = 500;
const MAX_REPS = 999;
/** קפיצת כפתורי ה-± בשדה המשקל. נפרדת מתוספת ההתקדמות, שגסה יותר. */
const WEIGHT_STEP = 2.5;

/** "לרגל" לתרגילי רגליים, "ליד" לתרגילי ידיים, "לצד" לשאר. */
function sideLabel(spec: Exercise): string {
  if (!spec.unilateral) return '';
  if (spec.muscles.some((m) => m.includes('גב') || m.includes('מעוינים'))) return 'ליד';
  if (spec.muscles.some((m) => m.includes('ישבן') || m.includes('ארבע'))) return 'לרגל';
  return 'לצד';
}

function previousText(prev: ExerciseHistory, timed: boolean): string {
  const values = prev.ex.sets
    .map((s) => {
      const v = setValue(s);
      return v === null ? DASH : String(v);
    })
    .join('/');
  const weights = [...new Set(prev.ex.sets.map((s) => s.weight).filter((w) => w !== null))];
  const weight = !timed && weights.length === 1 ? `${clean(weights[0])} ק"ג · ` : '';
  return `${weight}${values}${timed ? ' שנ׳' : ''} · ${formatDM(prev.d)}`;
}

export default function ExerciseFocus({
  spec,
  log,
  onChange,
  previous,
  onSetLogged,
}: Props) {
  const timed = spec.isTimed;
  const usesWeight = !timed && !spec.bodyweightOnly;
  const suggestion = getProgressionSuggestion(log, previous?.ex ?? null);
  const side = sideLabel(spec);

  const patchSet = (i: number, patch: Partial<LoggedSet>) => {
    const sets = log.sets.length > i ? [...log.sets] : [...log.sets, emptySet()];
    const before = sets[i] ?? emptySet();
    const after = { ...before, ...patch };
    sets[i] = after;
    onChange({ ...log, sets });

    // המנוחה נפתחת רק במעבר מריק למלא — לא בכל הקשה על המשקל,
    // ולא כשמתקנים ערך שכבר הוזן.
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

      <div className="row row--between row--baseline focus__meta">
        <span className="tiny muted grow" style={{ direction: 'ltr', textAlign: 'start' }}>
          {spec.machine ?? 'משקל גוף'}
        </span>
        <span className="tiny muted">
          יעד{' '}
          <span className="num">
            {spec.repRangeMin}
            {spec.repRangeMin === spec.repRangeMax ? '' : `–${spec.repRangeMax}`}
          </span>
          {timed ? ' שנ׳' : ''}
          {side ? ` ${side}` : ''}
          {spec.effort ? ` · ${spec.effort}` : ''}
        </span>
      </div>

      <p className="tiny muted focus__muscles">{spec.muscles.join(' · ')}</p>

      {spec.note && <p className="focus__note small">{spec.note}</p>}

      <p className="tiny muted focus__prev">
        {previous ? `הפעם הקודמת: ${previousText(previous, timed)}` : 'אין רישום קודם'}
      </p>

      <div className="focus__sets">
        {log.sets.map((s, i) => (
          <div className="focus__set" key={i}>
            <span className="focus__setno tiny muted">סט {i + 1}</span>
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
            <div className={usesWeight ? 'focus__reps' : 'grow'}>
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

      {suggestion.kind !== 'none' && (
        <p className="small focus__suggestion">{suggestion.text}</p>
      )}
    </div>
  );
}
