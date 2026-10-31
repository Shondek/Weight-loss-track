import type { ReactNode } from 'react';

type Props = {
  /** שורה קטנה ושקטה מעל הכותרת, למשל "שבוע 9". */
  eyebrow?: ReactNode;
  title: ReactNode;
  /** שורה משנית מתחת לכותרת, למשל התאריך המלא. */
  sub?: ReactNode;
  className?: string | undefined;
};

/**
 * כותרת מסך: "יום שישי · 31/10". פסקאות ולא h1 — ל-App יש כבר h1 אחד
 * (מוסתר) לכל הדף, והכותרת כאן היא הקשר (יום, תאריך, שבוע), לא מבנה.
 */
export default function ScreenHeader({ eyebrow, title, sub, className }: Props) {
  return (
    <header className={className ? `top ${className}` : 'top'}>
      {eyebrow && <p className="top__eyebrow">{eyebrow}</p>}
      <p className="top__title">{title}</p>
      {sub && <p className="top__sub">{sub}</p>}
    </header>
  );
}
