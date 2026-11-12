import Link from 'next/link';
import type { ButtonHTMLAttributes, CSSProperties, MouseEventHandler, ReactNode } from 'react';
import { cx } from './cx';
import styles from './Pill.module.css';

export type PillVariant = 'outline' | 'outline-light' | 'filled' | 'surface';
export type PillSize = 40 | 44 | 46 | 50;

export interface PillProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** outline = thin `line` border · outline-light = cream border (header "Join a game") · filled = marigold · surface = static chip. Default outline. */
  variant?: PillVariant;
  /** Height in px: 40 chips · 44 header and title-row pills · 46 presets and Claim! · 50 share row. Default 44. */
  size?: PillSize;
  /** Selected state. Sets `aria-pressed` on buttons. */
  selected?: boolean;
  /** How `selected` looks: 'fill' = filled marigold (presets) · 'border' = marigold border only (name chips). Default fill. */
  selectedLook?: 'fill' | 'border';
  /** Renders a link (`next/link`). */
  href?: string;
  /** Renders a plain `<span>` (not interactive), e.g. the "Code K7RQ2" pill. */
  as?: 'span';
  /** Font size in px, when a screen needs a different one from the size default. */
  fontSize?: number;
  children: ReactNode;
}

/** Rounded pill: chip, small action or nav button. See docs/COMPONENTS.md. */
export function Pill({
  variant = 'outline',
  size = 44,
  selected,
  selectedLook = 'fill',
  href,
  as,
  fontSize,
  className,
  style,
  children,
  type,
  ...rest
}: PillProps) {
  const cls = cx(
    styles.pill,
    styles[`s${size}`],
    styles[variant === 'outline-light' ? 'outlineLight' : variant],
    selected && (selectedLook === 'fill' ? styles.selectedFill : styles.selectedBorder),
    className,
  );
  const css = { ...(fontSize ? { fontSize } : null), ...style } as CSSProperties;
  if (as === 'span') {
    return (
      <span className={cls} style={css}>
        {children}
      </span>
    );
  }
  if (href !== undefined) {
    return (
      <Link href={href} className={cls} style={css} onClick={rest.onClick as unknown as MouseEventHandler<HTMLAnchorElement>} aria-current={rest['aria-current']}>
        {children}
      </Link>
    );
  }
  return (
    <button type={type ?? 'button'} className={cls} style={css} aria-pressed={selected === undefined ? undefined : selected} {...rest}>
      {children}
    </button>
  );
}
