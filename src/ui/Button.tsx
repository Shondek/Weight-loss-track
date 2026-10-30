import type { ComponentPropsWithoutRef, ReactNode } from 'react';
import Icon, { type IconComponent } from './Icon';

export type ButtonVariant = 'accent' | 'secondary' | 'ghost' | 'danger';

type Props = {
  /** `accent` — הפעולה הראשית (אחת לכרטיס). `secondary` — משטח 3. `ghost` — בלי משטח. */
  variant?: ButtonVariant | undefined;
  block?: boolean | undefined;
  /** 60px — כפתור הסט / קריאה לפעולה גדולה. */
  tall?: boolean | undefined;
  icon?: IconComponent | undefined;
  children?: ReactNode;
} & Omit<ComponentPropsWithoutRef<'button'>, 'children'>;

const CLASS: Record<ButtonVariant, string> = {
  accent: 'btn btn--primary',
  secondary: 'btn',
  ghost: 'btn btn--quiet',
  danger: 'btn btn--danger',
};

/**
 * כפתור. אותן מחלקות שהמסכים הקיימים מרנדרים (`.btn`, `.btn--primary`,
 * `.btn--quiet`, `.btn--danger`), כדי ששני הנתיבים ייראו זהים. אזור מגע 48.
 */
export default function Button({ variant = 'secondary', block, tall, icon, className, children, type = 'button', ...rest }: Props) {
  const cls = [CLASS[variant], block ? 'btn--block' : '', tall ? 'btn--tall' : '', className ?? ''].filter(Boolean).join(' ');
  return (
    <button type={type} className={cls} {...rest}>
      {icon && <Icon icon={icon} size={18} />}
      {children}
    </button>
  );
}
