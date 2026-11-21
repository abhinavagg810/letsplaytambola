import type { Metadata } from 'next';
import { ruleName, rupees } from '@/core';
import type { RuleId } from '@/core';
import { AdminOff } from '@/features/admin/AdminOff';
import { Kpi, PageHead, Panel, dec, num, pct, Empty } from '@/features/admin/bits';
import { Columns, Ranked } from '@/features/admin/charts';
import { ChartBox, CsvButton } from '@/features/admin/client';
import styles from '@/features/admin/ui.module.css';
import { cached } from '@/server/admin/cache';
import { gameDistributions, gameOverview, summariseCounts } from '@/server/admin/gameStats';
import type { Bucket, Summary } from '@/server/admin/gameStats';
import { requireAdmin } from '@/server/admin/guard';
import { byKey, toastLabel } from '@/server/admin/labels';
import { parseRange } from '@/server/admin/range';
import { formatDuration } from '@/server/admin/time';
import { getStore } from '@/server/store';

export const metadata: Metadata = { title: 'Engagement' };

const prizeName = (id: string): string => {
  try {
    return ruleName(id as RuleId) || id;
  } catch {
    return id;
  }
};
const bars = (b: readonly Bucket[]) => b.map((x) => ({ label: x.label, value: x.count }));
const dur = (ms: number | null): string => (ms === null ? '—' : formatDuration(ms));
const spread = (s: Summary, f: (n: number | null) => string): string => (s.n ? `middle half ${f(s.p25)}–${f(s.p75)}` : 'no data yet');

const AD_SPOT: Record<string, string> = { lobby_player: 'Waiting room — players', lobby_host: 'Waiting room — host', results: 'Results' };

