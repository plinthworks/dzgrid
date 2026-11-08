// What scripts/perf-browser.mjs drives for the features (Phase 11 L3, ARCHITECTURE §5.3 lines « not measured » since
// Phase 3 and the later features): dataset A (100 000 × 30) at 1 280 × 720 grouped, pivoted, filtered from the floating
// row, a value list of 20 000 values scrolled, printed. Each call makes its own grid (the last one destroyed first); the
// rows are in memory before any clock starts. Times are to the next frame (or the second, as `perf.ts`).
import { createGrid, type GridInstance } from '/packages/dom/src/index.ts';
import { grouping } from '/packages/dom/src/grouping.ts';
import { pivot } from '/packages/dom/src/pivot.ts';
import { spans } from '/packages/dom/src/spans.ts';
import { filters } from '/packages/dom/src/filters.ts';
import { preparePrint } from '/packages/dom/src/print.ts';
import { FR } from '/packages/dom/src/locales/fr.ts';
import { FR_GROUP } from '/packages/dom/src/locales/fr-group.ts';
import { FR_PIVOT } from '/packages/dom/src/locales/fr-pivot.ts';
import { FR_PRINT } from '/packages/dom/src/locales/fr-print.ts';
import { FR_FILTERS } from '/packages/dom/src/locales/fr-filters.ts';
import { datasetA, type RowA } from '/perf/dataset.ts';

const types: Record<string, string> = { n: 'number', d: 'day', i: 'instant', b: 'boolean' };
const ids = ['id', 't0', 't1', 't2', 't3', 't4', 'a0', 'a1', 'a2', 'a3', 'a4', 'n0', 'n1', 'n2', 'n3', 'n4', 'n5', 'n6', 'n7', 'd0', 'd1', 'd2', 'd3', 'i0', 'i1', 'e0', 'e1', 'e2', 'b0', 'b1'];
/** The perf page's columns; the three totals of the Node bench (`perf/bench-entry.ts` groupCases): a sum, a mean, the latest day. */
const AGG: Record<string, string> = { n1: 'sum', n0: 'avg', d0: 'max' };
// The kinds and functions picked from a record are wider than ColumnDef's unions: a page, not API.
const columns = ids.map((id, k) => ({ id, width: 110, ...(id !== 'id' && types[id[0]!] ? { type: types[id[0]!] as never } : {}), ...(k < 2 ? { pinned: 'start' as const } : {}), ...(AGG[id] ? { aggFunc: AGG[id] as never } : {}) }));
/** A tenth of `n2` (0–99): ten groups of about 10 000 rows each (the Node line's « group of ~10 000 rows »). */
const tenth = { id: 'tenth', width: 90, type: 'number' as never, // a literal kept apart from ColumnDef: a page, not API
  value: (r: RowA) => Math.floor(r.n2 / 10) };
const text = { ...FR.text, ...FR_GROUP.text, ...FR_PIVOT.text, ...FR_PRINT.text, ...FR_FILTERS.text };
const host = document.getElementById('host')!;
const raf = () => new Promise<void>((r) => requestAnimationFrame(() => r()));
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const med = (a: number[]) => [...a].sort((x, y) => x - y)[a.length >> 1]!;

/** Long animation frames and long tasks seen from `start()` to `stop()`. */
function watch() {
  const seen: { type: string; duration: number }[] = [];
  const obs = (['long-animation-frame', 'longtask'] as const).flatMap((type) => {
    try {
      const po = new PerformanceObserver((l) => { for (const e of l.getEntries()) seen.push({ type, duration: e.duration }); });
      po.observe({ type, buffered: false });
      return [po];
    } catch {
      return [];
    }
  });
  return {
    stop() {
      for (const o of obs) o.takeRecords().forEach((e) => seen.push({ type: e.entryType, duration: e.duration }));
      obs.forEach((o) => o.disconnect());
      const top = (t: string) => Math.max(0, ...seen.filter((e) => e.type === t).map((e) => e.duration));
      return { loaf: top('long-animation-frame'), longtask: top('longtask') };
    },
  };
}

let rows: RowA[] = [];
let grid: GridInstance<RowA> | null = null;
const fresh = () => (grid?.destroy(), (grid = null), host.replaceChildren());
const make = (o: Record<string, unknown>) =>
  (grid = createGrid<RowA>(host, { rows, getRowId: (r: RowA) => r.id, columns, messages: { ...FR, text }, timeZone: 'Africa/Algiers', ...o } as never)); // the options spread from a record: a page, not API
/** Frame deltas while `move()` runs once a frame for `frames` frames (the first two dropped by the caller). */
async function frames(move: () => void, n: number): Promise<number[]> {
  const deltas: number[] = [];
  let last = performance.now();
  for (let f = 0; f < n; f++) {
    move();
    await raf();
    const now = performance.now();
    deltas.push(now - last);
    last = now;
  }
  return deltas;
}

