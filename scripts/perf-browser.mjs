/**
 * The grid's time and DOM budgets in Chrome (§5.3, docs/phase-2-plan.md §4):
 * `npm run bench:browser`. One headless Chrome, closed in finally; dataset A
 * at 1 280 × 720; medians of 5 page loads. Budgets in perf/browser-budgets.json;
 * exits 1 when a line is over. Headless on a fast machine, the numbers are
 * indicative: K.8's figures are owed on a mid-range laptop, headed.
 * `-- --only tree`: the million-row tree alone (Phase 4 step 6, with its pinned parents); it runs last in a full run.
 * `-- --only range-b`: dataset B's editing gestures (Phase 5 step 12), indicative, no budget (Q17d, S12-Q7); never in a full run.
 * `-- --only features`: the lines of Phase 11 L3 alone (the §5.3 lines left « not measured » since Phase 3 and the later
 * features: grouping, a 10 000-row group opened, the pivot, typing in the floating row, a 20 000-value list, print, the
 * infinite and server-side scrolls, server C's answer to the rows painted, `<dz-grid>` with templated cells).
 * `-- --cpu 4` (ARCHITECTURE §5.4, Phase 11 L3): every page's CPU slowed 4× (CDP `Emulation.setCPUThrottlingRate`),
 * checked against `perf/browser-budgets-4x.json` (§5.3 targets × 3, no frame over 100 ms). `-- --json <file>` saves
 * the lines read.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { serve, browser, median, percentile } from '../spikes/kit.mjs';
import { buildFixture } from '../packages/angular/browser/build.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const arg = (k) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : null);
/** The CPU slowdown (§5.4): 1 (none) or 4, the low-end profile; its own budget file. */
const cpu = Number(arg('--cpu') ?? 1);
if (cpu !== 1 && cpu !== 4) throw new Error(`--cpu takes 1 or 4, not ${arg('--cpu')}`);
const budgetFile = `${ROOT}perf/${cpu === 1 ? 'browser-budgets.json' : `browser-budgets-${cpu}x.json`}`;
const budgets = existsSync(budgetFile) ? JSON.parse(readFileSync(budgetFile, 'utf8')).budgets : {};
// Step 25 lines: the audit screen's server (C) and the CSV of A load tzslot through audit.html's
// importmap (bundled once, as test:audit does); `<dz-grid>` runs on the Angular fixture's `?a=1`
// page, built here (AOT, minified; `npm run build` first).
await build({ entryPoints: { dom: '@tzslot/dom', core: '@tzslot/core', 'dom-lazy': '@tzslot/dom/lazy', 'core-lazy': '@tzslot/core/lazy' }, bundle: true, splitting: true, format: 'esm', outdir: `${ROOT}node_modules/.cache/dzgrid-browser`, absWorkingDir: ROOT, logLevel: 'error' });
const only = arg('--only');
if (!only || only === 'features') await buildFixture();
// Minified, as a consumer ships it: never measure unminified code (§5.4).
const site = await serve(import.meta.url, { minify: true });
const lines = [];
let open = null;
process.on('SIGINT', async () => { await open?.close().catch(() => {}); await site.close(); process.exit(130); });

const line = (name, value, unit, better = 'lower') => {
  const budget = budgets[name];
  const ok = budget === undefined || (better === 'lower' ? value <= budget : value >= budget);
  lines.push({ name, value, unit, ok });
  console.log(`${ok ? 'ok  ' : 'OVER'} ${name}: ${Number.isInteger(value) ? value : value.toFixed(1)} ${unit} (budget ${budget ?? '—'})`);
};

async function page(b, n) {
  const pg = await b.newPage({ viewport: { width: 1300, height: 760 } });
  const errors = [];
  pg.on('pageerror', (e) => errors.push(e.message));
  await pg.goto(site.root('packages/dom/test/browser/perf.html'));
  await pg.waitForFunction(() => window.ready, null, { timeout: 30000 });
  await pg.evaluate((n) => window.p.prepare(n), n);
  return { pg, errors };
}

