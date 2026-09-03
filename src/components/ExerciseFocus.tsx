import type { LoggedExercise, LoggedSet } from '../types';
import type { Exercise } from '../data/program';
import { WEIGHT_STEP } from '../data/config';
import type { ExerciseHistory } from '../lib/workouts';
import { emptySet, lastWeightOf, setPerformed, setValue } from '../lib/workouts';
import { formatDM } from '../lib/date';
import { clean, DASH } from '../lib/format';
import Stepper from './Stepper';
import NumberField from './NumberField';

type Props = {
  spec: Exercise;
  log: LoggedExercise;
  onChange: (next: LoggedExercise) => void;
  /** הביצועים האחרונים של התרגיל, מהחדש לישן. ריק = אין ביצוע קודם. */
  history: ExerciseHistory[];
  /** נקרא כשסט עובר מריק למלא — מפעיל את טיימר המנוחה. */
  onSetLogged: (setIndex: number) => void;
};

const MAX_WEIGHT = 500;
const MAX_REPS = 999;

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
function historyText(h: ExerciseHistory, timed: boolean, usesWeight: boolean): string {
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
    parts.push(`${distinct.size === 1 ? (weights[0] ?? DASH) : weights.join(',')} ק״ג`);
  }
  parts.push(timed ? `${values} שנ׳` : values);
  return parts.join(' · ');
}

export default function ExerciseFocus({
  spec,
  log,
  onChange,
  history,
  onSetLogged,
}: Props) {
  const timed = spec.isTimed;
  const usesWeight = !timed && !spec.bodyweightOnly;
  const side = sideLabel(spec);
  const weight = lastWeightOf(log);

  /**
   * משקל אחד לתרגיל. במודל הוא עדיין נשמר לכל סט — אותו ערך בכולם —
   * כדי שרשומות קיימות (עם משקל שונה בכל סט) ימשיכו להיקרא.
   */
  const setWeight = (w: number | null) => {
    onChange({ ...log, sets: log.sets.map((s) => ({ ...s, weight: w })) });
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

      {/* היסטוריה לקריאה בלבד: הביצועים האחרונים, לפני שדות הקלט. */}
      <div className="focus__history" aria-label={`ביצועים קודמים — ${spec.name}`}>
        {history.length === 0 ? (
          <p className="tiny muted" style={{ margin: 0 }}>
            אין ביצוע קודם
          </p>
        ) : (
          <ul className="list list--block tiny muted">
            {history.map((h) => (
              <li key={h.workoutId} className="num">
                {historyText(h, timed, usesWeight)}
              </li>
            ))}
          </ul>
        )}
      </div>

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
            placeholder='ק"ג'
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
  );
}
