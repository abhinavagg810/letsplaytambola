'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import styles from './admin.module.css';

const LINKS = [
  { href: '/admin', label: 'Dashboard' },
  { href: '/admin/games', label: 'Plays' },
  { href: '/admin/players', label: 'Players' },
  { href: '/admin/notify', label: 'Notify me' },
] as const;

/** The admin's section links. The current section is marked for screen readers and by colour. */
export function AdminNav() {
  const path = usePathname() ?? '';
  return (
    <nav className={styles.nav} aria-label="Admin sections">
      {LINKS.map((l) => {
        const current = l.href === '/admin' ? path === '/admin' : path === l.href || path.startsWith(`${l.href}/`);
        return (
          // No prefetch: admin pages are never cached, and every one checks the session itself.
          <Link key={l.href} href={l.href} className={styles.navLink} aria-current={current ? 'page' : undefined}>
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
