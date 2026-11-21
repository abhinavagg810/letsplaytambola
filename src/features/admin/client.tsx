'use client';
// Small interactive pieces of the admin pages.
import { useRouter } from 'next/navigation';
import { useEffect, useId, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { cx } from '@/components/cx';
import styles from './ui.module.css';

export type Cell = string | number | null;
export interface TableData { head: string[]; rows: Cell[][] }

/** One CSV cell; text a spreadsheet could read as a formula is defused with a leading quote mark (as on the server). */
function csvCell(v: Cell): string {
  if (v === null || v === undefined) return '';
  let s = String(v);
  if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function download(table: TableData, file: string): void {
  const text = [table.head, ...table.rows].map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = file.endsWith('.csv') ? file : `${file}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Downloads the numbers of a chart or small table as a CSV file, made in the browser from what is on the page. */
export function CsvButton({ table, file, label = 'CSV' }: { table: TableData; file: string; label?: string }) {
  return (
    <button type="button" className={styles.miniBtn} onClick={() => download(table, file)} disabled={table.rows.length === 0} aria-label={`Download ${file} as CSV`}>
      {label}
    </button>
  );
}

export function PlainTable({ table, numeric }: { table: TableData; numeric?: number[] }) {
  const isNum = (i: number, v: Cell): boolean => (numeric ? numeric.includes(i) : typeof v === 'number');
  return (
    <div className={styles.tableScroll}>
      <table className={styles.table}>
        <thead>
          <tr>{table.head.map((h, i) => <th key={i} scope="col" className={isNum(i, table.rows[0]?.[i] ?? null) ? styles.num : undefined}>{h}</th>)}</tr>
        </thead>
        <tbody>
          {table.rows.map((r, ri) => (
            <tr key={ri}>
              {r.map((c, i) => (i === 0 ? <th key={i} scope="row">{c ?? '—'}</th> : <td key={i} className={isNum(i, c) ? styles.num : undefined}>{typeof c === 'number' ? c.toLocaleString('en-IN') : c ?? '—'}</td>))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * A panel around a chart: title, what it counts, a Chart / Table switch and a CSV download of the same numbers.
 * The table is the accessible twin of the chart — every value the chart shows is in it.
 */
export function ChartBox({ title, sub, table, file, children, footer, wide }: { title: string; sub?: ReactNode; table: TableData; file: string; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  const [view, setView] = useState<'chart' | 'table'>('chart');
  const id = useId();
  return (
    <section className={cx(styles.panel, wide && styles.span2)} aria-labelledby={id}>
      <div className={styles.panelHead}>
        <div className={styles.panelTitles}>
          <h2 id={id} className={styles.panelTitle}>{title}</h2>
          {sub ? <p className={styles.panelSub}>{sub}</p> : null}
        </div>
        <div className={styles.panelTools} data-noprint>
          <div className={styles.viewSwitch} role="group" aria-label={`Show ${title} as`}>
            <button type="button" aria-pressed={view === 'chart'} onClick={() => setView('chart')}>Chart</button>
            <button type="button" aria-pressed={view === 'table'} onClick={() => setView('table')}>Table</button>
          </div>
          <CsvButton table={table} file={file} />
        </div>
      </div>
      <div hidden={view !== 'chart'}>{children}</div>
      {view === 'table' ? (table.rows.length ? <PlainTable table={table} /> : <p className={styles.emptyLine}>Nothing to list for this period.</p>) : null}
      {/* On paper the table is of more use than a hover: print both. */}
      {view === 'chart' && table.rows.length ? <div className={styles.printOnly}><PlainTable table={table} /></div> : null}
      {footer}
    </section>
  );
}

/** A code, an id or an IP address with a button that copies it. */
export function Copy({ text, children, mono = true }: { text: string; children?: ReactNode; mono?: boolean }) {
  const [done, setDone] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch { /* nothing more to try */ }
      ta.remove();
    }
    setDone(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setDone(false), 1500);
  };
  return (
    <span className={styles.copy}>
      <span className={mono ? styles.mono : undefined}>{children ?? text}</span>
      <button type="button" className={styles.copyBtn} onClick={copy} aria-label={done ? 'Copied' : `Copy ${text}`} title={done ? 'Copied' : 'Copy'}>
        <svg viewBox="0 0 20 20" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          {done ? <path d="M4 10.5l4 4 8-9" /> : <path d="M7 7V4h9v9h-3M4 7h9v9H4z" />}
        </svg>
        <span className="visually-hidden" role="status">{done ? 'Copied' : ''}</span>
      </button>
    </span>
  );
}

/**
 * Show / hide columns of the table with id `tableId`. Columns are marked with data-col="key" on their th and td.
 * The choice is remembered in this browser.
 */
export function ColumnPicker({ tableId, columns, storageKey }: { tableId: string; columns: { key: string; label: string; off?: boolean }[]; storageKey: string }) {
  const [hidden, setHidden] = useState<string[]>(() => columns.filter((c) => c.off).map((c) => c.key));
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(storageKey);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- read once after hydration: the server cannot know this browser's choice
      if (saved) setHidden((JSON.parse(saved) as string[]).filter((k) => columns.some((c) => c.key === k)));
    } catch {
      // keep the defaults
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);
  const toggle = (key: string) => {
    setHidden((h) => {
      const next = h.includes(key) ? h.filter((k) => k !== key) : [...h, key];
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {
        // not remembered
      }
      return next;
    });
  };
  const css = hidden.map((k) => `#${tableId} [data-col="${k}"]{display:none}`).join('');
  return (
    <details className={styles.colPicker} data-noprint>
      <summary className={styles.miniBtn}>Columns{hidden.length ? ` (${columns.length - hidden.length}/${columns.length})` : ''}</summary>
      <div className={styles.colMenu}>
        {columns.map((c) => (
          <label key={c.key} className={styles.colItem}>
            <input type="checkbox" checked={!hidden.includes(c.key)} onChange={() => toggle(c.key)} />
            {c.label}
          </label>
        ))}
      </div>
      {css ? <style>{css}</style> : null}
    </details>
  );
}

interface EraseResult { found: boolean; devices: number; ips: number; events: number; participations: number; games: number; activeGames: number }

/** "Erase a device": type (or arrive with) a short device id, confirm in a dialog, POST to /api/admin/erase. */
export function EraseForm({ initial = '' }: { initial?: string }) {
  const router = useRouter();
  const [id, setId] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<(EraseResult & { id: string }) | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const clean = id.trim().toLowerCase();
  const valid = /^[0-9a-f]{8}$/.test(clean);

  const ask = (e: React.FormEvent) => {
    e.preventDefault();
    setError(valid ? '' : 'A device id is 8 characters: digits and the letters a to f.');
    if (valid) dialog.current?.showModal();
  };
  const erase = async () => {
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/admin/erase', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ device: clean }), cache: 'no-store' });
      const data = (await res.json().catch(() => null)) as { ok?: boolean; error?: string; result?: EraseResult } | null;
      if (res.ok && data?.ok && data.result) {
        setResult({ ...data.result, id: clean });
        setId('');
        router.refresh();
      } else setError(data?.error || 'Something went wrong — nothing was erased');
    } catch {
      setError('Could not reach the server — nothing was erased');
    }
    setBusy(false);
    dialog.current?.close();
  };

  return (
    <>
      <form className={styles.eraseForm} onSubmit={ask} noValidate>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>Device id</span>
          <input className={cx(styles.control, styles.mono)} name="device" value={id} onChange={(e) => setId(e.target.value)} placeholder="e.g. 3fa9c1d2" maxLength={8} autoComplete="off" autoCapitalize="none" spellCheck={false} aria-describedby="erase-help" aria-invalid={error ? true : undefined} />
        </label>
        <button type="submit" className={styles.dangerBtn} disabled={busy || !clean}>Erase this device…</button>
      </form>
      <p id="erase-help" className={styles.hint}>The id is the 8-character code shown in the Players table and on a player’s page.</p>
      <p className={styles.formError} role="alert">{error}</p>
      {result ? (
        <p className={styles.formOk} role="status">
          {result.found
            ? <>Erased device <b className={styles.mono}>{result.id}</b>: {result.devices} device row, {result.ips} IP address{result.ips === 1 ? '' : 'es'}, {result.events} event{result.events === 1 ? '' : 's'}, {result.participations} game record{result.participations === 1 ? '' : 's'}; names replaced in {result.games} game{result.games === 1 ? '' : 's'}.{result.activeGames ? ` ${result.activeGames} of those ${result.activeGames === 1 ? 'is' : 'are'} still being played and keep${result.activeGames === 1 ? 's' : ''} the seat until ${result.activeGames === 1 ? 'it expires' : 'they expire'} — erase again after 24 hours to cut that last link.` : ''}</>
            : <>Nothing is stored for device <b className={styles.mono}>{result.id}</b>. (This check is in the audit list below.)</>}
        </p>
      ) : null}
      <dialog ref={dialog} className={styles.dialog} aria-labelledby="erase-title">
        <h2 id="erase-title" className={styles.dialogTitle}>Erase device <span className={styles.mono}>{clean}</span>?</h2>
        <p>This deletes its device row, every IP address and event recorded for it, and its place and device details in games. The names it typed are replaced with “Erased player” in stored game summaries.</p>
        <p><b>This cannot be undone.</b></p>
        <div className={styles.dialogActions}>
          <button type="button" className={styles.btn} onClick={() => dialog.current?.close()} disabled={busy} autoFocus>Cancel</button>
          <button type="button" className={styles.dangerBtn} onClick={erase} disabled={busy}>{busy ? 'Erasing…' : 'Erase for good'}</button>
        </div>
      </dialog>
    </>
  );
}
