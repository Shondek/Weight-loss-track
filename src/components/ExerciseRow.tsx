import type { ExerciseLog } from '../types';
import type { ExerciseSpec } from '../data/program';
import type { ExerciseHistory } from '../lib/workouts';
import { progressionHint } from '../lib/workouts';
import { formatDM } from '../lib/date';
import { clean } from '../lib/format';
import Stepper from './Stepper';
import NumberField from './NumberField';

type Props = {
  spec: ExerciseSpec;
  log: ExerciseLog;
  onChange: (next: ExerciseLog) => void;
  /** הרישום הקודם של אותו תרגיל, לתווית "אחרון". */
  previous: ExerciseHistory | null;
};

const MAX_WEIGHT = 500;
const MAX_REPS = 999;

function historyLabel(prev: ExerciseHistory | null, timed: boolean): string | undefined {
  if (!prev) return undefined;
  const sets = prev.r.map((v) => (v === null ? '—' : String(v))).join('/');
  const weight = timed || prev.w === null ? null : `${clean(prev.w)} ק"ג`;
  return `אחרון: ${[weight, sets].filter(Boolean).join(' · ')} · ${formatDM(prev.d)}`;
}

export default function ExerciseRow({ spec, log, onChange, previous }: Props) {
  const timed = spec.kind === 'time';
  const hint = progressionHint(log);
  const setLabel = timed ? 'שנ׳' : 'חזרות';

  const setRep = (i: number, v: number | null) => {
    const r = [log.r[0] ?? null, log.r[1] ?? null, log.r[2] ?? null];
    r[i] = v;
    onChange({ ...log, r });
  };

  return (
    <div className="exercise">
      <div className="row row--between row--baseline" style={{ marginBottom: 'var(--sp-2)' }}>
        <h3 className="grow">{spec.n}</h3>
        <span className="tiny muted">
          יעד{' '}
          <span className="num">
            {spec.min}–{spec.max}
          </span>
          {timed ? ' שנ׳' : ''}
        </span>
      </div>

      {!timed && (
        <div style={{ marginBottom: 'var(--sp-2)' }}>
          <Stepper
            label={`משקל — ${spec.n}`}
            hideLabel
            unit='ק"ג'
            value={log.w}
            onChange={(w) => onChange({ ...log, w })}
            step={spec.step}
            min={0}
            max={MAX_WEIGHT}
            decimals={1}
            placeholder='ק"ג'
          />
        </div>
      )}

      <div className="sets">
        {[0, 1, 2].map((i) => (
          <NumberField
            key={i}
            label={`סט ${i + 1}`}
            suffix={timed ? 'שנ׳' : undefined}
            value={log.r[i] ?? null}
            onChange={(v) => setRep(i, v)}
            min={0}
            max={MAX_REPS}
            placeholder={setLabel}
          />
        ))}
      </div>

      {(previous || hint) && (
        <div className="stack--tight" style={{ marginTop: 'var(--sp-2)' }}>
          {previous && (
            <p className="tiny muted" style={{ margin: 0 }}>
              {historyLabel(previous, timed)}
            </p>
          )}
          {hint && (
            <p className="tiny" style={{ margin: 0 }}>
              {hint}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
