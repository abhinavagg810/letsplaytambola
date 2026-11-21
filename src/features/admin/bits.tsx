// Small server-rendered pieces shared by the admin pages.
import Link from 'next/link';
import type { ReactNode } from 'react';
import { cx } from '@/components/cx';
import { placeLabel } from '@/server/client-info';
import type { Delta } from '@/server/admin/range';
import { STATUS_LABEL } from '@/server/admin/stats';
import type { AdminStatus } from '@/server/admin/stats';
import { formatDuration, formatIst } from '@/server/admin/time';
import { uaSummary } from '@/server/insights/ua';
import styles from './ui.module.css';

/** 12,34,567 — numbers the Indian way. */
export const num = (n: number): string => (Number.isFinite(n) ? Math.round(n).toLocaleString('en-IN') : '—');
export const dec = (n: number | null | undefined, digits = 1): string => (n === null || n === undefined || !Number.isFinite(n) ? '—' : n.toLocaleString('en-IN', { maximumFractionDigits: digits, minimumFractionDigits: n % 1 === 0 ? 0 : digits }));
/** "42%" of a 0–1 fraction; "—" when there is nothing to divide by. */
export const pct = (part: number, whole: number, digits = 0): string => (whole > 0 ? `${((part / whole) * 100).toFixed(digits)}%` : '—');

export function StatusPill({ status }: { status: AdminStatus }) {
  return (
    <span className={styles.status} data-status={status}>
      <span className={styles.statusDot} aria-hidden="true" />
      {STATUS_LABEL[status]}
    </span>
  );
}

/** A device, shown only as its short anonymous id, linking to its page. */
export function DeviceLink({ id }: { id: string | null | undefined }) {
  if (!id) return <span className={styles.dim}>—</span>;
  return (
    <Link href={`/admin/players/${id}`} prefetch={false} className={cx(styles.cellLink, styles.mono, styles.above)} title="Anonymous device id — open this device">
      {id}
    </Link>
  );
}

/** A time in India time; hovering shows how long ago that was. */
export function When({ ms, now, short }: { ms: number | null | undefined; now: number; short?: boolean }) {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return <span className={styles.dim}>—</span>;
  const text = formatIst(ms);
  const ago = ms <= now ? `${formatDuration(now - ms)} ago` : `in ${formatDuration(ms - now)}`;
  return <time dateTime={new Date(ms).toISOString()} title={ago}>{short ? text.replace(/ \d{4},/, ',').replace(' IST', '') : text}</time>;
}

/** "Pune, Maharashtra, India" or a dimmed "Unknown". */
export function Place({ p, stacked }: { p: { city?: string | null; region?: string | null; country?: string | null } | null | undefined; stacked?: boolean }) {
  const label = p ? placeLabel(p) : 'Unknown';
  if (label === 'Unknown') return <span className={styles.dim}>Unknown</span>;
  // In tables: the city on one line, state and country under it — narrower columns, easier to scan.
  if (stacked && p?.city) return <>{p.city}<span className={styles.sub}>{placeLabel({ region: p.region, country: p.country })}</span></>;
  return <>{label}</>;
}

export function DeviceText({ d }: { d: { deviceType?: string | null; os?: string | null; osVersion?: string | null; browser?: string | null; browserVersion?: string | null; inApp?: string | null } | null | undefined }) {
  if (!d) return <span className={styles.dim}>Unknown</span>;
  const text = uaSummary({ ...d, device: d.deviceType });
  return text === 'Unknown' ? <span className={styles.dim}>Unknown</span> : <>{text}{d.deviceType && d.deviceType !== 'unknown' ? <span className={styles.sub}>{d.deviceType}</span> : null}</>;
}

export function PageHead({ title, sub, range, children }: { title: ReactNode; sub?: ReactNode; range?: string; children?: ReactNode }) {
  return (
    <div className={styles.pageHead}>
      <div style={{ minWidth: 0 }}>
        <h1 className={styles.pageTitle}>{title}</h1>
        {sub ? <p className={styles.pageSub}>{sub}</p> : null}
      </div>
      <div className={styles.pageActions}>
        {range ? <span className={styles.rangeChip} title="The period these numbers cover (India time)">{range}</span> : null}
        {children}
      </div>
    </div>
  );
}

