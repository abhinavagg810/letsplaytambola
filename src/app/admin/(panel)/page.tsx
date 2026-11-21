import type { Metadata } from 'next';
import Link from 'next/link';
import { rupees } from '@/core';
import { AdminOff } from '@/features/admin/AdminOff';
import { Kpi, PageHead, Panel, StatusPill, When, dec, num, pct, Empty } from '@/features/admin/bits';
import { Columns, Heatmap, heatTable } from '@/features/admin/charts';
import { ChartBox, Copy } from '@/features/admin/client';
import styles from '@/features/admin/ui.module.css';
import { cached } from '@/server/admin/cache';
import { gameOverview } from '@/server/admin/gameStats';
import { requireAdmin } from '@/server/admin/guard';
import { dailySeries, fullDay, heatGrid } from '@/server/admin/labels';
import { LIVE_NOW_MS } from '@/server/admin/queries';
import { delta, parseRange, withRange } from '@/server/admin/range';
import { gameFacts } from '@/server/admin/stats';
import { formatDuration, shortDay } from '@/server/admin/time';
import { ADMIN_MAX_RANGE_ROWS, getStore } from '@/server/store';

export const metadata: Metadata = { title: 'Overview' };

/** A visitor counts as "on the site now" when an event arrived from them this recently. */
const ACTIVE_VISITOR_MS = 5 * 60_000;

