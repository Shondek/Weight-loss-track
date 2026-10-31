import type { ReactNode } from 'react';
import Icon, { type IconComponent } from './Icon';

/**
 * `done` — הושלם / נמדד / שבוע מלא. `partial` — חלקי / תזכורת.
 * `missing` — חסר / אין נתון. `neutral` — מידע בלי שיפוט. `accent` — פעיל.
 */
export type ChipTone = 'done' | 'partial' | 'missing' | 'neutral' | 'accent';

type Props = {
  tone: ChipTone;
  icon?: IconComponent | undefined;
  className?: string | undefined;
  children: ReactNode;
};

/**
 * צ'יפ סטטוס: תמיד מילה + צבע, אף פעם לא צבע לבד. מקודד מלאות נתון,
 * לעולם לא כיוון שינוי (ירידה/עלייה נשארות בלי צבע).
 */
export default function StatusChip({ tone, icon, className, children }: Props) {
  const cls = ['chip', tone === 'neutral' ? '' : `chip--${tone}`, className ?? ''].filter(Boolean).join(' ');
  return (
    <span className={cls}>
      {icon && <Icon icon={icon} size={14} />}
      {children}
    </span>
  );
}
