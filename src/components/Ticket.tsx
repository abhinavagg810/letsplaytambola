import type { CSSProperties, ReactNode } from 'react';
import { cx } from './cx';
import styles from './Ticket.module.css';

export interface TicketProps {
  /** 3 rows × 9 columns; 0 = blank cell. */
  ticket: number[][];
  /** Numbers that are dabbed (pink circle, white number). */
  marked?: ReadonlySet<number> | readonly number[];
  /**
   * Called with the number when a number cell is tapped. When given, number cells are buttons.
   * The parent decides what happens (dab, un-dab, or toast "N hasn't been called yet").
   */
  onCell?: (n: number) => void;
  /** Header text, e.g. "Sapna's ticket". */
  title?: ReactNode;
  /** Slot on the right of the pink header — the Claim! pill in the live game. */
  headerRight?: ReactNode;
  /** Small line under the grid. */
  hint?: ReactNode;
  /** Plain preview: no header, hint or shadow, radius 16 (lobby "Your ticket"). */
  bare?: boolean;
  /** Tilt each dab a little, like a hand-dabbed paper ticket (website sample). */
  tilt?: boolean;
  /**
   * Fine-tuning through CSS variables on `style`/`className`:
   * --ticket-radius (20px) · --ticket-pad (8px) · --ticket-head-pad · --cell-ratio (1 / 1.15) · --cell-font · --dab-size (86%) · --dab-color (pink) · --dab-nudge (0).
   */
  className?: string;
  style?: CSSProperties;
}

/**
 * A Tambola ticket: paper card, pink header, 3×9 grid with 2px gaps, striped blanks,
 * number cells 1:1.15, dab = pink circle with a white number. See docs/COMPONENTS.md.
 */
export function Ticket({ ticket, marked, onCell, title, headerRight, hint, bare, tilt, className, style }: TicketProps) {
  const isMarked = (n: number) => (!marked ? false : 'has' in marked ? marked.has(n) : marked.includes(n));
  const cells = ticket.flat();
  return (
    <div className={cx(styles.ticket, bare && styles.bare, className)} style={style}>
      {!bare && (title || headerRight) ? (
        <div className={styles.header}>
          <span className={styles.title}>{title}</span>
          {headerRight}
        </div>
      ) : null}
      <div className={styles.pad}>
        <div className={styles.grid} role="group" aria-label={typeof title === 'string' ? title : 'Ticket'}>
          {cells.map((n, i) => {
            if (!n) return <span key={i} className={cx(styles.cell, styles.blank)} aria-hidden="true" />;
            const on = isMarked(n);
            const dab = (
              <span className={cx(styles.dab, on && styles.dabOn)} style={on && tilt ? { transform: `rotate(${((n * 37) % 24) - 12}deg)` } : undefined}>
                {n}
              </span>
            );
            return onCell ? (
              <button key={i} type="button" className={cx(styles.cell, styles.tap)} aria-pressed={on} aria-label={on ? `${n}, dabbed` : `${n}`} onClick={() => onCell(n)}>
                {dab}
              </button>
            ) : (
              <span key={i} className={styles.cell}>
                {dab}
                {on ? <span className="visually-hidden">dabbed</span> : null}
              </span>
            );
          })}
        </div>
      </div>
      {!bare && hint ? <div className={styles.hint}>{hint}</div> : null}
    </div>
  );
}
