import type { Metadata } from 'next';
import Link from 'next/link';
import { isGameCode, rupees } from '@/core';
import type { GameEvent } from '@/core';
import { Board } from '@/components/Board';
import { AdminOff } from '@/features/admin/AdminOff';
import { DeviceLink, DeviceText, Fact, PageHead, Panel, Place, StatusPill, When, num, Empty } from '@/features/admin/bits';
import { Copy, CsvButton } from '@/features/admin/client';
import styles from '@/features/admin/ui.module.css';
import { propsText } from '@/server/admin/exports';
import { requireAdmin } from '@/server/admin/guard';
import { eventLabel, sourceLabel } from '@/server/admin/labels';
import { priceText } from '@/server/admin/queries';
import { gameFacts, roundsOf, winsOf } from '@/server/admin/stats';
import { formatDuration, formatIst, formatIstTime } from '@/server/admin/time';
import { placeLabel } from '@/server/client-info';
import { uaSummary } from '@/server/insights/ua';
import { getStore } from '@/server/store';

export const metadata: Metadata = { title: 'Play detail' };

function eventText(e: GameEvent): { text: string; win?: boolean } {
  switch (e.kind) {
    case 'join': return { text: `${e.name} joined` };
    case 'start': return { text: 'The host started the game' };
    case 'call': return { text: `Number ${e.n} called` };
    case 'win': return { text: `${e.name} won ${e.label}`, win: true };
    case 'round': return { text: `Round ${e.round} set up — new tickets for everyone` };
  }
}

