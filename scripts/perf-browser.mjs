/**
 * The grid's time and DOM budgets in Chrome (§5.3, docs/phase-2-plan.md §4):
 * `npm run bench:browser`. One headless Chrome, closed in finally; dataset A
 * at 1 280 × 720; medians of 5 page loads. Budgets in perf/browser-budgets.json;
 * exits 1 when a line is over. Headless on a fast machine, the numbers are
 * indicative: K.8's figures are owed on a mid-range laptop, headed.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { serve, browser, median, percentile } from '../spikes/kit.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const budgets = JSON.parse(readFileSync(`${ROOT}perf/browser-budgets.json`, 'utf8')).budgets;
// Minified, as a consumer ships it: never measure unminified code (§5.4).
const site = await serve(import.meta.url, { minify: true });
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
} finally {
  await b.close();
  open = null;
  await site.close();
}
const over = lines.filter((l) => !l.ok).length;
console.log(`\nbench:browser: ${lines.length} lines, ${over} over budget (headless, indicative)`);
process.exit(over ? 1 : 0);
