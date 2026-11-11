import type { CSSProperties } from 'react';
import type { RestTimer } from '../hooks/useRestTimer';
import type { FloatingControls } from '../hooks/useFloatingTimer';
import { agoText, finishedTitle, kindLabel, mmss } from '../hooks/timerCore';
import { Button, Icon, Num, useToast } from '../ui';
import { Pause, PictureInPicture2, Play, RotateCcw, Volume2, VolumeX, X } from '../ui/icons';

type Props = {
  timer: RestTimer;
  soundEnabled: boolean;
  onToggleSound: (v: boolean) => void;
  floating: FloatingControls;
};

/**
 * פס הטיימר. לא חוסם — אפשר להזין את הסט הבא בזמן שהוא רץ. יושב מעל
 * הניווט התחתון כדי שייראה בלי לגלול.
 *
 * שורה אחת, בלי שבירה (שלב 7): מימין הכיתוב הקטן ומתחתיו הזמן; משמאל
 * הפקדים. מנוחה: −15, +30, דלג. חימום: השהה/המשך, אפס, דלג. אירובי: תצוגה
 * בלבד ("סיים" נמצא בכרטיס האירובי, כי שם נפתח הסיכום). אחרי הסיום: "המנוחה
 * נגמרה · לפני X שניות" עד שסוגרים או עד שמתחיל טיימר חדש. בקצה: טיימר צף
 * (רק היכן שנתמך) ומתג הצליל.
 */
export default function RestTimerBar({ timer, soundEnabled, onToggleSound, floating }: Props) {
  const toast = useToast();
  if (!timer.running && !timer.finished) return null;

  const openFloating = async () => {
    const ok = await floating.toggle();
    if (!ok) toast.show({ text: 'טיימר צף לא נפתח במכשיר הזה', ms: 3000 });
  };

  const toggleSound = () => {
    const next = !soundEnabled;
    onToggleSound(next);
    // הדלקה מנגנת את הצליל מיד: גם פותחת את השמע בתוך הנגיעה, וגם מאשרת שהוא נשמע.
    if (next) timer.testSound();
  };

  const shownSec = timer.stopwatch ? timer.elapsedSec : timer.remainingSec;
  const label = timer.stopwatch ? `${timer.label} · סטופר` : timer.paused ? `${timer.label} · מושהה` : timer.label;

  return (
    <div className={`resttimer${timer.finished ? ' is-finished' : ''}`}>
      {/* פס דק: כמה נשאר. מה שעבר מתרוקן מימין — הזמן זורם מימין לשמאל. */}
      <div className="resttimer__progress" aria-hidden="true">
        <span style={{ '--left': timer.running && !timer.stopwatch ? timer.fractionLeft : 0 } as CSSProperties} />
      </div>
      <div className="resttimer__inner">
        {timer.running ? (
          <div
            className="resttimer__main"
            role="timer"
            aria-label={`${kindLabel(timer.kind)} — ${timer.stopwatch ? 'עברו' : 'נשארו'} ${mmss(shownSec)}${timer.next ? `. הבא: ${timer.next}` : ''}`}
          >
            <span className="resttimer__label">{label}</span>
            <span className="resttimer__count num">{mmss(shownSec)}</span>
          </div>
        ) : (
          <div className="resttimer__main" role="status" aria-live="polite">
            <span className="resttimer__done">{finishedTitle(timer.kind)}</span>
            <span className="resttimer__ago">
              {timer.endedAgoSec < 60 ? agoText(timer.endedAgoSec) : (
                <>
                  לפני <Num>{mmss(timer.endedAgoSec)}</Num> דק׳
                </>
              )}
            </span>
          </div>
        )}

        <div className="resttimer__actions">
          {timer.finished ? (
            <Button variant="secondary" icon={X} onClick={timer.skip}>
              סגור
            </Button>
          ) : timer.kind === 'cardio' ? null : timer.kind === 'countdown' ? (
            <>
              <Button
                variant="secondary"
                className="resttimer__icon"
                aria-label={timer.paused ? 'המשך' : 'השהה'}
                onClick={timer.paused ? timer.resume : timer.pause}
              >
                <Icon icon={timer.paused ? Play : Pause} size={20} />
              </Button>
              <Button variant="secondary" className="resttimer__icon" aria-label="אפס" onClick={timer.reset}>
                <Icon icon={RotateCcw} size={20} />
              </Button>
              <Button variant="ghost" onClick={timer.skip}>
                דלג
              </Button>
            </>
          ) : (
            // מנוחה: −15 (יכולת קיימת), +30 ו"דלג".
            <>
              <Button variant="secondary" className="resttimer__step" onClick={() => timer.add(-15)} aria-label="הפחת 15 שניות">
                <span className="num">−15</span>
              </Button>
              <Button variant="secondary" className="resttimer__step" onClick={() => timer.add(30)} aria-label="הוסף 30 שניות">
                <span className="num">+30</span>
              </Button>
              <Button variant="ghost" onClick={timer.skip}>
                דלג
              </Button>
            </>
          )}

          {floating.available && (
            <Button
              variant="ghost"
              className="resttimer__icon"
              aria-label={floating.open ? 'סגור טיימר צף' : 'טיימר צף'}
              aria-pressed={floating.open}
              title="טיימר צף"
              onClick={() => void openFloating()}
            >
              <Icon icon={PictureInPicture2} size={20} />
            </Button>
          )}
          <Button
            variant="ghost"
            className="resttimer__icon"
            aria-label={soundEnabled ? 'צליל פועל — כבה' : 'צליל כבוי — הפעל'}
            aria-pressed={soundEnabled}
            title={soundEnabled ? 'כבה צליל' : 'הפעל צליל'}
            onClick={toggleSound}
          >
            <Icon icon={soundEnabled ? Volume2 : VolumeX} size={20} />
          </Button>
        </div>
      </div>
    </div>
  );
}
