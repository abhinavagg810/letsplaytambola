import Link from 'next/link';
import type { ButtonHTMLAttributes, CSSProperties, MouseEventHandler, ReactNode } from 'react';
import { cx } from './cx';
import styles from './Button.module.css';

export type ButtonVariant = 'primary' | 'cream' | 'whatsapp' | 'outline' | 'ink';
/** Height in px. 60–64 are the main buttons; 44 is the minimum tap target. */
export type ButtonSize = 44 | 50 | 54 | 56 | 58 | 60 | 62 | 64;

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'disabled'> {
  /** primary = marigold with the inset lip · cream · whatsapp = green · outline · ink = dark on light cards. Default primary. */
  variant?: ButtonVariant;
  /** Height in px. Default 60. */
  size?: ButtonSize;
  /** Stretch to the full width of the parent. */
  block?: boolean;
  /**
   * Looks disabled (muted colour) but STILL receives taps, so `onClick` can show a toast such as
   * "Type your name first". It is NOT marked disabled for assistive tech or tests (it does respond), so the
   * toast is the feedback. Use this instead of `disabled` for the main buttons.
   */
  disabledLook?: boolean;
  /** Really disabled: no taps, no focus. Prefer `disabledLook` when the tap should explain why. */
  disabled?: boolean;
  /** No inset lip on the primary variant (the design leaves it off on some secondary marigold buttons). */
  flat?: boolean;
  /** Renders a link (`next/link`) that looks like the button. */
  href?: string;
  /** Font size in px, when a screen needs a different one from the size default. */
  fontSize?: number;
  children: ReactNode;
}

/** The main action button. See docs/COMPONENTS.md. */
export function Button({
  variant = 'primary',
  size = 60,
  block,
  disabledLook,
  disabled,
  flat,
  href,
  fontSize,
  className,
  style,
  children,
  type,
  ...rest
}: ButtonProps) {
  const cls = cx(
    styles.button,
    styles[variant],
    size >= 60 ? styles.lg : size >= 50 ? styles.md : styles.sm,
    block && styles.block,
    flat && styles.flat,
    (disabledLook || disabled) && styles.disabledLook,
    className,
  );
  const css = { '--btn-h': `${size}px`, ...(fontSize ? { fontSize } : null), ...style } as CSSProperties;
  if (href !== undefined && !disabled) {
    return (
      <Link href={href} className={cls} style={css} onClick={rest.onClick as unknown as MouseEventHandler<HTMLAnchorElement>}>
        {children}
      </Link>
    );
  }
  return (
    <button type={type ?? 'button'} className={cls} style={css} disabled={disabled} {...rest}>
      {children}
    </button>
  );
}
