import type { Metadata } from 'next';
import Link from 'next/link';
import { AdminOff } from '@/features/admin/AdminOff';
import { PageHead, Pager, SortTh, StatusPill } from '@/features/admin/bits';
import styles from '@/features/admin/admin.module.css';
import { requireAdmin } from '@/server/admin/guard';
import { GAME_STATUSES, PAGE_SIZE, gamesQuery, gamesQueryString, parseGamesFilter, priceText } from '@/server/admin/queries';
import type { GamesFilter } from '@/server/admin/queries';
import { STATUS_LABEL, gameFacts } from '@/server/admin/stats';
import { formatIst, istDay } from '@/server/admin/time';
import { ADMIN_RETENTION_DAYS, ADMIN_RETENTION_MS, getStore } from '@/server/store';

export const metadata: Metadata = { title: 'Plays' };

export default async function AdminGamesPage({ searchParams }: PageProps<'/admin/games'>) {
  const admin = await requireAdmin();
  if (admin.off) return <AdminOff />;
  const { now } = admin;
  const filter = parseGamesFilter(await searchParams, now);
  const page = await getStore().adminListGames(gamesQuery(filter, now));
  const filtered = !!(filter.q || filter.status || filter.from || filter.to);
  const sortHref = (sort: GamesFilter['sort']): string =>
    `/admin/games${gamesQueryString(filter, { sort, dir: filter.sort === sort && filter.dir === 'desc' ? 'asc' : 'desc', page: 1 })}`;

  return (
    <>
      <PageHead title="Plays" sub={`Every game created in the last ${ADMIN_RETENTION_DAYS} days. Times are India time (IST).`} />

      <form className={`${styles.panel} ${styles.filters}`} method="get" action="/admin/games" role="search" aria-label="Filter plays">
        <label className={`${styles.field} ${styles.fieldGrow}`}>
          <span className={styles.fieldLabel}>Search</span>
          <input className={styles.control} type="search" name="q" defaultValue={filter.q} placeholder="Code, game name or host" maxLength={60} autoComplete="off" />
        </label>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>Status</span>
          <select className={styles.control} name="status" defaultValue={filter.status}>
            <option value="">All</option>
            {GAME_STATUSES.map((s) => (
              <option key={s} value={s}>{STATUS_LABEL[s]}</option>
            ))}
          </select>
        </label>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>Created from</span>
          <input className={styles.control} type="date" name="from" defaultValue={filter.from} min={istDay(now - ADMIN_RETENTION_MS)} max={istDay(now)} />
        </label>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>Created to</span>
          <input className={styles.control} type="date" name="to" defaultValue={filter.to} min={istDay(now - ADMIN_RETENTION_MS)} max={istDay(now)} />
        </label>
        {filter.sort !== 'created' ? <input type="hidden" name="sort" value={filter.sort} /> : null}
        {filter.dir !== 'desc' ? <input type="hidden" name="dir" value={filter.dir} /> : null}
        <div className={styles.filterActions}>
          <button type="submit" className={styles.btnPrimary}>Apply</button>
          {filtered ? <Link href="/admin/games" prefetch={false} className={styles.btn}>Clear</Link> : null}
          {/* A plain link: the browser downloads the file. */}
          <a href={`/api/admin/games.csv${gamesQueryString(filter, { page: 1 })}`} className={styles.btn} download>
            Export CSV
          </a>
        </div>
      </form>

      <div className={styles.tableWrap}>
        <table className={`${styles.table} ${styles.rowLink}`}>
          <caption className="visually-hidden">Plays, {page.total} matching</caption>
          <thead>
            <tr>
              <SortTh label="Created (IST)" active={filter.sort === 'created'} dir={filter.dir} href={sortHref('created')} />
              <th scope="col">Code</th>
              <th scope="col">Game name</th>
              <th scope="col">Host</th>
              <th scope="col">Status</th>
              <SortTh label="Players" active={filter.sort === 'players'} dir={filter.dir} href={sortHref('players')} className={styles.num} />
              <th scope="col" className={styles.num}>Called</th>
              <th scope="col" className={styles.num}>Round</th>
              <th scope="col" className={styles.num}>Ticket price</th>
              <th scope="col" className={styles.num}>Prizes won</th>
              <SortTh label="Last activity" active={filter.sort === 'activity'} dir={filter.dir} href={sortHref('activity')} />
            </tr>
          </thead>
          <tbody>
            {page.rows.map((row) => {
              const g = gameFacts(row, now);
              return (
                <tr key={g.code}>
                  <td>{formatIst(g.createdAt)}</td>
                  <td className={styles.mono}>{g.code}</td>
                  <th scope="row">
                    <Link href={`/admin/games/${g.code}`} prefetch={false} className={`${styles.cellLink} ${styles.stretched}`}>{g.name}</Link>
                  </th>
                  <td>{g.hostName}</td>
                  <td><StatusPill status={g.status} /></td>
                  <td className={styles.num}>{g.players}</td>
                  <td className={styles.num}>{g.called}</td>
                  <td className={styles.num}>{g.round}</td>
                  <td className={styles.num}>{priceText(g.price)}</td>
                  <td className={styles.num}>{g.prizesWon} / {g.prizesTotal}</td>
                  <td>{formatIst(g.updatedAt)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {page.rows.length === 0 ? <p className={styles.empty}>{filtered ? 'No plays match these filters.' : 'No games have been created yet.'}</p> : null}
      </div>

      <Pager page={filter.page} pageSize={PAGE_SIZE} total={page.total} noun="plays" href={(p) => `/admin/games${gamesQueryString(filter, { page: p })}`} />
    </>
  );
}
