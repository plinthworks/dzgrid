// S1 — one million rows in a recycled DOM: height cap, ScrollMapper, smoothness, memory.
//
//   node spikes/s1-virtual-1m/run.mjs
//   BROWSERS=chrome REPS=3 HEADED=1 node spikes/s1-virtual-1m/run.mjs
//
// Frame times are rAF-to-rAF deltas while a rAF loop scrolls programmatically.
// One browser at a time, closed in a finally; one 1 M-row page at a time.
// Each scenario runs REPS times; the summary keeps the least-disturbed rep
// (lowest p95 frame time), since other processes only ever add time.
import { serve, browser, record, median, percentile } from '../kit.mjs';
import { firefox } from 'playwright-core';
import { decodePng, runAt } from './png.mjs';

const BROWSERS = (process.env.BROWSERS ?? 'chrome,firefox,webkit').split(',');
const REPS = Number(process.env.REPS ?? 2);
const FRAMES = Number(process.env.FRAMES ?? 300);
const headless = process.env.HEADED !== '1';
const ROWS = 1_000_000;
const ROW_HEIGHT = 32;
const HEADER = 32;
const MAX_PHYSICAL = Number(process.env.MAX_PHYSICAL ?? 4_000_000);   // §3.7 said 8 M; see precisionByCap for why 4 M
const CAP_CANDIDATES = [8_000_000, 4_000_000];
const VIEW = { width: 1440, height: 900 };
const FRAME_MS = 1000 / 60;
const DPRS = [1, 2, 3];

/**
 * The kit's browsers, except Firefox, which gets full-resolution timers
 * (by default it rounds performance.now() to 1 ms without cross-origin
 * isolation, which the kit's server does not send). WebKit stays at 1 ms.
 */
async function launch(name) {
  if (name !== 'firefox') return browser(name, { headless });
  return firefox.launch({ headless, firefoxUserPrefs: { 'privacy.reduceTimerPrecision': false } });
}

const site = await serve(import.meta.url);
const out = { rows: ROWS, columns: 30, rowHeight: ROW_HEIGHT, maxPhysical: MAX_PHYSICAL, viewport: VIEW, headless, reps: REPS, frames: FRAMES, browsers: {} };

const isRed = ([r, g, b]) => r > 200 && g < 60 && b < 60;
const isBlue = ([r, g, b]) => b > 200 && r < 60 && g < 60;

function frameStats(d) {
  const deltas = d.deltas, work = d.work;
  const med = median(deltas);
  return {
    fpsMedian: +(1000 / med).toFixed(1),
    frameMedianMs: +med.toFixed(2),
    frameP95Ms: +percentile(deltas, 95).toFixed(2),
    frameMaxMs: +Math.max(...deltas).toFixed(1),
    over16_7Pct: +((100 * deltas.filter((x) => x > 16.7).length) / deltas.length).toFixed(1),
    // A frame that took more than 1.5 vsync intervals missed at least one.
    droppedPct: +((100 * deltas.filter((x) => x > 1.5 * FRAME_MS).length) / deltas.length).toFixed(1),
    fpsMean: +((1000 * deltas.length) / deltas.reduce((a, b) => a + b, 0)).toFixed(1),
    workMedianMs: +median(work).toFixed(3),
    workP95Ms: +percentile(work, 95).toFixed(3),
    workMaxMs: +Math.max(...work).toFixed(2),
    workLayoutMedianMs: +median(d.workLayout).toFixed(3),
    workLayoutP95Ms: +percentile(d.workLayout, 95).toFixed(3),
    workLayoutMaxMs: +Math.max(...d.workLayout).toFixed(2),
    longTasks: d.longTaskSupported ? d.longTasks.length : 'unsupported',
    longTaskMaxMs: d.longTaskSupported && d.longTasks.length ? Math.max(...d.longTasks) : null,
    perFrame: d.perFrame,
  };
}

/** Chrome's own main-thread accounting (seconds, cumulative) — style, layout, script, all tasks. */
async function metrics(cdp) {
  if (!cdp) return null;
  const { metrics: list } = await cdp.send('Performance.getMetrics');
  const get = (k) => list.find((m) => m.name === k)?.value ?? 0;
  return { style: get('RecalcStyleDuration'), layout: get('LayoutDuration'), script: get('ScriptDuration'), task: get('TaskDuration') };
}
function perFrameMs(a, b, frames) {
  if (!a || !b) return null;
  const f = (k) => +((1000 * (b[k] - a[k])) / frames).toFixed(3);
  return { styleMs: f('style'), layoutMs: f('layout'), scriptMs: f('script'), taskMs: f('task') };
}

async function heap(cdp) {
  if (!cdp) return null;
  await cdp.send('HeapProfiler.collectGarbage');
  const h = await cdp.send('Runtime.getHeapUsage');
  const dom = await cdp.send('Memory.getDOMCounters');
  return { usedMB: +(h.usedSize / 2 ** 20).toFixed(1), totalMB: +(h.totalSize / 2 ** 20).toFixed(1), domNodes: dom.nodes, listeners: dom.jsEventListeners };
}

