import type { Metadata } from 'next';
import { AdminOff } from '@/features/admin/AdminOff';
import { PageHead, Pager, When, num, Empty } from '@/features/admin/bits';
import { Copy } from '@/features/admin/client';
import styles from '@/features/admin/ui.module.css';
import { requireAdmin } from '@/server/admin/guard';
import { ADMIN_MAX_PAGE, getStore } from '@/server/store';

export const metadata: Metadata = { title: 'Notify me' };

export default async function AdminNotifyPage({ searchParams }: PageProps<'/admin/notify'>) {
  const admin = await requireAdmin();
  if (admin.off) return <AdminOff />;
  const { now } = admin;

  const raw = (await searchParams).page;
  const pageNo = Math.max(1, Number.parseInt(Array.isArray(raw) ? raw[0] ?? '' : raw ?? '', 10) || 1);
  const list = await getStore().adminListNotifyNumbers({ limit: ADMIN_MAX_PAGE, offset: (pageNo - 1) * ADMIN_MAX_PAGE });

  return (
    <>
      <PageHead title="Notify me" sub="WhatsApp numbers people left on the website to hear about the app launch. Kept until the launch message is sent or the person asks for removal." />

      <div className={styles.tableCard}>
        <div className={styles.tableBar}>
          <span className={styles.tableBarTitle}>{num(list.total)} {list.total === 1 ? 'number' : 'numbers'}<small>newest first</small></span>
          <div className={styles.tableTools} data-noprint>
            <a href="/api/admin/notify.csv" className={styles.miniBtn} download>Export CSV</a>
          </div>
        </div>
        <div className={styles.tableScroll}>
          <table className={styles.table}>
            <caption className="visually-hidden">Notify-me numbers, {list.total} in all</caption>
            <thead>
              <tr>
                <th scope="col">WhatsApp number</th>
                <th scope="col">Added (IST)</th>
              </tr>
            </thead>
            <tbody>
              {list.rows.map((r) => (
                <tr key={r.phone}>
                  <th scope="row"><Copy text={r.phone} /></th>
                  <td><When ms={r.createdAt} now={now} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          {list.rows.length === 0 ? <Empty title="Nobody has asked to be notified yet" hint="Numbers typed into “Notify me” on the home page appear here." /> : null}
        </div>
        <Pager page={pageNo} pageSize={ADMIN_MAX_PAGE} total={list.total} noun="numbers" href={(p) => `/admin/notify${p > 1 ? `?page=${p}` : ''}`} />
      </div>
    </>
  );
}
