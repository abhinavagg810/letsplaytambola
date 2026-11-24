import Link from 'next/link';
import { Logo } from './Logo';
import styles from './SiteFooter.module.css';

const GROUPS: { id: string; title: string; links: [href: string, label: string][] }[] = [
  { id: 'play', title: 'Play', links: [['/host', 'Host a game'], ['/join', 'Join a game']] },
  { id: 'learn', title: 'Learn', links: [['/how-to-play', 'How to play'], ['/ways-to-win', 'Ways to win'], ['/tambola-number-calls', 'Number calls']] },
  { id: 'about', title: 'About', links: [['/about', 'About us'], ['/contact', 'Contact'], ['/privacy', 'Privacy'], ['/terms', 'Terms']] },
];

/** The shared footer (every page): logo and note, then three groups of links — Play, Learn, About. No props. See docs/COMPONENTS.md. */
export function SiteFooter() {
  return (
    <footer className={styles.footer}>
      <div className={styles.inner}>
        <div className={styles.brand}>
          <span className={styles.logo}>
            <Logo size={28} />
          </span>
          <span className={styles.note}>Tambola with family and friends. Free, no sign-up. For entertainment only — no real-money play.</span>
        </div>
        <div className={styles.groups}>
          {GROUPS.map((g) => (
            <nav key={g.id} className={styles.group} aria-labelledby={`footer-${g.id}`}>
              <span id={`footer-${g.id}`} className={styles.groupTitle}>
                {g.title}
              </span>
              <ul className={styles.links}>
                {g.links.map(([href, label]) => (
                  <li key={href}>
                    <Link href={href}>{label}</Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
      </div>
    </footer>
  );
}
