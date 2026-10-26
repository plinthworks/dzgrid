/**
 * The grid's time and DOM budgets in Chrome (§5.3, docs/phase-2-plan.md §4):
 * `npm run bench:browser`. One headless Chrome, closed in finally; dataset A
 * at 1 280 × 720; medians of 5 page loads. Budgets in perf/browser-budgets.json;
 * exits 1 when a line is over. Headless on a fast machine, the numbers are
 * indicative: K.8's figures are owed on a mid-range laptop, headed.
 * `-- --only tree`: the million-row tree alone (Phase 4 step 6, with its pinned parents); it runs last in a full run.
 * `-- --only range-b`: dataset B's editing gestures (Phase 5 step 12), indicative, no budget (Q17d, S12-Q7); never in a full run.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { serve, browser, median, percentile } from '../spikes/kit.mjs';
import { buildFixture } from '../packages/angular/browser/build.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const budgets = JSON.parse(readFileSync(`${ROOT}perf/browser-budgets.json`, 'utf8')).budgets;
// Step 25 lines: the audit screen's server (C) and the CSV of A load tzslot through audit.html's
// importmap (bundled once, as test:audit does); `<dz-grid>` runs on the Angular fixture's `?a=1`
// page, built here (AOT, minified; `npm run build` first).
await build({ entryPoints: { dom: '@tzslot/dom', core: '@tzslot/core' }, bundle: true, splitting: true, format: 'esm', outdir: `${ROOT}node_modules/.cache/dzgrid-browser`, absWorkingDir: ROOT, logLevel: 'error' });
if (!process.argv.includes("--only")) await buildFixture();
// Minified, as a consumer ships it: never measure unminified code (§5.4).
const site = await serve(import.meta.url, { minify: true });
const only = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1] : null;
const lines = [];
let open = null;
process.on('SIGINT', async () => { await open?.close().catch(() => {}); await site.close(); process.exit(130); });

const line = (name, value, unit, better = 'lower') => {
  const budget = budgets[name];
  const ok = budget === undefined || (better === 'lower' ? value <= budget : value >= budget);
  lines.push({ name, value, ok });
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
try {
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
      line('1 000 000 rows (scaled): frames without rows', await pg.evaluate(() => window.p.coverage('block', 2000, 40)), '%');
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
console.log(`\nbench:browser: ${lines.length} lines, ${over} over budget (headless, indicative)`);
process.exit(over ? 1 : 0);
