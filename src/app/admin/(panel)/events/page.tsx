import type { Metadata } from 'next';
import Link from 'next/link';
import { AdminOff } from '@/features/admin/AdminOff';
import { DeviceLink, PageHead, Pager, Place, When, num, Empty } from '@/features/admin/bits';
import styles from '@/features/admin/ui.module.css';
import { EVENTS_PAGE, eventsQuery, parseEventsFilter, propsText } from '@/server/admin/exports';
import { requireAdmin } from '@/server/admin/guard';
import { deviceTypeLabel, eventLabel, sourceLabel } from '@/server/admin/labels';
import { parseRange, rangeParams, withRange } from '@/server/admin/range';
import { EVENT_NAMES } from '@/server/insights/events';
import { getStore } from '@/server/store';

export const metadata: Metadata = { title: 'Events' };

export default async function AdminEventsPage({ searchParams }: PageProps<'/admin/events'>) {
  const admin = await requireAdmin();
  if (admin.off) return <AdminOff />;
  const { now } = admin;
  const sp = await searchParams;
  const range = parseRange(sp, now);
  const filter = parseEventsFilter(sp);
  const list = await getStore().listEvents(eventsQuery(filter, range.from, range.to));
  const own = { name: filter.name, device: filter.device, code: filter.code, session: filter.session };
  const filtered = !!(filter.name || filter.device || filter.code || filter.session);
  const csvParams = rangeParams(range);
  for (const [k, v] of Object.entries(own)) if (v) csvParams.set(k, v);

  return (
    <>
      <PageHead title="Events" sub="Every usage event recorded in the selected period, newest first: page views, taps on the main buttons, funnel steps, shares, claims. Names and details come from a fixed list — nothing a visitor types is ever recorded here." range={range.label} />

      <form className={`${styles.panel} ${styles.filters}`} method="get" action="/admin/events" role="search" aria-label="Filter events">
        {[...rangeParams(range)].map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
        <label className={`${styles.field} ${styles.fieldGrow}`}>
          <span className={styles.fieldLabel}>Event</span>
          <select className={styles.control} name="name" defaultValue={filter.name}>
            <option value="">All events</option>
            {EVENT_NAMES.map((n) => <option key={n} value={n}>{eventLabel(n)}</option>)}
          </select>
        </label>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>Device id</span>
          <input className={`${styles.control} ${styles.mono}`} name="device" defaultValue={filter.device} placeholder="8 characters" maxLength={8} autoComplete="off" autoCapitalize="none" spellCheck={false} />
        </label>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>Game code</span>
          <input className={`${styles.control} ${styles.mono}`} name="code" defaultValue={filter.code} placeholder="e.g. K7RQ2" maxLength={5} autoComplete="off" autoCapitalize="characters" spellCheck={false} />
        </label>
        {filter.session ? <input type="hidden" name="session" value={filter.session} /> : null}
        <div className={styles.filterActions}>
          <button type="submit" className={styles.btnPrimary}>Apply</button>
          {filtered ? <Link href={withRange('/admin/events', range)} prefetch={false} className={styles.btn}>Clear</Link> : null}
        </div>
      </form>

      {filter.session ? <p className={styles.note}>Showing one session: <span className={styles.mono}>{filter.session}</span></p> : null}

      <div className={styles.tableCard}>
        <div className={styles.tableBar}>
          <span className={styles.tableBarTitle}>{num(list.total)} {list.total === 1 ? 'event' : 'events'}</span>
          <div className={styles.tableTools} data-noprint>
            <a href={`/api/admin/events.csv?${csvParams.toString()}`} className={styles.miniBtn} download>Export CSV</a>
          </div>
        </div>
        <div className={styles.tableScroll}>
          <table className={styles.table}>
            <caption className="visually-hidden">Events, {list.total} matching</caption>
            <thead>
              <tr>
                <th scope="col">Time (IST)</th>
                <th scope="col">Event</th>
                <th scope="col">Details</th>
                <th scope="col">Game</th>
                <th scope="col">Page</th>
                <th scope="col">Device id</th>
                <th scope="col">Session</th>
                <th scope="col">Source</th>
                <th scope="col">Device</th>
                <th scope="col">Location</th>
              </tr>
            </thead>
            <tbody>
              {list.rows.map((e) => (
                <tr key={e.id}>
                  <td><When ms={e.at} now={now} short /></td>
                  <th scope="row">{eventLabel(e.name)}<span className={`${styles.sub} ${styles.mono}`}>{e.name}</span></th>
                  <td className={styles.mono}>{propsText(e.props) || <span className={styles.dim}>—</span>}</td>
                  <td>{e.code ? <Link href={withRange(`/admin/games/${e.code}`, range)} prefetch={false} className={`${styles.cellLink} ${styles.mono}`}>{e.code}</Link> : <span className={styles.dim}>—</span>}</td>
                  <td className={styles.mono}>{e.path ?? '—'}</td>
                  <td><DeviceLink id={e.device} /></td>
                  <td><Link href={withRange('/admin/events', range, { session: e.session })} prefetch={false} className={`${styles.cellLink} ${styles.mono}`} title={`Only session ${e.session}`}>{e.session.slice(0, 8)}</Link></td>
                  <td>{e.source ? sourceLabel(e.source) : <span className={styles.dim}>Unknown</span>}</td>
                  <td>{e.deviceType ? deviceTypeLabel(e.deviceType) : <span className={styles.dim}>Unknown</span>}{e.os ? <span className={styles.sub}>{e.inApp ? `${e.os} · ${e.inApp} in-app` : `${e.os}${e.browser ? ` · ${e.browser}` : ''}`}</span> : null}</td>
                  <td><Place p={e} stacked /></td>
                </tr>
              ))}
            </tbody>
          </table>
          {list.rows.length === 0 ? <Empty title={filtered ? 'No event matches these filters' : 'No events in this period'} hint="Try a longer date range at the top. Events are kept for 90 days; visitors with an ad blocker may send none." /> : null}
        </div>
        <Pager page={filter.page} pageSize={EVENTS_PAGE} total={list.total} noun="events" href={(p) => withRange('/admin/events', range, { ...own, page: p > 1 ? p : undefined })} />
      </div>
    </>
  );
}
