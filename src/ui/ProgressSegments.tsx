/** `done` — נרשם. `current` — במוקד. `pending` — דולג / ממתין לחזרה. `upcoming` — עוד לא. */
export type SegmentState = 'done' | 'current' | 'pending' | 'upcoming';

export type Segment = {
  key: string;
  state: SegmentState;
  /** טקסט לקורא מסך: "לג-פרס — נרשם". */
  label: string;
};

type Props = {
  items: readonly Segment[];
  label: string;
};

/**
 * פס התקדמות מקטעי: מקטע לכל תרגיל, הנוכחי במבטא, מה שנרשם מלא, מה שדולג
 * מקווקו. תצוגה בלבד — הניווט נעשה בחצים וברשימת התרגילים. לכל מקטע טקסט
 * מוסתר, כי צבע וצורה לא לבד.
 */
export default function ProgressSegments({ items, label }: Props) {
  return (
    <ol className="segs" aria-label={label}>
      {items.map((s) => (
        <li key={s.key} className={`seg seg--${s.state}`} aria-current={s.state === 'current' ? 'step' : undefined}>
          <span className="visually-hidden">{s.label}</span>
        </li>
      ))}
    </ol>
  );
}
