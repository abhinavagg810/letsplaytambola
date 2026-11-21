import type { Metadata } from 'next';
import { AdminOff } from '@/features/admin/AdminOff';
import { PageHead, Panel, When, num, Empty } from '@/features/admin/bits';
import { CsvButton, EraseForm } from '@/features/admin/client';
import styles from '@/features/admin/ui.module.css';
import { requireAdmin } from '@/server/admin/guard';
import { formatIst } from '@/server/admin/time';
import type { TableCounts } from '@/server/insights/types';
import { ADMIN_RETENTION_DAYS, getStore } from '@/server/store';

export const metadata: Metadata = { title: 'Data & privacy' };

const TABLES: [keyof TableCounts, string, string, string][] = [
  ['games', 'Games', 'The public game document: names typed, numbers called, winners, prizes, times.', `Stops working 24 hours after the last activity; the summary is deleted ${ADMIN_RETENTION_DAYS} days after it.`],
  ['players', 'Tickets', 'One row per person per game: the ticket, the dabs and a scrambled device code.', `Ticket and dabs erased at 24 hours; the row goes with its game at ${ADMIN_RETENTION_DAYS} days.`],
  ['devices', 'Devices', 'One row per browser: first and last seen, latest IP address and approximate place, device and browser, how it first arrived, lifetime counts.', `Deleted ${ADMIN_RETENTION_DAYS} days after it was last seen.`],
  ['device_ips', 'IP addresses', 'Every IP address a device was seen on, with the place it maps to.', `Deleted ${ADMIN_RETENTION_DAYS} days after it was last seen.`],
  ['participations', 'Game records', 'Per device per game: IP address, place and device at the moment the game was created or joined.', `Deleted after ${ADMIN_RETENTION_DAYS} days, or with its game.`],
  ['events', 'Events', 'Usage events from a fixed list: page views, button taps, funnel steps, shares, claims.', `Deleted after ${ADMIN_RETENTION_DAYS} days.`],
  ['notify_numbers', 'Notify-me numbers', 'WhatsApp numbers left for the app launch message.', 'Kept until the launch message is sent or the person asks for removal.'],
  ['admin_audit', 'Audit lines', 'What was done from this page: device id and counts only.', 'Kept.'],
];

export default async function AdminPrivacyPage({ searchParams }: PageProps<'/admin/privacy'>) {
  const admin = await requireAdmin();
  if (admin.off) return <AdminOff />;
  const { now } = admin;
  const raw = (await searchParams).device;
  const device = (Array.isArray(raw) ? raw[0] ?? '' : raw ?? '').trim().toLowerCase();
  const store = getStore();
  const [counts, audit] = await Promise.all([store.tableCounts(), store.listAudit(100)]);

  return (
    <>
      <PageHead title="Data & privacy" sub="What is stored, for how long, and how to erase one device when someone asks. The public Privacy Policy (/privacy) says the same in plain words — keep the two in step." />

      <Panel title="What is stored right now" sub={`The clean-up runs by itself about once an hour. IP addresses, device rows and events follow the same ${ADMIN_RETENTION_DAYS}-day rule as game summaries.`}
        action={<CsvButton file="stored-rows" table={{ head: ['Table', 'Rows', 'What it holds', 'How long'], rows: TABLES.map(([k, name, what, keep]) => [name, counts[k] ?? 0, what, keep]) }} />}>
        <div className={styles.tableScroll}>
          <table className={styles.table}>
            <thead><tr><th scope="col">Table</th><th scope="col" className={styles.num}>Rows</th><th scope="col">What it holds</th><th scope="col">How long it is kept</th></tr></thead>
            <tbody>
              {TABLES.map(([k, name, what, keep]) => (
                <tr key={k}>
                  <th scope="row">{name}<span className={`${styles.sub} ${styles.mono}`}>{k}</span></th>
                  <td className={styles.num}>{num(counts[k] ?? 0)}</td>
                  <td className={styles.wrap}>{what}</td>
                  <td className={styles.wrap}>{keep}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <div className={styles.grid2}>
        <Panel title="Who can see it">
          <ul style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 16, lineHeight: 1.45, color: 'var(--text-soft)', listStyle: 'disc', paddingLeft: 20 }}>
            <li>Only this admin area. IP addresses, places and device details are never part of any page or response a player gets.</li>
            <li>Devices are shown as an 8-character id — a piece of a scrambled code. The full code never leaves the server.</li>
            <li>Tickets and dabs are never shown here, in any export or API.</li>
            <li>Exports (CSV) contain names people typed, phone numbers and IP addresses. Keep the files private and delete them when done.</li>
            <li>The place is worked out from the IP address by the hosting provider: city level at best, wrong behind VPNs. It is not GPS.</li>
          </ul>
        </Panel>

        <Panel title="Erase a device" sub="For when someone asks you to delete their data. Find their device on the Players page (search by the name they used or the game’s code), then erase it here.">
          <div id="erase">
            <EraseForm initial={/^[0-9a-f]{8}$/.test(device) ? device : ''} />
          </div>
          <p className={styles.hint}>
            Erasing deletes the device row, its IP addresses, its events and its per-game place and device details, and replaces the names it typed with “Erased player” in stored game summaries.
            A game that is still being played keeps the seat so the game can go on; erase again after it has expired (24 hours) to cut that last link.
            To remove a whole game or a Notify-me number, see docs/ADMIN.md.
          </p>
        </Panel>
      </div>

      <Panel title="Audit" sub="Every erase made from this page, newest first"
        action={<CsvButton file="admin-audit" table={{ head: ['Time (IST)', 'Action', 'Device id', 'Devices', 'IP addresses', 'Events', 'Game records', 'Games anonymised', 'Of those still active'], rows: audit.map((a) => [formatIst(a.at), a.action, a.target, a.detail.devices ?? 0, a.detail.ips ?? 0, a.detail.events ?? 0, a.detail.participations ?? 0, a.detail.games ?? 0, a.detail.activeGames ?? 0]) }} />}>
        {audit.length === 0 ? <Empty title="Nothing has been erased" hint="Each erase leaves one line here: the device id and how many rows went." /> : (
          <div className={styles.tableScroll} style={{ maxHeight: 420 }}>
            <table className={styles.table}>
              <thead><tr><th scope="col">Time (IST)</th><th scope="col">Action</th><th scope="col">Device id</th><th scope="col" className={styles.num}>Devices</th><th scope="col" className={styles.num}>IPs</th><th scope="col" className={styles.num}>Events</th><th scope="col" className={styles.num}>Game records</th><th scope="col" className={styles.num}>Games anonymised</th></tr></thead>
              <tbody>
                {audit.map((a) => (
                  <tr key={a.id}>
                    <td><When ms={a.at} now={now} /></td>
                    <th scope="row">{a.action === 'erase_device' ? 'Erased a device' : a.action}</th>
                    <td className={styles.mono}>{a.target}</td>
                    <td className={styles.num}>{num(Number(a.detail.devices ?? 0))}</td>
                    <td className={styles.num}>{num(Number(a.detail.ips ?? 0))}</td>
                    <td className={styles.num}>{num(Number(a.detail.events ?? 0))}</td>
                    <td className={styles.num}>{num(Number(a.detail.participations ?? 0))}</td>
                    <td className={styles.num}>{num(Number(a.detail.games ?? 0))}{Number(a.detail.activeGames ?? 0) > 0 ? <span className={styles.sub}>{num(Number(a.detail.activeGames))} still active</span> : null}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </>
  );
}
