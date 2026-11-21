// Charts for the admin: plain HTML/CSS and a little SVG, no chart library.
// One hue per chart, zero baselines, labelled axes with units, direct value labels where there is room, a tooltip per mark
// (hover or keyboard focus). Each chart sits in a <ChartBox>, which offers the same numbers as a table and as CSV.
import { cx } from '@/components/cx';
import { num } from './bits';
import styles from './ui.module.css';

export type Hue = 'marigold' | 'teal' | 'pink';

export interface BarDatum {
  /** Short label for the axis ("12 Nov", "9 pm"). */
  label: string;
  /** Full label for the tooltip ("12 Nov 2026"). */
  full?: string;
  value: number;
}

/** A round number at or above `max` for the top of the y axis (1, 2, 4, 5, 10, 20, 40, 50, 100 …). */
export function niceTop(max: number): number {
  if (max <= 1) return 1;
  const pow = 10 ** Math.floor(Math.log10(max));
  for (const m of [1, 2, 4, 5, 10]) if (m * pow >= max) return m * pow;
  return 10 * pow;
}

const count = (n: number, unit: readonly [string, string]): string => `${num(n)} ${n === 1 ? unit[0] : unit[1]}`;
const compact = (n: number): string => (n >= 100000 ? `${+(n / 100000).toFixed(1)}L` : n >= 1000 ? `${+(n / 1000).toFixed(1)}K` : String(n));

/** Columns over time or over ordered buckets. Values on the columns when there are few, on the highest one otherwise. */
export function Columns({ data, unit, xTitle, hue = 'marigold', labelEvery, empty }: {
  data: readonly BarDatum[];
  /** What is counted, singular and plural: ["game", "games"]. */
  unit: readonly [string, string];
  xTitle: string;
  hue?: Hue;
  labelEvery?: number;
  empty: string;
}) {
  const max = Math.max(0, ...data.map((d) => d.value));
  if (max === 0) return <p className={styles.emptyLine}>{empty}</p>;
  const top = niceTop(max);
  const ticks = top % 2 === 0 ? [0, top / 2, top] : [0, top];
  const n = data.length;
  const every = labelEvery ?? (n <= 10 ? 1 : n <= 24 ? 3 : n <= 31 ? 5 : 15);
  const labelAll = n <= 12;
  const endLabel = labelEvery === undefined && n > 10;
  const peak = data.findIndex((d) => d.value === max);
  return (
    <figure className={styles.chart} data-hue={hue}>
      <div className={styles.plotWrap}>
        <div className={styles.yAxis} aria-hidden="true">
          {ticks.map((t) => <span key={t} className={styles.yTick} style={{ bottom: `${(t / top) * 100}%` }}>{compact(t)}</span>)}
        </div>
        <div className={styles.plot}>
          {ticks.slice(1).map((t) => <span key={t} className={styles.gridLine} style={{ bottom: `${(t / top) * 100}%` }} aria-hidden="true" />)}
          <div className={styles.bars} role="list">
            {data.map((d, i) => {
              const text = `${d.full ?? d.label}: ${count(d.value, unit)}`;
              return (
                <div key={i} className={styles.barCol} role="listitem" aria-label={text} tabIndex={0}>
                  {d.value > 0 && (labelAll || i === peak) ? <span className={styles.barValue} aria-hidden="true">{compact(d.value)}</span> : null}
                  <div className={styles.bar} style={{ height: `${(d.value / top) * 100}%` }} />
                  <span className={cx(styles.tip, i < n * 0.25 && n > 3 && styles.tipStart, i >= n * 0.75 && n > 3 && styles.tipEnd)} aria-hidden="true">{text}</span>
                </div>
              );
            })}
          </div>
        </div>
        <div className={styles.xAxis} aria-hidden="true">
          {data.map((d, i) => {
            const isLast = endLabel && i === n - 1;
            const show = isLast || (i % every === 0 && !(endLabel && n - 1 - i < every * 0.6));
            if (!show) return null;
            const isFirst = n > 10 && i === 0;
            return (
              <span key={i} className={cx(styles.xTick, isFirst && styles.xTickStart, isLast && styles.xTickEnd, !isLast && Math.ceil(n / every) > 5 && (i / every) % 2 === 1 && styles.xTickAlt)}
                style={{ left: isFirst ? 0 : isLast ? '100%' : `${((i + 0.5) / n) * 100}%` }}>
                {d.label}
              </span>
            );
          })}
        </div>
        <div className={styles.axisTitle} aria-hidden="true">{xTitle}</div>
      </div>
    </figure>
  );
}

export interface RankItem { label: string; note?: string; value: number; extra?: string }

