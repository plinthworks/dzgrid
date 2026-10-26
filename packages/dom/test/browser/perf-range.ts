// What scripts/perf-browser.mjs `-- --only range-b` drives (Phase 5 step 12, step12-plan.md « Bench », indicative until
// the quiet-machine run, Q17d): dataset B (3 000 × 12) in an editable grid with blocks and the fill, French, a save that
// records and answers in a microtask; each gesture timed from its event to the next painted frame, the long tasks counted.
import { createGrid, type GridInstance } from '/packages/dom/src/index.ts';
import { edit } from '/packages/dom/src/edit.ts';
import { editors } from '/packages/dom/src/editors.ts';
import { range } from '/packages/dom/src/range.ts';
import { fill } from '/packages/dom/src/fill.ts';
import { FR } from '/packages/dom/src/locales/fr.ts';
import { FR_EDIT } from '/packages/dom/src/locales/fr-edit.ts';
import { FR_EDITORS } from '/packages/dom/src/locales/fr-editors.ts';
import { FR_RANGE } from '/packages/dom/src/locales/fr-range.ts';
import { FR_FILL } from '/packages/dom/src/locales/fr-fill.ts';
import { datasetB, type RowB } from '/perf/dataset.ts';
import { dataKey } from '/packages/core/src/index.ts';

const host = document.getElementById('host')!;
/** The command key: Cmd on a Mac (the grid reads the platform), Ctrl elsewhere. */
const mac = /Mac|iP(hone|ad|od)/.test(navigator.platform);
const cmd = { ctrlKey: !mac, metaKey: mac };
const frame = () => new Promise<void>((r) => requestAnimationFrame(() => setTimeout(r, 0)));
const messages = { ...FR, text: { ...FR.text, ...FR_EDIT.text, ...FR_EDITORS.text, ...FR_RANGE.text, ...FR_FILL.text } };
const COLS = [
  { id: 'product', header: 'Produit', width: 180, editable: true }, { id: 'lot', header: 'Lot', width: 90, editable: true },
  { id: 'stock', header: 'Stock', type: 'number', width: 80, editable: true, edit: { min: 0 } }, { id: 'min', header: 'Min', type: 'number', width: 70, editable: true },
  { id: 'price', header: 'Prix', type: 'number', width: 90, editable: true }, { id: 'expiry', header: 'Péremption', type: 'day', width: 110, editable: true },
  { id: 'received', header: 'Reçu', type: 'instant', width: 150, editable: true }, { id: 'status', header: 'État', type: 'enum', width: 90, editable: true, enumOptions: ['ok', 'low', 'out', 'blocked'].map((value) => ({ value, label: value })) },
  { id: 'active', header: 'Actif', type: 'boolean', width: 70, editable: true }, { id: 'site', header: 'Site', type: 'enum', width: 110, editable: true, enumOptions: ['alger', 'oran', 'constantine', 'annaba', 'blida', 'setif'].map((value) => ({ value, label: value })) },
  { id: 'note', header: 'Note', width: 160, editable: true }, { id: 'id', header: 'Id', width: 70 },
];
let grid: GridInstance<RowB> | null = null;
let blocks = range();
let filling = fill(blocks);
let editing = edit<RowB>();
const requests: { changes: number }[] = [];
let long = 0;
new PerformanceObserver((l) => { for (const e of l.getEntries()) if (e.duration > 50) long++; }).observe({ type: 'longtask', buffered: false });

const key = (id: string) => dataKey(id)!;
const cell = (id: string, col: string) => [...host.querySelectorAll<HTMLElement>('.dzg-layer > .dzg-row')].find((r) => r.querySelector('[data-col="id"]')?.textContent === id)?.querySelector<HTMLElement>(`[data-col="${col}"]`) ?? null;

const p = {
  /** A fresh grid of dataset B (n rows). */
  async make(n = 3000) {
    grid?.destroy();
    requests.length = 0;
    blocks = range();
    filling = fill(blocks);
    editing = edit<RowB>({ save: (req) => (requests.push({ changes: req.changes.length }), Promise.resolve()) });
    grid = createGrid<RowB>(host, { rows: datasetB(n), getRowId: (r) => r.id, columns: COLS as never, messages, locale: 'fr-FR', timeZone: 'Africa/Algiers', features: [editing, editors(), blocks, filling] });
    await frame();
    await frame();
  },
  /** Runs a gesture, then times it to the next painted frame; the requests and long tasks it made. */
  async time(run: () => void) {
    long = 0;
    requests.length = 0;
    const t0 = performance.now();
    run();
    await frame();
    const ms = performance.now() - t0;
    await new Promise((r) => setTimeout(r, 60));
    return { ms, requests: requests.length, changes: requests.reduce((a, r) => a + r.changes, 0), long };
  },
  /** 1. Bulk: the stock column of every row, Ctrl+Enter in the first row's field. */
  async bulk() {
    const d = grid!.kernel.rows.displayed;
    const last = d.keyAt(d.index(d.count - 1)!);
    grid!.api.focusCell(key('b0'), 'stock');
    await frame();
    blocks.api(grid!)!.set({ anchor: { row: key('b0'), column: 'stock' }, focus: { row: last, column: 'stock' } });
    cell('b0', 'stock')!.focus();
    cell('b0', 'stock')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'F2', bubbles: true, cancelable: true }));
    await frame();
    const f = host.querySelector<HTMLInputElement>('.dzg-field')!;
    f.value = '77';
    f.dispatchEvent(new Event('input', { bubbles: true }));
    return p.time(() => f.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ...cmd, bubbles: true, cancelable: true })));
  },
  /** 2. A paste of 100 × 10 cells from the paste event. */
  async paste() {
    grid!.api.focusCell(key('b10'), 'product');
    await frame();
    cell('b10', 'product')!.focus();
    const tsv = Array.from({ length: 100 }, (_, i) => Array.from({ length: 10 }, (_, j) => (j === 2 || j === 3 ? String(i + j) : j === 0 ? `p${i}` : '')).join('\t')).join('\n');
    const dt = new DataTransfer();
    dt.setData('text/plain', tsv);
    return p.time(() => document.body.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })));
  },
  /** 3. A fill of a 2-row number series down 2 998 rows, by the API. */
  async series() {
    grid!.api.focusCell(key('b0'), 'min');
    await frame();
    blocks.api(grid!)!.set({ anchor: { row: key('b0'), column: 'min' }, focus: { row: key('b1'), column: 'min' } });
    const d = grid!.kernel.rows.displayed;
    return p.time(() => void filling.api(grid!)!.fill({ row: d.keyAt(d.index(d.count - 1)!), column: 'min' }));
  },
  /** 4. Ctrl+D on every cell (3 000 × 12). */
  async down() {
    grid!.api.focusCell(key('b0'), 'product');
    await frame();
    const d = grid!.kernel.rows.displayed;
    blocks.api(grid!)!.set({ anchor: { row: key('b0'), column: 'product' }, focus: { row: d.keyAt(d.index(d.count - 1)!), column: 'id' } });
    cell('b0', 'product')!.focus();
    return p.time(() => cell('b0', 'product')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'd', code: 'KeyD', ...cmd, bubbles: true, cancelable: true })));
  },
  /** 5. Undo of the last gesture (Ctrl+Z through the API). */
  async undo() {
    return p.time(() => void editing.api(grid!)!.undo());
  },
};
(window as unknown as { p: typeof p; ready: boolean }).p = p;
(window as unknown as { ready: boolean }).ready = true;
