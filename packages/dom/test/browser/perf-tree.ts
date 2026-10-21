// What scripts/perf-browser.mjs `-- --only tree` drives (Phase 4 step 6): the million-row tree of
// perf/profiles/tree.ts (parent ids, ten levels, mixed widths) at 1 280 × 720, French.
import { createGrid, type GridInstance } from '/packages/dom/src/index.ts';
import { tree } from '/packages/dom/src/tree.ts';
import { FR } from '/packages/dom/src/locales/fr.ts';
import { FR_TREE } from '/packages/dom/src/locales/fr-tree.ts';
import { treeProfile, type TreeRow } from '/perf/profiles/tree.ts';

const host = document.getElementById('host')!;
const raf = () => new Promise<void>((r) => requestAnimationFrame(() => r()));
const messages = { ...FR, text: { ...FR.text, ...FR_TREE.text } };
let rows: TreeRow[] = [];
let grid: GridInstance<TreeRow> | null = null;
let watch: { loaf: number[]; frames: number[]; stop: boolean; t0: number; detail: unknown[] } | null = null;

/** A parent shown among the rows mounted in the view's upper half (by aria-rowindex), with its index. */
function parentInView(): { key: string; index: number } | null {
  const vp = document.querySelector<HTMLElement>('.dzg-viewport')!.getBoundingClientRect();
  const d = grid!.kernel.rows.displayed;
  const els = [...document.querySelectorAll<HTMLElement>('.dzg-layer > .dzg-row[aria-expanded]')].filter((r) => {
    const b = r.getBoundingClientRect();
    return b.top > vp.top + 40 && b.bottom < vp.top + vp.height / 2;
  });
  const r = els[0];
  if (!r) return null;
  const index = Number(r.getAttribute('aria-rowindex')) - 2;
  return { key: d.keyAt(index as never) as string, index };
}

const p = {
  prepare(n: number) {
    rows = treeProfile(n);
  },
  /** Rows in memory → the second frame after createGrid (the tree built, the roots painted). */
  async build(): Promise<number> {
    const t0 = performance.now();
    grid = createGrid<TreeRow>(host, {
      rows, getRowId: (r) => r.id, messages, locale: 'fr-FR',
      columns: [{ id: 'name', header: 'Nom', width: 260 }, { id: 'n', header: 'N', type: 'number', width: 120 }, { id: 'level', header: 'Niveau', type: 'number', width: 120 }],
      features: [tree<TreeRow>({ parentId: (r) => r.parent })],
    });
    await raf();
    await raf();
    return performance.now() - t0;
  },
  /** Everything opened → the next frame. */
  async expandAll(): Promise<{ ms: number; count: number }> {
    const t0 = performance.now();
    grid!.kernel.dispatch({ type: 'rows.expandAll', expanded: true }, 'user');
    await raf();
    return { ms: performance.now() - t0, count: grid!.kernel.rows.displayed.count };
  },
  /** Long animation frames and frame times from now to `stop()` (the runner wheels meanwhile). */
  start() {
    const w = (watch = { loaf: [] as number[], frames: [] as number[], stop: false, t0: performance.now(), detail: [] as unknown[] });
    const po = new PerformanceObserver((l) => {
      // A frame that began before the watch (the expand-all's) is not the scroll's.
      for (const e of (l.getEntries() as any[]).filter((x) => x.startTime >= w.t0)) {
        w.loaf.push(e.duration);
        w.detail.push({ at: Math.round(e.startTime - w.t0), d: Math.round(e.duration), block: Math.round(e.blockingDuration), render: Math.round(e.renderStart ? e.startTime + e.duration - e.renderStart : 0), style: Math.round(e.styleAndLayoutStart ? e.startTime + e.duration - e.styleAndLayoutStart : 0), scripts: e.scripts.map((x: any) => `${x.invoker}:${Math.round(x.duration)}:${x.sourceFunctionName}`) });
      }
    });
    po.observe({ type: 'long-animation-frame', buffered: false });
    let last = performance.now();
    const tick = () => {
      const now = performance.now();
      w.frames.push(now - last);
      last = now;
      if (!w.stop) requestAnimationFrame(tick);
      else po.disconnect();
    };
    requestAnimationFrame(tick);
  },
  async stop(): Promise<{ loaf: number[]; frames: number[]; top: number }> {
    watch!.stop = true;
    await raf();
    await raf();
    const vp = document.querySelector<HTMLElement>('.dzg-viewport')!;
    return { loaf: watch!.loaf, frames: watch!.frames.slice(2), top: vp.scrollTop, logical: (grid as any).scroll?.logicalTop, detail: watch!.detail };
  },
  /** A parent in the view closed then opened again, each to the next frame (and its model's part, `script`); `n` pairs. */
  async toggles(n: number): Promise<{ ms: number[]; script: number[]; index: number }> {
    const at = parentInView(); // the view where the runner left it
    if (!at) return { ms: [], script: [], index: -1 };
    const ms: number[] = [];
    const script: number[] = [];
    for (let k = 0; k < n; k++) {
      for (const expanded of [false, true]) {
        await raf();
        const t0 = performance.now();
        grid!.kernel.dispatch({ type: 'rows.expand', rows: [at.key as never], expanded }, 'user');
        script.push(performance.now() - t0);
        await raf();
        ms.push(performance.now() - t0);
      }
    }
    return { ms, script, index: at.index };
  },
  /** The focus on the first row's name cell (the runner then presses Ctrl+End). */
  async focusFirst() {
    const d = grid!.kernel.rows.displayed;
    grid!.api.focusCell(d.keyAt(0 as never), 'name');
    await raf();
  },
  /** Where the focus is: its row's aria-rowindex, the grid's aria-rowcount, the rows shown. */
  where() {
    const a = document.activeElement as HTMLElement;
    const r = a.closest('.dzg-row');
    return { rowindex: Number(r?.getAttribute('aria-rowindex')), rowcount: Number(document.querySelector('.dzg-viewport')!.getAttribute('aria-rowcount')), count: grid!.kernel.rows.displayed.count, col: a.dataset['col'] ?? null, focus: grid!.kernel.focus };
  },
};
(window as any).p = p;
(window as any).ready = true;
