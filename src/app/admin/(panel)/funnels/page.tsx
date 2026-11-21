import type { Metadata } from 'next';
import Link from 'next/link';
import { AdminOff } from '@/features/admin/AdminOff';
import { PageHead, num, pct } from '@/features/admin/bits';
import { FunnelChart, Ranked } from '@/features/admin/charts';
import { ChartBox } from '@/features/admin/client';
import styles from '@/features/admin/ui.module.css';
import { cached } from '@/server/admin/cache';
import { requireAdmin } from '@/server/admin/guard';
import { deviceTypeLabel, sourceLabel } from '@/server/admin/labels';
import { parseRange, withRange } from '@/server/admin/range';
import type { FunnelStep } from '@/server/insights/types';
import { getStore } from '@/server/store';

export const metadata: Metadata = { title: 'Funnels' };

const HOST: [string, string, string?][] = [
  ['page_view:home', 'Saw the home page'],
  ['page_view:host', 'Opened host setup', '/host'],
  ['host_name_typed', 'Had a name in the form', 'typed, or remembered from last time'],
  ['host_create_tap', 'Tapped “Create game”'],
  ['host_created', 'Game created'],
  ['game_start', 'Started the game'],
  ['results_seen:host', 'Reached the results', 'the game finished'],
];
const JOIN: [string, string, string?][] = [
  ['page_view:game_invite', 'Saw an invite', 'opened a game link, not yet joined'],
  ['join_name_typed', 'Had a name in the form', 'typed, or remembered from last time'],
  ['join_ok', 'Joined the game'],
  ['results_seen:player', 'Played to the end', 'saw the results'],
];
const REASONS: Record<string, string> = {
  forbidden: 'Not allowed', invalid: 'Bad input', state: 'Wrong moment (e.g. already finished)', full: 'Game full', no_token: 'No device token', bad_request: 'Bad request',
  not_found: 'Game not found', rate_limited: 'Too many tries', busy: 'Server busy', server: 'Server error', network: 'No connection', other: 'Other',
};
const one = (v: string | string[] | undefined): string => (Array.isArray(v) ? v[0] ?? '' : v ?? '');

