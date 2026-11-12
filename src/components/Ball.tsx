import type { CSSProperties } from 'react';
import { cx } from './cx';
import styles from './Ball.module.css';

export interface BallProps {
  /** The number on the ball. `null` shows an empty disc (before the first call). */
  number: number | string | null;
  /** Diameter in px. Default 116 (live game). The website uses 124 (hero) and 96 (feature mock). */
  size?: number;
  /** Gentle bobbing animation (website hero). Off under reduced motion. */
  float?: boolean;
  /** Accessible label; default "Number N". Pass '' to hide it from screen readers (e.g. when a live region announces the call). */
  label?: string;
  className?: string;
}

/** Design sizes; other sizes are scaled from the 116px original. */
const PRESET: Record<number, { ring: number; disc: number; font: number; glow: string; nudge: number }> = {
  116: { ring: 5, disc: 76, font: 42, glow: '0 0 50px var(--pink-glow)', nudge: 0 },
  124: { ring: 6, disc: 82, font: 46, glow: '0 0 60px var(--ball-glow-strong)', nudge: 6 },
  96: { ring: 5, disc: 64, font: 36, glow: '0 0 40px var(--ball-glow-mid)', nudge: 5 },
};

/**
 * The caller ball: pink, marigold ring, glow, cream disc with the number.
 * 116px → 5px ring, 76px disc, 42px/800 number. See docs/COMPONENTS.md.
 */
export function Ball({ number, size = 116, float, label, className }: BallProps) {
  const k = size / 116;
  const p = PRESET[size] ?? {
    ring: Math.max(3, Math.round(5 * k)),
    disc: Math.round(76 * k),
    font: Math.round(42 * k),
    glow: `0 0 ${Math.round(50 * k)}px var(--pink-glow)`,
    nudge: 0,
  };
  const outer: CSSProperties = { width: size, height: size, boxShadow: `0 0 0 ${p.ring}px var(--marigold), ${p.glow}` };
  const disc: CSSProperties = { width: p.disc, height: p.disc, fontSize: p.font, paddingTop: p.nudge || undefined };
  const text = number === null || number === '' ? '' : String(number);
  const aria = label ?? (text ? `Number ${text}` : 'No number yet');
  return (
    <div className={cx(styles.ball, float && styles.float, className)} style={outer} role={aria ? 'img' : undefined} aria-label={aria || undefined} aria-hidden={aria ? undefined : true}>
      <div className={styles.disc} style={disc} aria-hidden="true">
        {text}
      </div>
    </div>
  );
}