export function Panel({ title, sub, action, children, className }: { title?: ReactNode; sub?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx(styles.panel, className)}>
      {title ? (
        <div className={styles.panelHead}>
          <div className={styles.panelTitles}>
            <h2 className={styles.panelTitle}>{title}</h2>
            {sub ? <p className={styles.panelSub}>{sub}</p> : null}
          </div>
          {action ? <div className={styles.panelTools} data-noprint>{action}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

/** Nothing to show yet — with a hint about what would put something here. */
export function Empty({ title, hint }: { title: string; hint?: ReactNode }) {
  return (
    <div className={styles.empty}>
      <span className={styles.emptyMark} aria-hidden="true" />
      <p className={styles.emptyTitle}>{title}</p>
      {hint ? <p className={styles.emptyHint}>{hint}</p> : null}
    </div>
  );
}

/** Shown on every admin page while the database has not been given migration 0003. */
export function MigrationNotice() {
  return (
    <div className={styles.warn} role="alert">
      <span className={styles.warnIcon} aria-hidden="true">!</span>
      <div>
        <b>Run migration 0003 to switch the analytics on.</b> The database has not been given <span className={styles.mono}>supabase/migrations/0003_insights.sql</span> yet,
        so visitors, places, devices, funnels and events are not being recorded and those sections are empty. Games keep working and the game numbers below are complete.
        Steps: Supabase → SQL Editor → New query → paste the whole file → Run (see <span className={styles.mono}>supabase/README.md</span>). This notice goes away within a minute of running it.
      </div>
    </div>
  );
}

export function DeltaBadge({ d, goodWhenUp = true }: { d: Delta; goodWhenUp?: boolean }) {
  if (d.dir === 'new') return <span className={styles.delta} data-tone="flat">new</span>;
  if (d.pct === null) return null;
  const tone = d.dir === 'flat' ? 'flat' : (d.dir === 'up') === goodWhenUp ? 'good' : 'bad';
  const arrow = d.dir === 'up' ? '▲' : d.dir === 'down' ? '▼' : '•';
  const word = d.dir === 'up' ? 'up' : d.dir === 'down' ? 'down' : 'no change';
  return (
    <span className={styles.delta} data-tone={tone}>
      <span className={styles.deltaArrow} aria-hidden="true">{arrow}</span>
      <span className="visually-hidden">{word} </span>
      {Math.abs(d.pct * 100).toFixed(Math.abs(d.pct) < 0.1 ? 1 : 0)}%
    </span>
  );
}

/** A tiny line of the daily values behind a KPI. Decorative: the charts and tables below carry the numbers. */
export function Spark({ values }: { values: readonly number[] }) {
  if (values.length < 2 || values.every((v) => v === 0)) return null;
  const w = 84, h = 30, pad = 3;
  const max = Math.max(...values, 1);
  const pts = values.map((v, i) => [pad + (i / (values.length - 1)) * (w - 2 * pad), h - pad - (v / max) * (h - 2 * pad)] as const);
  const last = pts[pts.length - 1];
  return (
    <svg className={styles.kpiSpark} width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
      <polyline points={pts.map((p) => p.map((n) => n.toFixed(1)).join(',')).join(' ')} fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={last[0]} cy={last[1]} r="3.5" fill="currentColor" stroke="var(--surface)" strokeWidth="2" />
    </svg>
  );
}

export function Kpi({ label, value, sub, delta, goodWhenUp, spark, title }: { label: string; value: string; sub?: ReactNode; delta?: Delta | null; goodWhenUp?: boolean; spark?: readonly number[]; title?: string }) {
  return (
    <div className={styles.kpi} title={title}>
      <div className={styles.kpiLabel}>{label}</div>
      <div className={styles.kpiValue}>{value}</div>
      {spark ? <Spark values={spark} /> : null}
      <div className={styles.kpiFoot}>
        {delta ? <><DeltaBadge d={delta} goodWhenUp={goodWhenUp} /><span>vs previous</span></> : null}
        {sub ? <span>{sub}</span> : null}
      </div>
    </div>
  );
}

/** "Showing 26–50 of 63" with Previous / Next. `href(page)` builds the link for a page. */
export function Pager({ page, pageSize, total, href, noun }: { page: number; pageSize: number; total: number; href: (page: number) => string; noun: string }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const first = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const last = Math.min(total, page * pageSize);
  return (
    <nav className={styles.pager} aria-label="Pages">
      <span>{total === 0 ? `No ${noun}` : `Showing ${num(first)}–${num(last)} of ${num(total)} ${noun}`}</span>
      <span className={styles.pagerLinks}>
        <Link href={href(Math.max(1, page - 1))} prefetch={false} className={cx(styles.miniBtn, page <= 1 && styles.btnOff)} aria-disabled={page <= 1} tabIndex={page <= 1 ? -1 : undefined}>
          Previous
        </Link>
        <span>Page {Math.min(page, pages)} of {pages}</span>
        <Link href={href(page + 1)} prefetch={false} className={cx(styles.miniBtn, page >= pages && styles.btnOff)} aria-disabled={page >= pages} tabIndex={page >= pages ? -1 : undefined}>
          Next
        </Link>
      </span>
    </nav>
  );
}

/** A column header that sorts: the first click sorts biggest/newest first, the next one flips it. */
export function SortTh({ label, active, dir, href, className, col }: { label: string; active: boolean; dir: 'asc' | 'desc'; href: string; className?: string; col?: string }) {
  return (
    <th scope="col" className={className} data-col={col} aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : undefined}>
      <Link href={href} prefetch={false} className={styles.sortLink} data-active={active} title={active ? `Sorted ${dir === 'asc' ? 'smallest / oldest' : 'biggest / newest'} first — click to flip` : 'Click to sort'}>
        {label}
        <span aria-hidden="true">{active ? (dir === 'asc' ? '▲' : '▼') : '↕'}</span>
      </Link>
    </th>
  );
}

export function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className={styles.fact}>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}
