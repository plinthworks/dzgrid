// S6 — cost of Angular templates in recycled cells. Builds the page (AOT,
// minified), then loads it once per (browser, variant, templated columns).
//   node spikes/s6-angular-cells/run.mjs                               Chrome, then Chrome with CPU ×4
//   S6_BROWSERS=chrome,chrome-4x,firefox node spikes/s6-angular-cells/run.mjs   + Firefox, last, alone
import { serve, browser, record, median, percentile } from '../kit.mjs';
import { buildPage } from './build.mjs';

const VARIANTS = ['view-fresh', 'view-pool', 'view-pool-attached', 'view-signal', 'component-fresh', 'component-pool'];
// chrome-4x: the same Chrome with its CPU slowed four times (CDP), a stand-in
// for the mid-range office laptop this machine is not.
const PLAN = {
  chrome: { engine: 'chrome', ts: [1, 3, 6, 13], memory: true, throttle: 1 },
  'chrome-4x': { engine: 'chrome', ts: [1, 3, 6, 13], memory: false, throttle: 4 },
  firefox: { engine: 'firefox', ts: [1, 3, 6, 13], memory: false, throttle: 1 },
};
// One browser open at a time, closed in `finally`. Firefox is opt-in (S6_BROWSERS=chrome,chrome-4x,firefox).
const browsers = (process.env.S6_BROWSERS ?? 'chrome,chrome-4x').split(',');
const STEPS = 30; // jumps of 40 rows (every row recycled)
const FRAMES = 150; // frames per scripted scroll
const BUDGET_MS = 8; // ARCHITECTURE.md §5: ≤ 8 ms per frame for templated columns

const r2 = (x) => Math.round(x * 100) / 100;
const sum = (xs) => xs.reduce((a, b) => a + b, 0);
const dist = (xs) => ({ median: r2(median(xs)), p95: r2(percentile(xs, 95)), mean: r2(sum(xs) / xs.length) });

const bundle = await buildPage();
const site = await serve(import.meta.url);
const out = { bundle, build: 'AOT: ngc (compiler-cli 21.2, compilationMode full) + esbuild minify, ngDevMode=false', browsers: {} };

async function measure(b, name, variant, t, plan) {
  const withMemory = plan.memory;
  const page = await b.newPage({ viewport: { width: 1400, height: 1100 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(site.url(`build/index.html?v=${variant}&t=${t}`));
  await page.waitForFunction(() => window.s6ready || window.s6error, null, { timeout: 30000 });
  const bootError = await page.evaluate(() => window.s6error);
  if (bootError) throw new Error(`${name} ${variant}: ${bootError}`);
  const cdp = plan.engine === 'chrome' ? await page.context().newCDPSession(page) : null;
  if (plan.throttle > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: plan.throttle });
  const mem = async () => {
    if (!withMemory) return null;
    await cdp.send('HeapProfiler.collectGarbage');
    await cdp.send('Performance.enable');
    const { metrics } = await cdp.send('Performance.getMetrics');
    const m = Object.fromEntries(metrics.map((x) => [x.name, x.value]));
    return { heapMB: r2(m.JSHeapUsedSize / 2 ** 20), nodes: m.Nodes };
  };
  const res = { variant, templated: variant === 'text' ? 0 : t };
  res.devMode = await page.evaluate(() => window.s6.devMode);
  const m0 = await mem();
  res.mount = await page.evaluate(() => window.s6.mount());
  const m1 = await mem();
  res.click = variant === 'text' ? null : await page.evaluate(() => window.s6.click());
  const step = await page.evaluate((n) => window.s6.steps(40, n), STEPS);
  const total = step.script.map((s, i) => s + step.layout[i]);
  res.step40 = { script: dist(step.script), withLayout: dist(total), perStepCounts: Object.fromEntries(Object.entries(step.counts).map(([k, v]) => [k, v / STEPS])) };
  for (const rows of [5, 40]) {
    const s = await page.evaluate(([r, f]) => window.s6.scroll(r, f), [rows, FRAMES]);
    res[`scroll${rows}`] = {
      work: dist(s.work),
      interval: dist(s.intervals),
      longFrames: s.intervals.filter((x) => x > 20).length,
      frames: s.intervals.length,
      perFrameCounts: Object.fromEntries(Object.entries(s.counts).map(([k, v]) => [k, r2(v / FRAMES)])),
    };
  }
  const m2 = await mem();
  if (withMemory) res.memory = { beforeMount: m0, afterMount: m1, afterScroll: m2, mountDeltaMB: r2(m1.heapMB - m0.heapMB), scrollDeltaMB: r2(m2.heapMB - m1.heapMB) };
  res.errors = errors;
  await page.close();
  return res;
}

for (const name of browsers) {
  const plan = PLAN[name];
  const b = await browser(plan.engine);
  const runs = [];
  const version = b.version();
  try {
    runs.push(await measure(b, name, 'text', 0, plan));
    for (const v of VARIANTS) for (const t of plan.ts) runs.push(await measure(b, name, v, t, plan));
  } finally {
    await b.close();
  }

  // Cost per templated cell: least-squares slope of the 40-row step (script +
  // layout, median) against the number of templated cells re-bound, from the
  // text baseline (0 cells) through every t.
  const text = runs[0];
  const perCell = {};
  for (const v of VARIANTS) {
    const pts = [[0, text.step40.withLayout.median], ...runs.filter((r) => r.variant === v).map((r) => [40 * r.templated, r.step40.withLayout.median])];
    const mx = sum(pts.map((p) => p[0])) / pts.length;
    const my = sum(pts.map((p) => p[1])) / pts.length;
    const slope = sum(pts.map(([x, y]) => (x - mx) * (y - my))) / sum(pts.map(([x]) => (x - mx) ** 2));
    const usPerCell = slope * 1000;
    perCell[v] = {
      usPerCell: r2(usPerCell),
      // How many templated cells can be re-bound in one frame before the budget is spent
      // (the text baseline for the rest of the window is subtracted first).
      cellsIn8ms: Math.max(0, Math.floor(((BUDGET_MS - text.step40.withLayout.median) / slope))),
      cellsIn16ms: Math.max(0, Math.floor(((16.7 - text.step40.withLayout.median) / slope))),
    };
  }
  out.browsers[name] = {
    version,
    cpuThrottle: plan.throttle,
    runs,
    perCell,
    table: runs.map((r) => ({
      variant: r.variant,
      t: r.templated,
      mountMs: r2(r.mount.scriptMs + r.mount.layoutMs),
      step40Med: r.step40.withLayout.median,
      step40P95: r.step40.withLayout.p95,
      scroll5WorkP95: r.scroll5.work.p95,
      scroll40WorkMed: r.scroll40.work.median,
      scroll40WorkP95: r.scroll40.work.p95,
      scroll40IntervalP95: r.scroll40.interval.p95,
      longFrames40: r.scroll40.longFrames,
      heapMB: r.memory ? r.memory.afterMount.heapMB : undefined,
      mountDeltaMB: r.memory?.mountDeltaMB,
      scrollDeltaMB: r.memory?.scrollDeltaMB,
      checksPerStep: r.step40.perStepCounts.checks,
      dcPerStep: r.step40.perStepCounts.detectChanges,
      ticksPerStep: r.step40.perStepCounts.ticks,
      tickMsPerStep: r2(r.step40.perStepCounts.tickMs),
      click: r.click ? r.click.ok : null,
      hostSignalSeen: r.click ? r.click.hot : null,
      errors: r.errors.length,
    })),
  };
  console.table(out.browsers[name].table);
  console.table(perCell);
}
await site.close();
record(import.meta.url, out);
