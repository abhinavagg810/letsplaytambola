import type { Metadata } from 'next';
import { AdminOff } from '@/features/admin/AdminOff';
import { Kpi, PageHead, Panel, num, pct, Empty } from '@/features/admin/bits';
import { Ranked } from '@/features/admin/charts';
import { ChartBox, CsvButton } from '@/features/admin/client';
import styles from '@/features/admin/ui.module.css';
import { cached } from '@/server/admin/cache';
import { requireAdmin } from '@/server/admin/guard';
import { UNKNOWN, cityLabel, countryLabel, regionLabel } from '@/server/admin/labels';
import { parseRange } from '@/server/admin/range';
import type { BreakdownRow, ParticipationRow } from '@/server/insights/types';
import { getStore } from '@/server/store';

export const metadata: Metadata = { title: 'Geography' };

interface Place { key: string; visitors: number; sessions: number; games: number; players: number; devices: number }

/** Visitors (from events) and games / players / devices that played (from participations), side by side per place. */
function merge(events: readonly BreakdownRow[], parts: readonly ParticipationRow[]): Place[] {
  const by = new Map<string, Place>();
  const get = (key: string): Place => {
    let p = by.get(key);
    if (!p) by.set(key, (p = { key, visitors: 0, sessions: 0, games: 0, players: 0, devices: 0 }));
    return p;
  };
  for (const e of events) Object.assign(get(e.key), { visitors: e.devices, sessions: e.sessions });
  for (const p of parts) Object.assign(get(p.key), { games: p.games, players: p.players, devices: p.devices });
  return [...by.values()].sort((a, b) => b.visitors - a.visitors || b.players - a.players || b.games - a.games || (a.key < b.key ? -1 : 1));
}

