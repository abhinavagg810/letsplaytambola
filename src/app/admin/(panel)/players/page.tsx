import type { Metadata } from 'next';
import Link from 'next/link';
import { rupees } from '@/core';
import { AdminOff } from '@/features/admin/AdminOff';
import { DeviceLink, DeviceText, PageHead, Pager, Place, SortTh, When, num, Empty } from '@/features/admin/bits';
import { ColumnPicker, Copy } from '@/features/admin/client';
import styles from '@/features/admin/ui.module.css';
import { DEVICES_PAGE, devicesQuery, devicesQueryString, parseDevicesFilter } from '@/server/admin/exports';
import { requireAdmin } from '@/server/admin/guard';
import { sourceLabel } from '@/server/admin/labels';
import { deviceStats, filterDevices } from '@/server/admin/stats';
import type { DeviceListSort } from '@/server/insights/types';
import { ADMIN_RETENTION_DAYS, ADMIN_RETENTION_MS, getStore } from '@/server/store';

export const metadata: Metadata = { title: 'Players' };

const COLUMNS = [
  { key: 'name', label: 'Last name used' }, { key: 'place', label: 'Location' }, { key: 'ip', label: 'IP address' }, { key: 'device', label: 'Device' },
  { key: 'source', label: 'First source' }, { key: 'sessions', label: 'Sessions' }, { key: 'hosted', label: 'Hosted' }, { key: 'joined', label: 'Joined' },
  { key: 'won', label: 'Prizes won' }, { key: 'amount', label: 'Amount won', off: true }, { key: 'first', label: 'First seen', off: true }, { key: 'last', label: 'Last seen' },
];

