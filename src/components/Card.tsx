import type { CSSProperties, HTMLAttributes, ReactNode } from 'react';
import { cx } from './cx';
import styles from './Card.module.css';

export interface CardProps extends HTMLAttributes<HTMLElement> {
  /** surface (default) · marigold (ink text) · paper (ticket cream, ink text) · bg (plum well inside a surface card) · note (soft marigold tint). */
  tone?: 'surface' | 'marigold' | 'paper' | 'bg' | 'note';
  /** Corner radius in px (cards 18–28; 32 for the big website bands; 12–16 for wells). Default 20. */
  radius?: 12 | 14 | 16 | 18 | 20 | 22 | 24 | 26 | 28 | 32;
  /** Padding in px. Default 0 (lists and custom layouts bring their own). */
  padding?: number;
  /** 1px `line` border. */
  border?: boolean;
  /** Marigold dotted strip along the top edge (caller card). Also clips the content to the radius. */
  dottedTop?: boolean;
  /** Clip children to the rounded corners (lists with dividers). */
  clip?: boolean;
  /** Element to render. Default div. */
  as?: 'div' | 'section' | 'article' | 'li' | 'aside';
  children?: ReactNode;
}

/** A rounded surface. See docs/COMPONENTS.md. */
export function Card({ tone = 'surface', radius = 20, padding, border, dottedTop, clip, as: Tag = 'div', className, style, children, ...rest }: CardProps) {
  const css = { borderRadius: radius, ...(padding !== undefined ? { padding } : null), ...style } as CSSProperties;
  return (
    <Tag className={cx(styles.card, styles[tone], border && styles.border, (clip || dottedTop) && styles.clip, className)} style={css} {...rest}>
      {dottedTop ? <div className={styles.dots} aria-hidden="true" /> : null}
      {children}
    </Tag>
  );
}