const b = await browser('chrome');
open = b;
const chrome = b.version();
// Every page of the run slowed alike: the throttle set on the page's own target, before it loads anything (it holds
// across the page's navigations, checked below by a fixed loop).
const newPage = b.newPage.bind(b);
b.newPage = async (o) => {
  const pg = await newPage(o);
  if (cpu !== 1) await (await pg.context().newCDPSession(pg)).send('Emulation.setCPUThrottlingRate', { rate: cpu });
  return pg;
};
/** In-page: `step` px a frame on the grid's scroller for `frames` frames; the frame deltas (as `perf.ts`'s `scroll`). */
const scrollFrames = (pg, step, frames, axis = 'block') => pg.evaluate(async ([step, frames, axis]) => {
  const vp = document.querySelector('.dzg-viewport');
  const deltas = [];
  let last = performance.now();
  for (let f = 0; f < frames; f++) {
    if (axis === 'block') vp.scrollTop += step;
    else vp.scrollLeft += step;
    await new Promise((r) => requestAnimationFrame(r));
    const now = performance.now();
    deltas.push(now - last);
    last = now;
  }
  return deltas;
}, [step, frames, axis]);
const frameLines = (name, deltas) => {
  const d = deltas.slice(2);
  line(`${name}: median frame`, median(d), 'ms');
  line(`${name}: p95 frame`, percentile(d, 95), 'ms');
  line(`${name}: longest frame`, Math.max(...d), 'ms');
};
console.log(`       CPU ${cpu}× (${cpu === 1 ? 'no throttle' : 'Emulation.setCPUThrottlingRate'}), budgets ${budgetFile.slice(ROOT.length)}`);
try {
  {
    // The throttle seen by the page: a fixed loop's time (printed; about cpu × the 1× figure).
    const pg = await b.newPage();
    await pg.goto(site.root('packages/dom/test/browser/perf.html'));
    const loop = await pg.evaluate(() => { const t0 = performance.now(); let x = 0; for (let i = 0; i < 2e7; i++) x = (x + i * 7) % 1000003; return [performance.now() - t0, x]; });
    console.log(`       a fixed loop (2·10⁷ steps) after the page's navigation: ${loop[0].toFixed(0)} ms`);
    await pg.close();
  }
  if (!only) {
    // ---- step 15: the set filter's popup with 2 000 values (first, so nothing before it warms it) ----
    {
      const { pg, errors } = await page(b, 100_000);
      const r = await pg.evaluate(() => window.p.setOpen());
      line('set filter: first open with 2 000 values (chunk, cold index) to the next frame', r.first, 'ms');
      line('set filter: open with 2 000 values (script)', r.script, 'ms');
      line('set filter: open with 2 000 values to the next frame', r.frame, 'ms');
      line('set filter: options drawn', r.options, 'options');
      line('set filter: page errors', errors.length, 'errors');
      await pg.close();
    }

    // ---- first render of A, and body nodes: five loads ----
    const firsts = [];
    let nodes = 0;
    for (let k = 0; k < 5; k++) {
      const { pg } = await page(b, 100_000);
      firsts.push(await pg.evaluate(() => window.p.firstRender()));
      nodes = await pg.evaluate(() => window.p.bodyNodes());
      await pg.close();
    }
    line('first render of A', median(firsts), 'ms');
    line('body nodes after first render', nodes, 'nodes');

    // ---- scrolling, transactions, sort, on one page ----
    {
      const { pg, errors } = await page(b, 100_000);
      await pg.evaluate(() => window.p.firstRender());
      const cdp = await pg.context().newCDPSession(pg);
      await cdp.send('Performance.enable');
      const metric = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]));
      for (const [name, axis, step, frames] of [['wheel scroll 50 px a frame', 'block', 50, 300], ['scrollbar drag 2 000 px a frame', 'block', 2000, 120], ['horizontal scroll 50 px a frame', 'inline', 50, 60]]) {
        const before = await metric();
        const r = await pg.evaluate(([axis, step, frames]) => window.p.scroll(axis, step, frames), [axis, step, frames]);
        const after = await metric();
        const d = r.deltas.slice(2);
        line(`${name}: median frame`, median(d), 'ms');
        line(`${name}: p95 frame`, percentile(d, 95), 'ms');
        line(`${name}: longest frame`, Math.max(...d), 'ms');
        line(`${name}: script per frame`, ((after.ScriptDuration - before.ScriptDuration) * 1000) / frames, 'ms');
        line(`${name}: layouts per frame`, (after.LayoutCount - before.LayoutCount) / frames, 'layouts');
        line(`${name}: frames without rows`, await pg.evaluate(([axis, step]) => window.p.coverage(axis, step, 60), [axis, step]), '%');
      }
      const tx = await pg.evaluate(() => window.p.transaction());
      line('one-row transaction to the next frame', tx.ms, 'ms');
      line('one-row transaction: rows touched', tx.touchedRows, 'rows');
      const sorts = [];
      for (let k = 0; k < 5; k++) sorts.push(await pg.evaluate(() => window.p.sortClick()));
      line('sort click on 100 000 (numeric, warm): sort and events', median(sorts.map((s) => s.model)), 'ms');
      line('sort click on 100 000 (numeric, warm) to the next frame', median(sorts.map((s) => s.frame)), 'ms');
      line('page errors', errors.length, 'errors');
      // ---- 1 000 create/destroy cycles: heap retained ----
      await pg.evaluate(() => window.p.destroy());
      await cdp.send('HeapProfiler.collectGarbage');
      const h0 = (await cdp.send('Runtime.getHeapUsage')).usedSize;
      await pg.evaluate(() => window.p.cycles(1000));
      await cdp.send('HeapProfiler.collectGarbage');
      const h1 = (await cdp.send('Runtime.getHeapUsage')).usedSize;
      line('1 000 create/destroy cycles: heap retained', (h1 - h0) / 1024 / 1024, 'MB');
      await pg.close();
    }

    // ---- step 25 (phase-3-plan §4): "next" to fetch on the server (C: 10⁷ rows, total unknown) ----
    {
      const pg = await b.newPage({ viewport: { width: 1300, height: 760 } });
      const errors = [];
      pg.on('pageerror', (e) => errors.push(e.message));
      await pg.goto(site.root('packages/dom/test/browser/audit.html'));
      await pg.waitForFunction(() => window.ready, null, { timeout: 30000 });
      await pg.evaluate(() => window.audit.mount({ config: 'server', lang: 'fr' }));
      const settle = () => pg.evaluate(async () => {
        for (let k = 0; k < 5; k++) {
          const s = window.audit.server;
          for (const e of s.pending()) s.release(e.seq);
          await new Promise((r) => requestAnimationFrame(r));
        }
      });
      await settle();
      const nexts = [];
      for (let k = 0; k < 9; k++) {
        // The fake server logs a request when the grid calls its `fetch`: the click to that call.
        nexts.push(await pg.evaluate(async () => {
          const log = window.audit.server.log;
          let at = null;
          const push = log.push;
          log.push = function (...a) { at ??= performance.now(); return push.apply(this, a); };
          const t0 = performance.now();
          document.querySelector('.dzg-footer button[data-go="next"]').click();
          await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
          delete log.push;
          return at === null ? Infinity : at - t0;
        }));
        await settle();
      }
      line('"next" click to fetch called (server, C)', median(nexts), 'ms');
      // ---- the CSV of A in the browser (100 000 × 30, all, French; the audit page's bench) ----
      const csv = await pg.evaluate(() => window.audit.exportBench(3));
      if (csv.error) errors.push(`export bench: ${csv.error}`);
      line('CSV export of A in the browser: wall', median(csv.runs?.map((r) => r.wall) ?? [Infinity]), 'ms');
      line('CSV export of A in the browser: longest task', Math.max(...(csv.runs?.map((r) => r.longtask) ?? [Infinity])), 'ms');
      line('CSV export of A in the browser: longest animation frame', Math.max(...(csv.runs?.map((r) => r.loaf) ?? [Infinity])), 'ms');
      line('server and CSV: page errors', errors.length, 'errors');
      await pg.close();
    }

    // ---- step 25: <dz-grid> (the Angular fixture's ?a=1 page, AOT, minified) on dataset A ----
    {
      const ng = async () => {
        // 1 300 × 1 030: the fixture's host is 70 % of the height, about the 720 px of the plan.
        const pg = await b.newPage({ viewport: { width: 1300, height: 1030 } });
        const errors = [];
        pg.on('pageerror', (e) => errors.push(e.message));
        pg.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
        await pg.goto(site.root('packages/angular/browser/build/index.html?a=1'));
        await pg.waitForFunction(() => window.fxReady || window.fxError, null, { timeout: 30000 });
        const boot = await pg.evaluate(() => window.fxError);
        if (boot) throw new Error(boot);
        return { pg, errors };
      };
      const firsts = [];
      const errors = [];
      for (let k = 0; k < 5; k++) {
        const { pg, errors: e } = await ng();
        firsts.push(await pg.evaluate(() => window.fx.firstRender()));
        if ((await pg.evaluate(() => window.fx.bodyRows())) === 0) e.push('no row drawn');
        errors.push(...e);
        await pg.close();
      }
      line('<dz-grid> first render of A', median(firsts), 'ms');
      const { pg, errors: e } = await ng();
      const cdp = await pg.context().newCDPSession(pg);
      await pg.evaluate(() => window.fx.cycles(20));
      await cdp.send('HeapProfiler.collectGarbage');
      const h0 = (await cdp.send('Runtime.getHeapUsage')).usedSize;
      const left = await pg.evaluate(() => window.fx.cycles(1000));
      await cdp.send('HeapProfiler.collectGarbage');
      const h1 = (await cdp.send('Runtime.getHeapUsage')).usedSize;
      if (left !== 0) e.push(`${left} grids left after the cycles`);
      line('<dz-grid> 1 000 create/destroy cycles: heap retained', (h1 - h0) / 1024 / 1024, 'MB');
      errors.push(...e);
      line('<dz-grid>: page errors', errors.length, 'errors');
      if (errors.length) console.log(`       ${JSON.stringify(errors).slice(0, 600)}`);
      await pg.close();
    }

    // ---- a million rows: first render ----
    {
      const { pg } = await page(b, 1_000_000);
      line('first render of 1 000 000 rows', await pg.evaluate(() => window.p.firstRender()), 'ms');
      const r = await pg.evaluate(() => window.p.scroll('block', 50, 120));
      line('1 000 000 rows (scaled), wheel-like scroll: median frame', median(r.deltas.slice(2)), 'ms');
      line('1 000 000 rows (scaled), wheel-like scroll: p95 frame', percentile(r.deltas.slice(2), 95), 'ms');
      line('1 000 000 rows (scaled), wheel-like scroll: longest frame', Math.max(...r.deltas.slice(2)), 'ms');
      line('1 000 000 rows (scaled): frames without rows', await pg.evaluate(() => window.p.coverage('block', 2000, 40)), '%');
      await pg.close();
    }
  }

  // ---- Phase 11 L3: the §5.3 lines « not measured » since Phase 3, and the later features (perf-features.ts) ----
  if (!only || only === 'features') {
    {
      const pg = await b.newPage({ viewport: { width: 1300, height: 760 } });
      const errors = [];
      pg.on('pageerror', (e) => errors.push(e.message));
      await pg.goto(site.root('packages/dom/test/browser/perf-features.html'));
      await pg.waitForFunction(() => window.ready, null, { timeout: 60000 });
      await pg.evaluate(() => window.p.prepare());
      const groups = [];
      for (let k = 0; k < 3; k++) groups.push(await pg.evaluate(() => window.p.group()));
      line('A grouped by 2 columns + 3 aggregations: the grid made, to the second frame (median of 3)', median(groups.map((g) => g.ms)), 'ms');
      const open = await pg.evaluate(() => window.p.openGroup(5));
      console.log(`       a group of ~10 000 opened: ${open.shown} rows shown`);
      line('A grouped by a tenth of n2: a group of ~10 000 rows opened (chevron) to the next frame (median of 5)', open.shown > 9000 ? median(open.ms) : Infinity, 'ms');
      const pivots = [];
      for (let k = 0; k < 3; k++) pivots.push(await pg.evaluate(() => window.p.pivot()));
      console.log(`       pivot: ${pivots[0].columns} header cells drawn`);
      line('pivot A (2 row columns, 2 pivot columns, 3 values): the grid made, to the second frame (median of 3)', median(pivots.map((x) => x.ms)), 'ms');
      // A person's half second between the focus and the first key (the row prepares the text filter then, L3), and at once.
      const typed = await pg.evaluate(() => window.p.typing(500));
      console.log(`       typing: ${typed.ms.map((m) => m.toFixed(1)).join(' / ')} ms; ${typed.narrowed} rows under « ent », ${typed.shown} at the end`);
      line('floating filter (text, debounceMs 0): a keystroke over A to the next frame (median of 6)', typed.narrowed > 0 && typed.narrowed < 100_000 ? median(typed.ms) : Infinity, 'ms');
      line('floating filter (text, debounceMs 0): the first keystroke, 500 ms after the focus, to the next frame', typed.ms[0], 'ms');
      line('floating filter (text, debounceMs 0): the longest keystroke to the next frame', Math.max(...typed.ms), 'ms');
      const rushed = await pg.evaluate(() => window.p.typing(0));
      line('floating filter (text, debounceMs 0): the first keystroke at once after the focus (recorded)', rushed.ms[0], 'ms');
      const set = await pg.evaluate(() => window.p.setList(120));
      console.log(`       value list: ${set.options} options drawn, scrolled ${Math.round(set.scrolled)} px`);
      line('set filter, 20 000 values: a warm open to the options drawn', set.open, 'ms');
      frameLines('set filter, 20 000 values: list scrolled 40 px a frame', set.deltas);
      const prints = [];
      for (let k = 0; k < 3; k++) prints.push(await pg.evaluate(() => window.p.print()));
      console.log(`       print: ${prints.map((x) => `${Math.round(x.ms)} ms, ${x.rows} rows, longest task ${Math.round(x.longtask)}`).join('; ')}`);
      line('print of 5 000 rows of A: preparePrint to the table built (median of 3)', prints.every((x) => x.rows === 5000) ? median(prints.map((x) => x.ms)) : Infinity, 'ms');
      line('print of 5 000 rows of A: the longest animation frame', Math.max(...prints.map((x) => x.loaf)), 'ms');
      line('features: page errors', errors.length, 'errors');
      if (errors.length) console.log(`       ${JSON.stringify(errors).slice(0, 600)}`);
      await pg.close();
    }

    // ---- data set C, infinite (10⁷ rows, 150 ms latency, total known) and server-side groups: wheel-like scroll ----
    for (const [name, path, before] of [
      ['infinite 10⁷ rows (150 ms latency): wheel-like scroll 50 px a frame', 'packages/dom/test/browser/infinite.html', null],
      ['server-side groups (150 ms latency), a fruit of 500 shops open: wheel-like scroll 50 px a frame', 'packages/dom/test/browser/server-groups.html', 'open'],
    ]) {
      const pg = await b.newPage({ viewport: { width: 1300, height: 760 } });
      const errors = [];
      pg.on('pageerror', (e) => errors.push(e.message));
      await pg.goto(site.root(path));
      await pg.waitForFunction(() => window.ready && document.querySelector('.dzg-layer .dzg-row'), null, { timeout: 30000 });
      if (before) {
        await pg.click('.dzg-layer .dzg-row[data-kind=group] .dzg-toggle');
        await pg.waitForFunction(() => document.querySelectorAll('.dzg-layer .dzg-row[aria-level="2"]').length > 5, null, { timeout: 30000 });
      }
      await pg.waitForTimeout(300);
      frameLines(name, await scrollFrames(pg, 50, 300));
      line(`${name}: page errors`, errors.length, 'errors');
      await pg.close();
    }

    // ---- server C (audit screen, 10⁷ rows, total unknown, held answers): an answer released to its rows painted ----
    {
      const pg = await b.newPage({ viewport: { width: 1300, height: 760 } });
      const errors = [];
      pg.on('pageerror', (e) => errors.push(e.message));
      await pg.goto(site.root('packages/dom/test/browser/audit.html'));
      await pg.waitForFunction(() => window.ready, null, { timeout: 30000 });
      await pg.evaluate(() => window.audit.mount({ config: 'server', lang: 'fr' }));
      const settle = () => pg.evaluate(async () => {
        for (let k = 0; k < 5; k++) {
          const s = window.audit.server;
          for (const e of s.pending()) s.release(e.seq);
          await new Promise((r) => requestAnimationFrame(r));
        }
      });
      await settle();
      const cdp = await pg.context().newCDPSession(pg);
      const heap = async () => (await cdp.send('HeapProfiler.collectGarbage'), (await cdp.send('Runtime.getHeapUsage')).usedSize);
      const h0 = await heap();
      const answers = [];
      for (let k = 0; k < 30; k++) {
        // « next », its request held; then the answer released, timed to the frame after the rows were written.
        answers.push(await pg.evaluate(async () => {
          const s = window.audit.server;
          document.querySelector('.dzg-footer button[data-go="next"]').click();
          await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
          // The body's scroller: its row layers (pinned and centre) take the new page's rows.
          let wrote = 0;
          const mo = new MutationObserver(() => { wrote ||= performance.now(); });
          mo.observe(document.querySelector('.dzg-viewport'), { subtree: true, childList: true, characterData: true });
          const t0 = performance.now();
          for (const e of s.pending()) s.release(e.seq);
          // The grid writes in its own frame callback, after this page's: the time to that write (as the transaction line).
          while (!wrote && performance.now() - t0 < 2000) await new Promise((r) => requestAnimationFrame(r));
          mo.disconnect();
          return wrote ? wrote - t0 : Infinity;
        }));
        await settle();
      }
      const h1 = await heap();
      line('server C: an answer (a page) released to its rows written, in the frame that paints them (median of 30)', median(answers), 'ms');
      line('server C: heap growth over 30 page changes (paged model holds one page)', (h1 - h0) / 1024 / 1024, 'MB');
      line('server C: page errors', errors.length, 'errors');
      await pg.close();
    }

    // ---- <dz-grid> on A with three templated columns (an ng-template cell part): scrollbar drag ----
    {
      const pg = await b.newPage({ viewport: { width: 1300, height: 1030 } });
      const errors = [];
      pg.on('pageerror', (e) => errors.push(e.message));
      pg.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
      await pg.goto(site.root('packages/angular/browser/build/index.html?a=1&t=1'));
      await pg.waitForFunction(() => window.fxReady || window.fxError, null, { timeout: 30000 });
      const boot = await pg.evaluate(() => window.fxError);
      if (boot) throw new Error(boot);
      line('<dz-grid> with 3 templated columns: first render of A', await pg.evaluate(() => window.fx.firstRender()), 'ms');
      const views = await pg.evaluate(() => window.fx.templated());
      console.log(`       ${views} template views drawn`);
      frameLines('<dz-grid> with 3 templated columns: scrollbar drag 2 000 px a frame', views > 0 ? await pg.evaluate(() => window.fx.scroll(2000, 120)) : [Infinity, Infinity, Infinity]);
      frameLines('<dz-grid> with 3 templated columns: wheel-like scroll 50 px a frame', await pg.evaluate(() => window.fx.scroll(50, 300)));
      line('<dz-grid> templated: page errors', errors.length, 'errors');
      if (errors.length) console.log(`       ${JSON.stringify(errors).slice(0, 600)}`);
      await pg.close();
    }
  }

  // ---- Phase 5 step 12: dataset B (3 000 × 12) — bulk, paste, fill, Ctrl+D, undo. Indicative (Q17d, S12-Q7): no budget ----
  if (only === 'range-b') {
    const pg = await b.newPage({ viewport: { width: 1300, height: 760 } });
    const errors = [];
    pg.on('pageerror', (e) => errors.push(e.message));
    await pg.goto(site.root('packages/dom/test/browser/perf-range.html'));
    await pg.waitForFunction(() => window.ready, null, { timeout: 30000 });
    const { loadavg } = await import('node:os');
    console.log(`       indicatif (Q17d) — load average ${loadavg().map((x) => x.toFixed(1)).join(' / ')}`);
    for (const [name, fn, expect] of [['bulk B 3 000 × 1 (Ctrl+Enter) to the painted frame', 'bulk', 3000], ['paste 1 000 cells (100 × 10) from the paste event to the painted frame', 'paste', null], ['fill 3 000 (a 2-row series, api.fill) to the painted frame', 'series', 2998], ['Ctrl+D on 3 000 × 12 to the painted frame', 'down', null], ['undo of a bulk 3 000 to the painted frame', 'undo', null]]) {
      const runs = [];
      for (let i = 0; i < 7; i++) {
        await pg.evaluate(() => window.p.make(3000));
        if (fn === 'undo') await pg.evaluate(() => window.p.bulk());
        runs.push(await pg.evaluate((f) => window.p[f](), fn));
      }
      const kept = runs.slice(2);
      line(`range B: ${name} (median of 5)`, median(kept.map((r) => r.ms)), 'ms');
      console.log(`       requests ${kept.map((r) => r.requests).join(',')}; changes ${kept.map((r) => r.changes).join(',')}${expect ? ` (expected ${expect})` : ''}; long tasks > 50 ms ${kept.map((r) => r.long).join(',')}`);
    }
    line('range B: page errors', errors.length, 'errors');
    if (errors.length) console.log(`       ${JSON.stringify(errors).slice(0, 600)}`);
    await pg.close();
  }

  // ---- Phase 4 step 6: the million-row tree (perf/profiles/tree.ts), everything opened ----
  if (!only || only === 'tree') {
    const pg = await b.newPage({ viewport: { width: 1300, height: 760 } });
    const errors = [];
    pg.on('pageerror', (e) => errors.push(e.message));
    await pg.goto(site.root('packages/dom/test/browser/perf-tree.html'));
    await pg.waitForFunction(() => window.ready, null, { timeout: 30000 });
    await pg.evaluate(() => window.p.prepare(1_000_000));
    line('tree 1 000 000: first render (build and paint)', await pg.evaluate(() => window.p.build()), 'ms');
    const all = await pg.evaluate(() => window.p.expandAll());
    line('tree 1 000 000: expand all to the next frame', all.ms, 'ms');
    line('tree 1 000 000: rows shown once all open', all.count, 'rows', 'higher');
    // A 2 s wheel scroll over the open tree: real wheel input (CDP), 100 px every 16 ms, not awaited one
    // by one (Playwright's wheel waits for each, about 50 ms: a slow wheel).
    await pg.mouse.move(640, 400);
    const input = await pg.context().newCDPSession(pg);
    await pg.evaluate(() => window.p.start());
    const sent = [];
    const t0 = Date.now();
    while (Date.now() - t0 < 2000) {
      sent.push(input.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 640, y: 400, deltaX: 0, deltaY: 100 }));
      await new Promise((r) => setTimeout(r, 16));
    }
    await Promise.all(sent);
    const sc = await pg.evaluate(() => window.p.stop());
    if (sc.detail.length) console.log(`       long animation frames: ${JSON.stringify(sc.detail)}`);
    console.log(`       ${sent.length} wheel events, scrolled ${sc.logical} px (logical)`);
    line('tree 1 000 000 open, 2 s wheel scroll: longest animation frame', Math.max(0, ...sc.loaf), 'ms');
    line('tree 1 000 000 open, 2 s wheel scroll: median frame', median(sc.frames), 'ms');
    line('tree 1 000 000 open, 2 s wheel scroll: p95 frame', percentile(sc.frames, 95), 'ms');
    // Sticky parent rows (tree-sticky.md), on by default: met during the scroll, worked out within 0.2 ms.
    line('tree 1 000 000 open, 2 s wheel scroll: frames with pinned parents', Math.round(sc.pinned * 100), '%', 'higher');
    line('tree 1 000 000 open: pinned parents worked out (mean of 10 000 scroll tops)', await pg.evaluate(() => window.p.stackCost(10_000)), 'ms');
    // A parent near the top closed and opened again (three times each), to the next frame.
    await pg.evaluate(() => { document.querySelector('.dzg-viewport').scrollTop = 0; });
    await pg.waitForTimeout(100);
    const top = await pg.evaluate(() => window.p.toggles(3));
    line('tree 1 000 000 open: a toggle near the top to the next frame (median of 6)', top.ms.length ? median(top.ms) : Infinity, 'ms');
    line('tree 1 000 000 open: a toggle near the top, model and events (median of 6)', top.script.length ? median(top.script) : Infinity, 'ms');
    // Ctrl+End: the last row (999 999) reached, the focus on it, aria-rowcount right.
    await pg.evaluate(() => window.p.focusFirst());
    await pg.keyboard.press('ControlOrMeta+End');
    await pg.waitForTimeout(150);
    const end = await pg.evaluate(() => window.p.where());
    console.log(`       Ctrl+End: ${JSON.stringify(end)}`);
    line('tree 1 000 000 open: Ctrl+End reaches the last row (aria-rowindex − header = rows shown)', end.rowindex - 1 === end.count && end.rowcount === end.count + 1 && end.count === 1_000_000 ? 0 : 1, 'misses');
    const low = await pg.evaluate(() => window.p.toggles(3));
    console.log(`       toggles at rows ${top.index} and ${low.index}`);
    line('tree 1 000 000 open: a toggle near the end to the next frame (median of 6)', low.ms.length ? median(low.ms) : Infinity, 'ms');
    line('tree 1 000 000 open: a toggle near the end, model and events (median of 6)', low.script.length ? median(low.script) : Infinity, 'ms');
    line('tree: page errors', errors.length, 'errors');
    if (errors.length) console.log(`       ${JSON.stringify(errors).slice(0, 600)}`);
    await pg.close();
  }
} finally {
  await b.close();
  open = null;
  await site.close();
}
const over = lines.filter((l) => !l.ok).length;
if (arg('--json')) writeFileSync(arg('--json'), JSON.stringify({ cpu, chrome, lines }, null, 2) + '\n');
console.log(`\nbench:browser (CPU ${cpu}×): ${lines.length} lines, ${over} over budget (headless, indicative)`);
process.exit(over ? 1 : 0);
