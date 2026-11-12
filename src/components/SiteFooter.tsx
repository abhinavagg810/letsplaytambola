import Link from 'next/link';
import { Logo } from './Logo';
import styles from './SiteFooter.module.css';

/** The shared footer (every page). No props. See docs/COMPONENTS.md. */
export function SiteFooter() {
  return (
    <footer className={styles.footer}>
      <div className={styles.inner}>
        <span className={styles.logo}>
          <Logo size={28} />
        </span>
        <nav className={styles.links} aria-label="Footer">
          <Link href="/host">Host a game</Link>
          <Link href="/join">Join a game</Link>
          <Link href="/#how">How it works</Link>
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
          <Link href="/privacy#contact">Contact</Link>
        </nav>
        <span className={styles.note}>For entertainment only — no real-money play.</span>
      </div>
    </footer>
  );
}
