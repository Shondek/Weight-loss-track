import type { ComponentPropsWithoutRef, ElementType, ReactNode } from 'react';

type Props<T extends ElementType> = {
  /** `section` כברירת מחדל; `div` לקיבוץ בלי משמעות סמנטית. */
  as?: T | undefined;
  /** `sunk` = משטח 3 (פקד/שקוע); `hero` = ריפוד עליון גדול יותר. */
  variant?: 'panel' | 'sunk' | 'hero' | undefined;
  className?: string | undefined;
  children?: ReactNode;
} & Omit<ComponentPropsWithoutRef<T>, 'as' | 'className' | 'children'>;

/**
 * פאנל: משטח 2, רדיוס 16, בלי מסגרת ובלי צל. ההפרדה היא דרגת המשטח,
 * לא קו. מקביל ל-`.section` שהמסכים הקיימים עדיין מרנדרים ישירות.
 */
export default function Surface<T extends ElementType = 'section'>({ as, variant = 'panel', className, children, ...rest }: Props<T>) {
  const Tag: ElementType = as ?? 'section';
  const cls = ['surface', variant === 'sunk' ? 'surface--sunk' : '', variant === 'hero' ? 'surface--hero' : '', className ?? '']
    .filter(Boolean)
    .join(' ');
  return (
    <Tag className={cls} {...rest}>
      {children}
    </Tag>
  );
}
