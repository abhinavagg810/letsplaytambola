import type { Metadata } from 'next';
import Link from 'next/link';
import { rupees } from '@/core';
import { AdminOff } from '@/features/admin/AdminOff';
import { DeviceLink, PageHead, Pager, SortTh } from '@/features/admin/bits';
import styles from '@/features/admin/admin.module.css';
import { requireAdmin } from '@/server/admin/guard';
import { PAGE_SIZE } from '@/server/admin/queries';
import { DEVICE_SORTS, deviceStats, filterDevices } from '@/server/admin/stats';
import type { DeviceSort } from '@/server/admin/stats';
import { formatIst } from '@/server/admin/time';
import { ADMIN_MAX_RANGE_ROWS, ADMIN_RETENTION_DAYS, ADMIN_RETENTION_MS, getStore } from '@/server/store';

export const metadata: Metadata = { title: 'Players' };

const one = (v: string | string[] | undefined): string => (Array.isArray(v) ? v[0] ?? '' : v ?? '');

export default async function AdminPlayersPage({ searchParams }: PageProps<'/admin/players'>) {
  const admin = await requireAdmin();
  if (admin.off) return <AdminOff />;
  const { now } = admin;

  const sp = await searchParams;
  const q = one(sp.q).trim().slice(0, 60);
  const sort: DeviceSort = (DEVICE_SORTS as readonly string[]).includes(one(sp.sort)) ? (one(sp.sort) as DeviceSort) : 'lastSeen';
  const dir = one(sp.dir) === 'asc' ? 'asc' : 'desc';
  const pageNo = Math.max(1, Number.parseInt(one(sp.page), 10) || 1);
  const games = await getStore().adminGamesInRange({ from: now - ADMIN_RETENTION_MS });
  const all = filterDevices(deviceStats(games.rows), { search: q, sort, dir });
  const rows = all.slice((pageNo - 1) * PAGE_SIZE, pageNo * PAGE_SIZE);

  const qs = (over: { sort?: DeviceSort; dir?: 'asc' | 'desc'; page?: number }): string => {
    const v = { sort, dir, page: pageNo, ...over };
    const p = new URLSearchParams();
    if (q) p.set('q', q);
    if (v.sort !== 'lastSeen') p.set('sort', v.sort);
    if (v.dir !== 'desc') p.set('dir', v.dir);
    if (v.page > 1) p.set('page', String(v.page));
    const s = p.toString();
    return `/admin/players${s ? `?${s}` : ''}`;
  };
  const sortHref = (s: DeviceSort): string => qs({ sort: s, dir: sort === s && dir === 'desc' ? 'asc' : 'desc', page: 1 });

  return (
    <>
      <PageHead title="Players" sub={`One row per device seen in the last ${ADMIN_RETENTION_DAYS} days: the names typed on it (newest first), games joined and hosted, prizes won and the recorded amount won (never handled by the app). Times are India time (IST).`} />

      <p className={styles.note}>
        A “player” here is a <b>browser on a device</b>, not a person — nobody signs up, so there are no accounts. The same person on a phone and a laptop is two rows; a family sharing one phone is one row with several names.
      </p>

      {games.total > games.rows.length ? (
        <p className={styles.note}>Built from the newest {ADMIN_MAX_RANGE_ROWS.toLocaleString('en-IN')} of {games.total.toLocaleString('en-IN')} games.</p>
      ) : null}

      <form className={`${styles.panel} ${styles.filters}`} method="get" action="/admin/players" role="search" aria-label="Search players">
        <label className={`${styles.field} ${styles.fieldGrow}`}>
          <span className={styles.fieldLabel}>Search by name</span>
          <input className={styles.control} type="search" name="q" defaultValue={q} placeholder="A name someone typed" maxLength={60} autoComplete="off" />
        </label>
        {sort !== 'lastSeen' ? <input type="hidden" name="sort" value={sort} /> : null}
        {dir !== 'desc' ? <input type="hidden" name="dir" value={dir} /> : null}
        <div className={styles.filterActions}>
          <button type="submit" className={styles.btnPrimary}>Search</button>
          {q ? <Link href="/admin/players" prefetch={false} className={styles.btn}>Clear</Link> : null}
        </div>
      </form>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <caption className="visually-hidden">Devices, {all.length} matching</caption>
          <thead>
            <tr>
              <th scope="col">Device</th>
              <th scope="col">Names used</th>
              <SortTh label="Joined" active={sort === 'games'} dir={dir} href={sortHref('games')} className={styles.num} />
              <SortTh label="Hosted" active={sort === 'hosted'} dir={dir} href={sortHref('hosted')} className={styles.num} />
              <SortTh label="Prizes won" active={sort === 'prizes'} dir={dir} href={sortHref('prizes')} className={styles.num} />
              <SortTh label="Amount" active={sort === 'amount'} dir={dir} href={sortHref('amount')} className={styles.num} />
              <SortTh label="First seen" active={sort === 'firstSeen'} dir={dir} href={sortHref('firstSeen')} />
              <SortTh label="Last seen" active={sort === 'lastSeen'} dir={dir} href={sortHref('lastSeen')} />
            </tr>
          </thead>
          <tbody>
            {rows.map((d) => (
              <tr key={d.id}>
                <th scope="row"><DeviceLink id={d.id} /></th>
                <td className={styles.wrap}>{d.names.join(', ')}</td>
                <td className={styles.num}>{d.joined}</td>
                <td className={styles.num}>{d.hosted}</td>
                <td className={styles.num}>{d.prizesWon}</td>
                <td className={styles.num}>{d.amount > 0 ? rupees(d.amount) : '—'}</td>
                <td>{formatIst(d.firstSeen)}</td>
                <td>{formatIst(d.lastSeen)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 ? <p className={styles.empty}>{q ? 'No device has used a name like that.' : 'Nobody has played yet.'}</p> : null}
      </div>

      <Pager page={pageNo} pageSize={PAGE_SIZE} total={all.length} noun="devices" href={(p) => qs({ page: p })} />
    </>
  );
}