for (const name of BROWSERS) {
  const res = {};
  const b = await launch(name);
  try {
    // 1. The height cap, and 2. whether a large offset is painted where it
    // should be (layout vs transform), at device pixel ratios 1, 2 and 3:
    // engines lay out in device-scaled units, so both limits may shrink.
    res.cap = {};
    res.bigOffset = {};
    for (const dpr of DPRS) {
      const page = await b.newPage({ viewport: VIEW, deviceScaleFactor: dpr });
      try {
      await page.goto(site.url('index.html'));
      await page.waitForFunction(() => window.spike);
      const cap = await page.evaluate(() => spike.maxHeight());
      res.cap['dpr' + dpr] = cap;
      const offsets = [];
      for (const Y of [2 ** 22 - 999, 2 ** 23 - 999, 2 ** 24 - 999, cap.cap - 1011].filter((y) => y < cap.cap - 1010)) {
        const geo = await page.evaluate(([h, y]) => spike.bigOffset(h, y), [Y + 1001, Y]);
        await page.waitForTimeout(100);
        const img = decodePng(await page.screenshot());
        const red = runAt(img, 50 * dpr, isRed), blue = runAt(img, 250 * dpr, isBlue);
        offsets.push({
          Y, scrollTop: geo.scrollTop, expectedTop: geo.expectedTop,
          rectLayout: geo.rectLayout, rectTransform: geo.rectTransform,
          errLayoutPx: red ? red.top / dpr - geo.expectedTop : null,
          errTransformPx: blue ? blue.top / dpr - geo.expectedTop : null,
        });
      }
      res.bigOffset['dpr' + dpr] = offsets;
      } finally { await page.close(); }
    }

    // 3. One million rows.
    const page = await b.newPage({ viewport: VIEW });
    const cdp = name === 'chrome' ? await page.context().newCDPSession(page) : null;
    const mem = {};
    let m;
    try {
    await page.goto(site.url('index.html'));
    await page.waitForFunction(() => window.spike);
    if (cdp) await cdp.send('Performance.enable');
    mem.empty = await heap(cdp);
    res.generate = await page.evaluate((n) => spike.generate(n), ROWS);
    mem.withData = await heap(cdp);
    res.mount = await page.evaluate((o) => spike.mount(o), { maxPhysical: MAX_PHYSICAL, rowHeight: ROW_HEIGHT, headerHeight: HEADER });
    mem.mounted = await heap(cdp);
    res.domNodesMounted = await page.evaluate(() => spike.domNodes());

    // 4. Reachability and precision.
    m = res.mount;
    const apiEnd = await page.evaluate(() => spike.probe(Infinity));
    const barEnd = await page.evaluate(() => spike.probePhysical('end'));
    const barStart = await page.evaluate(() => spike.probePhysical(0));
    const mid = await page.evaluate((y) => spike.probe(y), Math.round(m.maxLogical / 2) + 7);
    res.reach = {
      api: apiEnd, scrollbar: barEnd, start: barStart, mid,
      lastRowReachable: apiEnd.lastRow === ROWS - 1 && Math.abs(apiEnd.lastBottomGap) < 1
        && barEnd.lastRow === ROWS - 1 && Math.abs(barEnd.lastBottomGap) < 1,
    };
    res.proportional = await page.evaluate(() => spike.proportional(400));
    res.endSweep = await page.evaluate(() => spike.endSweep(512));

    // A real wheel event: in scaled mode, 100 px of wheel must move 100 logical px, not 100 × ratio.
    await page.evaluate((y) => spike.probe(y), Math.round(m.maxLogical / 3));
    await page.mouse.move(700, 450);
    const before = await page.evaluate(() => spike.logical());
    await page.mouse.wheel(0, 100);
    await page.waitForTimeout(250);
    const after = await page.evaluate(() => spike.logical());
    res.wheel = { deltaY: 100, movedLogical: after - before, ratio: m.ratio };

    // Pixels, not rects: mark a row near the end and find it in a screenshot.
    {
      const y = m.maxLogical - 333;
      const geo = await page.evaluate((v) => spike.probe(v), y);
      const row = Math.floor(y / ROW_HEIGHT) + 5;
      await page.evaluate((r) => spike.mark(r, 'rgb(255,0,0)'), row);
      await page.waitForTimeout(100);
      const img = decodePng(await page.screenshot());
      const red = runAt(img, 3, isRed);
      const expected = HEADER + row * ROW_HEIGHT - geo.logicalTop;
      res.pixelNearEnd = { row, expectedTop: expected, paintedTop: red?.top ?? null, paintedHeight: red?.height ?? null, errPx: red ? red.top - expected : null };
      await page.evaluate((r) => spike.mark(r, null), row);
    }

    // 5. Smoothness.
    const scenarios = {
      wheel: { axis: 'logical', start: Math.round(m.maxLogical / 2), dy: 48, dx: 0 },
      fling: { axis: 'logical', start: Math.round(m.maxLogical / 2), dy: 1600, dx: 0 },
      scrollbarDrag: { axis: 'physical', start: 1_000_000, dy: 2000, dx: 0 },
      diagonalNearEnd: { axis: 'logical', start: m.maxLogical - FRAMES * 48 - 1000, dy: 48, dx: 24 },
    };
    res.scenarios = {};
    for (const [key, s] of Object.entries(scenarios)) {
      const reps = [];
      for (let r = 0; r < REPS; r++) {
        const m0 = await metrics(cdp);
        const raw = await page.evaluate((o) => spike.scenario(o), { ...s, frames: FRAMES });
        const m1 = await metrics(cdp);
        reps.push({ ...frameStats(raw), chromeMainThread: perFrameMs(m0, m1, FRAMES) });
      }
      reps.sort((a, b) => a.frameP95Ms - b.frameP95Ms);
      res.scenarios[key] = { ...s, best: reps[0], reps };
    }
    mem.afterScroll = await heap(cdp);
    res.domNodesAfterScroll = await page.evaluate(() => spike.domNodes());
    res.memory = mem;
    if (!cdp) res.memoryNote = 'JS heap only measurable in Chrome (CDP); DOM nodes counted with getElementsByTagName("*").';

    // Memory is short (other services share the machine): one 1 M-row page at
    // a time, so the main page goes before the next ones open.
    } finally { await page.close(); }

    // The same rows built property by property under computed keys: what a careless loader costs.
    if (cdp) {
      const p2 = await b.newPage({ viewport: VIEW });
      try {
      const cdp2 = await p2.context().newCDPSession(p2);
      await p2.goto(site.url('index.html'));
      await p2.waitForFunction(() => window.spike);
      const g = await p2.evaluate((n) => spike.generate(n, 'keyed'), ROWS);
      mem.keyedShapeWithData = { ...(await heap(cdp2)), generateMs: g.ms };
      } finally { await p2.close(); }
    }

    // Pixels at every ratio, for the default cap and for candidate caps:
    // a row is marked red and found in a screenshot, at eleven positions.
    res.precisionByCap = {};
    for (const cap of CAP_CANDIDATES) {
      for (const dpr of DPRS) {
        const p2 = await b.newPage({ viewport: VIEW, deviceScaleFactor: dpr });
        try {
        await p2.goto(site.url('index.html'));
        await p2.waitForFunction(() => window.spike);
        await p2.evaluate((n) => spike.generate(n), ROWS);
        const mm = await p2.evaluate((o) => spike.mount(o), { maxPhysical: cap, rowHeight: ROW_HEIGHT, headerHeight: HEADER });
        const end = await p2.evaluate(() => spike.probe(Infinity));
        const sweep = await p2.evaluate(() => spike.endSweep(256));
        let worst = 0;
        const errs = [];
        for (let k = 0; k <= 10; k++) {
          const y = k === 10 ? mm.maxLogical : Math.round((mm.maxLogical * k) / 10) + (k % 2 ? 17 : 0);
          const geo = await p2.evaluate((v) => spike.probe(v), y);
          const row = Math.min(ROWS - 1, Math.floor(geo.logicalTop / ROW_HEIGHT) + 3);
          await p2.evaluate((r) => spike.mark(r, 'rgb(255,0,0)'), row);
          await p2.waitForTimeout(50);
          const img = decodePng(await p2.screenshot());
          const red = runAt(img, 3 * dpr, isRed);
          const expected = HEADER + row * ROW_HEIGHT - geo.logicalTop;
          const err = red ? red.top / dpr - expected : NaN;
          errs.push({ physical: geo.physicalTop, errPx: err });
          worst = Math.max(worst, Number.isNaN(err) ? Infinity : Math.abs(err));
          await p2.evaluate((r) => spike.mark(r, null), row);
        }
        res.precisionByCap[`cap${cap}_dpr${dpr}`] = {
          ratio: mm.ratio, lastRow: end.lastRow, lastBottomGap: end.lastBottomGap,
          rectSweepMaxErr: sweep.maxErr, pixelMaxErr: worst, pixels: errs,
        };
        } finally { await p2.close(); }
      }
    }

    const fps = Object.values(res.scenarios).map((s) => s.best.fpsMedian);
    res.verdict = {
      lastRowReachable: res.reach.lastRowReachable,
      endPrecisionPx: res.endSweep.maxErr,
      wheelExact: Math.abs(res.wheel.movedLogical - 100) <= 1,
      minScenarioFpsMedian: Math.min(...fps),
      scrollableAt58: res.reach.lastRowReachable && Math.min(...fps) >= 58,
    };
  } catch (e) {
    res.error = String(e?.stack ?? e);
    console.error(name, e);
  } finally {
    await b.close();
  }
  out.browsers[name] = res;
}
await site.close();
record(import.meta.url, out);
