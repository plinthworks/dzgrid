/**
 * S9 page: index.html?position=transform&contain=none&strategy=ordered
 * builds 100 000 × 30 rows and one grid in that variant; run.mjs then calls
 * `spike.run({ frames, dy })` once per scroll speed.
 */
import { ComposeGrid, type Containment, type Position, type Strategy } from './compose.ts';
import { formatCell, makeColumns, makeRows } from './data.ts';

const SEED = 20261016;
const q = new URLSearchParams(location.search);
const variant = {
  position: (q.get('position') ?? 'transform') as Position,
  contain: (q.get('contain') ?? 'none') as Containment,
  strategy: (q.get('strategy') ?? 'ordered') as Strategy,
};
const ROWS = Number(q.get('rows') ?? 100_000);
const ROW_HEIGHT = 32;
const HEADER = 32;

const columns = makeColumns(30, SEED, 120);
const rows = makeRows(ROWS, columns, SEED);
const keys = columns.map((c) => c.id);
const kinds = columns.map((c) => c.kind);
const grid = new ComposeGrid({
  host: document.getElementById('host')!,
  rowCount: ROWS, columns, rowHeight: ROW_HEIGHT, headerHeight: HEADER,
  overscanRows: 4, overscanCols: 2,
  cellText: (r, c) => formatCell(rows[r]![keys[c]!]!, kinds[c]!),
  variant,
});

const nextFrame = () => new Promise<number>((r) => requestAnimationFrame(r));

/** Rows drawn where they belong, and (for 'ordered' and 'rebuild') in row order in the DOM. */
function check() {
  const vr = grid.viewport.getBoundingClientRect();
  const bodyTop = vr.top + HEADER;
  let maxErr = 0, inOrder = true, prev = -1;
  const mounted = grid.mountedInDomOrder();
  for (const { row, el } of mounted) {
    maxErr = Math.max(maxErr, Math.abs(el.getBoundingClientRect().top - bodyTop - (row * ROW_HEIGHT - grid.viewport.scrollTop)));
    if (row < prev) inOrder = false;
    prev = row;
  }
  return { mounted: mounted.length, maxErr, domOrderIsRowOrder: inOrder, cells: grid.viewport.querySelectorAll('.dzg-cell:not([hidden])').length };
}

/**
 * Scrolls by `dy` px per frame (and `dx`), rendering synchronously in the
 * frame, then forces style + layout so that `workLayout` holds this frame's
 * script + style + layout cost. Paint and composite are not in it: they are
 * seen in the frame deltas (vsync or uncapped) and, in Chrome, in CDP metrics.
 */
async function run(s: { frames: number; dy: number; dx?: number; start?: number }) {
  const v = grid.viewport;
  v.scrollTop = s.start ?? 10_000 * ROW_HEIGHT;
  v.scrollLeft = 0;
  grid.syncFromScroll();
  await nextFrame(); await nextFrame();
  const c0 = { ...grid.counters };
  const deltas: number[] = [], work: number[] = [], workLayout: number[] = [];
  let y = v.scrollTop, x = 0, xdir = 1, last = -1;
  const maxX = v.scrollWidth - v.clientWidth;
  await new Promise<void>((done) => {
    let n = 0;
    const tick = (t: number) => {
      if (last >= 0) deltas.push(t - last);
      last = t;
      const t0 = performance.now();
      y += s.dy;
      v.scrollTop = y;
      if (s.dx) { x += xdir * s.dx; if (x >= maxX || x <= 0) { xdir = -xdir; x = Math.max(0, Math.min(maxX, x)); } v.scrollLeft = x; }
      grid.syncFromScroll();
      const t1 = performance.now();
      void v.scrollWidth;
      const t2 = performance.now();
      work.push(t1 - t0);
      workLayout.push(t2 - t0);
      if (++n <= s.frames) requestAnimationFrame(tick); else done();
    };
    requestAnimationFrame(tick);
  });
  await nextFrame();
  const c1 = grid.counters;
  return {
    deltas, work, workLayout,
    perFrame: {
      rowBinds: (c1.rowBinds - c0.rowBinds) / s.frames,
      cellWrites: (c1.cellWrites - c0.cellWrites) / s.frames,
      created: (c1.created - c0.created) / s.frames,
    },
    check: check(),
    domElements: document.getElementsByTagName('*').length,
  };
}

(window as any).spike = { variant, run, check, ready: true };
