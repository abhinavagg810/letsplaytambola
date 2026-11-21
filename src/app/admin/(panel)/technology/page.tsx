import type { Metadata } from 'next';
import { AdminOff } from '@/features/admin/AdminOff';
import { Kpi, PageHead, num, pct } from '@/features/admin/bits';
import { Ranked } from '@/features/admin/charts';
import type { Hue } from '@/features/admin/charts';
import { ChartBox } from '@/features/admin/client';
import styles from '@/features/admin/ui.module.css';
import { cached } from '@/server/admin/cache';
import { requireAdmin } from '@/server/admin/guard';
import { SCREEN_ORDER, UNKNOWN, byKey, deviceTypeLabel, screenLabel } from '@/server/admin/labels';
import { parseRange } from '@/server/admin/range';
import type { BreakdownDim, BreakdownRow } from '@/server/insights/types';
import { getStore } from '@/server/store';

export const metadata: Metadata = { title: 'Technology' };

const CONN: Record<string, string> = { 'slow-2g': 'Very slow (2G or worse)', '2g': '2G speed', '3g': '3G speed', '4g': '4G speed or better', '5g': '5G', wifi: 'Wi-Fi', cellular: 'Mobile data', ethernet: 'Cable', none: 'Offline', other: 'Other' };
const LANG: Record<string, string> = { en: 'English', hi: 'Hindi', mr: 'Marathi', gu: 'Gujarati', ta: 'Tamil', te: 'Telugu', kn: 'Kannada', bn: 'Bengali', pa: 'Punjabi', ml: 'Malayalam', ur: 'Urdu', or: 'Odia' };
const langLabel = (k: string): string => {
  const [l, r] = k.split('-');
  return `${LANG[l] ?? l}${r ? ` (${r})` : ''}`;
};

export default async function AdminTechnologyPage({ searchParams }: PageProps<'/admin/technology'>) {
  const admin = await requireAdmin();
  if (admin.off) return <AdminOff />;
  const { now } = admin;
  const range = parseRange(await searchParams, now);
  const store = getStore();
  const { from, to } = range;
  const get = (dim: BreakdownDim) => cached(`tech:${dim}:${from}:${to}`, () => store.eventBreakdown({ from, to, dim, names: ['session_start'], limit: 40 }));
  const [types, os, browsers, inApp, screens, langs, conns, touch, pwa] = await Promise.all([
    get('device_type'), get('os'), get('browser'), get('in_app'), get('screen'), get('prop:lang'), get('prop:conn'), get('prop:touch'), get('prop:pwa'),
  ]);
  const sessions = types.reduce((a, r) => a + r.sessions, 0);
  const of = (rows: readonly BreakdownRow[], key: string): number => byKey(rows).get(key)?.sessions ?? 0;
  const inAppSessions = inApp.filter((r) => r.key).reduce((a, r) => a + r.sessions, 0);
  const orderedScreens = [...screens].sort((a, b) => (SCREEN_ORDER.indexOf(a.key) + 99) % 99 - (SCREEN_ORDER.indexOf(b.key) + 99) % 99);

  const box = (title: string, sub: string, file: string, rows: readonly BreakdownRow[], label: (k: string) => string, hue: Hue, none = UNKNOWN, first = title) => (
    <ChartBox title={title} sub={sub} file={file} table={{ head: [first, 'Sessions', 'Share', 'Visitors'], rows: rows.map((r) => [r.key ? label(r.key) : none, r.sessions, pct(r.sessions, sessions, 1), r.devices]) }}>
      <Ranked items={rows.map((r) => ({ label: r.key ? label(r.key) : none, value: r.sessions }))} total={sessions} unit={['session', 'sessions']} hue={hue} max={12} empty="No sessions recorded in this period yet." />
    </ChartBox>
  );

  return (
    <>
      <PageHead title="Technology" sub="What people use to open the site, counted per session. Worked out from what the browser says about itself — a good guide, not a guarantee." range={range.label} />

      <section aria-label="Technology totals" className={styles.kpis}>
        <Kpi label="Sessions" value={num(sessions)} />
        <Kpi label="On a phone" value={pct(of(types, 'phone'), sessions)} sub={`${num(of(types, 'phone'))} sessions`} />
        <Kpi label="Android" value={pct(of(os, 'Android'), sessions)} sub={`iOS ${pct(of(os, 'iOS'), sessions)}`} />
        <Kpi label="In-app browsers" value={pct(inAppSessions, sessions)} sub={`WhatsApp ${pct(of(inApp, 'WhatsApp'), sessions)}`} />
        <Kpi label="Touch screens" value={pct(of(touch, 'true'), sessions)} />
        <Kpi label="Installed to home screen" value={pct(of(pwa, 'true'), sessions)} sub={`${num(of(pwa, 'true'))} sessions`} />
      </section>

      <div className={styles.grid3}>
        {box('Device type', 'Phone, tablet or desktop', 'device-types', types, deviceTypeLabel, 'marigold')}
        {box('Operating system', 'Android, iOS, Windows …', 'operating-systems', os, (k) => k, 'teal')}
        {box('Browser', '“WebView” is a browser built into another app', 'browsers', browsers, (k) => k, 'pink')}
        {box('In-app browsers', 'Links opened inside WhatsApp, Instagram, Facebook …', 'in-app-browsers', inApp, (k) => k, 'teal', 'A normal browser', 'App')}
        {box('Screen width', 'The device’s screen, in CSS pixels', 'screen-widths', orderedScreens, screenLabel, 'marigold')}
        {box('Language', 'The browser’s first language', 'languages', langs, langLabel, 'pink')}
        {box('Connection', 'Speed class reported by the browser (Chrome and Android only)', 'connections', conns, (k) => CONN[k] ?? k, 'teal', 'Not reported')}
      </div>
    </>
  );
}
