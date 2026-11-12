import { cx } from './cx';
import styles from './Logo.module.css';

export interface LogoProps {
  /** Font size in px of the word TAMBOLA; everything scales from it. Default 64. Header 30, footer 28. */
  size?: number;
  /** light = cream letters for dark backgrounds (default) · dark = ink letters for light backgrounds. */
  tone?: 'light' | 'dark';
  /** Only the round pink "90" mark (a `size`-px circle). */
  markOnly?: boolean;
  className?: string;
}

/**
 * The Letsplaytambola logo, drawn with live text and CSS (no image), so it stays crisp at any size.
 * Needs Baloo 2 at weight 800. See docs/COMPONENTS.md.
 */
export function Logo({ size = 64, tone = 'light', markOnly, className }: LogoProps) {
  return (
    <span className={cx(styles.logo, tone === 'dark' && styles.dark, className)} style={{ fontSize: size }} role="img" aria-label="Let’s play Tambola">
      {markOnly ? (
        <span className={styles.mark} aria-hidden="true">
          <span className={styles.markDisc}>90</span>
        </span>
      ) : (
        <>
          <span className={styles.tag} aria-hidden="true">
            Let’s play
          </span>
          <span className={styles.word} aria-hidden="true">
            <span>TAMB</span>
            <span className={styles.ball}>
              <span className={styles.ballDisc}>90</span>
            </span>
            <span>LA</span>
          </span>
        </>
      )}
    </span>
  );
}
