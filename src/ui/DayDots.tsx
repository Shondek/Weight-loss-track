export type DayDotState = 'done' | 'missing' | 'future';

export type DayDot = {
  key: string;
  /** אות היום: א–ש. */
  letter: string;
  state: DayDotState;
  today?: boolean | undefined;
  /** טקסט לקורא מסך: "רביעי: נשקל". */
  label: string;
};

type Props = {
  days: readonly DayDot[];
  /** `aria-label` של הרשימה. */
  label: string;
};

/**
 * שבע נקודות, אחת ליום: מלאה = יש נתון, חלולה מקווקוות = חסר, חלולה
 * שקטה = עתיד, והיום בטבעת מבטא. **בלי מספרים**: הערך היומי הוא רעש,
 * והמסך מראה רק אם הוא קיים. לכל נקודה טקסט מוסתר — צבע וצורה לא לבד.
 */
export default function DayDots({ days, label }: Props) {
  return (
    <ul className="dots" aria-label={label}>
      {days.map((d) => (
        <li key={d.key} className={`dot dot--${d.state}${d.today ? ' dot--today' : ''}`}>
          <span className="dot__mark" aria-hidden="true" />
          <span className="dot__letter" aria-hidden="true">
            {d.letter}
          </span>
          <span className="visually-hidden">{d.label}</span>
        </li>
      ))}
    </ul>
  );
}
