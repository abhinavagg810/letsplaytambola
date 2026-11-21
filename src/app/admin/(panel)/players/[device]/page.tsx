import type { Metadata } from 'next';
import Link from 'next/link';
import { rupees } from '@/core';
import { AdminOff } from '@/features/admin/AdminOff';
import { DeviceText, Fact, PageHead, Pager, Panel, Place, When, num, Empty } from '@/features/admin/bits';
import { Copy, CsvButton } from '@/features/admin/client';
import styles from '@/features/admin/ui.module.css';
import { propsText } from '@/server/admin/exports';
import { requireAdmin } from '@/server/admin/guard';
import { eventLabel, sourceLabel } from '@/server/admin/labels';
import { deviceStats } from '@/server/admin/stats';
import { formatIst } from '@/server/admin/time';
import { placeLabel } from '@/server/client-info';
import { ADMIN_RETENTION_DAYS, ADMIN_RETENTION_MS, getStore } from '@/server/store';

export const metadata: Metadata = { title: 'Player detail' };

const EVENTS_PER_PAGE = 50;

export default async function AdminPlayerDetailPage({ params, searchParams }: PageProps<'/admin/players/[device]'>) {
  const admin = await requireAdmin();
  if (admin.off) return <AdminOff />;
  const { now } = admin;

  const id = decodeURIComponent((await params).device).trim().toLowerCase();
  const rawPage = (await searchParams).page;
  const page = Math.max(1, Number.parseInt(Array.isArray(rawPage) ? rawPage[0] ?? '' : rawPage ?? '', 10) || 1);
  const valid = /^[0-9a-f]{8}$/.test(id);
  const store = getStore();
  const [found, games, events] = valid
    ? await Promise.all([
        store.getDevice(id),
        store.adminGamesInRange({ from: now - ADMIN_RETENTION_MS, device: id }),
        store.listEvents({ device: id, limit: EVENTS_PER_PAGE, offset: (page - 1) * EVENTS_PER_PAGE }),
      ])
    : [null, null, null];
  const played = games ? deviceStats(games.rows).find((d) => d.id === id) : undefined;
  if (!found && !played) {
    return <PageHead title="No such device" sub={`Nothing is stored for a device with that id in the last ${ADMIN_RETENTION_DAYS} days.`} />;
  }
  const d = found?.device;
  const ips = found?.ips ?? [];
  const sessions = new Set(events?.rows.map((e) => e.session)).size;

  return (
    <>
      <PageHead title={<>Device <Copy text={id} /></>} sub={d ? <>Last seen <When ms={d.lastSeen} now={now} /> from <Place p={d} />.</> : 'Known only from the games it took part in.'}>
        <Link href={`/admin/events?device=${id}&range=90d`} prefetch={false} className={styles.btn}>Its events</Link>
        <Link href={`/admin/privacy?device=${id}#erase`} prefetch={false} className={styles.dangerBtn}>Erase this device…</Link>
      </PageHead>

      <p className={styles.note}>
        This is a <b>browser on a device</b>, not a person — there are no accounts. The id is a short piece of a scrambled code kept by that browser. Clearing the browser’s site data gives it a new id.
      </p>

      <Panel title="Activity">
        <dl className={styles.facts}>
          <Fact label="First seen"><When ms={d?.firstSeen ?? played?.firstSeen} now={now} /></Fact>
          <Fact label="Last seen"><When ms={d?.lastSeen ?? played?.lastSeen} now={now} /></Fact>
          <Fact label="Sessions">{d ? num(d.sessions) : '—'}</Fact>
          <Fact label="Games hosted">{num(d?.gamesHosted ?? played?.hosted ?? 0)}</Fact>
          <Fact label="Games joined">{num(d?.gamesJoined ?? played?.joined ?? 0)}</Fact>
          <Fact label="Prizes won">{num(played?.prizesWon ?? d?.prizesWon ?? 0)}</Fact>
          <Fact label="Recorded amount won">{(played?.amount ?? d?.amountWon ?? 0) > 0 ? `${rupees(played?.amount ?? d?.amountWon ?? 0)} (recorded only)` : '—'}</Fact>
          <Fact label="Last name used">{d?.lastName ?? played?.names[0] ?? '—'}</Fact>
        </dl>
      </Panel>

      {d ? (
        <div className={styles.grid2}>
          <Panel title="Where and on what" sub="From its most recent request">
            <dl className={styles.facts}>
              <Fact label="Location"><Place p={d} /></Fact>
              <Fact label="Latest IP address">{d.ip ? <Copy text={d.ip} /> : <span className={styles.dim}>Unknown</span>}</Fact>
              <Fact label="Time zone">{d.timezone ?? d.clientTz ?? <span className={styles.dim}>Unknown</span>}</Fact>
              <Fact label="Postal code">{d.postal ?? <span className={styles.dim}>Unknown</span>}</Fact>
              <Fact label="Device"><DeviceText d={d} /></Fact>
              <Fact label="Language">{d.language ?? <span className={styles.dim}>Unknown</span>}</Fact>
              <Fact label="Screen">{d.screenW && d.screenH ? `${d.screenW} × ${d.screenH} px${d.dpr ? ` @ ${d.dpr / 100}×` : ''}` : <span className={styles.dim}>Unknown</span>}</Fact>
              <Fact label="Window">{d.viewportW && d.viewportH ? `${d.viewportW} × ${d.viewportH} px` : <span className={styles.dim}>Unknown</span>}</Fact>
              <Fact label="Touch screen">{d.touch === null ? <span className={styles.dim}>Unknown</span> : d.touch ? 'Yes' : 'No'}</Fact>
              <Fact label="Connection">{d.connection ?? <span className={styles.dim}>Not reported</span>}</Fact>
              <Fact label="Installed to home screen">{d.standalone === null ? <span className={styles.dim}>Unknown</span> : d.standalone ? 'Yes' : 'No'}</Fact>
            </dl>
            {d.ua ? <p className={styles.hint} style={{ overflowWrap: 'anywhere' }}><span className={styles.fieldLabel}>What the browser said</span><br />{d.ua}</p> : null}
          </Panel>
          <Panel title="How it first arrived" sub="First touch — never overwritten by later visits">
            <dl className={styles.facts}>
              <Fact label="Source">{d.firstSource ? sourceLabel(d.firstSource) : <span className={styles.dim}>Unknown</span>}</Fact>
              <Fact label="Referrer">{d.firstReferrer ?? <span className={styles.dim}>None</span>}</Fact>
              <Fact label="Campaign source">{d.firstUtmSource ?? <span className={styles.dim}>None</span>}</Fact>
              <Fact label="Campaign medium">{d.firstUtmMedium ?? <span className={styles.dim}>None</span>}</Fact>
              <Fact label="Campaign name">{d.firstUtmCampaign ?? <span className={styles.dim}>None</span>}</Fact>
              <Fact label="Landing page">{d.firstLanding ?? <span className={styles.dim}>Unknown</span>}</Fact>
            </dl>
          </Panel>
        </div>
      ) : null}

      <Panel title="IP addresses seen" sub={`${num(ips.length)} in the last ${ADMIN_RETENTION_DAYS} days, most recent first`}
        action={<CsvButton file={`device-${id}-ips`} table={{ head: ['IP address', 'Location', 'First seen (IST)', 'Last seen (IST)', 'Requests'], rows: ips.map((i) => [i.ip, placeLabel(i), formatIst(i.firstSeen), formatIst(i.lastSeen), i.hits]) }} />}>
        {ips.length === 0 ? <Empty title="No IP address recorded" hint="On the live site every request carries one; on a local machine there is none." /> : (
          <div className={styles.tableScroll} style={{ maxHeight: 320 }}>
            <table className={styles.table}>
              <thead><tr><th scope="col">IP address</th><th scope="col">Location</th><th scope="col">First seen</th><th scope="col">Last seen</th><th scope="col" className={styles.num}>Requests</th></tr></thead>
              <tbody>
                {ips.map((i) => (
                  <tr key={i.ip}>
                    <th scope="row"><Copy text={i.ip} /></th>
                    <td><Place p={i} /></td>
                    <td><When ms={i.firstSeen} now={now} short /></td>
                    <td><When ms={i.lastSeen} now={now} short /></td>
                    <td className={styles.num}>{num(i.hits)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {played ? (
        <>
          <Panel title="Names used" sub="Most recent first">
            <ul className={styles.chips}>{played.names.map((n) => <li key={n} className={styles.chip}>{n}</li>)}</ul>
          </Panel>
          <Panel title="Games" sub={`${played.games.length} in the last ${ADMIN_RETENTION_DAYS} days, newest first`}>
            <div className={styles.tableScroll} style={{ maxHeight: 420 }}>
              <table className={`${styles.table} ${styles.rowLink}`}>
                <thead>
                  <tr><th scope="col">Date (IST)</th><th scope="col">Game</th><th scope="col">Code</th><th scope="col">Role</th><th scope="col">Name used</th><th scope="col">Prizes won</th><th scope="col" className={styles.num}>Amount</th></tr>
                </thead>
                <tbody>
                  {played.games.map((g) => (
                    <tr key={g.code}>
                      <td><When ms={g.createdAt} now={now} short /></td>
                      <th scope="row"><Link href={`/admin/games/${g.code}`} prefetch={false} className={`${styles.cellLink} ${styles.stretched}`}>{g.name}</Link></th>
                      <td><Copy text={g.code} /></td>
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
      ) : null}

      <div className={styles.tableCard}>
        <div className={styles.tableBar}>
          <span className={styles.tableBarTitle}>Session and event history<small>{num(events?.total ?? 0)} events · {num(sessions)} {sessions === 1 ? 'session' : 'sessions'} on this page · newest first</small></span>
          <div className={styles.tableTools} data-noprint>
            <a href={`/api/admin/events.csv?device=${id}&range=90d`} className={styles.miniBtn} download>Export CSV</a>
          </div>
        </div>
        <div className={styles.tableScroll} style={{ maxHeight: 560 }}>
          <table className={styles.table}>
            <thead><tr><th scope="col">Time (IST)</th><th scope="col">Event</th><th scope="col">Details</th><th scope="col">Game</th><th scope="col">Page</th><th scope="col">Session</th><th scope="col">Location</th></tr></thead>
            <tbody>
              {(events?.rows ?? []).map((e) => (
                <tr key={e.id}>
                  <td><When ms={e.at} now={now} short /></td>
                  <th scope="row">{eventLabel(e.name)}</th>
                  <td className={styles.mono}>{propsText(e.props) || <span className={styles.dim}>—</span>}</td>
                  <td>{e.code ? <Link href={`/admin/games/${e.code}`} prefetch={false} className={`${styles.cellLink} ${styles.mono}`}>{e.code}</Link> : <span className={styles.dim}>—</span>}</td>
                  <td className={styles.mono}>{e.path ?? '—'}</td>
                  <td className={styles.mono} title={e.session}>{e.session.slice(0, 8)}</td>
                  <td><Place p={e} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          {(events?.rows.length ?? 0) === 0 ? <Empty title="No events recorded for this device" hint="Events are kept for 90 days. A device that only ever played before analytics were switched on has none." /> : null}
        </div>
        <Pager page={page} pageSize={EVENTS_PER_PAGE} total={events?.total ?? 0} noun="events" href={(p) => `/admin/players/${id}${p > 1 ? `?page=${p}` : ''}`} />
      </div>
    </>
  );
}
