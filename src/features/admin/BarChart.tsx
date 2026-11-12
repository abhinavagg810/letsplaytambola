import { cx } from '@/components/cx';
import styles from './admin.module.css';

export interface BarDatum {
  /** Short label for the axis ("12 Nov", "9 pm"). */
  label: string;
  /** Full label for the tooltip and the data table ("12 Nov 2026"). */
  full?: string;
  value: number;
}

export interface BarChartProps {
  data: readonly BarDatum[];
  /** What is counted, singular and plural: ["game", "games"]. */
  unit: readonly [string, string];
  /** Title of the x axis ("Day (IST)"). */
  xTitle: string;
  /** Caption of the hidden data table. */
  caption: string;
  /** One hue per chart: marigold (default) or teal. */
  hue?: 'marigold' | 'teal';
  /** Show an axis label on every n-th bar (default: chosen from the number of bars). */
  labelEvery?: number;
  /** Shown instead of the chart when every value is 0. */
  empty: string;
}

/** A round number at or above `max` for the top of the y axis (1, 2, 4, 5, 10, 20, 40, 50, 100 …). */
export function niceTop(max: number): number {
  if (max <= 1) return 1;
  const pow = 10 ** Math.floor(Math.log10(max));
  for (const m of [1, 2, 4, 5, 10]) if (m * pow >= max) return m * pow;
  return 10 * pow;
}

const count = (n: number, unit: readonly [string, string]): string => `${n} ${n === 1 ? unit[0] : unit[1]}`;

/**
 * A plain HTML/CSS bar chart: zero baseline, labelled axes, values written on the bars
 * (every bar when there are few, the highest one otherwise), a tooltip per bar, and the same
 * numbers as a visually hidden table for screen readers.
 */
export function BarChart({ data, unit, xTitle, caption, hue = 'marigold', labelEvery, empty }: BarChartProps) {
  const max = Math.max(0, ...data.map((d) => d.value));
  if (max === 0) return <p className={styles.empty}>{empty}</p>;
  const top = niceTop(max);
  const ticks = top % 2 === 0 ? [0, top / 2, top] : [0, top];
  const n = data.length;
  const every = labelEvery ?? (n <= 10 ? 1 : n <= 24 ? 3 : n <= 31 ? 5 : 15);
  const labelAll = n <= 10;
  const endLabel = labelEvery === undefined && n > 10;
  const peak = data.findIndex((d) => d.value === max);
  const gap = n > 40 ? 1 : n > 14 ? 2 : 8;
  return (
    <figure className={cx(styles.chart, hue === 'teal' && styles.chartTeal)}>
      <div className={styles.plotWrap}>
        <div className={styles.yAxis} aria-hidden="true">
          {ticks.map((t) => (
            <span key={t} className={styles.yTick} style={{ bottom: `${(t / top) * 100}%` }}>{t}</span>
          ))}
        </div>
        <div className={styles.plot}>
          {ticks.slice(1).map((t) => (
            <span key={t} className={styles.gridLine} style={{ bottom: `${(t / top) * 100}%` }} aria-hidden="true" />
          ))}
          <div className={styles.bars} style={{ ['--bar-gap' as string]: `${gap}px` }}>
            {data.map((d, i) => {
              const text = `${d.full ?? d.label}: ${count(d.value, unit)}`;
              return (
                <div key={i} className={styles.barCol} role="img" aria-label={text} tabIndex={-1}>
                  {d.value > 0 && (labelAll || i === peak) ? <span className={styles.barValue} aria-hidden="true">{d.value}</span> : null}
                  <div className={styles.bar} style={{ height: `${(d.value / top) * 100}%`, borderRadius: n > 40 ? '2px 2px 0 0' : undefined }} />
                  <span className={cx(styles.tip, i < n * 0.2 && n > 3 && styles.tipStart, i >= n * 0.8 && n > 3 && styles.tipEnd)} aria-hidden="true">{text}</span>
                </div>
              );
            })}
          </div>
        </div>
        <div className={styles.xAxis} aria-hidden="true">
          {data.map((d, i) => {
            // Many bars: label every n-th one, and always the last (the newest day), dropping a label that would touch it.
            const isLast = endLabel && i === n - 1;
            const show = isLast || (i % every === 0 && !(endLabel && n - 1 - i < every * 0.6));
            if (!show) return null;
            const isFirst = n > 10 && i === 0;
            return (
              <span
                key={i}
                className={cx(styles.xTick, isFirst && styles.xTickStart, isLast && styles.xTickEnd, !isLast && Math.ceil(n / every) > 5 && (i / every) % 2 === 1 && styles.xTickAlt)}
                style={{ left: isFirst ? 0 : isLast ? '100%' : `${((i + 0.5) / n) * 100}%` }}
              >
                {d.label}
              </span>
            );
          })}
        </div>
        <div className={styles.axisTitle} aria-hidden="true">{xTitle}</div>
      </div>
      {/* The wrapper is what is hidden: a table itself ignores the 1px width and would widen the page. */}
      <div className="visually-hidden">
      <table>
        <caption>{caption}</caption>
        <thead>
          <tr>
            <th scope="col">{xTitle}</th>
            <th scope="col">{unit[1]}</th>
          </tr>
        </thead>
        <tbody>
          {data.map((d, i) => (
            <tr key={i}>
              <th scope="row">{d.full ?? d.label}</th>
              <td>{d.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </figure>
  );
}

/** A ranked list with one bar per row and the count written at its end. */
export function RankList({ items, unit, empty }: { items: readonly { label: string; count: number }[]; unit: readonly [string, string]; empty: string }) {
  if (!items.length) return <p className={styles.empty}>{empty}</p>;
  const max = Math.max(...items.map((i) => i.count));
  return (
    <ol className={styles.rank}>
      {items.map((it) => (
        <li key={it.label} className={styles.rankRow} title={`${it.label}: ${count(it.count, unit)}`}>
          <span className={styles.rankLabel}>{it.label}</span>
          <span className={styles.rankTrack} aria-hidden="true">
            <span className={styles.rankBar} style={{ display: 'block', width: `${(it.count / max) * 100}%` }} />
          </span>
          <span className={styles.rankValue}>
            {it.count}
            <span className="visually-hidden"> {it.count === 1 ? unit[0] : unit[1]}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}
