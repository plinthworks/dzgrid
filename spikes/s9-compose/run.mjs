// S9 — composition while scrolling: transform vs inset-block-start, contain,
// content-visibility, recycling vs rebuilding the window. 100 000 × 30 rows,
// ~40 × ~12 visible, overscan 4 rows / 2 columns.
//
//   node spikes/s9-compose/run.mjs
//   BROWSERS=chrome,firefox-asap REPS=3 FRAMES=180 node spikes/s9-compose/run.mjs
//
// Runs: 'chrome', 'firefox', 'webkit' at vsync (60 Hz), plus 'firefox-asap':
// Firefox with its refresh driver at 1000 Hz, so a frame lasts as long as its
// work (script + style + layout + paint) — the only uncapped engine we have
// (Chrome headless ignores --disable-frame-rate-limit; WebKit has no switch).
// Each variant gets a fresh page; reps run the variants in alternating order
// and the summary takes the median over reps.
import { serve, browser, record, median, percentile } from '../kit.mjs';
import { firefox } from 'playwright-core';

const RUNS = (process.env.BROWSERS ?? 'chrome,firefox,webkit,firefox-asap').split(',');
const REPS = Number(process.env.REPS ?? 2);
const FRAMES = Number(process.env.FRAMES ?? 120);
const headless = process.env.HEADED !== '1';
const VIEW = { width: 1455, height: 1327 };     // ~40 rows × 32 px + header, ~12 columns × 120 px, + scrollbars
const FRAME_MS = 1000 / 60;
const SPEEDS = { slow: 32, fast: 320 };          // px per frame: one row, ten rows

const POSITIONS = ['transform', 'inset'];
const CONTAINS = ['none', 'strict', 'content', 'cv-auto'];
const STRATEGIES = ['ordered', 'inplace', 'rebuild'];
const VARIANTS = POSITIONS.flatMap((position) => CONTAINS.flatMap((contain) => STRATEGIES.map((strategy) => ({ position, contain, strategy }))));
const nameOf = (v) => `${v.position}/${v.contain}/${v.strategy}`;

async function launch(run) {
  // Firefox gets full-resolution performance.now(); WebKit stays at 1 ms.
  if (run === 'firefox') return firefox.launch({ headless, firefoxUserPrefs: { 'privacy.reduceTimerPrecision': false } });
  if (run === 'firefox-asap') return firefox.launch({ headless, firefoxUserPrefs: { 'privacy.reduceTimerPrecision': false, 'layout.frame_rate': 1000 } });
  return browser(run, { headless });
}

async function chromeMetrics(cdp) {
  if (!cdp) return null;
  const { metrics } = await cdp.send('Performance.getMetrics');
  const get = (k) => metrics.find((m) => m.name === k)?.value ?? 0;
  return { style: get('RecalcStyleDuration'), layout: get('LayoutDuration'), script: get('ScriptDuration'), task: get('TaskDuration') };
}

const r3 = (x) => +x.toFixed(3);
function stats(raw, m0, m1) {
  const d = raw.deltas;
  const out = {
    frameMedianMs: r3(median(d)),
    frameP95Ms: r3(percentile(d, 95)),
    frameMeanMs: r3(d.reduce((a, b) => a + b, 0) / d.length),
    fpsMean: +((1000 * d.length) / d.reduce((a, b) => a + b, 0)).toFixed(1),
    over16_7Pct: +((100 * d.filter((x) => x > 16.7).length) / d.length).toFixed(1),
    droppedPct: +((100 * d.filter((x) => x > 1.5 * FRAME_MS).length) / d.length).toFixed(1),
    workMedianMs: r3(median(raw.work)),
    workP95Ms: r3(percentile(raw.work, 95)),
    workLayoutMedianMs: r3(median(raw.workLayout)),
    workLayoutP95Ms: r3(percentile(raw.workLayout, 95)),
    // Unbiased under WebKit's 1 ms clock: differences of truncated readings average out.
    workLayoutMeanMs: r3(raw.workLayout.reduce((a, b) => a + b, 0) / raw.workLayout.length),
    perFrame: raw.perFrame,
    check: raw.check,
  };
  if (m0 && m1) {
    const f = (k) => r3((1000 * (m1[k] - m0[k])) / FRAMES);
    out.chrome = { styleMs: f('style'), layoutMs: f('layout'), scriptMs: f('script'), taskMs: f('task') };
  }
  return out;
}

const site = await serve(import.meta.url);
const out = { rows: 100_000, columns: 30, viewport: VIEW, frames: FRAMES, reps: REPS, speeds: SPEEDS, headless, runs: {} };

