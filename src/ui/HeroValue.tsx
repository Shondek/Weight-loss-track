import type { ReactNode } from 'react';
import Num from './Num';

type Props = {
  /** הטקסט המעוצב של הערך ("94.40", "—"). */
  value: string;
  unit?: string | undefined;
  /**
   * `dim` — ערך שקיים אבל אינו מלא (שבוע חלקי): אותו גודל, צבע משני.
   * `empty` — אין ערך בכלל (מקף): קטן ושקט.
   */
  state?: 'full' | 'dim' | 'empty' | undefined;
  /** בקצה השורה: "5/7" וצ'יפ סטטוס. */
  aside?: ReactNode;
  /** תיאור לקורא מסך, למשל "ממוצע שבועי 94.40 ק"ג, 5 מתוך 7". */
  label?: string | undefined;
};

/**
 * המספר הגדול של המסך. 64px ב-300. הגודל לא משתנה בין שבוע מלא לחלקי —
 * החלקיות מקודדת בצבע **ובצ'יפ** לצידו (מילה + צבע), כדי שהמסך לא ייראה
 * "כבוי" בשבוע רגיל שבו עוד לא נשקלו 7 פעמים.
 */
export default function HeroValue({ value, unit, state = 'full', aside, label }: Props) {
  const cls = ['hero', state === 'dim' ? 'hero--dim' : '', state === 'empty' ? 'hero--empty' : ''].filter(Boolean).join(' ');
  return (
    <div className="hero-row" role={label ? 'group' : undefined} aria-label={label}>
      <span className={cls}>
        <Num>{value}</Num>
      </span>
      {unit && <span className="hero-unit">{unit}</span>}
      {aside && <span className="hero-aside">{aside}</span>}
    </div>
  );
}
