import type { CSSProperties } from 'react';
import { cx } from './cx';
import styles from './Avatar.module.css';

/** Avatar colours in join order (README): pink, marigold, teal, blue, green, coral. */
export const AVATAR_COLORS = [
  'var(--avatar-1)',
  'var(--avatar-2)',
  'var(--avatar-3)',
  'var(--avatar-4)',
  'var(--avatar-5)',
  'var(--avatar-6)',
] as const;

/** Colour for the n-th person to join (0-based); wraps round after six. */
export function avatarColor(index: number): string {
  return AVATAR_COLORS[((index % AVATAR_COLORS.length) + AVATAR_COLORS.length) % AVATAR_COLORS.length];
}

const FONT: Record<number, number> = { 28: 13, 32: 15, 34: 15, 40: 17 };

export interface AvatarProps {
  /** The person's name; the first letter is shown, uppercased. */
  name: string;
  /** Join-order index (0-based) → palette colour, or any CSS colour string (e.g. the `color` the server sends). Default 0. */
  color?: number | string;
  /** Diameter in px: 28 · 32 (player chips) · 34 · 40 (lists). Default 40. */
  size?: number;
  /** 3px plum ring, for overlapping stacks. */
  ring?: boolean;
  className?: string;
}

/** A round avatar: the initial on a colour. Decorative — put the name next to it. See docs/COMPONENTS.md. */
export function Avatar({ name, color = 0, size = 40, ring, className }: AvatarProps) {
  const initial = (Array.from(name.trim())[0] ?? '?').toUpperCase();
  const css: CSSProperties = {
    width: size,
    height: size,
    fontSize: FONT[size] ?? Math.round(size * 0.43),
    background: typeof color === 'number' ? avatarColor(color) : color,
  };
  return (
    <span className={cx(styles.avatar, ring && styles.ring, className)} style={css} aria-hidden="true">
      {initial}
    </span>
  );
}
