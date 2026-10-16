/**
 * S1 page harness. run.mjs drives it step by step through `window.spike`,
 * so that memory can be sampled between steps.
 */
import { VirtualGrid } from './grid.ts';
import { formatCell, makeColumns, makeRows, type ColumnDef, type Row } from './data.ts';

const SEED = 20261016;
let rows: Row[] = [];
let columns: ColumnDef[] = [];
let grid: VirtualGrid | null = null;

const nextFrame = () => new Promise<number>((r) => requestAnimationFrame(r));

/**
 * Two limits, measured on a plain block in a scroll container:
 * - `cap`: the largest block-size the engine still lays out (bisection);
 *   CSS lengths are single-precision floats above 2^24 and some engines
 *   round offsetHeight/scrollHeight through floats too, so a request h counts
 *   as held when the box measures within 2 px of it. What happens above the
 *   cap is recorded too (clamped, or collapsed to 0).
 * - `exact`: whether an odd integer just above 2^24 survives, i.e. whether
 *   pixel-exact offsets are possible above 16 777 216 px.
 */
function maxHeight() {
  const sc = document.createElement('div');
  sc.style.cssText = 'overflow:auto;block-size:500px;inline-size:300px;position:relative';
  const el = document.createElement('div');
  el.style.inlineSize = '1px';
  sc.append(el);
  document.body.append(sc);
  const size = (h: number) => { el.style.blockSize = h + 'px'; return el.getBoundingClientRect().height; };
  const holds = (h: number) => Math.abs(size(h) - h) <= 2 && Math.abs(sc.scrollHeight - h) <= 2;
  let lo = 1_000_000, hi = 2_000_000_000;
  while (lo < hi) {
    const mid = Math.floor((lo + hi + 1) / 2);
    if (holds(mid)) lo = mid; else hi = mid - 1;
  }
  const cap = size(lo);
  sc.scrollTop = 1e12;
  const scrollTopOf1e12 = sc.scrollTop;          // WebKit wraps a huge value to 0
  sc.scrollTop = sc.scrollHeight;
  const maxScrollTop = sc.scrollTop;
  const reachesBottom = Math.abs(maxScrollTop - (sc.scrollHeight - sc.clientHeight)) < 1;
  const aboveCap = size(lo + 1000);
  const exact = {
    '2^24-1': size(2 ** 24 - 1), '2^24+1': size(2 ** 24 + 1), '2^24+3': size(2 ** 24 + 3), '2^25+1': size(2 ** 25 + 1),
  };
  sc.remove();
  return { cap, maxScrollTop, reachesBottom, scrollTopOf1e12, aboveCapGives: aboveCap, exact };
}

/**
 * Two markers at the same large offset Y inside a container of height H: one
 * placed by layout (inset-block-start), one by transform (translateY). The
 * caller screenshots and finds where each was actually painted.
 */
function bigOffset(H: number, Y: number) {
  document.body.replaceChildren();
  const sc = document.createElement('div');
  sc.style.cssText = 'position:fixed;inset:0;overflow:auto;background:white';
  const tall = document.createElement('div');
  tall.style.cssText = `position:relative;inline-size:100%;block-size:${H}px`;
  const byLayout = document.createElement('div');
  byLayout.style.cssText = `position:absolute;inset-inline-start:0;inline-size:100px;block-size:20px;inset-block-start:${Y}px;background:rgb(255,0,0)`;
  const byTransform = document.createElement('div');
  byTransform.style.cssText = `position:absolute;inset-inline-start:200px;inline-size:100px;block-size:20px;inset-block-start:0;transform:translateY(${Y}px);background:rgb(0,0,255)`;
  tall.append(byLayout, byTransform);
  sc.append(tall);
  document.body.append(sc);
  sc.scrollTop = Y - 101;
  return {
    scrollTop: sc.scrollTop,
    expectedTop: Y - sc.scrollTop,
    rectLayout: byLayout.getBoundingClientRect().top,
    rectTransform: byTransform.getBoundingClientRect().top,
  };
}

function generate(count: number, shape: 'literal' | 'keyed' = 'literal') {
  const t0 = performance.now();
  columns = makeColumns(30, SEED);
  rows = makeRows(count, columns, SEED, shape);
  return { ms: performance.now() - t0, rows: rows.length, columns: columns.length };
}

async function mount(o: { maxPhysical: number; rowHeight: number; headerHeight: number }) {
  const t0 = performance.now();
  const keys = columns.map((c) => c.id);
  const kinds = columns.map((c) => c.kind);
  grid = new VirtualGrid({
    host: document.getElementById('host')!,
    rowCount: rows.length,
    columns,
    rowHeight: o.rowHeight,
    headerHeight: o.headerHeight,
    maxPhysical: o.maxPhysical,
    overscanRows: 4,
    overscanCols: 2,
    cellText: (r, c) => formatCell(rows[r]![keys[c]!]!, kinds[c]!),
  });
  void grid.viewport.offsetHeight;          // style + layout of the first window
  const sync = performance.now() - t0;
  await nextFrame();
  await nextFrame();                        // first frame painted
  const m = grid.mapper;
  return {
    syncMs: sync, firstPaintMs: performance.now() - t0,
    scaled: m.scaled, ratio: m.ratio, physicalHeight: m.physicalHeight, logicalHeight: m.logicalHeight,
    maxLogical: m.maxLogical, maxPhysical: m.maxPhysical, window: grid.window,
  };
}

