// Small server-rendered pieces shared by the admin pages.
import Link from 'next/link';
import type { ReactNode } from 'react';
import { cx } from '@/components/cx';
import { STATUS_LABEL } from '@/server/admin/stats';
import type { AdminStatus } from '@/server/admin/stats';
import styles from './admin.module.css';

export function StatusPill({ status }: { status: AdminStatus }) {
  return (
    <span className={styles.status} data-status={status}>
      <span className={styles.statusDot} aria-hidden="true" />
      {STATUS_LABEL[status]}
    </span>
  );
}

/** A device, shown only as its short anonymous id, linking to its page. */
export function DeviceLink({ id }: { id: string }) {
  if (!id) return <span className={styles.dim}>—</span>;
  return (
    <Link href={`/admin/players/${id}`} prefetch={false} className={styles.deviceLink} title="Anonymous device id">
      {id}
    </Link>
  );
}

export function PageHead({ title, sub, crumb, children }: { title: ReactNode; sub?: ReactNode; crumb?: { href: string; label: string }; children?: ReactNode }) {
  return (
    <div className={styles.pageHead}>
      <div style={{ minWidth: 0 }}>
        {crumb ? (
          <Link href={crumb.href} prefetch={false} className={styles.crumb}>
            ← {crumb.label}
          </Link>
        ) : null}
        <h1 className={styles.pageTitle}>{title}</h1>
        {sub ? <p className={styles.pageSub}>{sub}</p> : null}
      </div>
      {children}
    </div>
  );
}

export function Panel({ title, sub, action, children, className }: { title?: ReactNode; sub?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx(styles.panel, className)}>
      {title ? (
        <div className={styles.panelHead}>
          <div>
            <h2 className={styles.sectionTitle}>{title}</h2>
            {sub ? <p className={styles.sectionSub}>{sub}</p> : null}
          </div>
          {action}
        </div>
      ) : null}
      {children}
    </section>
  );
}

/** "Showing 26–50 of 63" with Previous / Next. `href(page)` builds the link for a page. */
export function Pager({ page, pageSize, total, href, noun }: { page: number; pageSize: number; total: number; href: (page: number) => string; noun: string }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const first = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const last = Math.min(total, page * pageSize);
  return (
    <nav className={styles.pager} aria-label="Pages">
      <span>
        {total === 0 ? `No ${noun}` : `Showing ${first}–${last} of ${total} ${noun}`}
      </span>
      <span className={styles.pagerLinks}>
        <Link href={href(Math.max(1, page - 1))} prefetch={false} className={cx(styles.btn, page <= 1 && styles.btnOff)} aria-disabled={page <= 1} tabIndex={page <= 1 ? -1 : undefined}>
          Previous
        </Link>
        <span>
          Page {Math.min(page, pages)} of {pages}
        </span>
        <Link href={href(page + 1)} prefetch={false} className={cx(styles.btn, page >= pages && styles.btnOff)} aria-disabled={page >= pages} tabIndex={page >= pages ? -1 : undefined}>
          Next
        </Link>
      </span>
    </nav>
  );
}

/** A column header that sorts: the first click sorts biggest/newest first, the next one flips it. */
export function SortTh({ label, active, dir, href, className }: { label: string; active: boolean; dir: 'asc' | 'desc'; href: string; className?: string }) {
  return (
    <th scope="col" className={className} aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : undefined}>
      <Link href={href} prefetch={false} className={styles.sortLink} data-active={active}>
        {label}
        <span aria-hidden="true">{active ? (dir === 'asc' ? '▲' : '▼') : '↕'}</span>
      </Link>
    </th>
  );
}
