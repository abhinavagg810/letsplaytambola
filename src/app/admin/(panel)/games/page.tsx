import type { Metadata } from 'next';
import Link from 'next/link';
import { AdminOff } from '@/features/admin/AdminOff';
import { DeviceText, PageHead, Pager, Place, SortTh, StatusPill, When, num, Empty } from '@/features/admin/bits';
import { ColumnPicker, Copy } from '@/features/admin/client';
import styles from '@/features/admin/ui.module.css';
import { requireAdmin } from '@/server/admin/guard';
import { sourceLabel } from '@/server/admin/labels';
import { GAME_QUICK, GAME_QUICK_LABEL, GAME_STATUSES, PAGE_SIZE, gamesQuery, gamesQueryString, parseGamesFilter, priceText } from '@/server/admin/queries';
import type { GamesFilter } from '@/server/admin/queries';
import { parseRange, rangeParams, withRange } from '@/server/admin/range';
import { STATUS_LABEL, gameFacts } from '@/server/admin/stats';
import { getStore } from '@/server/store';

export const metadata: Metadata = { title: 'Plays' };

const COLUMNS = [
  { key: 'host', label: 'Host' }, { key: 'status', label: 'Status' }, { key: 'players', label: 'Players' }, { key: 'called', label: 'Numbers called', off: true },
  { key: 'round', label: 'Round', off: true }, { key: 'price', label: 'Ticket price' }, { key: 'prizes', label: 'Prizes won' },
  { key: 'place', label: 'Host location' }, { key: 'device', label: 'Host device' }, { key: 'source', label: 'Source' }, { key: 'activity', label: 'Last activity' },
];
const one = (v: string | string[] | undefined): string => (Array.isArray(v) ? v[0] ?? '' : v ?? '');

