import type { Metadata } from 'next';
import Link from 'next/link';
import { rupees } from '@/core';
import { AdminOff } from '@/features/admin/AdminOff';
import { BarChart, RankList } from '@/features/admin/BarChart';
import { PageHead, Panel, StatusPill } from '@/features/admin/bits';
import styles from '@/features/admin/admin.module.css';
import { requireAdmin } from '@/server/admin/guard';
import { LIVE_NOW_MS } from '@/server/admin/queries';
import { RANGE_KEYS, RANGE_LABEL, dashboardStats, gameFacts, isRangeKey, rangeFor } from '@/server/admin/stats';
import { formatDuration, formatIst, hourLabel, shortDay } from '@/server/admin/time';
import { ADMIN_MAX_RANGE_ROWS, getStore } from '@/server/store';

export const metadata: Metadata = { title: 'Dashboard' };

const num = (n: number): string => n.toLocaleString('en-IN');
const avg = (n: number): string => (n ? n.toFixed(1) : '0');
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const fullDay = (day: string): string => {
  const [y, m, d] = day.split('-');
  return `${Number(d)} ${MONTHS[Number(m) - 1]} ${y}`;
};

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className={styles.tile}>
      <div className={styles.tileLabel}>{label}</div>
      <div className={styles.tileValue}>{value}</div>
      {sub ? <div className={styles.tileSub}>{sub}</div> : null}
    </div>
  );
}

export default async function AdminDashboardPage({ searchParams }: PageProps<'/admin'>) {
  const admin = await requireAdmin();
  if (admin.off) return <AdminOff />;
  const { now } = admin;

  const sp = await searchParams;
  const key = isRangeKey(sp.range) ? sp.range : '7d';
  const range = rangeFor(key, now);
  const store = getStore();
  const [inRange, liveNow, notify] = await Promise.all([
    store.adminGamesInRange({ from: range.from, to: range.to }),
    store.adminListGames({ status: 'open', activeSince: now - LIVE_NOW_MS, sort: 'activity', dir: 'desc', limit: 50, offset: 0 }),
    store.adminCountNotifyNumbers(range.from, range.to),
  ]);
  const s = dashboardStats(inRange.rows, range.days, now);
  const period = key === 'today' ? 'today' : `in the last ${RANGE_LABEL[key]}`;
  const dayData = (pick: 'games' | 'players') => s.daily.map((d) => ({ label: shortDay(d.day), full: fullDay(d.day), value: d[pick] }));

  return (
    <>
      <PageHead title="Dashboard" sub={`Games created ${period}. Days and hours are India time (IST).`}>
        <nav className={styles.segment} aria-label="Date range">
          {RANGE_KEYS.map((k) => (
            <Link key={k} href={k === '7d' ? '/admin' : `/admin?range=${k}`} prefetch={false} className={styles.segmentLink} aria-current={k === key ? 'true' : undefined}>
              {RANGE_LABEL[k]}
            </Link>
          ))}
        </nav>
      </PageHead>

      {inRange.total > inRange.rows.length ? (
        <p className={styles.note}>
          Showing the newest {num(ADMIN_MAX_RANGE_ROWS)} of {num(inRange.total)} games in this period — pick a shorter range for exact numbers.
        </p>
      ) : null}

      <section aria-label="Totals" className={styles.tiles}>
        <Tile label="Games created" value={num(s.gamesCreated)} />
        <Tile label="Games started" value={num(s.gamesStarted)} sub={s.gamesCreated ? `${Math.round((s.gamesStarted / s.gamesCreated) * 100)}% of created` : undefined} />
        <Tile label="Games finished" value={num(s.gamesFinished)} sub={s.gamesCreated ? `${Math.round((s.gamesFinished / s.gamesCreated) * 100)}% of created` : undefined} />
        <Tile label="Total players" value={num(s.totalPlayers)} sub="tickets dealt, one per person per game" />
        <Tile label="Unique devices" value={num(s.uniqueDevices)} sub="browsers that hosted or joined" />
        <Tile label="Avg players per game" value={avg(s.avgPlayers)} />
        <Tile label="Avg numbers called" value={avg(s.avgCalled)} sub={`per finished game (${num(s.finishedRounds)} ${s.finishedRounds === 1 ? 'round' : 'rounds'})`} />
        <Tile label="Games with a ticket price" value={`${Math.round(s.pricedShare * 100)}%`} sub={`${num(s.pricedGames)} of ${num(s.gamesCreated)}`} />
        <Tile label="Recorded pot" value={rupees(s.pot)} sub="recorded only, not handled by the app" />
        <Tile label="Notify-me sign-ups" value={num(notify)} />
      </section>

      <div className={styles.grid2}>
        <Panel title="Games per day" sub="Games created each day">
          <BarChart data={dayData('games')} unit={['game', 'games']} xTitle="Day (IST)" caption={`Games created per day, ${period}`} empty="No games in this period yet." />
        </Panel>
        <Panel title="Players per day" sub="People holding a ticket, by the day their game was created">
          <BarChart data={dayData('players')} unit={['player', 'players']} xTitle="Day (IST)" caption={`Players per day, ${period}`} hue="teal" empty="No players in this period yet." />
        </Panel>
      </div>

      <Panel title="Busiest hours" sub={`Games created ${period}, by hour of the day`}>
        <BarChart
          data={s.hours.map((value, h) => ({ label: hourLabel(h), full: `${hourLabel(h)} to ${hourLabel((h + 1) % 24)} IST`, value }))}
          unit={['game', 'games']}
          xTitle="Hour of day (IST)"
          caption={`Games created per hour of the day, ${period}`}
          labelEvery={3}
          empty="No games in this period yet."
        />
      </Panel>

      <div className={styles.grid2}>
        <Panel title="Most picked ways to win" sub="How many games included each one (top 10)">
          <RankList items={s.picked} unit={['game', 'games']} empty="No games in this period yet." />
        </Panel>
        <Panel title="Most won" sub="How many times each one was won (top 10)">
          <RankList items={s.won} unit={['win', 'wins']} empty="Nothing has been won in this period yet." />
        </Panel>
      </div>

      <Panel title="Live now" sub="Games in the lobby or being played, with activity in the last 15 minutes">
        {liveNow.rows.length === 0 ? (
          <p className={styles.empty}>No game is open right now.</p>
        ) : (
          <div className={`${styles.tableWrap} ${styles.tableWrapFlat}`}>
            <table className={`${styles.table} ${styles.rowLink}`}>
              <thead>
                <tr>
                  <th scope="col">Game</th>
                  <th scope="col">Code</th>
                  <th scope="col">Status</th>
                  <th scope="col">Host</th>
                  <th scope="col" className={styles.num}>Players</th>
                  <th scope="col" className={styles.num}>Called</th>
                  <th scope="col">Last activity</th>
                </tr>
              </thead>
              <tbody>
                {liveNow.rows.map((row) => {
                  const g = gameFacts(row, now);
                  return (
                    <tr key={g.code}>
                      <th scope="row">
                        <Link href={`/admin/games/${g.code}`} prefetch={false} className={`${styles.cellLink} ${styles.stretched}`}>{g.name}</Link>
                      </th>
                      <td className={styles.mono}>{g.code}</td>
                      <td><StatusPill status={g.status} /></td>
                      <td>{g.hostName}</td>
                      <td className={styles.num}>{g.players}</td>
                      <td className={styles.num}>{g.called}</td>
                      <td title={formatIst(g.updatedAt)}>{formatDuration(now - g.updatedAt)} ago</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </>
  );
}
