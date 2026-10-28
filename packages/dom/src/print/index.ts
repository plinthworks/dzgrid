import { problem, type ColumnOrGroup, type GridKernel, type RowNode } from '@dzgrid/core';
import { emit } from '@dzgrid/core/internal';
import type { GridContext } from '../context.js';
import type { PrintMessageKey } from '../part-texts.js';
import { cellValue } from '../render/rows.js';

/** The texts `preparePrint()` needs, from `@dzgrid/dom/locales/<lang>-print` (a missing one: told once, `missing-message`). */
export const PRINT_KEYS = ['print.truncated', 'print.page'] as const satisfies readonly PrintMessageKey[];

export interface PrintOptions {
  /** Rows printed at most (5 000 by default, owner Q-I); beyond, the first ones, a line saying so, and `print-too-many`. */
  readonly maxRows?: number;
  /** The table's caption; the grid's accessible name otherwise. */
  readonly title?: string;
}

/** A grid made by `createGrid` (its kernel is how the features find it). */
export type PrintableGrid = { readonly kernel: GridKernel<any, any> };

/** How long one slice of the build runs before the main thread is given back (ms). */
const SLICE = 8;
const EM = ' ';
/** The grids told their print texts are missing (once each). */
const told = new WeakSet<object>();
/** The build asked last: a newer call cancels an older one. */
let gen = 0;
/** The cleanup of the table in the page (one at a time). */
let stop: (() => void) | null = null;

/**
 * The cleanup of one table: it closes over the container alone, so the app keeping it keeps no row (the build's own
 * closures, which read the rows, are dropped when the build ends). Idempotent: the container gone, nothing more to do.
 */
const cleaner = (box: HTMLElement): (() => void) => {
  const c = (): void => {
    if (stop === c) stop = null;
    if (box.isConnected) box.remove(), box.ownerDocument.documentElement.classList.remove('dzg-printing');
  };
  return c;
};

/** The main thread given back: `scheduler.yield()`, else a message, else a timeout. */
const pause = (w: any): Promise<unknown> =>
  w?.scheduler?.yield
    ? w.scheduler.yield()
    : new Promise((r) => {
        if (!w?.MessageChannel) return void setTimeout(r, 0);
        const c = new w.MessageChannel();
        c.port1.onmessage = () => (c.port1.close(), r(0));
        c.port2.postMessage(0);
      });

/**
 * `preparePrint(grid, options)` (docs/behaviors/print.md 1–9; owner Q-I, O9): writes the rows the grid shows — filtered,
 * sorted, searched; a tree's shown rows, pinned rows first and last; a server's shown page — as a real `<table>` in a
 * container beside the grid (a child of <body>), hidden on screen, built in slices so the page stays responsive; resolves
 * with the cleanup (idempotent). The screen grid is not touched. Style: `@dzgrid/theme/print.css`.
 *
 * ```ts
 * import { print } from '@dzgrid/dom/print';
 * import { FR_PRINT } from '@dzgrid/dom/locales/fr-print';
 * button.onclick = () => print(grid, { title: 'Patients' });
 * ```
 */