for (const run of RUNS) {
  const b = await launch(run);
  const raw = {};                                  // variant → speed → [rep stats]
  try {
    for (let rep = 0; rep < REPS; rep++) {
      const order = rep % 2 ? [...VARIANTS].reverse() : VARIANTS;
      for (const v of order) {
        const page = await b.newPage({ viewport: VIEW });
        try {
        const cdp = run === 'chrome' ? await page.context().newCDPSession(page) : null;
        if (cdp) await cdp.send('Performance.enable');
        await page.goto(site.url(`index.html?position=${v.position}&contain=${v.contain}&strategy=${v.strategy}`));
        await page.waitForFunction(() => window.spike?.ready);
        for (const [speed, dy] of Object.entries(SPEEDS)) {
          const m0 = await chromeMetrics(cdp);
          const r = await page.evaluate((o) => spike.run(o), { frames: FRAMES, dy });
          const m1 = await chromeMetrics(cdp);
          ((raw[nameOf(v)] ??= {})[speed] ??= []).push(stats(r, m0, m1));
        }
        } finally { await page.close(); }
      }
      console.error(`${run}: rep ${rep + 1}/${REPS} done`);
    }
  } catch (e) {
    out.runs[run] = { error: String(e?.stack ?? e) };
    console.error(run, e);
    continue;
  } finally {
    await b.close();                               // one browser at a time, never left running
  }

  // Median over reps of each number.
  const summary = {};
  for (const [variant, bySpeed] of Object.entries(raw)) {
    summary[variant] = {};
    for (const [speed, reps] of Object.entries(bySpeed)) {
      const med = (f) => r3(median(reps.map(f)));
      summary[variant][speed] = {
        frameMedianMs: med((s) => s.frameMedianMs), frameMeanMs: med((s) => s.frameMeanMs), frameP95Ms: med((s) => s.frameP95Ms), fpsMean: med((s) => s.fpsMean),
        droppedPct: med((s) => s.droppedPct),
        workMedianMs: med((s) => s.workMedianMs), workLayoutMedianMs: med((s) => s.workLayoutMedianMs), workLayoutP95Ms: med((s) => s.workLayoutP95Ms), workLayoutMeanMs: med((s) => s.workLayoutMeanMs),
        ...(reps[0].chrome ? { chromeTaskMs: med((s) => s.chrome.taskMs), chromeLayoutMs: med((s) => s.chrome.layoutMs), chromeStyleMs: med((s) => s.chrome.styleMs) } : {}),
        perFrame: reps[0].perFrame,
        rowsWhereTheyBelong: reps.every((s) => s.check.maxErr < 0.5),
        domOrderIsRowOrder: reps.every((s) => s.check.domOrderIsRowOrder),
      };
    }
  }
  out.runs[run] = { summary, reps: raw };
}
await site.close();

// Ranking on the two measures that hold a frame's *whole* cost: Chrome's
// main-thread task time per frame (CDP) and Firefox's uncapped frame time.
// Each is normalised to the best variant of that run and speed, then
// averaged. The forced-layout timing (workLayout) is kept as a second view
// — mean in WebKit, whose clock ticks in whole milliseconds — but it flatters
// content-visibility:auto, whose deferred work lands after the forced layout.
const FULL_COST = { chrome: (s) => s.chromeTaskMs, 'firefox-asap': (s) => s.frameMeanMs };   // mean: uncapped ticks are quantised (~1.26 ms)
const PARTIAL_COST = { webkit: (s) => s.workLayoutMeanMs, firefox: (s) => s.workLayoutMedianMs };
function rank(costs) {
  const result = {};
  const used = Object.keys(costs).filter((run) => out.runs[run]?.summary);
  for (const speed of Object.keys(SPEEDS)) {
    const scores = Object.fromEntries(VARIANTS.map((v) => [nameOf(v), {}]));
    for (const run of used) {
      const vals = VARIANTS.map((v) => costs[run](out.runs[run].summary[nameOf(v)][speed]));
      const best = Math.max(Math.min(...vals), 1e-3);
      VARIANTS.forEach((v, i) => { scores[nameOf(v)][run] = r3(vals[i] / best); });
    }
    result[speed] = Object.entries(scores)
      .map(([variant, per]) => { const xs = Object.values(per); return { variant, relativeCost: r3(xs.reduce((a, b) => a + b, 0) / (xs.length || 1)), ...per }; })
      .sort((a, b) => a.relativeCost - b.relativeCost);
  }
  return { runs: used, ...result };
}
out.ranking = { fullFrameCost: rank(FULL_COST), scriptStyleLayout: rank(PARTIAL_COST) };
record(import.meta.url, out);