const p = {
  prepare() {
    rows = datasetA(100_000);
  },
  /** §5.3 « Regroupement sur 2 colonnes + 3 agrégations (A) ≤ 150 ms »: the grid made grouped, to the second frame. */
  async group(): Promise<{ ms: number; rows: number }> {
    fresh();
    await raf();
    const t0 = performance.now();
    make({ features: [grouping({ by: ['e1', 'n2'] })] });
    await raf();
    await raf();
    return { ms: performance.now() - t0, rows: document.querySelectorAll('.dzg-layer .dzg-row').length };
  },
  /** §5.3 « déployer un groupe de 10 000 lignes ≤ 30 ms »: A grouped by a tenth of n2, the first group's chevron clicked, to the next frame. Median of `n` open + close pairs (the open timed). */
  async openGroup(n: number): Promise<{ ms: number[]; shown: number }> {
    fresh();
    make({ columns: [...columns, tenth], features: [grouping({ by: ['tenth'] })] });
    await raf();
    await raf();
    const ms: number[] = [];
    let shown = 0;
    for (let k = 0; k < n; k++) {
      const toggle = document.querySelector<HTMLElement>('.dzg-layer .dzg-row[data-kind=group] .dzg-toggle')!;
      const t0 = performance.now();
      toggle.click();
      await raf();
      ms.push(performance.now() - t0);
      shown = grid!.kernel.rows.displayed.count;
      await raf();
      document.querySelector<HTMLElement>('.dzg-layer .dzg-row[data-kind=group] .dzg-toggle')!.click();
      await raf();
      await raf();
    }
    return { ms, shown };
  },
  /** §5.3 / Phase 10: A with 2 row columns, 2 pivot columns, 3 values (48 created columns), the grid made, to the second frame. */
  async pivot(): Promise<{ ms: number; columns: number }> {
    fresh();
    await raf();
    const t0 = performance.now();
    make({ features: [grouping({ by: ['e1', 'n2'], pivot: pivot({ columns: ['e0', 'e2'], values: { n1: 'sum', n0: 'avg', d0: 'max' } as never }) }), spans()] }); // values typed by the core's Fns: a page, not API
    await raf();
    await raf();
    return { ms: performance.now() - t0, columns: document.querySelectorAll('.dzg-header .dzg-hcell').length };
  },
  /**
   * Phase 3 « frappe dans le filtre flottant »: a text column's floating box, a keystroke that filters at once
   * (`debounceMs: 0`, the worst a user can set: every key runs the filter over A) to the next frame; each key narrows.
   * `wait`: the time between the focus and the first key (a person's, about half a second; 0: at once).
   */
  async typing(wait: number): Promise<{ ms: number[]; shown: number; narrowed: number; loaf: number }> {
    fresh();
    make({ features: [filters({ floating: true, debounceMs: 0 })] });
    await raf();
    await raf();
    const box = document.querySelector<HTMLInputElement>('.dzg-hcell[data-col="t0"] input, [data-col="t0"] input[data-dzg-owner="filter-input"]')
      ?? [...document.querySelectorAll<HTMLInputElement>('input[data-dzg-owner="filter-input"]')][0]!;
    box.focus();
    await sleep(wait);
    const ms: number[] = [];
    let narrowed = 0;
    const w = watch();
    for (const s of ['e', 'en', 'ent', 'en', 'e', '']) {
      box.value = s;
      const t0 = performance.now();
      box.dispatchEvent(new InputEvent('input', { bubbles: true, data: s.slice(-1), inputType: 'insertText' }));
      await raf();
      ms.push(performance.now() - t0);
      if (s === 'ent') narrowed = grid!.kernel.rows.displayed.count;
      await raf();
    }
    const shown = grid!.kernel.rows.displayed.count;
    return { ms, shown, narrowed, loaf: w.stop().loaf };
  },
  /**
   * Phase 3 « défilement d'une liste de 20 000 valeurs »: a set filter over a column of 20 000 values, opened (to the
   * frame its options show), then its list scrolled 40 px a frame for `n` frames.
   */
  async setList(n: number): Promise<{ open: number; deltas: number[]; options: number; scrolled: number }> {
    fresh();
    const f = filters();
    const place = { id: 'place', header: 'Commune', width: 160, value: (r: RowA) => `Commune ${Number(r.id.slice(1)) % 20_000}`, filter: { kind: 'set' } };
    make({ columns: [columns[0]!, place, ...columns.slice(2)], features: [f] });
    await raf();
    await raf();
    const shown = () => document.querySelectorAll('.dzg-popup [role=option]').length;
    // A first open warms the chunk and the index (the cold open is `perf.ts`'s line); then the timed one.
    f.openFilter('place');
    while (!shown()) await raf();
    f.closeFilter();
    await raf();
    const t0 = performance.now();
    f.openFilter('place');
    while (!shown()) await raf();
    await raf();
    const open = performance.now() - t0;
    const list = [...document.querySelectorAll<HTMLElement>('.dzg-popup *')].find((e) => e.scrollHeight > e.clientHeight + 100 && getComputedStyle(e).overflowY !== 'visible')!;
    const deltas = await frames(() => void (list.scrollTop += 40), n);
    const scrolled = list.scrollTop;
    const options = shown();
    f.closeFilter();
    return { open, deltas, options, scrolled };
  },
  /** Print of 5 000 rows (print.md, owner Q-I): `preparePrint` on A to its table built, the longest task and frame during it. */
  async print(): Promise<{ ms: number; rows: number; loaf: number; longtask: number }> {
    fresh();
    make({});
    await raf();
    await raf();
    await sleep(50);
    const w = watch();
    const t0 = performance.now();
    const done = await preparePrint(grid!, { maxRows: 5000 });
    const ms = performance.now() - t0;
    await sleep(60);
    const r = w.stop();
    const printed = document.querySelectorAll('table tbody tr').length;
    done?.();
    return { ms, rows: printed, ...r };
  },
  destroy: fresh,
};
(window as unknown as { p: typeof p }).p = p;
(window as unknown as { ready: boolean }).ready = true;
