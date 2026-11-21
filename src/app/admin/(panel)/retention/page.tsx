import type { Metadata } from 'next';
import { AdminOff } from '@/features/admin/AdminOff';
import { Kpi, PageHead, Panel, num, pct, Empty } from '@/features/admin/bits';
import { CsvButton } from '@/features/admin/client';
import styles from '@/features/admin/ui.module.css';
import { cached } from '@/server/admin/cache';
import { requireAdmin } from '@/server/admin/guard';
import { fullDay } from '@/server/admin/labels';
import { istDay } from '@/server/admin/time';
import type { ReturnRate } from '@/server/insights/types';
import { ADMIN_RETENTION_DAYS, getStore } from '@/server/store';

export const metadata: Metadata = { title: 'Retention' };

export default async function AdminRetentionPage() {
  const admin = await requireAdmin();
  if (admin.off) return <AdminOff />;
  const { now } = admin;
  const r = await cached(`ret:${istDay(now)}`, () => getStore().retention(now));
  const rate = (label: string, days: number, x: ReturnRate) => (
    <Kpi label={label} value={pct(x.returned, x.eligible)} sub={x.eligible ? `${num(x.returned)} of ${num(x.eligible)} devices first seen ${days}+ ${days === 1 ? 'day' : 'days'} ago` : `no device is ${days} ${days === 1 ? 'day' : 'days'} old yet`} />
  );
  const weeks = Math.max(0, ...r.cohorts.map((c) => c.active.length));
  const head = ['Week of first visit', 'Devices', ...Array.from({ length: weeks }, (_, k) => (k === 0 ? 'Week 0' : `Week ${k}`))];
  const rows = r.cohorts.map((c) => [`${fullDay(c.week)}`, c.size, ...Array.from({ length: weeks }, (_, k) => (k < c.active.length ? pct(c.active[k], c.size) : ''))]);
  const any = r.cohorts.some((c) => c.size > 0);

  return (
    <>
      <PageHead title="Retention" sub={`Do people come back? Worked out over everything stored (the last ${ADMIN_RETENTION_DAYS} days), in India calendar days. A “device” is a browser on a phone or computer, not a person.`} />

      <section aria-label="Return rates" className={styles.kpis}>
        {rate('Came back after day 1', 1, r.d1)}
        {rate('Came back after day 7', 7, r.d7)}
        {rate('Came back after day 30', 30, r.d30)}
        <Kpi label="Hosts" value={num(r.hosts)} sub="devices that created a game" />
        <Kpi label="Returning hosts" value={pct(r.returningHosts, r.hosts)} sub={`${num(r.returningHosts)} hosted on 2 or more different days`} />
      </section>
      <p className={styles.note}>
        <b>“Came back after day N”</b> = of the devices first seen at least N days ago, the share that was active again N or more days after their first day.
        Someone who clears their browser data, or switches phone, looks like a new device.
      </p>

      <Panel
        title="Weekly cohorts"
        sub="Each row is the devices first seen in one week (Monday to Sunday). Each column is how many of them were active again that many weeks later."
        action={<CsvButton file="weekly-cohorts" table={{ head, rows }} />}
      >
        {!any ? <Empty title="No device has been seen yet" hint="Cohorts fill in as visitors arrive. Week 0 is the week of the first visit." /> : (
          <div className={styles.tableScroll}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">Week of first visit</th>
                  <th scope="col" className={styles.num}>Devices</th>
                  {Array.from({ length: weeks }, (_, k) => <th key={k} scope="col" style={{ textAlign: 'center' }}>{k === 0 ? 'Week 0' : `+${k} wk`}</th>)}
                </tr>
              </thead>
              <tbody>
                {r.cohorts.map((c) => (
                  <tr key={c.week}>
                    <th scope="row">{fullDay(c.week)}</th>
                    <td className={styles.num}>{num(c.size)}</td>
                    {Array.from({ length: weeks }, (_, k) => {
                      if (k >= c.active.length) return <td key={k} />;
                      const share = c.size ? c.active[k] / c.size : 0;
                      return (
                        <td key={k} className={styles.cohortCell} title={`${num(c.active[k])} of ${num(c.size)} devices`}>
                          {c.size ? <><span className={styles.cohortFill} style={{ opacity: 0.08 + 0.5 * share }} aria-hidden="true" /><span>{pct(c.active[k], c.size)}</span></> : <span className={styles.dim}>—</span>}
                        </td>
                      );
                    })}
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