/** Ranked horizontal bars: the value and its share of the total written at the end of each row. */
export function Ranked({ items, unit, total, hue = 'marigold', empty, max: cap = 10 }: {
  items: readonly RankItem[];
  unit: readonly [string, string];
  /** What 100% is; default: the sum of the items. Pass 0 to leave shares out. */
  total?: number;
  hue?: Hue;
  empty: string;
  max?: number;
}) {
  const shown = items.slice(0, cap);
  if (!shown.length || shown.every((i) => i.value === 0)) return <p className={styles.emptyLine}>{empty}</p>;
  const top = Math.max(...shown.map((i) => i.value));
  const whole = total ?? items.reduce((a, i) => a + i.value, 0);
  return (
    <ol className={styles.rank} data-hue={hue}>
      {shown.map((it, i) => (
        <li key={`${it.label}-${i}`} className={styles.rankRow} title={`${it.label}: ${count(it.value, unit)}`}>
          <span className={styles.rankLabel}>{it.label}{it.note ? <small> · {it.note}</small> : null}</span>
          <span className={styles.rankValue}>
            {num(it.value)}
            <span className="visually-hidden"> {it.value === 1 ? unit[0] : unit[1]}</span>
            {whole > 0 ? <small>{((it.value / whole) * 100).toFixed(it.value / whole < 0.1 ? 1 : 0)}%</small> : null}
            {it.extra ? <small>{it.extra}</small> : null}
          </span>
          <span className={styles.rankTrack} aria-hidden="true">
            <span className={styles.rankBar} style={{ width: `${(it.value / top) * 100}%` }} />
          </span>
        </li>
      ))}
    </ol>
  );
}

const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const hour12 = (h: number): string => `${h % 12 === 0 ? 12 : h % 12}${h < 12 ? 'a' : 'p'}`;
const hourFull = (h: number): string => `${h % 12 === 0 ? 12 : h % 12} ${h < 12 ? 'am' : 'pm'}`;

/** Weekday × hour of day (India time). One hue from faint to strong; exact numbers in the tooltip and the table view. */
export function Heatmap({ cells, unit, hue = 'marigold', empty }: { cells: readonly (readonly number[])[]; unit: readonly [string, string]; hue?: Hue; empty: string }) {
  const max = Math.max(0, ...cells.flat());
  if (max === 0) return <p className={styles.emptyLine}>{empty}</p>;
  return (
    <figure className={styles.chart} data-hue={hue}>
      <div className={styles.heat}>
        {cells.map((row, d) => (
          <div key={d} style={{ display: 'contents' }}>
            <span className={styles.heatLabel}>{DOW[d]}</span>
            {row.map((v, h) => {
              const text = `${DOW[d]} ${hourFull(h)}–${hourFull((h + 1) % 24)}: ${count(v, unit)}`;
              return (
                <span key={h} className={styles.heatCell} role="img" aria-label={text} tabIndex={v > 0 ? 0 : -1}>
                  {v > 0 ? <span className={styles.heatFill} style={{ opacity: 0.18 + 0.82 * (v / max) }} /> : null}
                  <span className={cx(styles.tip, h < 6 && styles.tipStart, h > 17 && styles.tipEnd)} aria-hidden="true">{text}</span>
                </span>
              );
            })}
          </div>
        ))}
        <span />
        {Array.from({ length: 24 }, (_, h) => <span key={h} className={cx(styles.heatLabel, styles.heatHour, h % 3 !== 0 && styles.heatHourAlt)} style={h % 3 === 0 ? undefined : { visibility: 'hidden' }} aria-hidden="true">{hour12(h)}</span>)}
      </div>
      <div className={styles.heatLegend} aria-hidden="true">
        <span>1</span>
        {[0.25, 0.5, 0.75, 1].map((o) => <span key={o} className={styles.heatSwatch} style={{ opacity: 0.18 + 0.82 * o }} />)}
        <span>{num(max)} {max === 1 ? unit[0] : unit[1]} in one hour (IST)</span>
      </div>
    </figure>
  );
}

/** The hour×weekday grid as table rows (for ChartBox's table view and CSV). */
export function heatTable(cells: readonly (readonly number[])[]): { head: string[]; rows: (string | number)[][] } {
  return { head: ['Day (IST)', ...Array.from({ length: 24 }, (_, h) => hourFull(h))], rows: cells.map((row, d) => [DOW[d], ...row]) };
}

export interface FunnelRow { label: string; note?: string; kept: number; any: number }

/** A funnel: how many visitors are still there at each step, the conversion from the step before, and how many were lost. */
export function FunnelChart({ steps, hue = 'marigold', empty }: { steps: readonly FunnelRow[]; hue?: Hue; empty: string }) {
  const first = steps[0]?.kept ?? 0;
  if (!steps.length || first === 0) return <p className={styles.emptyLine}>{empty}</p>;
  return (
    <ol className={cx(styles.funnel, styles.chart)} data-hue={hue}>
      {steps.map((s, i) => {
        const prev = i > 0 ? steps[i - 1].kept : null;
        const lost = prev !== null ? prev - s.kept : 0;
        return (
          <li key={s.label}>
            {prev !== null ? (
              <div className={styles.funnelStep} style={{ padding: 0 }}>
                <span />
                <span className={styles.funnelDrop}>
                  <span><b>{prev > 0 ? `${((s.kept / prev) * 100).toFixed(0)}%` : '—'}</b> went on</span>
                  <span>· {num(lost)} left here</span>
                </span>
              </div>
            ) : null}
            <div className={styles.funnelStep} title={`${s.label}: ${num(s.kept)} visitors reached this step in order; ${num(s.any)} did this step at all`}>
              <span className={styles.funnelNo} aria-hidden="true">{i + 1}</span>
              <span className={styles.funnelName}>{s.label}{s.note ? <small>{s.note}</small> : null}</span>
              <span className={styles.funnelTrack} aria-hidden="true"><span className={styles.funnelBar} style={{ width: `${(s.kept / first) * 100}%` }} /></span>
              <span className={styles.funnelCount}>{num(s.kept)}<small>{((s.kept / first) * 100).toFixed(0)}% of step 1</small></span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