function PlaceTable({ caption, first, rows, label, totalVisitors, file }: { caption: string; first: string; rows: Place[]; label: (key: string) => { name: string; sub?: string }; totalVisitors: number; file: string }) {
  const head = [first, 'Visitors', 'Share of visitors', 'Sessions', 'Games hosted', 'Players', 'Devices that played'];
  const data = rows.map((r) => { const l = label(r.key); return [l.sub ? `${l.name}, ${l.sub}` : l.name, r.visitors, pct(r.visitors, totalVisitors, 1), r.sessions, r.games, r.players, r.devices]; });
  return (
    <Panel title={caption} sub={`${num(rows.filter((r) => r.key).length)} known`} action={<CsvButton file={file} table={{ head, rows: data }} />}>
      {rows.length === 0 ? <Empty title="Nothing recorded in this period" hint="Places come from the visitor’s network address on the live site. On a local machine there are none." /> : (
        <div className={styles.tableScroll} style={{ maxHeight: 520 }}>
          <table className={styles.table}>
            <thead>
              <tr>{head.map((h, i) => <th key={h} scope="col" className={i ? styles.num : undefined}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const l = label(r.key);
                return (
                  <tr key={r.key || 'unknown'}>
                    <th scope="row">{r.key ? l.name : <span className={styles.dim}>{UNKNOWN}</span>}{l.sub ? <span className={styles.sub}>{l.sub}</span> : null}</th>
                    <td className={styles.num}>{num(r.visitors)}</td>
                    <td className={styles.num}>{pct(r.visitors, totalVisitors, 1)}</td>
                    <td className={styles.num}>{num(r.sessions)}</td>
                    <td className={styles.num}>{num(r.games)}</td>
                    <td className={styles.num}>{num(r.players)}</td>
                    <td className={styles.num}>{num(r.devices)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

export default async function AdminGeographyPage({ searchParams }: PageProps<'/admin/geography'>) {
  const admin = await requireAdmin();
  if (admin.off) return <AdminOff />;
  const { now } = admin;
  const range = parseRange(await searchParams, now);
  const store = getStore();
  const { from, to } = range;
  const ev = (dim: 'country' | 'region' | 'city' | 'all') => cached(`geo:ev:${dim}:${from}:${to}`, () => store.eventBreakdown({ from, to, dim, limit: 300 }));
  const part = (dim: 'country' | 'region' | 'city') => cached(`geo:part:${dim}:${from}:${to}`, () => store.participationBreakdown(from, to, dim));
  const [all, evCountry, evRegion, evCity, pCountry, pRegion, pCity] = await Promise.all([ev('all'), ev('country'), ev('region'), ev('city'), part('country'), part('region'), part('city')]);

  const total = all[0]?.devices ?? 0;
  const countries = merge(evCountry, pCountry);
  const regions = merge(evRegion, pRegion);
  const cities = merge(evCity, pCity).slice(0, 100);
  const india = countries.find((c) => c.key === 'IN')?.visitors ?? 0;
  const unknown = countries.find((c) => c.key === '')?.visitors ?? 0;
  const states = regions.filter((r) => r.key.startsWith('IN-'));
  const topCity = cities.find((c) => c.key);

  return (
    <>
      <PageHead title="Geography" sub="Where visitors and players are, as far as their network address tells. This is the approximate place of the internet connection (city level at best) — not GPS, and wrong behind VPNs and for some mobile networks." range={range.label} />

      <section aria-label="Geography totals" className={styles.kpis}>
        <Kpi label="Visitors" value={num(total)} sub="different devices" />
        <Kpi label="From India" value={pct(india, total)} sub={`${num(india)} visitors`} />
        <Kpi label="Countries" value={num(countries.filter((c) => c.key).length)} />
        <Kpi label="Indian states" value={num(states.length)} sub="and union territories" />
        <Kpi label="Top city" value={topCity ? cityLabel(topCity.key).city : '—'} sub={topCity ? `${num(topCity.visitors)} visitors` : undefined} />
        <Kpi label="Place unknown" value={pct(unknown, total)} sub={`${num(unknown)} visitors`} />
      </section>

      <div className={styles.grid2}>
        <ChartBox title="Indian states and territories" sub="Visitors by state" file="india-states"
          table={{ head: ['State', 'Visitors', 'Games hosted', 'Players', 'Devices that played'], rows: states.map((r) => [regionLabel(r.key), r.visitors, r.games, r.players, r.devices]) }}>
          <Ranked items={states.map((r) => ({ label: regionLabel(r.key), value: r.visitors, extra: `${num(r.games)} ${r.games === 1 ? 'game' : 'games'} · ${num(r.players)} ${r.players === 1 ? 'player' : 'players'}` }))} total={india} unit={['visitor', 'visitors']} max={15} empty="No visitor from an Indian state was recorded in this period." />
        </ChartBox>
        <ChartBox title="Top cities" sub="Visitors by city" file="top-cities"
          table={{ head: ['City', 'State / country', 'Visitors', 'Games hosted', 'Players'], rows: cities.filter((c) => c.key).map((r) => [cityLabel(r.key).city, cityLabel(r.key).where, r.visitors, r.games, r.players]) }}>
          <Ranked items={cities.filter((c) => c.key).map((r) => ({ label: cityLabel(r.key).city, note: cityLabel(r.key).where, value: r.visitors, extra: `${num(r.players)} ${r.players === 1 ? 'player' : 'players'}` }))} total={total} unit={['visitor', 'visitors']} hue="teal" max={15} empty="No city was recorded in this period." />
        </ChartBox>
      </div>

      <PlaceTable caption="Countries" first="Country" rows={countries} label={(k) => ({ name: countryLabel(k) })} totalVisitors={total} file="countries" />
      <PlaceTable caption="States and regions" first="State / region" rows={regions} label={(k) => ({ name: regionLabel(k) })} totalVisitors={total} file="regions" />
      <PlaceTable caption="Cities" first="City" rows={cities} label={(k) => { const c = cityLabel(k); return { name: c.city, sub: c.where }; }} totalVisitors={total} file="cities" />
    </>
  );
}
