import type { ReactNode } from 'react';

type Props = {
  title: ReactNode;
  /** בקצה השני: הערה קטנה ("3 שבועות מלאים"), צ'יפ, או כפתור רפאים. */
  aside?: ReactNode;
  /** `h2` כברירת מחדל; `h3` לסעיף בתוך כרטיס. */
  level?: 2 | 3 | undefined;
  className?: string | undefined;
};

/**
 * כותרת סעיף: תווית קטנה ושקטה מימין, הערה/פעולה משמאל. אותו מבנה של
 * `.section__head` שהמסכים מרנדרים היום.
 */
export default function SectionHeader({ title, aside, level = 2, className }: Props) {
  const Tag = level === 3 ? 'h3' : 'h2';
  return (
    <div className={className ? `section__head ${className}` : 'section__head'}>
      <Tag>{title}</Tag>
      {aside && <span className="tiny muted">{aside}</span>}
    </div>
  );
}
