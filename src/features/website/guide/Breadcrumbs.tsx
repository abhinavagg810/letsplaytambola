import Link from 'next/link';
import { SITE_URL } from '@/lib/site';
import { JsonLd } from './JsonLd';
import styles from './guide.module.css';

export interface Crumb {
  href: string;
  label: string;
}

/** "Home › How to play" — visible trail plus BreadcrumbList structured data. The last crumb is the current page. */
export function Breadcrumbs({ trail }: { trail: Crumb[] }) {
  const all = [{ href: '/', label: 'Home' }, ...trail];
  return (
    <>
      <nav className={styles.crumbs} aria-label="Breadcrumb">
        <ol>
          {all.map((c, i) => (
            <li key={c.href}>
              {i < all.length - 1 ? <Link href={c.href}>{c.label}</Link> : <span aria-current="page">{c.label}</span>}
            </li>
          ))}
        </ol>
      </nav>
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'BreadcrumbList',
          itemListElement: all.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.label, item: `${SITE_URL}${c.href === '/' ? '/' : c.href}` })),
        }}
      />
    </>
  );
}
