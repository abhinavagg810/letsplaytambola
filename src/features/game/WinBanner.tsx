'use client';
import { winText } from '@/core';
import { useWinNotice } from './useGameEvents';
import styles from './Live.module.css';

/**
 * "Meera wins Top Line!" — marigold card fixed near the top for 5 seconds, for everyone in the game.
 * The (empty) live region is always in the page, so screen readers announce the win and nothing moves.
 */
export function WinBanner({ code }: { code: string }) {
  const win = useWinNotice(code);
  return (
    <div className={styles.bannerRegion} aria-live="assertive" aria-atomic="true">
      {win ? (
        <div key={win.seq} className={styles.banner}>
          <span className={styles.bannerTitle}>{winText(win.name, win.label)}</span>
          <span className={styles.bannerSub}>Checked and confirmed ✓</span>
        </div>
      ) : null}
    </div>
  );
}
