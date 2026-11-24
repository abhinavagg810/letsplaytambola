'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Logo } from './Logo';
import { Pill } from './Pill';
import styles from './SiteHeader.module.css';

const NARROW_PAD = { padding: '0 16px' };

/**
 * The shared sticky header (every page).
 * Desktop (≥ 860px): logo · How it works · Features · How to play · About · "Join a game" outline pill · "Host a game" marigold pill
 * (Features and About from 1040px, so the row never crowds; both are also in the footer).
 * Mobile: logo · "Host" pill · "Menu" pill that opens the list under the header: join, the home sections, the guides, About, Contact.
 * No props. See docs/COMPONENTS.md.
 */
export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <header className={styles.header}>
      <div className={styles.bar}>
        <Link href="/" className={styles.home} onClick={close}>
          <Logo size={30} />
        </Link>
        <nav className={styles.wide} aria-label="Main">
          <Link href="/#how" className={styles.link}>
            How it works
          </Link>
          <Link href="/#features" className={`${styles.link} ${styles.roomy}`}>
            Features
          </Link>
          <Link href="/how-to-play" className={styles.link}>
            How to play
          </Link>
          <Link href="/about" className={`${styles.link} ${styles.roomy}`}>
            About
          </Link>
          <Pill href="/join" variant="outline-light">
            Join a game
          </Pill>
          <Pill href="/host" variant="filled">
            Host a game
          </Pill>
        </nav>
        <div className={styles.narrow}>
          <Pill href="/host" variant="filled" style={NARROW_PAD} onClick={close}>
            Host
          </Pill>
          <Pill style={NARROW_PAD} aria-expanded={open} aria-controls="site-menu" onClick={() => setOpen((o) => !o)}>
            {open ? 'Close' : 'Menu'}
          </Pill>
        </div>
      </div>
      {open ? (
        <nav id="site-menu" className={styles.menu} aria-label="Menu">
          <Link href="/join" className={styles.row} onClick={close}>
            Join a game with a code
          </Link>
          <Link href="/#how" className={styles.row} onClick={close}>
            How it works
          </Link>
          <Link href="/#features" className={styles.row} onClick={close}>
            Features
          </Link>
          <Link href="/how-to-play" className={styles.row} onClick={close}>
            How to play
          </Link>
          <Link href="/ways-to-win" className={styles.row} onClick={close}>
            Ways to win
          </Link>
          <Link href="/tambola-number-calls" className={styles.row} onClick={close}>
            Number calls
          </Link>
          <Link href="/about" className={styles.row} onClick={close}>
            About us
          </Link>
          <Link href="/contact" className={styles.row} onClick={close}>
            Contact
          </Link>
        </nav>
      ) : null}
    </header>
  );
}
