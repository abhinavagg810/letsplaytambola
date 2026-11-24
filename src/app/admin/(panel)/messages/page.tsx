import type { Metadata } from 'next';
import Link from 'next/link';
import { AdminOff } from '@/features/admin/AdminOff';
import { DeviceLink, DeviceText, Empty, PageHead, Pager, Place, When, num } from '@/features/admin/bits';
import { Copy } from '@/features/admin/client';
import { MessageActions } from '@/features/admin/messages';
import styles from '@/features/admin/ui.module.css';
import { CONTACT_TOPICS, topicLabel } from '@/lib/contact';
import { requireAdmin } from '@/server/admin/guard';
import { MESSAGES_PAGE_SIZE, messagesQuery, messagesQueryString, parseMessagesFilter } from '@/server/admin/messages';
import type { MessagesFilter } from '@/server/admin/messages';
import { ADMIN_RETENTION_DAYS, getStore } from '@/server/store';
import type { ContactPage } from '@/server/store';

export const metadata: Metadata = { title: 'Messages' };

const PREVIEW = 110;
const preview = (s: string): string => {
  const flat = s.replace(/\s+/g, ' ');
  return [...flat].length > PREVIEW ? `${[...flat].slice(0, PREVIEW).join('').trimEnd()}…` : flat;
};
const isEmail = (s: string): boolean => /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(s);

/** Shown on the Messages page while the database has not been given migration 0004. */
function ContactMigrationNotice() {
  return (
    <div className={styles.warn} role="alert">
      <span className={styles.warnIcon} aria-hidden="true">!</span>
      <div>
        <b>Run migration 0004 to switch the contact form on.</b> The database has not been given <span className={styles.mono}>supabase/migrations/0004_contact.sql</span> yet,
        so messages sent from the contact page are <b>not being stored</b>. People who try are told so and shown the email address instead.
        Steps: Supabase → SQL Editor → New query → paste the whole file → Run (see <span className={styles.mono}>supabase/README.md</span>). This notice goes away within a minute of running it.
      </div>
    </div>
  );
}

