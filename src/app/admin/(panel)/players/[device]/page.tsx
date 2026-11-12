import type { Metadata } from 'next';
import Link from 'next/link';
import { rupees } from '@/core';
import { AdminOff } from '@/features/admin/AdminOff';
import { PageHead, Panel } from '@/features/admin/bits';
import styles from '@/features/admin/admin.module.css';
import { requireAdmin } from '@/server/admin/guard';
import { deviceStats } from '@/server/admin/stats';
import { formatIst } from '@/server/admin/time';
import { ADMIN_RETENTION_DAYS, ADMIN_RETENTION_MS, getStore } from '@/server/store';

export const metadata: Metadata = { title: 'Player detail' };

export default async function AdminPlayerDetailPage({ params }: PageProps<'/admin/players/[device]'>) {
  const admin = await requireAdmin();
  if (admin.off) return <AdminOff />;
  const { now } = admin;

  const id = decodeURIComponent((await params).device).trim().toLowerCase();
  const crumb = { href: '/admin/players', label: 'All players' };
  const valid = /^[0-9a-f]{8}$/.test(id);
  const games = valid ? await getStore().adminGamesInRange({ from: now - ADMIN_RETENTION_MS, device: id }) : null;
  const device = games ? deviceStats(games.rows).find((d) => d.id === id) : undefined;
  if (!device) {
    return <PageHead title="No such device" sub={`No device with that id has hosted or joined a game in the last ${ADMIN_RETENTION_DAYS} days.`} crumb={crumb} />;
  }

  return (
    <>
      <PageHead title={<>Device <span className={styles.mono} style={{ fontSize: 'inherit' }}>{device.id}</span></>} crumb={crumb} sub="Times are India time (IST)." />

      <p className={styles.note}>
        This is a <b>browser on a device</b>, not a person — there are no accounts. The id is a short piece of a scrambled code kept by that browser; it carries no name, phone number or location. Clearing the browser’s site data gives it a new id.
      </p>

      <Panel>
        <dl className={styles.facts}>
          <div className={styles.fact}><dt>Games joined</dt><dd>{device.joined}</dd></div>
          <div className={styles.fact}><dt>Games hosted</dt><dd>{device.hosted}</dd></div>
          <div className={styles.fact}><dt>Prizes won</dt><dd>{device.prizesWon}</dd></div>
          <div className={styles.fact}><dt>Recorded amount won</dt><dd>{device.amount > 0 ? `${rupees(device.amount)} (recorded only)` : '—'}</dd></div>
          <div className={styles.fact}><dt>First seen</dt><dd>{formatIst(device.firstSeen)}</dd></div>
          <div className={styles.fact}><dt>Last seen</dt><dd>{formatIst(device.lastSeen)}</dd></div>
        </dl>
      </Panel>

      <Panel title="Names used" sub="Most recent first">
        <ul className={styles.chips}>
          {device.names.map((n) => (
            <li key={n} className={styles.chip}>{n}</li>
          ))}
        </ul>
      </Panel>

      <Panel title="Games" sub={`${device.games.length} in the last ${ADMIN_RETENTION_DAYS} days, newest first`}>
        <div className={`${styles.tableWrap} ${styles.tableWrapFlat}`}>
          <table className={`${styles.table} ${styles.rowLink}`}>
            <thead>
              <tr>
                <th scope="col">Date (IST)</th>
                <th scope="col">Game</th>
                <th scope="col">Code</th>
                <th scope="col">Role</th>
                <th scope="col">Name used</th>
                <th scope="col">Prizes won</th>
                <th scope="col" className={styles.num}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {device.games.map((g) => (
                <tr key={g.code}>
                  <td>{formatIst(g.createdAt)}</td>
                  <th scope="row">
                    <Link href={`/admin/games/${g.code}`} prefetch={false} className={`${styles.cellLink} ${styles.stretched}`}>{g.name}</Link>
                  </th>
                  <td className={styles.mono}>{g.code}</td>
                  <td>{g.role === 'host' ? (g.hasTicket ? 'Host' : 'Host (no ticket)') : 'Player'}</td>
                  <td>{g.playedAs}</td>
                  <td className={styles.wrap}>{g.wins ? g.prizeLabels.join(', ') : <span className={styles.dim}>—</span>}</td>
                  <td className={styles.num}>{g.amount > 0 ? rupees(g.amount) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  );
}