export default async function AdminEngagementPage({ searchParams }: PageProps<'/admin/engagement'>) {
  const admin = await requireAdmin();
  if (admin.off) return <AdminOff />;
  const { now } = admin;
  const range = parseRange(await searchParams, now);
  const store = getStore();
  const { from, to } = range;
  const ev = (key: string, q: Parameters<typeof store.eventBreakdown>[0]) => cached(`eng:${key}:${from}:${to}`, () => store.eventBreakdown(q));

  const [games, names, autoGames, valid, invalid, calledAt, toasts, ads] = await Promise.all([
    cached(`games:${from}:${to}`, () => store.adminGamesInRange({ from, to })),
    ev('names', { from, to, dim: 'name' }),
    ev('auto', { from, to, dim: 'code', names: ['auto_on'], limit: 3000 }),
    ev('valid', { from, to, dim: 'prop:prize', names: ['claim_valid'] }),
    ev('invalid', { from, to, dim: 'prop:prize', names: ['claim_invalid'] }),
    ev('calledAt', { from, to, dim: 'prop:prize+called', names: ['claim_valid'], limit: 3000 }),
    ev('toasts', { from, to, dim: 'prop:cls', names: ['toast'] }),
    ev('ads', { from, to, dim: 'prop:slot', names: ['ad_seen'] }),
  ]);
  const o = gameOverview(games.rows, range.days, now);
  const dist = gameDistributions(games.rows, now);
  const n = byKey(names);
  const events = (name: string): number => n.get(name)?.events ?? 0;
  const devices = (name: string): number => n.get(name)?.devices ?? 0;

  const validBy = byKey(valid);
  const invalidBy = byKey(invalid);
  const prizes = [...new Set([...valid.map((r) => r.key), ...invalid.map((r) => r.key)])].filter(Boolean)
    .map((id) => ({ id, valid: validBy.get(id)?.events ?? 0, invalid: invalidBy.get(id)?.events ?? 0 }))
    .sort((a, b) => b.valid + b.invalid - (a.valid + a.invalid) || (a.id < b.id ? -1 : 1));
  const claimsValid = events('claim_valid');
  const claimsInvalid = events('claim_invalid');

  // Numbers called when each way to win was claimed: (prize, called) pairs → a summary per prize.
  const pairs = new Map<string, [number, number][]>();
  for (const r of calledAt) {
    const [prize, called] = r.key.split(':');
    if (!prize || called === '' || called === undefined) continue;
    pairs.set(prize, [...(pairs.get(prize) ?? []), [Number(called), r.events]]);
  }
  const calledRows = [...pairs].map(([id, list]) => ({ id, s: summariseCounts(list) })).sort((a, b) => (a.s.median ?? 0) - (b.s.median ?? 0) || (a.id < b.id ? -1 : 1));

  const started = o.started;
  const withAuto = autoGames.filter((r) => r.key).length;
  const fmt0 = (v: number | null): string => (v === null ? '—' : dec(v, 0));

  return (
    <>
      <PageHead title="Engagement" sub="What happens inside games: how many people, how long, what gets won and when, and which controls are used. Game numbers come from the games created in this period; taps and claims from events in this period." range={range.label} />

      <section aria-label="Engagement totals" className={styles.kpis}>
        <Kpi label="Players per game" value={dec(dist.players.median)} sub={`median · ${spread(dist.players, (v) => dec(v, 0))}`} />
        <Kpi label="Game length" value={dur(dist.durationMs.median)} sub={`median · ${spread(dist.durationMs, dur)}`} />
        <Kpi label="Numbers called" value={fmt0(dist.called.median)} sub={`median per round · ${spread(dist.called, fmt0)}`} />
        <Kpi label="Replay rate" value={pct(dist.replayedGames, dist.finishedGames)} sub={`${num(dist.replayedGames)} of ${num(dist.finishedGames)} finished games played again`} />
        <Kpi label="Auto-call used" value={pct(withAuto, started)} sub={`${num(withAuto)} of ${num(started)} started games`} />
        <Kpi label="Sound switched off" value={num(devices('mute_on'))} sub={`devices · switched back on ${num(devices('mute_off'))}`} />
        <Kpi label="Claims that were valid" value={pct(claimsValid, claimsValid + claimsInvalid)} sub={`${num(claimsValid)} valid · ${num(claimsInvalid)} not valid`} />
        <Kpi label="Prize money per game" value={dist.prizeMoneySummary.median === null ? '—' : rupees(Math.round(dist.prizeMoneySummary.median))} sub="median, recorded only" />
      </section>

      <Panel title="From create to start" sub="How long hosts wait. Medians, with the middle half of games in brackets.">
        <div className={styles.steps}>
          <div className={styles.stepStat}><b>{dur(dist.toFirstJoinMs.median)}</b><span>create → first person joins ({spread(dist.toFirstJoinMs, dur)})</span></div>
          <div className={styles.stepStat}><b>{dur(dist.lobbyMs.median)}</b><span>first join → host starts ({spread(dist.lobbyMs, dur)})</span></div>
          <div className={styles.stepStat}><b>{dur(dist.toStartMs.median)}</b><span>create → start ({spread(dist.toStartMs, dur)})</span></div>
          <div className={styles.stepStat}><b>{pct(dist.noJoin, dist.games)}</b><span>of games: nobody but the host ever joined ({num(dist.noJoin)})</span></div>
          <div className={styles.stepStat}><b>{pct(dist.neverStarted, dist.games)}</b><span>of games never started ({num(dist.neverStarted)})</span></div>
        </div>
      </Panel>

      <div className={styles.grid2}>
        <ChartBox title="Players per game" sub="Games by how many people held a ticket" file="players-per-game" table={{ head: ['Players', 'Games'], rows: dist.playersPerGame.map((b) => [b.label, b.count]) }}>
          <Columns data={bars(dist.playersPerGame)} unit={['game', 'games']} xTitle="Players holding a ticket" labelEvery={1} empty="No games in this period yet." />
        </ChartBox>
        <ChartBox title="Game length" sub="Finished rounds, from start to the last prize" file="game-length" table={{ head: ['Length', 'Rounds'], rows: dist.duration.map((b) => [b.label, b.count]) }}>
          <Columns data={bars(dist.duration)} unit={['round', 'rounds']} xTitle="Minutes from start to finish" hue="teal" labelEvery={1} empty="No round finished in this period yet." />
        </ChartBox>
        <ChartBox title="Rounds per game" sub="How often “Play again” was used" file="rounds-per-game" table={{ head: ['Rounds', 'Games'], rows: dist.rounds.map((b) => [b.label, b.count]) }}>
          <Columns data={bars(dist.rounds)} unit={['game', 'games']} xTitle="Rounds played with the same code" hue="pink" labelEvery={1} empty="No games in this period yet." />
        </ChartBox>
        <ChartBox title="Prize money per game" sub="Started games by the prize money shown — recorded only, never handled by the app" file="prize-money-per-game" table={{ head: ['Prize money', 'Games'], rows: dist.prizeMoney.map((b) => [b.label, b.count]) }}>
          <Columns data={bars(dist.prizeMoney)} unit={['game', 'games']} xTitle="Recorded prize money (₹)" labelEvery={1} empty="No game was started in this period yet." />
        </ChartBox>
        <ChartBox title="Most picked ways to win" sub="Games that included each one" file="ways-picked" table={{ head: ['Way to win', 'Games'], rows: o.picked.map((p) => [p.label, p.count]) }}>
          <Ranked items={o.picked.map((p) => ({ label: p.label, value: p.count }))} total={o.created} unit={['game', 'games']} max={12} empty="No games in this period yet." />
        </ChartBox>
        <ChartBox title="Most won" sub="Times each one was won, over every round" file="ways-won" table={{ head: ['Way to win', 'Wins'], rows: o.won.map((p) => [p.label, p.count]) }}>
          <Ranked items={o.won.map((p) => ({ label: p.label, value: p.count }))} total={0} unit={['win', 'wins']} hue="teal" max={12} empty="Nothing has been won in this period yet." />
        </ChartBox>
      </div>

      <Panel
        title="Claims per way to win"
        sub="Every claim is checked by the server. “Not valid” is mostly “not yet” — someone claimed too early."
        action={<CsvButton file="claims" table={{ head: ['Way to win', 'Claims', 'Valid', 'Not valid', 'Not-valid rate'], rows: prizes.map((p) => [prizeName(p.id), p.valid + p.invalid, p.valid, p.invalid, pct(p.invalid, p.valid + p.invalid)]) }} />}
      >
        {prizes.length === 0 ? <Empty title="No claims in this period" hint={`The claim sheet was opened ${num(events('claim_open'))} times.`} /> : (
          <div className={styles.tableScroll} style={{ maxHeight: 420 }}>
            <table className={styles.table}>
              <thead><tr><th scope="col">Way to win</th><th scope="col" className={styles.num}>Claims</th><th scope="col" className={styles.num}>Valid</th><th scope="col" className={styles.num}>Not valid</th><th scope="col" className={styles.num}>Not-valid rate</th></tr></thead>
              <tbody>
                {prizes.map((p) => (
                  <tr key={p.id}>
                    <th scope="row">{prizeName(p.id)}</th>
                    <td className={styles.num}>{num(p.valid + p.invalid)}</td>
                    <td className={styles.num}>{num(p.valid)}</td>
                    <td className={styles.num}>{num(p.invalid)}</td>
                    <td className={styles.num}>{pct(p.invalid, p.valid + p.invalid)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className={styles.hint}>Claim sheet opened {num(events('claim_open'))} {events('claim_open') === 1 ? 'time' : 'times'} by {num(devices('claim_open'))} {devices('claim_open') === 1 ? 'device' : 'devices'} in this period.</p>
      </Panel>

      <div className={styles.grid2}>
        <Panel
          title="Numbers called before each win"
          sub="How many numbers were out when each way to win was claimed (median, and the middle half)."
          action={<CsvButton file="numbers-before-win" table={{ head: ['Way to win', 'Wins', '25th percentile', 'Median', '75th percentile'], rows: calledRows.map((r) => [prizeName(r.id), r.s.n, fmt0(r.s.p25), fmt0(r.s.median), fmt0(r.s.p75)]) }} />}
        >
          {calledRows.length === 0 ? <Empty title="No wins recorded in this period" hint="Filled in from valid claims: the number of numbers called at that moment." /> : (
            <div className={styles.tableScroll} style={{ maxHeight: 420 }}>
              <table className={styles.table}>
                <thead><tr><th scope="col">Way to win</th><th scope="col" className={styles.num}>Wins</th><th scope="col" className={styles.num}>Median</th><th scope="col" className={styles.num}>Middle half</th></tr></thead>
                <tbody>
                  {calledRows.map((r) => (
                    <tr key={r.id}>
                      <th scope="row">{prizeName(r.id)}</th>
                      <td className={styles.num}>{num(r.s.n)}</td>
                      <td className={styles.num}>{fmt0(r.s.median)} of 90</td>
                      <td className={styles.num}>{fmt0(r.s.p25)} – {fmt0(r.s.p75)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
        <ChartBox title="Messages shown to people" sub="Short messages at the bottom of the screen, by kind. The text itself is never recorded." file="messages-shown" table={{ head: ['Kind of message', 'Times', 'Devices'], rows: toasts.map((r) => [toastLabel(r.key), r.events, r.devices]) }}
          footer={<p className={styles.hint}>Went offline: {num(events('offline'))} · “game not found” shown: {num(events('game_not_found'))}.</p>}>
          <Ranked items={toasts.map((r) => ({ label: toastLabel(r.key), value: r.events }))} unit={['time', 'times']} hue="pink" max={12} empty="No error or warning message was shown in this period." />
        </ChartBox>
      </div>

      <ChartBox
        title="Ad views"
        sub="An ad counts as seen when at least half of it was on screen for one second. Counted only while ads are switched on."
        file="ad-views"
        table={{ head: ['Ad spot', 'Views', 'Devices'], rows: ads.map((r) => [AD_SPOT[r.key] ?? r.key, r.events, r.devices]) }}
        footer={<p className={styles.hint}>Total {num(events('ad_seen'))} {events('ad_seen') === 1 ? 'view' : 'views'} by {num(devices('ad_seen'))} {devices('ad_seen') === 1 ? 'device' : 'devices'}. Google’s own reports in AdSense are the source of truth for earnings.</p>}
      >
        <Ranked items={ads.map((r) => ({ label: AD_SPOT[r.key] ?? r.key, value: r.events }))} unit={['view', 'views']} hue="teal" empty="No ad was seen in this period. Ads show only after AdSense is set up." />
      </ChartBox>
    </>
  );
}