export default async function AdminFunnelsPage({ searchParams }: PageProps<'/admin/funnels'>) {
  const admin = await requireAdmin();
  if (admin.off) return <AdminOff />;
  const { now } = admin;
  const sp = await searchParams;
  const range = parseRange(sp, now);
  const store = getStore();
  const { from, to } = range;
  const device = /^[a-z]{1,16}$/.test(one(sp.device)) ? one(sp.device) : '';
  const source = /^[a-z0-9][a-z0-9._-]{0,59}$/.test(one(sp.source)) ? one(sp.source) : '';
  const f = { ...(device ? { deviceType: device } : {}), ...(source ? { source } : {}) };
  const key = `${from}:${to}:${device}:${source}`;

  const [host, join, deviceTypes, sources, createFails, joinFails] = await Promise.all([
    cached(`fun:host:${key}`, () => store.funnel({ from, to, steps: HOST.map((s) => s[0]), ...f })),
    cached(`fun:join:${key}`, () => store.funnel({ from, to, steps: JOIN.map((s) => s[0]), ...f })),
    cached(`fun:dt:${from}:${to}`, () => store.eventBreakdown({ from, to, dim: 'device_type' })),
    cached(`fun:src:${from}:${to}`, () => store.eventBreakdown({ from, to, dim: 'source', limit: 30 })),
    cached(`fun:cf:${key}`, () => store.eventBreakdown({ from, to, dim: 'prop:reason', names: ['host_create_failed'], ...f })),
    cached(`fun:jf:${key}`, () => store.eventBreakdown({ from, to, dim: 'prop:reason', names: ['join_failed', 'game_not_found'], ...f })),
  ]);
  const rows = (def: [string, string, string?][], steps: FunnelStep[]) => def.map(([, label, note], i) => ({ label, note, kept: steps[i]?.kept ?? 0, any: steps[i]?.any ?? 0 }));
  const table = (def: [string, string, string?][], steps: FunnelStep[]) => ({
    head: ['Step', 'Visitors still in the funnel', 'From the step before', 'Lost at this step', 'Of step 1', 'Did this step at all'],
    rows: def.map(([, label], i) => {
      const s = steps[i] ?? { kept: 0, any: 0 };
      const before = i > 0 ? steps[i - 1]?.kept ?? 0 : null;
      return [label, s.kept, before === null ? '' : pct(s.kept, before), before === null ? '' : before - s.kept, pct(s.kept, steps[0]?.kept ?? 0), s.any];
    }),
  });
  const filtered = !!(device || source);
  const hostEnd = host[host.length - 1]?.kept ?? 0;
  const joinEnd = join[join.length - 1]?.kept ?? 0;
  const fail = (rowsIn: typeof createFails) => rowsIn.map((r) => ({ label: r.key ? REASONS[r.key] ?? r.key : 'Game not found (page shown)', value: r.events }));

  return (
    <>
      <PageHead title="Funnels" sub="How far visitors get on the way to hosting and to joining a game. A visitor is one device (or one session, if it sent no device id)." range={range.label} />

      <form className={`${styles.panel} ${styles.filters}`} method="get" action="/admin/funnels" aria-label="Filter the funnels">
        {range.key !== '7d' ? <input type="hidden" name="range" value={range.key} /> : null}
        {range.key === 'custom' ? <><input type="hidden" name="from" value={range.fromDay} /><input type="hidden" name="to" value={range.toDay} /></> : null}
        {range.cmp ? <input type="hidden" name="cmp" value="1" /> : null}
        <label className={styles.field}>
          <span className={styles.fieldLabel}>Device type</span>
          <select className={styles.control} name="device" defaultValue={device}>
            <option value="">All devices</option>
            {deviceTypes.filter((r) => r.key).map((r) => <option key={r.key} value={r.key}>{deviceTypeLabel(r.key)} ({num(r.devices)})</option>)}
          </select>
        </label>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>Source</span>
          <select className={styles.control} name="source" defaultValue={source}>
            <option value="">All sources</option>
            {sources.filter((r) => r.key).map((r) => <option key={r.key} value={r.key}>{sourceLabel(r.key)} ({num(r.devices)})</option>)}
          </select>
        </label>
        <div className={styles.filterActions}>
          <button type="submit" className={styles.btnPrimary}>Apply</button>
          {filtered ? <Link href={withRange('/admin/funnels', range)} prefetch={false} className={styles.btn}>Clear</Link> : null}
        </div>
      </form>

      <p className={styles.note}>
        <b>How to read these.</b> A visitor is counted at a step only if they also did <b>every step before it</b> in this period, so the numbers can only go down.
        The table view also shows how many did each step at all — for example people who opened a shared <span className={styles.mono}>/host</span> link without ever seeing the home page.
      </p>

      <div className={styles.grid2}>
        <ChartBox title="Hosting a game" sub={`Home → setup → create → start → finish. ${pct(hostEnd, host[0]?.kept ?? 0, 1)} of visitors who saw the home page went all the way.`} file="host-funnel" table={table(HOST, host)}>
          <FunnelChart steps={rows(HOST, host)} empty="Nobody saw the home page in this period (with these filters)." />
        </ChartBox>
        <ChartBox title="Joining a game" sub={`Invite → name → joined → played to the end. ${pct(joinEnd, join[0]?.kept ?? 0, 1)} of visitors who saw an invite played to the end.`} file="join-funnel" table={table(JOIN, join)}>
          <FunnelChart steps={rows(JOIN, join)} hue="teal" empty="Nobody opened an invite in this period (with these filters)." />
        </ChartBox>
        <ChartBox title="Why creating failed" sub="Times the server refused or could not be reached" file="create-failures" table={{ head: ['Reason', 'Times'], rows: fail(createFails).map((r) => [r.label, r.value]) }}>
          <Ranked items={fail(createFails)} unit={['time', 'times']} hue="pink" empty="No failed “Create game” in this period — good." />
        </ChartBox>
        <ChartBox title="Why joining failed" sub="Refused joins, and “we can’t find that game” pages" file="join-failures" table={{ head: ['Reason', 'Times'], rows: fail(joinFails).map((r) => [r.label, r.value]) }}>
          <Ranked items={fail(joinFails)} unit={['time', 'times']} hue="pink" empty="No failed join in this period — good." />
        </ChartBox>
      </div>
    </>
  );
}