export default async function AdminGamesPage({ searchParams }: PageProps<'/admin/games'>) {
  const admin = await requireAdmin();
  if (admin.off) return <AdminOff />;
  const { now } = admin;
  const sp = await searchParams;
  const range = parseRange(sp, now);
  // The global date range is this table's date filter (by the day a game was created).
  const filter = parseGamesFilter(new URLSearchParams({ q: one(sp.q), status: one(sp.status), quick: one(sp.quick), sort: one(sp.sort), dir: one(sp.dir), page: one(sp.page), from: range.fromDay, to: range.toDay }), now);
  const store = getStore();
  const page = await store.adminListGames(gamesQuery(filter, now));
  const hosts = await store.gameHosts(page.rows.map((r) => r.code));

  // Links on this page keep the range and this table's own filters.
  const href = (over: Partial<GamesFilter>): string => {
    const p = rangeParams(range);
    const own = new URLSearchParams(gamesQueryString({ ...filter, from: '', to: '' }, over).slice(1));
    for (const [k, v] of own) p.set(k, v);
    const s = p.toString();
    return s ? `/admin/games?${s}` : '/admin/games';
  };
  const sortHref = (sort: GamesFilter['sort']): string => href({ sort, dir: filter.sort === sort && filter.dir === 'desc' ? 'asc' : 'desc', page: 1 });
  const filtered = !!(filter.q || filter.status || filter.quick);
  const csvHref = `/api/admin/games.csv${gamesQueryString(filter, { page: 1 })}`;
  const finishedToday = range.key === 'today' && filter.status === 'done' && !filter.quick;

  return (
    <>
      <PageHead title="Plays" sub={filter.quick === 'live' ? 'Games open right now (lobby or live, active in the last 15 minutes) — whatever the date range.' : 'Every game created in the selected period. Times are India time (IST).'} range={filter.quick === 'live' ? 'Right now' : range.label} />

      <nav className={styles.quick} aria-label="Quick filters">
        <Link href={withRange('/admin/games', range)} prefetch={false} className={styles.quickLink} aria-current={!filtered && !finishedToday ? 'true' : undefined}>All plays</Link>
        {GAME_QUICK.map((qk) => (
          <Link key={qk} href={withRange('/admin/games', range, { quick: qk })} prefetch={false} className={styles.quickLink} aria-current={filter.quick === qk ? 'true' : undefined}>{GAME_QUICK_LABEL[qk]}</Link>
        ))}
        <Link href={withRange('/admin/games', { ...range, key: 'today' }, { status: 'done' })} prefetch={false} className={styles.quickLink} aria-current={finishedToday ? 'true' : undefined}>Finished today</Link>
      </nav>

      <form className={`${styles.panel} ${styles.filters}`} method="get" action="/admin/games" role="search" aria-label="Filter plays">
        {[...rangeParams(range)].map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
        {filter.quick ? <input type="hidden" name="quick" value={filter.quick} /> : null}
        <label className={`${styles.field} ${styles.fieldGrow}`}>
          <span className={styles.fieldLabel}>Search</span>
          <input className={styles.control} type="search" name="q" defaultValue={filter.q} placeholder="Code, game name or host" maxLength={60} autoComplete="off" />
        </label>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>Status</span>
          <select className={styles.control} name="status" defaultValue={filter.status} disabled={filter.quick === 'live'}>
            <option value="">All</option>
            {GAME_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
          </select>
        </label>
        {filter.sort !== 'created' ? <input type="hidden" name="sort" value={filter.sort} /> : null}
        {filter.dir !== 'desc' ? <input type="hidden" name="dir" value={filter.dir} /> : null}
        <div className={styles.filterActions}>
          <button type="submit" className={styles.btnPrimary}>Apply</button>
          {filtered ? <Link href={withRange('/admin/games', range)} prefetch={false} className={styles.btn}>Clear</Link> : null}
        </div>
      </form>

      <div className={styles.tableCard}>
        <div className={styles.tableBar}>
          <span className={styles.tableBarTitle}>{num(page.total)} {page.total === 1 ? 'play' : 'plays'}<small>click a row to open it</small></span>
          <div className={styles.tableTools} data-noprint>
            <ColumnPicker tableId="plays-table" storageKey="lpt:admin:plays-cols" columns={COLUMNS} />
            {/* A plain link: the browser downloads the file. */}
            <a href={csvHref} className={styles.miniBtn} download>Export CSV</a>
          </div>
        </div>
        <div className={styles.tableScroll}>
          <table id="plays-table" className={`${styles.table} ${styles.rowLink}`}>
            <caption className="visually-hidden">Plays, {page.total} matching</caption>
            <thead>
              <tr>
                <SortTh label="Created (IST)" active={filter.sort === 'created'} dir={filter.dir} href={sortHref('created')} />
                <th scope="col">Game</th>
                <th scope="col" data-col="host">Host</th>
                <th scope="col" data-col="status">Status</th>
                <SortTh label="Players" active={filter.sort === 'players'} dir={filter.dir} href={sortHref('players')} className={styles.num} col="players" />
                <th scope="col" className={styles.num} data-col="called">Called</th>
                <th scope="col" className={styles.num} data-col="round">Round</th>
                <th scope="col" className={styles.num} data-col="price">Ticket price</th>
                <th scope="col" className={styles.num} data-col="prizes">Prizes won</th>
                <th scope="col" data-col="place">Host location</th>
                <th scope="col" data-col="device">Host device</th>
                <th scope="col" data-col="source">Source</th>
                <SortTh label="Last activity" active={filter.sort === 'activity'} dir={filter.dir} href={sortHref('activity')} col="activity" />
              </tr>
            </thead>
            <tbody>
              {page.rows.map((row) => {
                const g = gameFacts(row, now);
                const h = hosts[row.code];
                return (
                  <tr key={g.code}>
                    <td><When ms={g.createdAt} now={now} short /></td>
                    <th scope="row"><Link href={withRange(`/admin/games/${g.code}`, range)} prefetch={false} className={`${styles.cellLink} ${styles.stretched}`}>{g.name}</Link><span className={styles.sub}><Copy text={g.code} /></span></th>
                    <td data-col="host">{g.hostName}</td>
                    <td data-col="status"><StatusPill status={g.status} /></td>
                    <td className={styles.num} data-col="players">{g.players}</td>
                    <td className={styles.num} data-col="called">{g.called}</td>
                    <td className={styles.num} data-col="round">{g.round}</td>
                    <td className={styles.num} data-col="price">{priceText(g.price)}</td>
                    <td className={styles.num} data-col="prizes">{g.prizesWon} / {g.prizesTotal}</td>
                    <td data-col="place"><Place p={h} stacked /></td>
                    <td data-col="device"><DeviceText d={h} /></td>
                    <td data-col="source">{h?.source ? sourceLabel(h.source) : <span className={styles.dim}>Unknown</span>}</td>
                    <td data-col="activity"><When ms={g.updatedAt} now={now} short /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {page.rows.length === 0 ? (
            <Empty
              title={filtered ? 'No plays match these filters' : 'No games were created in this period'}
              hint={filter.quick === 'live' ? 'Nobody has a game open right now.' : filtered ? 'Try a longer date range, or clear the filters.' : 'Pick a longer date range at the top — games are kept for 90 days.'}
            />
          ) : null}
        </div>
        <Pager page={filter.page} pageSize={PAGE_SIZE} total={page.total} noun="plays" href={(p) => href({ page: p })} />
      </div>
    </>
  );
}
