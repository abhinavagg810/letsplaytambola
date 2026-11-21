#!/usr/bin/env node
// End-to-end suite runner: plain Node + Playwright against a RUNNING server.
//
//   npm run build && npx next start -p 3000        (in one terminal)
//   BASE_URL=http://localhost:3000 npm run e2e     (in another)
//
//   npm run e2e -- live            only spec files whose name contains "live"
//   npm run e2e -- LIVE-03 CLM-    only cases whose id starts with one of these
//
// Environment: BASE_URL (default http://localhost:3000) · E2E_PARALLEL spec files at once (default 3) ·
// E2E_SPECS extra folder of *.spec.mjs · E2E_OUT folder for results.json and screenshots (default e2e/.results) ·
// E2E_HEADED=1 to watch. Exits 1 if any case fails.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { BASE, Failure, loadPlaywright, newDevice } from './lib.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(process.env.E2E_OUT || path.join(here, '.results'));
const PARALLEL = Math.max(1, Number(process.env.E2E_PARALLEL) || 3);
const CASE_TIMEOUT_MS = Number(process.env.E2E_TIMEOUT_MS) || 180_000;
const filters = process.argv.slice(2);
const fileFilters = filters.filter((f) => !/^[A-Z0-9]+-/.test(f));
const idFilters = filters.filter((f) => /^[A-Z0-9]+-/.test(f));

let playwright;
try {
  playwright = loadPlaywright();
} catch (e) {
  console.error(String(e.message || e));
  process.exit(2);
}

try {
  const ping = await fetch(BASE + '/robots.txt');
  if (!ping.ok) throw new Error(`HTTP ${ping.status}`);
} catch (e) {
  console.error(`No server answering at ${BASE} (${e.message}).\nStart one first:  npm run build && npx next start -p 3000   then   BASE_URL=http://localhost:3000 npm run e2e`);
  process.exit(2);
}

const specDirs = [path.join(here, 'specs'), ...(process.env.E2E_SPECS ? [path.resolve(process.env.E2E_SPECS)] : [])];
const files = specDirs
  .flatMap((d) => fs.readdirSync(d).filter((f) => f.endsWith('.spec.mjs')).sort().map((f) => path.join(d, f)))
  ;
const fileWanted = (f) => fileFilters.some((x) => path.basename(f).includes(x));

fs.mkdirSync(OUT, { recursive: true });
const browser = await playwright.chromium.launch({ headless: process.env.E2E_HEADED !== '1' });
const results = [];
const started = Date.now();

async function runCase(file, c) {
  const pages = [];
  const notes = [];
  const evidence = [];
  const openIssues = [];
  const t = {
    browser,
    playwright,
    /** A new device (own storage and token). Closed automatically when the case ends. */
    device: async (kind = 'android', extra = {}) => {
      const page = await newDevice(browser, kind, extra);
      pages.push(page);
      return page;
    },
    /** A problem that is known, reported and waiting for a decision: the case is recorded as "failed-open" without failing the run. */
    open: (text) => openIssues.push(String(text)),
    /** Write down what was actually observed (goes into the results file). */
    note: (text) => notes.push(String(text)),
    /** Keep a screenshot as evidence. */
    shot: async (page, name, opts = {}) => {
      const file = path.join(OUT, `${c.id}-${name}.png`);
      await page.screenshot({ path: file, ...opts });
      evidence.push(file);
      return file;
    },
  };
  const t0 = Date.now();
  let status = 'passed';
  let error = null;
  let timer;
  try {
    await Promise.race([
      c.run(t),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Failure(`case timed out after ${CASE_TIMEOUT_MS / 1000}s`)), CASE_TIMEOUT_MS); }),
    ]);
  } catch (e) {
    status = 'failed';
    error = e instanceof Failure ? e.message : String(e && e.stack ? e.stack.split('\n').slice(0, 16).join('\n') : e);
    let i = 0;
    for (const p of pages) {
      try {
        const f = path.join(OUT, `${c.id}-FAILED-${i++}.png`);
        await p.screenshot({ path: f });
        evidence.push(f);
      } catch {
        // page already closed
      }
    }
  } finally {
    clearTimeout(timer);
    for (const p of pages) await p.context().close().catch(() => undefined);
  }
  const meta = Object.fromEntries(Object.entries(c).filter(([k]) => k !== 'run'));
  if (status === 'passed' && openIssues.length) status = 'failed-open';
  const r = { ...meta, file: path.basename(file), status, ms: Date.now() - t0, error, notes, open: openIssues, evidence };
  results.push(r);
  console.log(`${status === 'passed' ? 'ok  ' : status === 'failed-open' ? 'OPEN' : 'FAIL'} ${c.id.padEnd(9)} ${c.title}  (${r.ms} ms)${error ? `\n       ${error.replace(/\n/g, '\n       ')}` : ''}${openIssues.map((o) => `\n       known, open: ${o}`).join('')}`);
}

async function runFile(file) {
  const mod = await import(pathToFileURL(file).href);
  for (const c of mod.default) {
    // No filter = everything; otherwise a case runs when its file or its id was asked for.
    if (filters.length && !fileWanted(file) && !idFilters.some((p) => c.id.startsWith(p))) continue;
    await runCase(file, c);
  }
}

const queue = [...files];
await Promise.all(Array.from({ length: Math.min(PARALLEL, queue.length || 1) }, async () => {
  for (let f = queue.shift(); f; f = queue.shift()) await runFile(f);
}));
await browser.close();

results.sort((a, b) => a.id.localeCompare(b.id, 'en', { numeric: true }));
const ids = results.map((r) => r.id);
const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify({ base: BASE, at: new Date().toISOString(), results }, null, 1));
const failed = results.filter((r) => r.status === 'failed');
const stillOpen = results.filter((r) => r.status === 'failed-open');
console.log(`\n${results.length} cases · ${results.length - failed.length - stillOpen.length} passed · ${stillOpen.length} with known open findings · ${failed.length} failed · ${Math.round((Date.now() - started) / 1000)} s · results: ${path.join(OUT, 'results.json')}`);
if (dupes.length) console.log(`WARNING: duplicate case ids: ${[...new Set(dupes)].join(', ')}`);
if (failed.length) console.log('Failed: ' + failed.map((r) => r.id).join(', '));
process.exit(failed.length || dupes.length ? 1 : 0);