export function preparePrint(grid: PrintableGrid, o: PrintOptions = {}): Promise<() => void> {
  const g = (grid as unknown as { context: GridContext<unknown> }).context;
  stop?.();
  const my = ++gen;
  const { doc, kernel: K, rows: M, el } = g;
  const html = doc.documentElement;
  const add = <E extends keyof HTMLElementTagNameMap>(tag: E, to: Node, text?: string): HTMLElementTagNameMap[E] => {
    const e = doc.createElement(tag);
    if (text != null) e.textContent = text;
    return to.appendChild(e);
  };
  const tell = (code: Parameters<typeof problem>[0], path: string, detail: string): void => emit(K, { type: 'problems', source: 'api', problems: [problem(code, 'warning', path, detail)] });
  const text = g.settings.messages.text as Readonly<Record<string, unknown>>;
  const missing = PRINT_KEYS.filter((k) => text[k] === undefined);
  if (missing.length && !told.has(K)) told.add(K), tell('missing-message', 'messages.text', missing.join(', '));
  const say = (k: PrintMessageKey, p: Record<string, string | number>): string => (text[k] === undefined ? '' : g.msg(k as never, p));

  const box = add('div', doc.body);
  box.className = 'dzg-print';
  box.style.display = 'none';
  box.setAttribute('aria-hidden', 'true');
  const clean = (stop = cleaner(box));

  // ---------- what is printed, gathered from the model's reads ----------
  const cols = g.columns.visible();
  const n = cols.length;
  const D = M.displayed;
  const max = Number.isInteger(o.maxRows) && o.maxRows! > 0 ? o.maxRows! : 5000;
  const pins = g.settings.features?.find((f) => f.id === 'pinned-rows') as { api?(x: PrintableGrid): { rows(s: string): typeof D } | null } | undefined;
  const band = (side: string): [RowNode<unknown>, number][] => {
    const r = pins?.api?.(grid)?.rows(side);
    return Array.from({ length: r?.count ?? 0 }, (_, i) => [r!.nodeAt(i as never), -1]);
  };
  const jobs = band('top');
  let total = 0;
  for (let i = 0; i < D.count; i++) {
    const node = D.nodeAt(i as never);
    // A detail panel, a lazy parent's loading row, a filler: never printed (O9).
    if (node.kind === 'data' && total++ < max) jobs.push([node, i]);
  }
  jobs.push(...band('bottom'));

  // ---------- the table ----------
  const lang = el.root.closest('[lang]')?.getAttribute('lang');
  const table = doc.createElement('table');
  for (const e of [box, table]) e.setAttribute('dir', g.dir), lang && e.setAttribute('lang', lang);
  if (total > max) {
    add('p', box, say('print.truncated', { n: max, total })).className = 'dzg-print-note';
    tell('print-too-many', 'print', JSON.stringify({ total, max }));
  }
  box.append(table);
  const vp = el.viewport;
  const by = vp.getAttribute('aria-labelledby');
  const name = o.title ?? vp.getAttribute('aria-label') ?? (by ? by.split(/\s+/).map((id) => doc.getElementById(id)?.textContent ?? '').join(' ').trim() : '');
  const page = M.page && say('print.page', { page: M.page.index + 1, pages: M.page.pageCount ?? '?' });
  const caption = [name, page].filter(Boolean).join(' — ');
  if (caption) add('caption', table, caption);

  // Header groups (the spans feature draws them on screen): a row per level, top to bottom; a <colgroup> per top group.
  const up = new Map<string, readonly ColumnOrGroup<unknown>[]>();
  const walk = (defs: readonly ColumnOrGroup<unknown>[], path: readonly ColumnOrGroup<unknown>[]): void => {
    for (const d of defs) 'children' in d ? walk(d.children, [...path, d]) : up.set(d.id, path);
  };
  if (g.bands.length) walk(g.settings.columns as readonly ColumnOrGroup<unknown>[], []);
  const runs = (l: number): [ColumnOrGroup<unknown> | undefined, number][] => {
    const out: [ColumnOrGroup<unknown> | undefined, number][] = [];
    for (const c of cols) {
      const grp = up.get(c.id)?.[l];
      const last = out.at(-1);
      if (last && grp && last[0] === grp) last[1]++;
      else out.push([grp, 1]);
    }
    return out;
  };
  const depth = Math.max(0, ...cols.map((c) => up.get(c.id)?.length ?? 0));
  if (depth) for (const [, span] of runs(0)) span > 1 && (add('colgroup', table).span = span), span < 2 && add('colgroup', table);
  const head = add('thead', table);
  for (let l = 0; l < depth; l++) {
    const tr = add('tr', head);
    for (const [grp, span] of runs(l)) {
      const th = add(grp ? 'th' : 'td', tr, grp ? (grp.header ?? grp.id) : '');
      if (grp) th.setAttribute('scope', 'colgroup');
      if (span > 1) th.colSpan = span;
    }
  }
  const hr = add('tr', head);
  for (const c of cols) add('th', hr, c.def.header ?? c.id).setAttribute('scope', 'col');
  const tb = add('tbody', table);

  // ---------- the rows, in slices: the screen's text of each cell, as text ----------
  const read = g.edit?.read ?? null;
  const map = g.spans?.map;
  const cellText = (j: number, node: RowNode<unknown>): string => (node.kind === 'data' ? cellValue(cols[j]!, node.data, g.ctx, read, node.key).text : '');
  const row = (node: RowNode<unknown>, i: number): HTMLTableRowElement => {
    const tr = doc.createElement('tr');
    const whole = i < 0 ? null : map?.ownerAt(i, 0);
    // A full-width row (or one cell across every column): one cell.
    if (whole && whole.row === i && whole.cols >= n) return (add('td', tr, cellText(0, node)).colSpan = n), tr;
    for (let j = 0; j < n; j++) {
      // A merged cell: its value on every row and column it covers (O9, as the CSV).
      const s = i < 0 ? null : map?.ownerAt(i, j);
      const t = s ? cellText(s.col, s.row === i ? node : D.nodeAt(s.row as never)) : cellText(j, node);
      add('td', tr, j || !node.level ? t : EM.repeat(node.level) + t);
    }
    return tr;
  };

  return (async () => {
    for (let k = 0; k < jobs.length; ) {
      const start = g.now();
      const part = doc.createDocumentFragment();
      do part.append(row(...jobs[k++]!));
      while (k < jobs.length && g.now() - start < SLICE);
      tb.append(part);
      if (k < jobs.length) {
        await pause(g.win);
        // A newer call, a cleanup or the grid gone: this build stops, its table removed.
        if (my !== gen || !box.isConnected || g.scope.isDisposed) return clean(), clean;
      }
    }
    if (box.isConnected) html.classList.add('dzg-printing');
    return clean;
  })();
}

/**
 * `print(grid, options)`: `preparePrint`, the browser's print dialog, and the cleanup on `afterprint` (every engine of the
 * support matrix sends it; the plan's `matchMedia('print')` fallback was dropped for the 1 600 B line, as §5 orders).
 */
export async function print(grid: PrintableGrid, o?: PrintOptions): Promise<void> {
  const done = await preparePrint(grid, o);
  const w = (grid as unknown as { context: GridContext<unknown> }).context.win;
  if (!w) return done();
  w.addEventListener('afterprint', done, { once: true });
  w.print();
}