export default async function AdminPlayersPage({ searchParams }: PageProps<'/admin/players'>) {
  const admin = await requireAdmin();
  if (admin.off) return <AdminOff />;
  const { now } = admin;
  const filter = parseDevicesFilter(await searchParams);
  const store = getStore();
  const list = await store.listDevices(devicesQuery(filter));
  // Before migration 0003 (or for games older than it) there are no device rows: fall back to what the games themselves tell.
  const legacy = list.total === 0 && !filter.q && !filter.played
    ? filterDevices(deviceStats((await store.adminGamesInRange({ from: now - ADMIN_RETENTION_MS })).rows), { sort: 'lastSeen', dir: 'desc' })
    : [];

  const href = (over: Partial<typeof filter>): string => `/admin/players${devicesQueryString(filter, over)}`;
  const sortHref = (s: DeviceListSort): string => href({ sort: s, dir: filter.sort === s && filter.dir === 'desc' ? 'asc' : 'desc', page: 1 });
  const sortTh = (label: string, s: DeviceListSort, col: string, numeric = true) => <SortTh label={label} active={filter.sort === s} dir={filter.dir} href={sortHref(s)} className={numeric ? styles.num : undefined} col={col} />;

  return (
    <>
      <PageHead title="Players" sub={`One row per device seen in the last ${ADMIN_RETENTION_DAYS} days — visitors as well as people who hosted or joined. Times are India time (IST).`} />

      <p className={styles.note}>
        A “player” here is a <b>browser on a device</b>, not a person — nobody signs up, so there are no accounts. The same person on a phone and a laptop is two rows; a family sharing one phone is one row.
        The location is the approximate place of the internet connection, not GPS.
      </p>

      <form className={`${styles.panel} ${styles.filters}`} method="get" action="/admin/players" role="search" aria-label="Search players">
        <label className={`${styles.field} ${styles.fieldGrow}`}>
          <span className={styles.fieldLabel}>Search</span>
          <input className={styles.control} type="search" name="q" defaultValue={filter.q} placeholder="Name, city, IP address or device id" maxLength={60} autoComplete="off" />
        </label>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>Show</span>
          <select className={styles.control} name="played" defaultValue={filter.played ? '1' : ''}>
            <option value="">Every device</option>
            <option value="1">Only devices that played</option>
          </select>
        </label>
        {filter.sort !== 'lastSeen' ? <input type="hidden" name="sort" value={filter.sort} /> : null}
        {filter.dir !== 'desc' ? <input type="hidden" name="dir" value={filter.dir} /> : null}
        <div className={styles.filterActions}>
          <button type="submit" className={styles.btnPrimary}>Apply</button>
          {filter.q || filter.played ? <Link href="/admin/players" prefetch={false} className={styles.btn}>Clear</Link> : null}
        </div>
      </form>

      {legacy.length ? (
        <div className={styles.tableCard}>
          <div className={styles.tableBar}>
            <span className={styles.tableBarTitle}>{num(legacy.length)} devices<small>from the games themselves — no visit, place or device details have been recorded for them</small></span>
          </div>
          <div className={styles.tableScroll}>
            <table className={styles.table}>
              <thead><tr><th scope="col">Device</th><th scope="col">Names used</th><th scope="col" className={styles.num}>Joined</th><th scope="col" className={styles.num}>Hosted</th><th scope="col" className={styles.num}>Prizes won</th><th scope="col" className={styles.num}>Amount</th><th scope="col">Last seen</th></tr></thead>
              <tbody>
                {legacy.slice(0, 200).map((d) => (
                  <tr key={d.id}>
                    <th scope="row"><DeviceLink id={d.id} /></th>
                    <td className={styles.wrap}>{d.names.join(', ')}</td>
                    <td className={styles.num}>{d.joined}</td>
                    <td className={styles.num}>{d.hosted}</td>
                    <td className={styles.num}>{d.prizesWon}</td>
                    <td className={styles.num}>{d.amount > 0 ? rupees(d.amount) : '—'}</td>
                    <td><When ms={d.lastSeen} now={now} short /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className={styles.tableCard}>
          <div className={styles.tableBar}>
            <span className={styles.tableBarTitle}>{num(list.total)} {list.total === 1 ? 'device' : 'devices'}</span>
            <div className={styles.tableTools} data-noprint>
              <ColumnPicker tableId="players-table" storageKey="lpt:admin:players-cols" columns={COLUMNS} />
              <a href={`/api/admin/players.csv${devicesQueryString(filter, { page: 1 })}`} className={styles.miniBtn} download>Export CSV</a>
            </div>
          </div>
          <div className={styles.tableScroll}>
            <table id="players-table" className={styles.table}>
              <caption className="visually-hidden">Devices, {list.total} matching</caption>
              <thead>
                <tr>
                  <th scope="col">Device id</th>
                  <th scope="col" data-col="name">Last name used</th>
                  <th scope="col" data-col="place">Location</th>
                  <th scope="col" data-col="ip">IP address</th>
                  <th scope="col" data-col="device">Device</th>
                  <th scope="col" data-col="source">First source</th>
                  {sortTh('Sessions', 'sessions', 'sessions')}
                  {sortTh('Hosted', 'hosted', 'hosted')}
                  {sortTh('Joined', 'joined', 'joined')}
                  {sortTh('Won', 'won', 'won')}
                  {sortTh('Amount', 'amount', 'amount')}
                  {sortTh('First seen', 'firstSeen', 'first', false)}
                  {sortTh('Last seen', 'lastSeen', 'last', false)}
                </tr>
              </thead>
              <tbody>
                {list.rows.map((d) => (
                  <tr key={d.id}>
                    <th scope="row"><DeviceLink id={d.id} /> <Copy text={d.id}><span className="visually-hidden">{d.id}</span></Copy></th>
                    <td data-col="name">{d.lastName ?? <span className={styles.dim}>—</span>}</td>
                    <td data-col="place"><Place p={d} stacked /></td>
                    <td data-col="ip">{d.ip ? <Copy text={d.ip} /> : <span className={styles.dim}>Unknown</span>}</td>
                    <td data-col="device"><DeviceText d={d} /></td>
                    <td data-col="source">{d.firstSource ? sourceLabel(d.firstSource) : <span className={styles.dim}>Unknown</span>}</td>
                    <td className={styles.num} data-col="sessions">{num(d.sessions)}</td>
                    <td className={styles.num} data-col="hosted">{num(d.gamesHosted)}</td>
                    <td className={styles.num} data-col="joined">{num(d.gamesJoined)}</td>
                    <td className={styles.num} data-col="won">{num(d.prizesWon)}</td>
                    <td className={styles.num} data-col="amount">{d.amountWon > 0 ? rupees(d.amountWon) : '—'}</td>
                    <td data-col="first"><When ms={d.firstSeen} now={now} short /></td>
                    <td data-col="last"><When ms={d.lastSeen} now={now} short /></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {list.rows.length === 0 ? <Empty title={filter.q || filter.played ? 'No device matches' : 'No device has been seen yet'} hint={filter.q ? 'Search looks in the last name used, the city, the IP address and the device id.' : 'A row appears as soon as someone opens the site.'} /> : null}
          </div>
          <Pager page={filter.page} pageSize={DEVICES_PAGE} total={list.total} noun="devices" href={(p) => href({ page: p })} />
        </div>
      )}
    </>
  );
}
