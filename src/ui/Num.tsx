import type { ComponentPropsWithoutRef, ReactNode } from 'react';

type Props = { children: ReactNode } & ComponentPropsWithoutRef<'span'>;

/**
 * מספר בתוך טקסט עברי: ספרות ברוחב אחיד, LTR ומבודד (`unicode-bidi: isolate`)
 * כדי ש-"94.40" או "25/10–31/10" לא יתהפכו. זהה ל-`<span className="num">`.
 */
export default function Num({ children, className, ...rest }: Props) {
  return (
    <span className={className ? `num ${className}` : 'num'} {...rest}>
      {children}
    </span>
  );
}
