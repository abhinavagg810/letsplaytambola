import type { Metadata } from 'next';
import Link from 'next/link';
import { AdminOff } from '@/features/admin/AdminOff';
import { Kpi, PageHead, Panel, dec, num, pct, Empty } from '@/features/admin/bits';
import { Ranked } from '@/features/admin/charts';
import type { RankItem } from '@/features/admin/charts';
import { ChartBox, Copy, CsvButton } from '@/features/admin/client';
import styles from '@/features/admin/ui.module.css';
import { cached } from '@/server/admin/cache';
import { requireAdmin } from '@/server/admin/guard';
import { UNKNOWN, byKey, sourceLabel } from '@/server/admin/labels';
import { delta, parseRange, withRange } from '@/server/admin/range';
import type { BreakdownDim, BreakdownRow } from '@/server/insights/types';
import { getStore } from '@/server/store';

export const metadata: Metadata = { title: 'Acquisition' };

const SHARES = ['share_whatsapp', 'share_copy', 'share_header_copy'];

const ranked = (rows: readonly BreakdownRow[], label: (k: string) => string, none: string | null = UNKNOWN): RankItem[] =>
  rows.filter((r) => r.key || none).map((r) => ({ label: r.key ? label(r.key) : none!, value: r.sessions }));
const tableOf = (first: string, rows: readonly BreakdownRow[], label: (k: string) => string, none = '(none)') =>
  ({ head: [first, 'Sessions', 'Visitors'], rows: rows.map((r) => [r.key ? label(r.key) : none, r.sessions, r.devices]) });