export default async function AdminGameDetailPage({ params }: PageProps<'/admin/games/[code]'>) {
  const admin = await requireAdmin();
  if (admin.off) return <AdminOff />;
  const { now } = admin;

  const code = decodeURIComponent((await params).code).trim().toUpperCase();
  const store = getStore();
  const [row, insights] = isGameCode(code) ? await Promise.all([store.adminGetGame(code), store.gameInsights(code)]) : [null, null];
  if (!row || !insights) {
    return <PageHead title="No such play" sub={`There is no game with the code ${code.slice(0, 12)}. It may be older than 90 days.`} />;
  }
  const { doc } = row;
  const g = gameFacts(row, now);
  const rounds = roundsOf(doc);
  const past = rounds.filter((r) => !r.current);
  const hostHasTicket = !!doc.hostPid && doc.players.some((p) => p.pid === doc.hostPid);
  const byDevice = new Map(insights.participations.map((p) => [p.device, p]));
  const hostPart = byDevice.get(row.hostDevice);

  const firstStart = rounds.find((r) => r.started && r.startedAt !== null)?.startedAt ?? null;
  const firstJoin = doc.players.filter((p) => p.pid !== doc.hostPid).map((p) => p.joinedAt).sort((a, b) => a - b)[0] ?? null;
  const count = (name: string): number => insights.events.filter((e) => e.name === name).length;
  const shares = { whatsapp: count('share_whatsapp'), copy: count('share_copy'), header: count('share_header_copy') };
  const invitesSeen = new Set(insights.events.filter((e) => e.name === 'page_view' && e.props.page === 'game_invite').map((e) => e.device ?? e.session)).size;

  // One timeline: what happened in the game (from its document: the latest 30) and what people did around it (analytics events).
  const timeline = [
    ...doc.events.map((e) => ({ at: e.at, key: `g${e.seq}`, kind: 'Game', ...eventText(e), who: '' as string | null })),
    ...insights.events.map((e) => ({ at: e.at, key: `e${e.id}`, kind: 'Activity', text: `${eventLabel(e.name)}${Object.keys(e.props).length ? ` (${propsText(e.props)})` : ''}`, win: false, who: e.device })),
  ].sort((a, b) => b.at - a.at);

  const people = [
    ...(!hostHasTicket ? [{ key: 'host', name: doc.hostName, role: 'Host (no ticket)', joinedAt: g.createdAt, wins: null as ReturnType<typeof winsOf> | null, device: row.hostDevice }] : []),
    ...doc.players.map((p) => ({ key: p.pid, name: p.name, role: p.pid === doc.hostPid ? 'Host' : 'Player', joinedAt: p.joinedAt, wins: winsOf(doc, p.pid), device: row.devices[p.pid] ?? '' })),
  ];

  return (
    <>
      <PageHead
        title={doc.name}
        sub={<>Game <Copy text={g.code} /> · hosted by {doc.hostName}{hostPart ? <> from <Place p={hostPart} /></> : null}</>}
      >
        <StatusPill status={g.status} />
      </PageHead>

      {g.expired ? (
        <p className={styles.note}>
          This game stopped working for players 24 hours after its last activity. Its tickets and dabs have been erased; this summary is kept for up to 90 days after the last activity.
        </p>
      ) : null}

      <Panel>
        <dl className={styles.facts}>
          <Fact label="Status"><StatusPill status={g.status} /></Fact>
          <Fact label="Host">{doc.hostName}{hostHasTicket ? '' : ' (no ticket)'}</Fact>
          <Fact label="Ticket price">{g.price > 0 ? `${rupees(g.price)} — collected outside the app` : 'Not set'}</Fact>
          <Fact label="Round">{g.round}</Fact>
          <Fact label="Players">{g.players}</Fact>
          <Fact label="Numbers called">{g.called} of 90</Fact>
          <Fact label="Prizes won">{g.prizesWon} of {g.prizesTotal}</Fact>
          <Fact label="Recorded prize money">{g.pot > 0 ? `${rupees(g.pot)} (recorded only)` : '—'}</Fact>
          <Fact label="Created"><When ms={g.createdAt} now={now} /></Fact>
          <Fact label="First person joined">{firstJoin ? <><When ms={firstJoin} now={now} /> <span className={styles.sub}>{formatDuration(Math.max(0, firstJoin - g.createdAt))} after it was created</span></> : 'Nobody joined'}</Fact>
          <Fact label="Time in lobby">{firstStart !== null ? formatDuration(Math.max(0, firstStart - g.createdAt)) : doc.status === 'lobby' ? `${formatDuration(Math.max(0, g.updatedAt - g.createdAt))} so far — not started` : '—'}</Fact>
          <Fact label="Started">{g.startedAt ? <When ms={g.startedAt} now={now} /> : doc.status === 'lobby' ? 'Not started' : '—'}</Fact>
          <Fact label="Finished">{doc.status === 'done' ? <When ms={g.finishedAt} now={now} /> : 'Not finished'}</Fact>
          <Fact label={doc.status === 'done' ? 'Game length' : 'Game length so far'}>{formatDuration(g.durationMs)}</Fact>
          <Fact label="Last activity"><When ms={g.updatedAt} now={now} /></Fact>
          <Fact label="Host device"><DeviceText d={hostPart} /></Fact>
          <Fact label="Host source">{hostPart?.source ? sourceLabel(hostPart.source) : <span className={styles.dim}>Unknown</span>}</Fact>
          <Fact label="Host IP address">{hostPart?.ip ? <Copy text={hostPart.ip} /> : <span className={styles.dim}>Unknown</span>}</Fact>
        </dl>
      </Panel>

      <Panel title="Sharing" sub="Share taps on this game, and how many different visitors opened its invite page.">
        <div className={styles.steps}>
          <div className={styles.stepStat}><b>{num(shares.whatsapp)}</b><span>“Share on WhatsApp” taps</span></div>
          <div className={styles.stepStat}><b>{num(shares.copy + shares.header)}</b><span>“Copy link” taps ({num(shares.copy)} in the lobby, {num(shares.header)} in the header)</span></div>
          <div className={styles.stepStat}><b>{num(invitesSeen)}</b><span>visitors saw the invite page</span></div>
          <div className={styles.stepStat}><b>{num(doc.players.filter((p) => p.pid !== doc.hostPid).length)}</b><span>people joined</span></div>
        </div>
      </Panel>

      <Panel
        title="People"
        sub="Where and on what each person created or joined the game. The place is the approximate location of their internet connection. Tickets and dabs are never shown here."
        action={<CsvButton file={`play-${g.code}-people`} table={{
          head: ['Name', 'Role', 'Joined (IST)', 'Prizes won', 'Amount (INR)', 'Location', 'IP address', 'Device', 'Source', 'Device id'],
          rows: people.map((p) => { const part = byDevice.get(p.device); return [p.name, p.role, formatIst(p.joinedAt), p.wins?.labels.join(', ') ?? '', p.wins?.amount ?? 0, part ? placeLabel(part) : '', part?.ip ?? '', part ? uaSummary({ ...part, device: part.deviceType }) : '', part?.source ?? '', p.device]; }),
        }} />}
      >
        {people.length === 0 ? <Empty title="Nobody has joined yet" /> : (
          <div className={styles.tableScroll} style={{ maxHeight: 520 }}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">Name</th>
                  <th scope="col">Role</th>
                  <th scope="col">Joined at</th>
                  <th scope="col">Prizes won</th>
                  <th scope="col" className={styles.num}>Amount</th>
                  <th scope="col">Location</th>
                  <th scope="col">IP address</th>
                  <th scope="col">Device</th>
                  <th scope="col">Source</th>
                  <th scope="col">Device id</th>
                </tr>
              </thead>
              <tbody>
                {people.map((p) => {
                  const part = byDevice.get(p.device);
                  return (
                    <tr key={p.key}>
                      <th scope="row">{p.name}</th>
                      <td>{p.role}</td>
                      <td><When ms={p.joinedAt} now={now} short /></td>
                      <td className={styles.wrap}>{p.wins?.count ? p.wins.labels.join(', ') : <span className={styles.dim}>—</span>}</td>
                      <td className={styles.num}>{priceText(p.wins?.amount ?? 0)}</td>
                      <td><Place p={part} stacked /></td>
                      <td>{part?.ip ? <Copy text={part.ip} /> : <span className={styles.dim}>Unknown</span>}</td>
                      <td><DeviceText d={part} /></td>
                      <td>{part?.source ? sourceLabel(part.source) : <span className={styles.dim}>Unknown</span>}</td>
                      <td><DeviceLink id={p.device} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel title="Ways to win" sub={g.round > 1 ? `Round ${g.round}` : undefined}>
        <div className={styles.tableScroll}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">Way to win</th>
                <th scope="col">Winner</th>
                <th scope="col" className={styles.num}>Amount</th>
                <th scope="col">Won at</th>
              </tr>
            </thead>
            <tbody>
              {doc.prizes.map((p) => (
                <tr key={p.id}>
                  <th scope="row">{p.label}</th>
                  <td>{p.winnerName ?? <span className={styles.dim}>Not won</span>}</td>
                  <td className={styles.num}>{priceText(p.amount)}</td>
                  <td>{p.wonAt ? <When ms={p.wonAt} now={now} short /> : <span className={styles.dim}>—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <div className={styles.grid2}>
        <Panel title="Numbers called" sub={g.called ? `${g.called} of 90, in the order they were called` : undefined}>
          {g.called === 0 ? <Empty title={`No number has been called${g.round > 1 ? ' in this round' : ''}`} /> : (
            <ol className={styles.calledList} aria-label="Numbers in call order">
              {doc.called.map((n) => <li key={n} className={styles.calledNum}>{n}</li>)}
            </ol>
          )}
        </Panel>
        <Panel title="Board">
          <div className={styles.boardBox}>
            <Board called={doc.called} latest={doc.called.at(-1) ?? null} />
          </div>
        </Panel>
      </div>

      {past.length ? (
        <Panel title="Earlier rounds" sub="Remembered when the host chose to play again">
          <div className={styles.tableScroll}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">Round</th>
                  <th scope="col">Started</th>
                  <th scope="col">Finished</th>
                  <th scope="col" className={styles.num}>Called</th>
                  <th scope="col" className={styles.num}>Players</th>
                  <th scope="col">Winners</th>
                </tr>
              </thead>
              <tbody>
                {past.map((r) => (
                  <tr key={r.round}>
                    <th scope="row">{r.round}</th>
                    <td><When ms={r.startedAt} now={now} short /></td>
                    <td><When ms={r.finishedAt} now={now} short /></td>
                    <td className={styles.num}>{r.called}</td>
                    <td className={styles.num}>{r.players}</td>
                    <td className={styles.wrap}>
                      {r.prizes.filter((p) => p.winnerName).map((p) => `${p.label}: ${p.winnerName}${p.amount ? ` (${rupees(p.amount)})` : ''}`).join(' · ') || <span className={styles.dim}>—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      ) : null}

      <Panel
        title="Timeline"
        sub="Newest first. “Game” lines come from the game itself (its latest 30 events); “Activity” lines are what people tapped and saw around it."
        action={<CsvButton file={`play-${g.code}-timeline`} table={{ head: ['Time (IST)', 'Kind', 'What', 'Device id'], rows: timeline.map((t) => [formatIst(t.at), t.kind, t.text, t.who ?? '']) }} />}
      >
        {timeline.length === 0 ? <Empty title="Nothing has happened yet" /> : (
          <ol className={styles.timeline}>
            {timeline.map((t) => (
              <li key={t.key}>
                <time className={styles.timelineTime} dateTime={new Date(t.at).toISOString()} title={formatIst(t.at)}>{formatIstTime(t.at).replace(' IST', '')}</time>
                <span className={styles.tag}>{t.kind}</span>
                <span className={t.win ? styles.eventWin : undefined}>{t.win ? '★ ' : ''}{t.text}{t.who ? <> · <DeviceLink id={t.who} /></> : null}</span>
              </li>
            ))}
          </ol>
        )}
      </Panel>

      <p className={styles.dim} style={{ fontSize: 15 }} data-noprint>
        <Link href={`/api/admin/games/${g.code}`} prefetch={false}>This play as JSON</Link>
      </p>
    </>
  );
}
