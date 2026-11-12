import type { Metadata } from 'next';
import Link from 'next/link';
import { isGameCode, rupees } from '@/core';
import type { GameEvent } from '@/core';
import { Board } from '@/components/Board';
import { AdminOff } from '@/features/admin/AdminOff';
import { DeviceLink, PageHead, Panel, StatusPill } from '@/features/admin/bits';
import { RefreshButton } from '@/features/admin/RefreshButton';
import styles from '@/features/admin/admin.module.css';
import { requireAdmin } from '@/server/admin/guard';
import { priceText } from '@/server/admin/queries';
import { gameFacts, roundsOf, winsOf } from '@/server/admin/stats';
import { formatDuration, formatIst, formatIstTime } from '@/server/admin/time';
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

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className={styles.fact}>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

export default async function AdminGameDetailPage({ params }: PageProps<'/admin/games/[code]'>) {
  const admin = await requireAdmin();
  if (admin.off) return <AdminOff />;
  const { now } = admin;

  const code = decodeURIComponent((await params).code).trim().toUpperCase();
  const row = isGameCode(code) ? await getStore().adminGetGame(code) : null;
  const crumb = { href: '/admin/games', label: 'All plays' };
  if (!row) {
    return (
      <>
        <PageHead title="No such play" sub={`There is no game with the code ${code.slice(0, 12)}. It may be older than 90 days.`} crumb={crumb} />
      </>
    );
  }
  const { doc } = row;
  const g = gameFacts(row, now);
  const rounds = roundsOf(doc);
  const past = rounds.filter((r) => !r.current);
  const open = !g.expired && g.status !== 'done';
  const hostHasTicket = !!doc.hostPid && doc.players.some((p) => p.pid === doc.hostPid);
  const events = [...doc.events].reverse();

  return (
    <>
      <PageHead
        title={doc.name}
        crumb={crumb}
        sub={
          <>
            <span className={styles.mono}>{g.code}</span> · hosted by {doc.hostName}
          </>
        }
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <StatusPill status={g.status} />
          {open ? <RefreshButton /> : null}
        </div>
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
          <Fact label="Recorded pot">{g.pot > 0 ? `${rupees(g.pot)} (recorded only)` : '—'}</Fact>
          <Fact label="Created">{formatIst(g.createdAt)}</Fact>
          <Fact label="Started">{g.startedAt ? formatIst(g.startedAt) : g.status === 'lobby' || (g.status === 'expired' && doc.status === 'lobby') ? 'Not started' : '—'}</Fact>
          <Fact label="Finished">{doc.status === 'done' ? formatIst(g.finishedAt) : 'Not finished'}</Fact>
          <Fact label="Last activity">{formatIst(g.updatedAt)}</Fact>
          <Fact label={doc.status === 'done' ? 'Duration' : 'Duration so far'}>{formatDuration(g.durationMs)}</Fact>
        </dl>
      </Panel>

      <Panel title="Ways to win" sub={g.round > 1 ? `Round ${g.round}` : undefined}>
        <div className={`${styles.tableWrap} ${styles.tableWrapFlat}`}>
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
                  <td>{p.wonAt ? formatIst(p.wonAt) : <span className={styles.dim}>—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title="Players" sub="A device is a browser on a phone or computer, shown as a short anonymous id. Tickets and dabs are never shown here.">
        {doc.players.length === 0 && hostHasTicket ? <p className={styles.empty}>Nobody has joined yet.</p> : (
          <div className={`${styles.tableWrap} ${styles.tableWrapFlat}`}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">Name</th>
                  <th scope="col">Role</th>
                  <th scope="col">Joined at</th>
                  <th scope="col">Prizes won</th>
                  <th scope="col" className={styles.num}>Amount</th>
                  <th scope="col">Device</th>
                </tr>
              </thead>
              <tbody>
                {!hostHasTicket ? (
                  <tr>
                    <th scope="row">{doc.hostName}</th>
                    <td>Host (no ticket)</td>
                    <td>{formatIst(g.createdAt)}</td>
                    <td><span className={styles.dim}>—</span></td>
                    <td className={styles.num}>—</td>
                    <td><DeviceLink id={row.hostDevice} /></td>
                  </tr>
                ) : null}
                {doc.players.map((p) => {
                  const w = winsOf(doc, p.pid);
                  return (
                    <tr key={p.pid}>
                      <th scope="row">{p.name}</th>
                      <td>{p.pid === doc.hostPid ? 'Host' : 'Player'}</td>
                      <td>{formatIst(p.joinedAt)}</td>
                      <td className={styles.wrap}>{w.count ? w.labels.join(', ') : <span className={styles.dim}>—</span>}</td>
                      <td className={styles.num}>{priceText(w.amount)}</td>
                      <td><DeviceLink id={row.devices[p.pid] ?? ''} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <div className={styles.grid2}>
        <Panel title="Numbers called" sub={g.called ? `${g.called} of 90, in the order they were called` : undefined}>
          {g.called === 0 ? <p className={styles.empty}>No number has been called{g.round > 1 ? ' in this round' : ''}.</p> : (
            <ol className={styles.calledList} aria-label="Numbers in call order">
              {doc.called.map((n) => (
                <li key={n} className={styles.calledNum}>{n}</li>
              ))}
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
          <div className={`${styles.tableWrap} ${styles.tableWrapFlat}`}>
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
                    <td>{formatIst(r.startedAt)}</td>
                    <td>{formatIst(r.finishedAt)}</td>
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

      <Panel title="Timeline" sub="The latest 30 events of the game, newest first">
        {events.length === 0 ? <p className={styles.empty}>Nothing has happened yet.</p> : (
          <ol className={styles.timeline}>
            {events.map((e) => {
              const t = eventText(e);
              return (
                <li key={e.seq}>
                  <time className={styles.timelineTime} dateTime={new Date(e.at).toISOString()} title={formatIst(e.at)}>{formatIstTime(e.at)}</time>
                  <span className={t.win ? styles.eventWin : undefined}>{t.text}</span>
                </li>
              );
            })}
          </ol>
        )}
      </Panel>

      <p className={styles.dim} style={{ fontSize: 15 }}>
        <Link href={`/api/admin/games/${g.code}`} prefetch={false}>This play as JSON</Link>
      </p>
    </>
  );
}