export default async function AdminAcquisitionPage({ searchParams }: PageProps<'/admin/acquisition'>) {
  const admin = await requireAdmin();
  if (admin.off) return <AdminOff />;
  const { now } = admin;
  const range = parseRange(await searchParams, now);
  const store = getStore();
  const { from, to, prev, cmp } = range;
  const start = (dim: BreakdownDim, f = from, t = to) => cached(`acq:${dim}:${f}:${t}`, () => store.eventBreakdown({ from: f, to: t, dim, names: ['session_start'], limit: 50 }));

  const [sources, prevSources, referrers, utmSource, utmMedium, utmCampaign, landings, inApp, steps, shareByGame, games] = await Promise.all([
    start('source'), cmp ? start('source', prev.from, prev.to) : null, start('prop:ref'), start('prop:utm_source'), start('prop:utm_medium'), start('prop:utm_campaign'),
    start('prop:landing'), start('in_app'),
    cached(`acq:steps:${from}:${to}`, () => store.eventBreakdown({ from, to, dim: 'step', names: [...SHARES, 'page_view', 'join_ok'] })),
    cached(`acq:sharegames:${from}:${to}`, () => store.eventBreakdown({ from, to, dim: 'code', names: SHARES, limit: 15 })),
    cached(`games:${from}:${to}`, () => store.adminGamesInRange({ from, to })),
  ]);

  const sum = (rows: readonly BreakdownRow[] | null): number => (rows ?? []).reduce((a, r) => a + r.sessions, 0);
  const sessions = sum(sources);
  const prevSessions = prevSources ? sum(prevSources) : null;
  const wa = byKey(sources).get('whatsapp')?.sessions ?? 0;
  const prevWa = prevSources ? byKey(prevSources).get('whatsapp')?.sessions ?? 0 : null;
  const waInApp = byKey(inApp).get('WhatsApp')?.sessions ?? 0;
  const anyInApp = inApp.filter((r) => r.key).reduce((a, r) => a + r.sessions, 0);
  const tagged = utmSource.filter((r) => r.key).reduce((a, r) => a + r.sessions, 0);

  const step = byKey(steps);
  const invitesSent = SHARES.reduce((a, n) => a + (step.get(n)?.events ?? 0), 0);
  const inviteSeen = step.get('page_view:game_invite')?.devices ?? 0;
  const joined = step.get('join_ok')?.devices ?? 0;
  // From the games themselves (not from events): people other than the host who took a ticket.
  const joins = games.rows.reduce((a, row) => a + (row.doc.players ?? []).filter((p) => p.pid !== row.doc.hostPid).length, 0);
  const d = (cur: number, before: number | null) => (cmp && before !== null ? delta(cur, before) : null);
  const landingLabel = (k: string): string => (k === '/g/[code]' ? 'A game link (/g/CODE)' : k);

  return (
    <>
      <PageHead title="Acquisition" sub="How people arrive. A session’s source is its campaign tag (utm_source) if the link had one, else the site it came from, else the app whose built-in browser opened it, else “direct”." range={range.label} />

      <section aria-label="Acquisition totals" className={styles.kpis}>
        <Kpi label="Sessions" value={num(sessions)} delta={d(sessions, prevSessions)} />
        <Kpi label="From WhatsApp" value={pct(wa, sessions)} delta={d(wa, prevWa)} sub={`${num(wa)} sessions`} title="Sessions whose source is WhatsApp: a wa.me / WhatsApp referrer, utm_source=whatsapp, or WhatsApp's built-in browser" />
        <Kpi label="WhatsApp in-app browser" value={pct(waInApp, sessions)} sub={`${num(waInApp)} sessions · any in-app browser ${pct(anyInApp, sessions)}`} />
        <Kpi label="Campaign-tagged" value={pct(tagged, sessions)} sub={`${num(tagged)} sessions with a utm_source`} />
        <Kpi label="Avg joins per game" value={games.rows.length ? dec(joins / games.rows.length) : '—'} sub={`${num(joins)} joins · ${num(games.rows.length)} games created`} />
      </section>

      <div className={styles.grid2}>
        <ChartBox title="Sources" sub="Sessions by where they came from" file="sources" table={tableOf('Source', sources, sourceLabel)}>
          <Ranked items={ranked(sources, sourceLabel)} unit={['session', 'sessions']} empty="No sessions recorded in this period yet." />
        </ChartBox>
        <ChartBox title="Referrers" sub="The site a session came from (host name only). Most taps from apps carry none." file="referrers" table={tableOf('Referrer', referrers, (k) => k, 'No referrer')}>
          <Ranked items={ranked(referrers, (k) => k, 'No referrer')} unit={['session', 'sessions']} hue="teal" empty="No sessions recorded in this period yet." />
        </ChartBox>
      </div>

      <div className={styles.grid3}>
        <ChartBox title="Campaign source" sub="utm_source" file="utm-source" table={tableOf('utm_source', utmSource, (k) => k)}>
          <Ranked items={ranked(utmSource, (k) => k, null)} total={sessions} unit={['session', 'sessions']} empty="No link with a utm_source was used in this period. Add ?utm_source=…&utm_medium=…&utm_campaign=… to links you post." />
        </ChartBox>
        <ChartBox title="Campaign medium" sub="utm_medium" file="utm-medium" table={tableOf('utm_medium', utmMedium, (k) => k)}>
          <Ranked items={ranked(utmMedium, (k) => k, null)} total={sessions} unit={['session', 'sessions']} hue="teal" empty="No link with a utm_medium was used in this period." />
        </ChartBox>
        <ChartBox title="Campaign name" sub="utm_campaign" file="utm-campaign" table={tableOf('utm_campaign', utmCampaign, (k) => k)}>
          <Ranked items={ranked(utmCampaign, (k) => k, null)} total={sessions} unit={['session', 'sessions']} hue="pink" empty="No link with a utm_campaign was used in this period." />
        </ChartBox>
      </div>

      <div className={styles.grid2}>
        <ChartBox title="Landing pages" sub="The first page of each session" file="landing-pages" table={tableOf('Landing page', landings, landingLabel)}>
          <Ranked items={ranked(landings, landingLabel)} unit={['session', 'sessions']} empty="No sessions recorded in this period yet." />
        </ChartBox>
        <ChartBox title="In-app browsers" sub="Sessions opened inside another app’s built-in browser" file="in-app-browsers" table={tableOf('Browser', inApp, (k) => k, 'A normal browser')}>
          <Ranked items={ranked(inApp, (k) => `${k} in-app`, 'A normal browser')} unit={['session', 'sessions']} hue="teal" empty="No sessions recorded in this period yet." />
        </ChartBox>
      </div>

      <Panel title="The invite loop" sub="Hosts share a link → people open the invite → some join. Counted from share taps, invite pages and joins in this period.">
        <div className={styles.steps}>
          <div className={styles.stepStat}><b>{num(invitesSent)}</b><span>share taps (WhatsApp {num(step.get('share_whatsapp')?.events ?? 0)} · copy link {num((step.get('share_copy')?.events ?? 0) + (step.get('share_header_copy')?.events ?? 0))})</span></div>
          <div className={styles.stepStat}><b>{num(inviteSeen)}</b><span>visitors saw an invite page{invitesSent ? ` · ${dec(inviteSeen / invitesSent)} per share tap` : ''}</span></div>
          <div className={styles.stepStat}><b>{num(joined)}</b><span>visitors joined · {pct(joined, inviteSeen)} of those who saw an invite</span></div>
          <div className={styles.stepStat}><b>{games.rows.length ? dec(joins / games.rows.length) : '—'}</b><span>joins per created game (from the games themselves)</span></div>
        </div>
        <p className={styles.hint}>A share tap opens WhatsApp or copies the link; whether the message was actually sent, and to how many people, cannot be known.</p>
      </Panel>

      <Panel
        title="Games shared the most"
        sub="Share taps per game in this period"
        action={<CsvButton file="shares-per-game" table={{ head: ['Game code', 'Share taps', 'Devices that shared'], rows: shareByGame.map((r) => [r.key, r.events, r.devices]) }} />}
      >
        {shareByGame.length === 0 ? <Empty title="No share taps in this period" hint="A host’s “Share on WhatsApp” and “Copy link” taps are counted here." /> : (
          <div className={styles.tableScroll}>
            <table className={styles.table}>
              <thead><tr><th scope="col">Game</th><th scope="col" className={styles.num}>Share taps</th><th scope="col" className={styles.num}>Devices that shared</th></tr></thead>
              <tbody>
                {shareByGame.map((r) => (
                  <tr key={r.key}>
                    <th scope="row">{r.key ? <><Link href={withRange(`/admin/games/${r.key}`, range)} prefetch={false} className={styles.cellLink}>{r.key}</Link> <Copy text={r.key}><span className="visually-hidden">{r.key}</span></Copy></> : UNKNOWN}</th>
                    <td className={styles.num}>{num(r.events)}</td>
                    <td className={styles.num}>{num(r.devices)}</td>
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
