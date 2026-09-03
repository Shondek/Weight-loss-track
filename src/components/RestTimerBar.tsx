import type { RestTimer } from '../hooks/useRestTimer';

type Props = {
  timer: RestTimer;
  soundEnabled: boolean;
  onToggleSound: (v: boolean) => void;
};

function mmss(total: number): string {
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * שורת הטיימר. לא חוסמת — אפשר להזין את הסט הבא בזמן שהיא רצה.
 * יושבת מעל הניווט התחתון כדי שתיראה בלי לגלול.
 *
 * מנוחה: ±15 ודלג. ספירה לאחור (חימום/אירובי): השהה/המשך, אפס, דלג.
 */
export default function RestTimerBar({ timer, soundEnabled, onToggleSound }: Props) {
  if (!timer.running && !timer.justFinished) return null;

  return (
    <div className="resttimer" role="status" aria-live="polite">
      <div className="resttimer__inner">
        {timer.running ? (
          <>
            <span className="resttimer__count num">{mmss(timer.remainingSec)}</span>
            <span className="grow tiny muted">{timer.label}</span>
            {timer.kind === 'countdown' ? (
              <>
                <button
                  type="button"
                  className="btn btn--quiet"
                  onClick={timer.paused ? timer.resume : timer.pause}
                >
                  {timer.paused ? 'המשך' : 'השהה'}
                </button>
                <button type="button" className="btn btn--quiet" onClick={timer.reset}>
                  אפס
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  className="btn btn--step"
                  onClick={() => timer.add(-15)}
                  aria-label="הפחת 15 שניות"
                >
                  <span className="num">−15</span>
                </button>
                <button
                  type="button"
                  className="btn btn--step"
                  onClick={() => timer.add(15)}
                  aria-label="הוסף 15 שניות"
                >
                  <span className="num">+15</span>
                </button>
              </>
            )}
            <button type="button" className="btn btn--quiet" onClick={timer.skip}>
              דלג
            </button>
          </>
        ) : (
          <>
            <span className="resttimer__count">סיום</span>
            <span className="grow tiny muted">{timer.label}</span>
          </>
        )}
        <button
          type="button"
          className="btn btn--quiet"
          aria-pressed={soundEnabled}
          onClick={() => onToggleSound(!soundEnabled)}
          title={soundEnabled ? 'כבה צליל' : 'הפעל צליל'}
        >
          {soundEnabled ? 'צליל' : 'שקט'}
        </button>
      </div>
    </div>
  );
}