/** Where each mounted row is drawn, against where it should be (logical row top − logical scroll). */
function geometry() {
  const g = grid!;
  const vr = g.viewport.getBoundingClientRect();
  const bodyTop = vr.top + g.headerHeight;
  const rh = 32;
  let maxErr = 0, firstVisible = -1, lastRow: number | null = null, lastBottomGap: number | null = null;
  for (const { row, el } of g.mountedRows()) {
    const r = el.getBoundingClientRect();
    const expected = row * rh - g.logicalTop;
    maxErr = Math.max(maxErr, Math.abs(r.top - bodyTop - expected));
    if (firstVisible < 0 && r.top >= bodyTop - 0.5) firstVisible = row;
    if (row === rowsCount() - 1) { lastRow = row; lastBottomGap = vr.top + g.viewport.clientHeight - r.bottom; }
  }
  return { logicalTop: g.logicalTop, physicalTop: g.viewport.scrollTop, maxErr, firstVisible, lastRow, lastBottomGap };
}
const rowsCount = () => rows.length;

function probe(y: number) { grid!.scrollToLogical(y); return geometry(); }

/** The scrollbar path: the browser moves scrollTop, we only read it. */
function probePhysical(p: number | 'end') {
  grid!.viewport.scrollTop = p === 'end' ? grid!.viewport.scrollHeight : p;
  grid!.syncFromScroll();
  return geometry();
}

/** Logical position against physical, sampled across the whole scroll range. */
function proportional(samples: number) {
  const g = grid!, m = g.mapper;
  let maxDev = 0;
  const points: { p: number; logical: number; firstVisible: number }[] = [];
  for (let k = 0; k <= samples; k++) {
    const p = Math.round((m.maxPhysical * k) / samples);
    const geo = probePhysical(p);
    const dev = Math.abs(geo.logicalTop / m.maxLogical - geo.physicalTop / m.maxPhysical);
    maxDev = Math.max(maxDev, dev);
    if (k % (samples / 4) === 0) points.push({ p: geo.physicalTop, logical: geo.logicalTop, firstVisible: geo.firstVisible });
  }
  return { maxDev, points };
}

/** One-pixel steps over the last `span` logical pixels: every step must move rows by exactly one pixel. */
function endSweep(span: number) {
  const g = grid!, max = g.mapper.maxLogical;
  let maxErr = 0, steps = 0;
  for (let y = max - span; y <= max; y++) { maxErr = Math.max(maxErr, probe(y).maxErr); steps++; }
  return { steps, maxErr };
}

/**
 * A rAF-driven programmatic scroll. `axis: 'logical'` is the grid's own API
 * (wheel interception, keyboard paging); `'physical'` sets scrollTop as a
 * scrollbar drag does and lets the grid re-derive the logical position.
 */
async function scenario(s: { frames: number; start: number; dy: number; dx: number; axis: 'logical' | 'physical' }) {
  const g = grid!;
  const maxX = g.viewport.scrollWidth - g.viewport.clientWidth;
  if (s.axis === 'logical') g.scrollToLogical(s.start); else { g.viewport.scrollTop = s.start; g.syncFromScroll(); }
  g.scrollInlineTo(0);
  await nextFrame(); await nextFrame();
  const longTasks: number[] = [];
  let po: PerformanceObserver | null = null;
  if (PerformanceObserver.supportedEntryTypes?.includes('longtask')) {
    po = new PerformanceObserver((l) => { for (const e of l.getEntries()) longTasks.push(e.duration); });
    po.observe({ type: 'longtask' });
  }
  const c0 = { ...g.counters };
  const deltas: number[] = [], work: number[] = [], workLayout: number[] = [];
  let y = s.start, x = 0, xdir = 1, last = -1;
  await new Promise<void>((done) => {
    let n = 0;
    const tick = (t: number) => {
      if (last >= 0) deltas.push(t - last);
      last = t;
      const t0 = performance.now();
      y += s.dy;
      if (s.dx) { x += xdir * s.dx; if (x >= maxX || x <= 0) { xdir = -xdir; x = Math.max(0, Math.min(maxX, x)); } g.viewport.scrollLeft = x; }
      if (s.axis === 'logical') { if (s.dx) g.syncFromScroll(false); g.scrollToLogical(y); }
      else { g.viewport.scrollTop = y; g.syncFromScroll(); }
      const t1 = performance.now();
      void g.viewport.scrollWidth;           // flush style + layout now: script + layout cost of this frame
      const t2 = performance.now();
      work.push(t1 - t0);
      workLayout.push(t2 - t0);
      if (++n <= s.frames) requestAnimationFrame(tick); else done();
    };
    requestAnimationFrame(tick);
  });
  await nextFrame();
  po?.disconnect();
  const c1 = g.counters;
  return {
    deltas, work, workLayout, longTasks, longTaskSupported: po !== null,
    endLogical: g.logicalTop,
    perFrame: {
      rowBinds: (c1.rowBinds - c0.rowBinds) / s.frames,
      cellWrites: (c1.cellWrites - c0.cellWrites) / s.frames,
    },
    window: g.window,
  };
}

function domNodes() { return document.getElementsByTagName('*').length; }

(window as any).spike = {
  maxHeight, bigOffset, generate, mount, probe, probePhysical, proportional, endSweep, scenario, domNodes,
  geometry, logical: () => grid!.logicalTop,
  mark: (row: number, colour: string | null) => grid!.mark(row, colour),
};