export default async function AdminMessagesPage({ searchParams }: PageProps<'/admin/messages'>) {
  const admin = await requireAdmin();
  if (admin.off) return <AdminOff />;
  const { now } = admin;
  const filter = parseMessagesFilter(await searchParams);
  const store = getStore();
  const [status, list] = await Promise.all([
    store.contactStatus().catch(() => 'ok' as const),
    store.adminListContactMessages(messagesQuery(filter)),
  ]) as ['ok' | 'missing', ContactPage];

  const href = (over: Partial<MessagesFilter>): string => `/admin/messages${messagesQueryString(filter, { page: 1, ...over })}`;
  const filtered = !!(filter.topic || filter.q || filter.status);
  const csvHref = `/api/admin/messages.csv${messagesQueryString({ ...filter, page: 1 })}`;

  return (
    <>
      <PageHead
        title="Messages"
        sub={`What people sent with the form on the Contact page, newest first. Times are India time (IST). Messages are deleted ${ADMIN_RETENTION_DAYS} days after they arrive. Reply from your own mailbox.`}
      >
        <span className={styles.rangeChip}>{num(list.unread)} unread</span>
      </PageHead>

      {status === 'missing' ? <ContactMigrationNotice /> : null}

      <nav className={styles.quick} aria-label="Quick filters">
        <Link href="/admin/messages" prefetch={false} className={styles.quickLink} aria-current={!filtered ? 'true' : undefined}>All</Link>
        <Link href={href({ status: 'unread', topic: '', q: '' })} prefetch={false} className={styles.quickLink} aria-current={filter.status === 'unread' && !filter.topic && !filter.q ? 'true' : undefined}>Unread ({num(list.unread)})</Link>
        {CONTACT_TOPICS.map((t) => (
          <Link key={t.id} href={href({ topic: t.id, status: '', q: '' })} prefetch={false} className={styles.quickLink} aria-current={filter.topic === t.id && !filter.status && !filter.q ? 'true' : undefined}>{t.label}</Link>
        ))}
      </nav>

      <form className={`${styles.panel} ${styles.filters}`} method="get" action="/admin/messages" role="search" aria-label="Filter messages">
        <label className={`${styles.field} ${styles.fieldGrow}`}>
          <span className={styles.fieldLabel}>Search</span>
          <input className={styles.control} type="search" name="q" defaultValue={filter.q} placeholder="Name, email, phone or words in the message" maxLength={60} autoComplete="off" />
        </label>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>Topic</span>
          <select className={styles.control} name="topic" defaultValue={filter.topic}>
            <option value="">All topics</option>
            {CONTACT_TOPICS.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
        </label>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>Status</span>
          <select className={styles.control} name="status" defaultValue={filter.status}>
            <option value="">Read and unread</option>
            <option value="unread">Unread</option>
            <option value="read">Read</option>
          </select>
        </label>
        <div className={styles.filterActions}>
          <button type="submit" className={styles.btnPrimary}>Apply</button>
          {filtered ? <Link href="/admin/messages" prefetch={false} className={styles.btn}>Clear</Link> : null}
        </div>
      </form>

      <div className={styles.tableCard}>
        <div className={styles.tableBar}>
          <span className={styles.tableBarTitle}>{num(list.total)} {list.total === 1 ? 'message' : 'messages'}<small>{filtered ? 'matching the filters' : 'newest first'}</small></span>
          <div className={styles.tableTools} data-noprint>
            <a href={csvHref} className={styles.miniBtn} download>Export CSV</a>
          </div>
        </div>
        <div className={styles.tableScroll}>
          <table className={styles.table} id="messages-table">
            <caption className="visually-hidden">Contact messages, {list.total} in all. Open a message to read all of it.</caption>
            <thead>
              <tr>
                <th scope="col">Received (IST)</th>
                <th scope="col">Topic</th>
                <th scope="col">From</th>
                <th scope="col">Reply to</th>
                <th scope="col">Message</th>
                <th scope="col">Place</th>
                <th scope="col">Device</th>
              </tr>
            </thead>
            <tbody>
              {list.rows.map((m) => {
                const unread = m.readAt === null;
                return (
                  <tr key={m.id} data-unread={unread ? 'true' : undefined} className={unread ? styles.msgUnread : undefined}>
                    <td>
                      <When ms={m.createdAt} now={now} short />
                      <span className={styles.sub}>{unread ? <><span className={styles.msgDot} aria-hidden="true" />Unread</> : 'Read'}</span>
                      <MessageActions id={m.id} read={!unread} who={m.name ?? 'someone who left no name'} />
                    </td>
                    <td>{topicLabel(m.topic)}</td>
                    <th scope="row" className={styles.wrap}>{m.name ?? <span className={styles.dim}>No name</span>}</th>
                    <td>{m.replyTo ? <Copy text={m.replyTo} mono={false} /> : <span className={styles.dim}>—</span>}</td>
                    <td className={styles.msgCell}>
                      <details className={styles.msgDetails}>
                        <summary className={styles.msgSummary}><span className={styles.msgPreview}>{preview(m.message)}</span></summary>
                        <div className={styles.msgFull}>{m.message}</div>
                        <dl className={styles.msgFacts}>
                          <div><dt>Came from</dt><dd>{m.page ?? '—'}</dd></div>
                          <div><dt>IP address</dt><dd>{m.ip ? <Copy text={m.ip} /> : '—'}</dd></div>
                          <div><dt>Language</dt><dd>{m.language ?? '—'}</dd></div>
                          <div><dt>Device id</dt><dd><DeviceLink id={m.device} /></dd></div>
                          {m.replyTo && isEmail(m.replyTo) ? (
                            <div><dt>Reply</dt><dd><a href={`mailto:${encodeURIComponent(m.replyTo).replace(/%40/g, '@')}?subject=${encodeURIComponent('Your message to Letsplaytambola')}`} className={styles.cellLink}>Write back by email</a></dd></div>
                          ) : null}
                        </dl>
                      </details>
                    </td>
                    <td><Place p={m} stacked /></td>
                    <td><DeviceText d={m} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {list.rows.length === 0 ? (
            <Empty
              title={filtered ? 'No message matches these filters' : status === 'missing' ? 'Messages are not being stored yet' : 'No messages yet'}
              hint={status === 'missing' ? 'Run migration 0004 (above).' : 'Messages sent from the Contact page (/contact) appear here.'}
            />
          ) : null}
        </div>
        <Pager page={filter.page} pageSize={MESSAGES_PAGE_SIZE} total={list.total} noun="messages" href={(p) => `/admin/messages${messagesQueryString(filter, { page: p })}`} />
      </div>
    </>
  );
}
