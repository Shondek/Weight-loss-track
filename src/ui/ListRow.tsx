import type { ComponentPropsWithoutRef, ReactNode } from 'react';
import Icon, { type IconComponent } from './Icon';

type Base = {
  title: ReactNode;
  /** שורה שנייה, שקטה. */
  sub?: ReactNode;
  /** אייקון בתחילת השורה. */
  lead?: IconComponent | undefined;
  /** בקצה: ערך, צ'יפ או פעולה. */
  end?: ReactNode;
  /** הכותרת נשברת לשתי שורות לכל היותר (ואז שלוש נקודות) במקום להיחתך בשורה אחת. */
  wrap?: boolean | undefined;
  /**
   * פעולה נפרדת בקצה השורה (כפתור משלה, ≥48px), מחוץ לאזור המגע של `onTap`:
   * "+" שרושם בנגיעה אחת לצד שורה שנגיעה בה פותחת את חלונית הכמות.
   */
  action?: ReactNode;
  className?: string | undefined;
};

type Props =
  | (Base & { onTap?: undefined } & Omit<ComponentPropsWithoutRef<'div'>, 'title' | 'className'>)
  | (Base & { onTap: () => void } & Omit<ComponentPropsWithoutRef<'button'>, 'title' | 'className' | 'onClick'>);

/**
 * שורה ברשימה: אזור מגע מלא (48), קו שיער בין שורות, בלי כרטיס לכל שורה.
 * עם `onTap` כל השורה היא כפתור.
 */
export default function ListRow(props: Props) {
  const { title, sub, lead, end, className, wrap, action } = props;
  const body = (
    <>
      {lead && (
        <span className="listrow__lead">
          <Icon icon={lead} />
        </span>
      )}
      <span className="listrow__body">
        <span className={wrap ? 'listrow__title listrow__title--wrap' : 'listrow__title'}>{title}</span>
        {sub && <span className="listrow__sub">{sub}</span>}
      </span>
      {end && <span className="listrow__end">{end}</span>}
    </>
  );
  if (props.onTap && action) {
    // שני כפתורים זה לצד זה: גוף השורה (פותח) והפעולה (רושמת). לא כפתור בתוך כפתור.
    const { onTap, title: _t, sub: _s, lead: _l, end: _e, className: _c, wrap: _w, action: _a, ...rest } = props;
    return (
      <div className={['listrow', 'listrow--split', className ?? ''].filter(Boolean).join(' ')}>
        <button type="button" className="listrow__tap" onClick={onTap} {...rest}>
          {body}
        </button>
        {action}
      </div>
    );
  }
  if (props.onTap) {
    const { onTap, title: _t, sub: _s, lead: _l, end: _e, className: _c, wrap: _w, action: _a, ...rest } = props;
    return (
      <button type="button" className={['listrow', 'listrow--tap', className ?? ''].filter(Boolean).join(' ')} onClick={onTap} {...rest}>
        {body}
      </button>
    );
  }
  const { onTap: _o, title: _t, sub: _s, lead: _l, end: _e, className: _c, wrap: _w, action: _a, ...rest } = props;
  return (
    <div className={['listrow', className ?? ''].filter(Boolean).join(' ')} {...rest}>
      {body}
    </div>
  );
}
