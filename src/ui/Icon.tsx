import type { LucideIcon } from 'lucide-react';

/** רכיב אייקון של lucide-react (כל אייקון ב-ui/icons.ts). ייבוא טיפוס בלבד — לא נכנס ל-bundle. */
export type IconComponent = LucideIcon;

type Props = {
  icon: IconComponent;
  /** ברירת המחדל 20. ניווט 24, צ'יפ 14. */
  size?: number | undefined;
  /** תיאור לקורא מסך. בלי תיאור האייקון דקורטיבי (aria-hidden). */
  label?: string | undefined;
  className?: string | undefined;
};

const STROKE = 2;

/**
 * אייקון אחיד: קו 2 בכל גודל (absoluteStrokeWidth), צבע currentColor,
 * ואף פעם לא גדול מהתווית שלידו. אין אימוג'י ואין סט שני.
 */
export default function Icon({ icon: Svg, size = 20, label, className }: Props) {
  return (
    <Svg
      className={className ? `ic ${className}` : 'ic'}
      size={size}
      strokeWidth={STROKE}
      absoluteStrokeWidth
      aria-hidden={label ? undefined : true}
      aria-label={label}
      role={label ? 'img' : undefined}
      focusable="false"
    />
  );
}