export default async function AdminOverviewPage({ searchParams }: PageProps<'/admin'>) {
  const admin = await requireAdmin();
  if (admin.off) return <AdminOff />;
  const { now } = admin;
  const range = parseRange(await searchParams, now);
  const store = getStore();
  const { from, to, prev, cmp } = range;

  const [games, prevGames, totals, prevTotals, byDay, byHour, liveNow, active, notify, prevNotify] = await Promise.all([
    cached(`games:${from}:${to}`, () => store.adminGamesInRange({ from, to })),
    cmp ? cached(`games:${prev.from}:${prev.to}`, () => store.adminGamesInRange({ from: prev.from, to: prev.to })) : null,
    cached(`totals:${from}:${to}`, () => store.trafficTotals(from, to)),
    cmp ? cached(`totals:${prev.from}:${prev.to}`, () => store.trafficTotals(prev.from, prev.to)) : null,
    cached(`ev:day:${from}:${to}`, () => store.eventBreakdown({ from, to, dim: 'day' })),
    cached(`ev:hourdow:${from}:${to}`, () => store.eventBreakdown({ from, to, dim: 'hourdow' })),
    store.adminListGames({ status: 'open', activeSince: now - LIVE_NOW_MS, sort: 'activity', dir: 'desc', limit: 50, offset: 0 }),
    store.trafficTotals(now - ACTIVE_VISITOR_MS, now + 1000),
    store.adminCountNotifyNumbers(from, to),
    cmp ? store.adminCountNotifyNumbers(prev.from, prev.to) : null,
  ]);
  const g = gameOverview(games.rows, range.days, now);
  const p = prevGames ? gameOverview(prevGames.rows, prev.days, now) : null;
  const d = (cur: number, before: number | null | undefined) => (cmp && before !== null && before !== undefined ? delta(cur, before) : null);

  const visitors = dailySeries(byDay, range.days, 'devices');
  const sessions = dailySeries(byDay, range.days, 'sessions');
  const gameDays = (pick: 'created' | 'started' | 'finished' | 'players') => g.daily.map((x) => ({ label: shortDay(x.day), full: fullDay(x.day), value: x[pick] }));
  const avgSession = totals.timedSessions ? totals.sessionMs / totals.timedSessions : null;
  const prevAvgSession = prevTotals?.timedSessions ? prevTotals.sessionMs / prevTotals.timedSessions : null;
  const sessionHeat = heatGrid(byHour, 'sessions');
  const few = range.days.length <= 2;

  return (
    <>
      <PageHead title="Overview" sub="Who came, what they did, and the games that were played. Days and hours are India time (IST)." range={range.label} />

      {games.total > games.rows.length ? (
        <p className={styles.note}>Game numbers use the newest {num(ADMIN_MAX_RANGE_ROWS)} of {num(games.total)} games in this period — pick a shorter range for exact numbers.</p>
      ) : null}

      <h2 className={styles.sectionLabel}>Live now</h2>
      <div className={styles.grid3}>
        <div className={styles.kpis} style={{ gridTemplateColumns: '1fr' }}>
          <Kpi label="Visitors on the site" value={num(active.visitors)} sub="sent an event in the last 5 minutes" />
          <Kpi label="Games open" value={num(liveNow.total)} sub="lobby or live, active in the last 15 minutes" />
        </div>
        <Panel title="Open games" sub="Newest activity first" className={styles.span2}>
          {liveNow.rows.length === 0 ? (
            <Empty title="No game is open right now" hint="A game shows here while it is in the lobby or being played and something happened in the last 15 minutes." />
          ) : (
            <div className={styles.tableScroll} style={{ maxHeight: 250 }}>
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
                    const f = gameFacts(row, now);
                    return (
                      <tr key={f.code}>
                        <th scope="row"><Link href={withRange(`/admin/games/${f.code}`, range)} prefetch={false} className={`${styles.cellLink} ${styles.stretched}`}>{f.name}</Link></th>
                        <td><Copy text={f.code} /></td>
                        <td><StatusPill status={f.status} /></td>
                        <td>{f.hostName}</td>
                        <td className={styles.num}>{f.players}</td>
                        <td className={styles.num}>{f.called}</td>
                        <td><When ms={f.updatedAt} now={now} short /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>

      <h2 className={styles.sectionLabel}>Visitors · {range.label}</h2>
      <section aria-label="Visitor totals" className={styles.kpis}>
        <Kpi label="Visitors" value={num(totals.visitors)} delta={d(totals.visitors, prevTotals?.visitors)} spark={few ? undefined : visitors.map((x) => x.value)} sub="different devices" />
        <Kpi label="Sessions" value={num(totals.sessions)} delta={d(totals.sessions, prevTotals?.sessions)} spark={few ? undefined : sessions.map((x) => x.value)} sub={totals.visitors ? `${dec(totals.sessions / totals.visitors)} per visitor` : undefined} />
        <Kpi label="New devices" value={num(totals.newDevices)} delta={d(totals.newDevices, prevTotals?.newDevices)} sub="first seen in this period" />
        <Kpi label="Returning devices" value={num(totals.returningDevices)} delta={d(totals.returningDevices, prevTotals?.returningDevices)} sub={`${pct(totals.returningDevices, totals.newDevices + totals.returningDevices)} of known devices`} />
        <Kpi label="Page views" value={num(totals.pageViews)} delta={d(totals.pageViews, prevTotals?.pageViews)} sub={totals.sessions ? `${dec(totals.pageViews / totals.sessions)} per session` : undefined} />
        <Kpi label="Avg time on site" value={avgSession === null ? '—' : formatDuration(avgSession)} delta={avgSession !== null && prevAvgSession !== null ? d(avgSession, prevAvgSession) : null} sub={`${num(totals.timedSessions)} sessions measured`} />
      </section>

      <h2 className={styles.sectionLabel}>Games · created {range.label.toLowerCase()}</h2>
      <section aria-label="Game totals" className={styles.kpis}>
        <Kpi label="Games created" value={num(g.created)} delta={d(g.created, p?.created)} spark={few ? undefined : g.daily.map((x) => x.created)} />
        <Kpi label="Games started" value={num(g.started)} delta={d(g.started, p?.started)} sub={`${pct(g.started, g.created)} of created`} />
        <Kpi label="Games finished" value={num(g.finished)} delta={d(g.finished, p?.finished)} sub={`${pct(g.finished, g.created)} of created`} />
        <Kpi label="Completion rate" value={pct(g.finished, g.started)} delta={p && p.started && g.started ? d(g.completionRate, p.completionRate) : null} sub="finished ÷ started" />
        <Kpi label="Players" value={num(g.players)} delta={d(g.players, p?.players)} spark={few ? undefined : g.daily.map((x) => x.players)} sub="tickets dealt" />
        <Kpi label="Devices that played" value={num(g.uniqueDevices)} delta={d(g.uniqueDevices, p?.uniqueDevices)} sub="hosted or joined" />
        <Kpi label="Avg players per game" value={dec(g.avgPlayers)} delta={p && p.created && g.created ? d(g.avgPlayers, p.avgPlayers) : null} />
        <Kpi label="Avg game length" value={g.avgDurationMs === null ? '—' : formatDuration(g.avgDurationMs)} delta={g.avgDurationMs !== null && p?.avgDurationMs ? d(g.avgDurationMs, p.avgDurationMs) : null} sub={`${num(g.finishedRounds)} finished ${g.finishedRounds === 1 ? 'round' : 'rounds'}`} />
        <Kpi label="Prize money" value={rupees(g.prizeMoney)} delta={d(g.prizeMoney, p?.prizeMoney)} sub="recorded only" title="Prize amounts shown in started rounds. The app never handles money." />
        <Kpi label="Ticket money" value={rupees(g.ticketMoney)} delta={d(g.ticketMoney, p?.ticketMoney)} sub={`recorded only · ${num(g.pricedGames)} priced ${g.pricedGames === 1 ? 'game' : 'games'}`} title="Ticket price × players, for started rounds. Collected outside the app." />
        <Kpi label="Notify-me sign-ups" value={num(notify)} delta={d(notify, prevNotify)} />
      </section>

      <div className={styles.grid2}>
        <ChartBox title="Visitors per day" sub="Different devices with at least one event" file="visitors-per-day" table={{ head: ['Day (IST)', 'Visitors', 'Sessions'], rows: visitors.map((x, i) => [x.full, x.value, sessions[i].value]) }}>
          <Columns data={visitors} unit={['visitor', 'visitors']} xTitle="Day (IST)" empty="No visits recorded in this period yet." />
        </ChartBox>
        <ChartBox title="Games per day" sub="Games created each day" file="games-per-day" table={{ head: ['Day (IST)', 'Created', 'Started', 'Finished'], rows: g.daily.map((x) => [fullDay(x.day), x.created, x.started, x.finished]) }}>
          <Columns data={gameDays('created')} unit={['game', 'games']} xTitle="Day (IST)" hue="teal" empty="No games in this period yet." />
        </ChartBox>
        <ChartBox title="Players per day" sub="People holding a ticket, by the day their game was created" file="players-per-day" table={{ head: ['Day (IST)', 'Players'], rows: g.daily.map((x) => [fullDay(x.day), x.players]) }}>
          <Columns data={gameDays('players')} unit={['player', 'players']} xTitle="Day (IST)" hue="pink" empty="No players in this period yet." />
        </ChartBox>
        <ChartBox title="Sessions per day" sub="Browser tab sessions started" file="sessions-per-day" table={{ head: ['Day (IST)', 'Sessions'], rows: sessions.map((x) => [x.full, x.value]) }}>
          <Columns data={sessions} unit={['session', 'sessions']} xTitle="Day (IST)" empty="No sessions recorded in this period yet." />
        </ChartBox>
        <ChartBox title="When people visit" sub="Sessions by weekday and hour of the day (IST)" file="sessions-by-hour" table={heatTable(sessionHeat)}>
          <Heatmap cells={sessionHeat} unit={['session', 'sessions']} empty="No sessions recorded in this period yet." />
        </ChartBox>
        <ChartBox title="When games are created" sub="Games by weekday and hour of the day (IST)" file="games-by-hour" table={heatTable(g.heat)}>
          <Heatmap cells={g.heat} unit={['game', 'games']} hue="teal" empty="No games in this period yet." />
        </ChartBox>
      </div>
    </>
  );
}
