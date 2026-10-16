// What scripts/perf-browser.mjs drives: dataset A (100 000 × 30) at 1 280 × 720, or a million rows.
import { createGrid, type GridInstance } from '/packages/dom/src/index.ts';
import { FR } from '/packages/dom/src/locales/fr.ts';
import { datasetA, type RowA } from '/perf/dataset.ts';

const types: Record<string, string> = { n: 'number', d: 'day', i: 'instant', b: 'boolean' };
const ids = ['id', 't0', 't1', 't2', 't3', 't4', 'a0', 'a1', 'a2', 'a3', 'a4', 'n0', 'n1', 'n2', 'n3', 'n4', 'n5', 'n6', 'n7', 'd0', 'd1', 'd2', 'd3', 'i0', 'i1', 'e0', 'e1', 'e2', 'b0', 'b1'];
const columns = ids.map((id, k) => ({ id, width: 110, ...(id !== 'id' && types[id[0]!] ? { type: types[id[0]!] as never } : {}), ...(k < 2 ? { pinned: 'start' as const } : {}) }));
const host = document.getElementById('host')!;
const raf = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

let rows: RowA[] = [];
let grid: GridInstance<RowA> | null = null;
const p = {
  prepare(n: number) {
    const base = datasetA(100_000);
    rows = n <= base.length ? base : Array.from({ length: n }, (_, i) => ({ ...base[i % base.length]!, id: `r${i}` }));
  },
  /** Rows in memory → the second frame after the first body write. */
  overscan: undefined as undefined | { rows?: number; cols?: number },
  async firstRender(): Promise<number> {
    const t0 = performance.now();
    grid = createGrid<RowA>(host, { rows, getRowId: (r) => r.id, columns, messages: FR, timeZone: 'Africa/Algiers', ...(p.overscan ? { overscan: p.overscan } : {}) });
    await raf();
    await raf();
    return performance.now() - t0;
  },
  bodyNodes(): number {
    const body = document.querySelector('.dzg-body')!;
    const w = document.createTreeWalker(body, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
    let n = 0;
    while (w.nextNode()) n++;
    return n;
  },
  /** Scrolls by `step` px a frame for `frames` frames; frame deltas, and frames where the view had no row. */
  async scroll(axis: 'block' | 'inline', step: number, frames: number): Promise<{ deltas: number[]; empty: number }> {
    const vp = document.querySelector<HTMLElement>('.dzg-viewport')!;
    const deltas: number[] = [];
    let last = performance.now();
    // Timing pass: one step a frame, nothing else measured in it.
    for (let f = 0; f < frames; f++) {
      if (axis === 'block') vp.scrollTop += step;
      else vp.scrollLeft += step;
      await raf();
      const now = performance.now();
      deltas.push(now - last);
      last = now;
    }
    return { deltas, empty: 0 };
  },
  /** Coverage, a pass of its own (its hit tests force layouts): after each step, once the frame that follows has run the grid's paint, rows must be under the view. */
  async coverage(axis: 'block' | 'inline', step: number, frames: number): Promise<number> {
    const vp = document.querySelector<HTMLElement>('.dzg-viewport')!;
    const v = vp.getBoundingClientRect();
    const covered = () => [0.1, 0.5, 0.9].every((y) => document.elementFromPoint(v.left + v.width / 2, v.top + 40 + (v.height - 60) * y)?.closest('.dzg-row'));
    let empty = 0;
    for (let f = 0; f < frames; f++) {
      if (axis === 'block') vp.scrollTop += step;
      else vp.scrollLeft += step;
      await raf();
      await raf();
      if (!covered()) empty++;
    }
    return (empty / frames) * 100;
  },
  async transaction(): Promise<{ ms: number; touchedRows: number }> {
    const vp = document.querySelector<HTMLElement>('.dzg-viewport')!;
    vp.scrollTop = 0;
    await raf();
    await raf();
    // The time to the DOM write: the observer's callback runs right after the grid wrote.
    let wrote = 0;
    const touched = new Set<string | null | undefined>();
    const mo = new MutationObserver((records) => {
      wrote ||= performance.now();
      for (const m of records) touched.add(((m.target as Element).closest?.('.dzg-row') ?? (m.target as Node).parentElement?.closest('.dzg-row'))?.getAttribute('aria-rowindex'));
    });
    mo.observe(document.querySelector('.dzg-layer')!, { subtree: true, childList: true, characterData: true, attributes: true });
    const target = rows[2]!;
    const t0 = performance.now();
    grid!.kernel.rows.applyTransaction({ update: [{ ...target, t0: `${target.t0}!` }] });
    await raf();
    await raf();
    const ms = wrote ? wrote - t0 : -1;
    mo.disconnect();
    return { ms, touchedRows: touched.size };
  },
  async sortClick(): Promise<number> {
    const head = document.querySelector<HTMLElement>('.dzg-hcell[data-col="n0"]') ?? document.querySelector<HTMLElement>('.dzg-hcell')!;
    // Warm the keys first: a sort is clicked again, not cold.
    grid!.kernel.dispatch({ type: 'sort.set', sort: [{ column: 'n0', dir: 'asc' }] }, 'user');
    grid!.kernel.dispatch({ type: 'sort.set', sort: [] }, 'user');
    await raf();
    const t0 = performance.now();
    head.click();
    await raf();
    return performance.now() - t0;
  },
  destroy() {
    grid?.destroy();
    grid = null;
  },
  async cycles(n: number) {
    const small = rows.slice(0, 200);
    for (let i = 0; i < n; i++) {
      const g = createGrid<RowA>(host, { rows: small, getRowId: (r) => r.id, columns, messages: FR, timeZone: 'Africa/Algiers' }, { sync: true });
      g.destroy();
    }
    await raf();
  },
};
(window as unknown as { p: typeof p }).p = p;
(window as unknown as { ready: boolean }).ready = true;
