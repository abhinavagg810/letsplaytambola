import { cx } from './cx';
import styles from './Board.module.css';

export interface BoardProps {
  /** Numbers called so far (any order). */
  called: ReadonlySet<number> | readonly number[];
  /** The latest number — shown pink. */
  latest?: number | null;
  /**
   * solid (default, the game): uncalled cells are plum discs.
   * outline (website mock): uncalled cells are thin rings, the latest has a cream ring and glow.
   */
  variant?: 'solid' | 'outline';
  className?: string;
}

/** The 1–90 board: 10 columns × 9 rows of round cells. Latest pink, called marigold, others plum. See docs/COMPONENTS.md. */
export function Board({ called, latest, variant = 'solid', className }: BoardProps) {
  const has = (n: number) => ('has' in called ? called.has(n) : called.includes(n));
  const count = 'size' in called ? called.size : called.length;
  return (
    <div className={cx(styles.board, variant === 'outline' && styles.outline, className)} role="img" aria-label={`Board: ${count} of 90 numbers called${latest ? `, latest ${latest}` : ''}`}>
      {Array.from({ length: 90 }, (_, i) => {
        const n = i + 1;
        return (
          <span key={n} className={cx(styles.cell, n === latest ? styles.latest : has(n) && styles.called)} aria-hidden="true">
            {n}
          </span>
        );
      })}
    </div>
  );
}
