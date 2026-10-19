import { describe, it, expect, afterEach } from 'vitest';
import { dataKey, type ColumnDef, type ColumnOrGroup, type RowKey } from '@dzgrid/core';
import { buildSpanMap, type SpanCell, type SpanMap } from '@dzgrid/core/spans';
import { createGrid, type GridInstance } from '../src/grid.js';
import type { GridSettings } from '../src/settings.js';
import type { Geometry, ViewportBox } from '../src/render/measure.js';
import type { GridContext } from '../src/context.js';
import { spans } from '../src/spans.js';
import { EN } from '../src/locales/en.js';

/**
 * Property checks of the spans feature's paint (coverage review of step 9b,
 * commit 3): random span grids (merge, rowSpan, colSpan, full width; pinning,
 * hidden columns, right to left, pagination, view sizes, scroll positions),
 * and after every paint the DOM is held against a fresh span map:
 *
 * - every visible slot is drawn by exactly one mounted cell, and that cell is
 *   the owner's origin; no covered slot has an element;
 * - a cell's aria-rowspan/colspan are the map's extents; its drawn rows stay
 *   inside the span; its width is its columns', its inline place its first column's;
 * - DOM order is aria-rowindex order;
 * - a row no span meets carries no span state (attributes, raised segments,
 *   geometry, label, placed pinned cells), whatever it was used for before;
 * - keys never land on a covered slot, the focused element is the focused
 *   cell, and an arrow that moved is undone by the opposite arrow.
 */
type R = Record<string, unknown> & { id: string; n: number; flag: boolean };
const H = 32;
let grids: GridInstance<R>[] = [];
afterEach(() => { for (const g of grids) g.destroy(); grids = []; document.body.innerHTML = ''; });

function rng(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return { next, int: (lo: number, hi: number) => lo + Math.floor(next() * (hi - lo + 1)), pick: <X>(xs: readonly X[]) => xs[Math.floor(next() * xs.length)]!, chance: (p: number) => next() < p };
}
const hash = (n: number, j: number) => {
  let h = (n * 2654435761 + j * 40503) >>> 0;
  h ^= h >>> 13;
  return Math.imul(h, 0x5bd1e995) >>> 0;
};

interface Spec {
  rows: R[];
  columns: ColumnOrGroup<R>[];
  settings: Partial<GridSettings<R>>;
  block: number;
  inline: number;
  maxPhysical?: number;
}

function randomSpec(r: ReturnType<typeof rng>, o: { rows?: number; longRuns?: number } = {}): Spec {
  const ncol = r.int(2, 6);
  const n = o.rows ?? r.pick([0, 1, 2, 7, 40, 120, 300]);
  const cols: ColumnDef<R>[] = [];
  const merged: number[] = [];
  for (let j = 0; j < ncol; j++) {
    const def: { -readonly [K in keyof ColumnDef<R>]: ColumnDef<R>[K] } = { id: `c${j}`, header: `C${j}`, width: 50 + 10 * r.int(0, 10) };
    const p = r.next();
    if (p < 0.18) def.pinned = 'start';
    else if (p < 0.28) def.pinned = 'end';
    if (j > 0 && r.chance(0.1)) def.hidden = true;
    const rule = r.next();
    if (rule < 0.4) {
      def.merge = true;
      merged.push(j);
    } else if (rule < 0.55) def.rowSpan = (c) => { const h = hash(c.row.n as number, j); return h % 4 === 0 ? 1 + (h >>> 3) % 6 : 1; };
    else if (rule < 0.7) def.colSpan = (c) => { const h = hash(c.row.n as number, j + 7); return h % 5 === 0 ? 2 + (h >>> 3) % 2 : 1; };
    else if (rule < 0.8) {
      // Tall and wide at once.
      def.rowSpan = (c) => { const h = hash(c.row.n as number, j + 3); return h % 3 === 0 ? 2 + (h >>> 3) % 4 : 1; };
      def.colSpan = (c) => { const h = hash(c.row.n as number, j + 3); return h % 3 === 0 ? 2 : 1; };
    }
    cols.push(def);
  }
  const rows: R[] = [];
  const runs = merged.map(() => ({ left: 0, v: 0 }));
  for (let i = 0; i < n; i++) {
    const row: R = { id: `r${i}`, n: i, flag: r.chance(0.05) };
    for (let j = 0; j < ncol; j++) {
      const m = merged.indexOf(j);
      if (m === -1) row[`c${j}`] = `v${hash(i, j) % 1000}`;
      else {
        const run = runs[m]!;
        if (run.left === 0) {
          run.v++;
          run.left = o.longRuns ?? r.pick([1, 1, 2, 3, 5, 8, 30, 90]);
        }
        run.left--;
        row[`c${j}`] = `m${run.v % 4}-${run.v}`;
      }
    }
    rows.push(row);
  }
  const settings: { -readonly [K in keyof GridSettings<R>]?: GridSettings<R>[K] } = {};
  if (r.chance(0.3)) settings.direction = 'rtl';
  if (r.chance(0.3)) settings.selection = { mode: 'multi', checkbox: true };
  if (r.chance(0.25)) settings.fullWidth = (row) => row.flag;
  if (r.chance(0.2)) settings.pagination = { pageSize: r.int(3, 60) };
  if (r.chance(0.7)) settings.overscan = { rows: r.int(0, 3), cols: r.int(0, 2) };
  if (r.chance(0.25)) settings.density = r.pick(['compact', 'spacious'] as const);
  // Sometimes a group over the first columns (a header band row above the column headers).
  const columns: ColumnOrGroup<R>[] = ncol > 2 && r.chance(0.25) ? [{ id: 'g', header: 'G', children: cols.slice(0, 2) }, ...cols.slice(2)] : cols;
  return { rows, columns, settings, block: r.pick([64, 100, 200, 320, 500]), inline: r.pick([150, 300, 600, 2000]) };
}

function make(spec: Spec) {
  const box: { -readonly [K in keyof ViewportBox]: ViewportBox[K] } = { block: spec.block, inline: spec.inline, scrollTop: 0, scrollInline: 0 };
  const geometry: Geometry = { read: () => ({ ...box }), writeScrollTop: (px) => { box.scrollTop = px; }, writeScrollInline: (px) => { box.scrollInline = px; } };
  const host = document.createElement('div');
  document.body.append(host);
  const g = createGrid<R>(host, {
    rows: spec.rows, getRowId: (x) => x.id, columns: spec.columns, messages: EN, features: [spans()], ...spec.settings,
  }, { geometry, sync: true, ...(spec.maxPhysical ? { maxPhysical: spec.maxPhysical } : {}) });
  grids.push(g);
  const vp = host.querySelector<HTMLElement>('.dzg-viewport')!;
  const ctx = (g as unknown as { context: GridContext<R> }).context;
  const scrollTo = (top: number, inline = box.scrollInline) => {
    box.scrollTop = top;
    box.scrollInline = inline;
    vp.dispatchEvent(new Event('scroll'));
  };
  return { g, host, vp, box, ctx, scrollTo };
}
type M = ReturnType<typeof make>;

const px = (el: HTMLElement, p: string): number | null => {
  const v = el.style.getPropertyValue(p);
  return v === '' ? null : parseFloat(v);
};

function freshMap(m: M): SpanMap {
  return buildSpanMap({ rows: m.ctx.rows.displayed, columns: m.ctx.columns, ctx: m.ctx.ctx, fullWidth: m.ctx.settings.fullWidth });
}

/** Every invariant of one paint; returns the problems found (empty: all hold). */
function check(m: M): string[] {
  const H = m.ctx.rowHeight();
  const out: string[] = [];
  const bad = (s: string) => { if (out.length < 12) out.push(s); };
  const { ctx, box } = m;
  const d = ctx.rows.displayed;
  const map = freshMap(m);
  const L = ctx.columns.layout;
  const segs = [L.start, L.center, L.end];
  const ids: string[] = [];
  const segOf: number[] = [];
  const offOf: number[] = [];
  const wOf: number[] = [];
  segs.forEach((s, k) => s.columns.forEach((c, i) => { ids.push(c.id); segOf.push(k); offOf.push(s.widths.offsetOf(i)); wOf.push(s.widths.sizeAt(i)); }));
  const nCols = ids.length;
  const extra = ctx.settings.selection?.checkbox ? 40 : 0;
  const owner = (r: number, c: number): SpanCell => map.ownerAt(r, c) ?? { row: r, col: c, rows: 1, cols: 1 };

  const rowEls = [...ctx.el.layer.children] as HTMLElement[];
  const headerRows = ctx.bands.length + 1 + ctx.headerRows.length;
  const idx = rowEls.map((e) => Number(e.getAttribute('aria-rowindex')) - headerRows - 1);
  for (let i = 1; i < idx.length; i++) if (!(idx[i - 1]! < idx[i]!)) bad(`DOM order ${idx.join(',')}`);
  const byRow = new Map<number, HTMLElement>();
  rowEls.forEach((e, i) => byRow.set(idx[i]!, e));

  // The visible rows (the view's block, no margin), and a reference row in it to place the others by.
  const top = ctx.scroll.logicalTop;
  const firstV = Math.floor(top / H);
  // As the base counts it: the view's last whole pixel (a row showing less than a pixel is not one).
  const lastV = Math.min(d.count - 1, Math.floor((top + Math.max(1, box.block) - 1) / H));
  const ref = d.count ? byRow.get(firstV) : undefined;
  if (d.count && !ref) bad(`first visible row ${firstV} not mounted`);
  const refTop = ref ? px(ref, 'inset-block-start')! : 0;
  const slotOf = (absTop: number) => firstV + (absTop - refTop) / H;

  // Centre columns in view.
  const centreView = Math.max(0, box.inline - L.start.width - extra - L.end.width);
  const colVisible = (c: number) => segOf[c] !== 1 || (offOf[c]! < box.scrollInline + centreView && offOf[c]! + wOf[c]! > box.scrollInline);

  // Rows hosting tall cells: their pinned segments raised above the default (2), the earlier higher.
  let lastZ = Infinity;
  for (const rowEl of rowEls) {
    const z = rowEl.querySelector<HTMLElement>(':scope > .dzg-seg-start')!.style.zIndex;
    if (z === '') continue;
    const zn = Number(z);
    if (!(zn > 2 && zn < lastZ)) bad(`host z ${z} after ${lastZ}`);
    lastZ = zn;
  }
  const cover = new Map<string, number>();
  for (const [ri, rowEl] of byRow) {
    const meets = map.inRow(ri, 0, nCols - 1);
    const full = map.fullWidth(ri);
    const tallHere = meets.some((s) => s.row === ri && s.rows > 1);
    const rowTop = px(rowEl, 'inset-block-start')!;
    const seg = (k: number) => rowEl.querySelector<HTMLElement>(`:scope > .dzg-seg-${['start', 'center', 'end'][k]}`)!;
    // Pooled-row state: nothing of a span on a row no span meets.
    if (!meets.length) {
      if (rowEl.hasAttribute('data-spans')) bad(`row ${ri}: data-spans with no span`);
      if (rowEl.hasAttribute('data-full')) bad(`row ${ri}: data-full with no span`);
    }
    if (rowEl.hasAttribute('data-full') !== full) bad(`row ${ri}: data-full ${rowEl.hasAttribute('data-full')} vs map ${full}`);
    if (rowEl.hasAttribute('data-spans') !== meets.some((s) => s.rows > 1)) bad(`row ${ri}: data-spans ${rowEl.hasAttribute('data-spans')}`);
    for (const k of [0, 2]) if ((seg(k).style.zIndex !== '') !== tallHere) bad(`row ${ri}: segment ${k} z '${seg(k).style.zIndex}' (hosts a tall cell: ${tallHere})`);
    for (const cellEl of rowEl.querySelectorAll<HTMLElement>('.dzg-cell')) {
      const id = cellEl.getAttribute('data-col')!;
      const c = ids.indexOf(id);
      if (c === -1) { bad(`row ${ri}: cell of a hidden column ${id}`); continue; }
      const o = owner(ri, c);
      if (o.row !== ri || o.col !== c) { bad(`row ${ri}: element on covered slot ${id} (owner ${o.row},${o.col})`); continue; }
      const rs = cellEl.getAttribute('aria-rowspan');
      const cs = cellEl.getAttribute('aria-colspan');
      if (rs !== (o.rows > 1 ? String(o.rows) : null)) bad(`row ${ri} ${id}: aria-rowspan ${rs} vs ${o.rows}`);
      if (cs !== (o.cols > 1 ? String(o.cols) : null)) bad(`row ${ri} ${id}: aria-colspan ${cs} vs ${o.cols}`);
      const isSpan = !!map.ownerAt(ri, c);
      if (cellEl.hasAttribute('data-span') !== isSpan) bad(`row ${ri} ${id}: data-span`);
      const label = cellEl.querySelectorAll(':scope > .dzg-span-label').length;
      if (label !== (o.rows > 1 ? 1 : 0)) bad(`row ${ri} ${id}: ${label} labels (rows ${o.rows})`);
      if (o.rows === 1) for (const p of ['inset-block-start', 'block-size', '--dzg-span-at']) if (cellEl.style.getPropertyValue(p) !== '') bad(`row ${ri} ${id}: leftover ${p} on a one-row cell`);
      // Width: its columns'.
      const want = wOf.slice(c, c + o.cols).reduce((a, b) => a + b, 0);
      if (!full && px(cellEl, 'inline-size') !== want) bad(`row ${ri} ${id}: inline-size ${px(cellEl, 'inline-size')} vs ${want}`);
      // Inline place, as the browser would lay it out (centre and spanning rows' pinned: absolute; else the flow).
      const k = segOf[c]!;
      const absolute = k === 1 || rowEl.hasAttribute('data-spans');
      let x: number | null;
      if (absolute) x = px(cellEl, 'inset-inline-start');
      else {
        x = k === 0 ? extra : 0;
        for (let s = cellEl.previousElementSibling; s; s = s.previousElementSibling) if (s.classList.contains('dzg-cell')) x += px(s as HTMLElement, 'inline-size') ?? 0;
        // A pinned cell in the flow carries no stale absolute place.
        if (cellEl.style.getPropertyValue('inset-inline-start') !== '') bad(`row ${ri} ${id}: stale inset-inline-start ${cellEl.style.getPropertyValue('inset-inline-start')} on a pinned cell in the flow`);
      }
      const wantX = offOf[c]! + (k === 0 ? extra : 0);
      if (!full && x !== wantX) bad(`row ${ri} ${id}: inline place ${x} vs ${wantX}`);
      // Rows drawn.
      let r0 = ri;
      let r1 = ri + 1;
      if (o.rows > 1) {
        const ins = px(cellEl, 'inset-block-start');
        const size = px(cellEl, 'block-size');
        if (ins === null || size === null) bad(`row ${ri} ${id}: tall cell without geometry`);
        else {
          r0 = slotOf(rowTop + ins);
          r1 = r0 + size / H;
          if (ref && !(size >= H)) bad(`row ${ri} ${id}: tall cell drawn ${size}px (less than a row)`);
          // The label at the span's centre, kept inside the part drawn.
          const at = px(cellEl, '--dzg-span-at');
          const mid = ((o.row + (o.rows - 1) / 2) - r0) * H;
          const wantAt = Math.max(0, Math.min(size - H, mid));
          if (ref && (at === null || Math.abs(at - wantAt) > 1e-6)) bad(`row ${ri} ${id}: label at ${at} vs ${wantAt}`);
          if (ref && (r0 < o.row - 1e-6 || r1 > o.row + o.rows + 1e-6)) bad(`row ${ri} ${id}: drawn ${r0}..${r1} outside its span ${o.row}..${o.row + o.rows}`);
          if (!Number.isInteger(Math.round(r0 * 1e6) / 1e6)) bad(`row ${ri} ${id}: drawn from mid-row ${r0}`);
        }
      }
      for (let r = Math.max(r0, firstV); r < Math.min(r1, lastV + 1); r++) for (let cc = c; cc < c + (full ? nCols : o.cols); cc++) {
        const key = `${Math.round(r)},${cc}`;
        cover.set(key, (cover.get(key) ?? 0) + 1);
      }
    }
  }
  if (d.count) for (let r = firstV; r <= lastV; r++) for (let c = 0; c < nCols; c++) {
    if (!colVisible(c)) continue;
    const n = cover.get(`${r},${c}`) ?? 0;
    if (n !== 1) {
      const o = owner(r, c);
      bad(`slot ${r},${ids[c]} drawn by ${n} cells (owner ${o.row},${ids[o.col]} ${o.rows}x${o.cols}; view rows ${firstV}..${lastV})`);
    }
  }
  return out;
}

const KEYS: [string, KeyboardEventInit?][] = [['ArrowDown'], ['ArrowUp'], ['ArrowLeft'], ['ArrowRight'], ['PageDown'], ['PageUp'], ['Home'], ['End'], ['Home', { ctrlKey: true }], ['End', { ctrlKey: true }]];
const OPP: Record<string, string> = { ArrowDown: 'ArrowUp', ArrowUp: 'ArrowDown', ArrowLeft: 'ArrowRight', ArrowRight: 'ArrowLeft' };

function press(key: string, init: KeyboardEventInit = {}) {
  (document.activeElement as HTMLElement).dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init }));
}

/** The focus after a key: on an origin, the element focused is that cell's. */
function checkFocus(m: M, dom = true): string[] {
  const f = m.g.kernel.focus;
  if (!f || f.kind !== 'cell') return [];
  const map = freshMap(m);
  const ids = m.ctx.columns.visible().map((c) => c.id);
  const r = m.ctx.rows.displayed.indexOf(f.row);
  const c = ids.indexOf(f.column);
  const out: string[] = [];
  const o = map.ownerAt(r, c);
  if (o && (o.row !== r || o.col !== c)) out.push(`focus on covered slot ${r},${f.column} (owner ${o.row},${ids[o.col]})`);
  const el = m.ctx.rowRenderer.cell(f.row, f.column);
  if (!el) out.push(`focused cell ${r},${f.column} not mounted`);
  else if (document.activeElement !== el) out.push(`active element is not the focused cell ${r},${f.column}`);
  return out;
}

/** After a sort, a filter, new rows or new columns: a focus left on a covered slot has gone to its owner. */
function checkOwner(m: M, log: string[], before: { d: unknown; v: number }): void {
  // Nothing moved (a sort or a filter that changes nothing): the kernel has nothing to reconcile.
  if (m.ctx.rows.displayed === before.d && m.ctx.columns.version === before.v) return;
  const f = m.g.kernel.focus;
  if (!f || f.kind !== 'cell') return;
  const map = freshMap(m);
  const ids = m.ctx.columns.visible().map((c) => c.id);
  const r = m.ctx.rows.displayed.indexOf(f.row);
  const c = ids.indexOf(f.column);
  const o = r < 0 || c < 0 ? null : map.ownerAt(r, c);
  if (o && (o.row !== r || o.col !== c)) throw new Error(`after a model change the focus stays on covered ${r},${f.column} (owner ${o.row},${ids[o.col]})\n${log.slice(-25).join(' | ')}`);
}

function step(m: M, r: ReturnType<typeof rng>, log: string[]): void {
  const d = m.ctx.rows.displayed;
  const was = { d, v: m.ctx.columns.version };
  const a = r.next();
  if (a < 0.35) {
    const t = r.chance(0.2) ? r.next() * 40 : r.int(0, Math.max(0, d.count)) * H + r.pick([0, 0, 5, 17]);
    log.push(`scroll ${t}`);
    m.scrollTo(t, r.chance(0.3) ? r.int(0, 400) : m.box.scrollInline);
  } else if (a < 0.5) {
    const col = r.pick(m.ctx.columns.visible().map((c) => c.id).concat(['c0']));
    const dir = r.pick(['asc', 'desc', null] as const);
    log.push(`sort ${col} ${dir}`);
    m.g.kernel.dispatch({ type: 'sort.set', sort: dir ? [{ column: col, dir }] : [] }, 'user');
    checkOwner(m, log, was);
  } else if (a < 0.62) {
    const id = `c${r.int(0, 5)}`;
    if (!m.ctx.columns.get(id)) return;
    const patch = r.pick([{ id, hidden: true }, { id, hidden: false }, { id, pinned: 'start' as const }, { id, pinned: null }, { id, pinned: 'end' as const }, { id, width: r.int(40, 200) }]);
    if (patch.hidden && m.ctx.columns.visible().length <= 1) return;
    log.push(`column ${JSON.stringify(patch)}`);
    m.g.kernel.dispatch({ type: 'column.state', patch: [patch] }, 'user');
    checkOwner(m, log, was);
  } else if (a < 0.67 && m.ctx.settings.pagination) {
    const i = r.int(0, 5);
    log.push(`page ${i}`);
    m.g.kernel.dispatch({ type: 'page.go', index: i }, 'user');
  } else if (a < 0.69) {
    const text = r.pick(['', '', 'm1', 'm2-', 'v1', 'zz']);
    log.push(`quick ${text}`);
    m.g.kernel.dispatch({ type: 'quick.set', text }, 'user');
    checkOwner(m, log, was);
  } else if (a < 0.72) {
    // New rows from the host: some edited (a merge run broken or joined), some removed.
    const rows = [...(m.ctx.settings.rows as Iterable<R>)].filter(() => !r.chance(0.05)).map((x) => (r.chance(0.1) ? { ...x, c0: r.pick(['m1-1', 'm2-2', x.c0]), flag: r.chance(0.1) } : x));
    log.push(`rows ${rows.length}`);
    m.g.update({ rows });
    checkOwner(m, log, was);
  } else if (a < 0.74) {
    m.box.block = r.pick([64, 100, 200, 320, 500]);
    log.push(`block ${m.box.block}`);
    m.g.api.refresh();
  } else if (a < 0.76 && d.count) {
    const ids = m.ctx.columns.visible().map((c) => c.id);
    const row = d.keyAt(d.index(r.int(0, d.count - 1))!);
    const col = r.pick(ids);
    log.push(`api focus ${String(row)} ${col}`);
    m.g.api.focusCell(row, col);
    m.g.api.refresh();
    const problems = checkFocus(m, true);
    if (problems.length) throw new Error(`${problems.join('\n')}\n${log.slice(-25).join(' | ')}`);
  } else if (d.count) {
    // Focus a mounted cell, then keys.
    if (m.g.kernel.focus?.kind !== 'cell' || !document.activeElement?.closest('.dzg-layer')) {
      const cells = [...m.ctx.el.layer.querySelectorAll<HTMLElement>('.dzg-cell')];
      if (!cells.length) return;
      const cell = r.pick(cells);
      log.push(`focus ${cell.parentElement!.parentElement!.getAttribute('aria-rowindex')} ${cell.getAttribute('data-col')}`);
      cell.focus();
    }
    for (let j = r.int(1, 6); j > 0; j--) {
      const [key, init] = r.pick(KEYS);
      const before = m.g.kernel.focus;
      const fromOrigin = checkFocus(m).length === 0;
      log.push(`key ${init?.ctrlKey ? 'Ctrl+' : ''}${key}`);
      press(key, init);
      const after = m.g.kernel.focus;
      const problems = checkFocus(m);
      if (problems.length && fromOrigin) throw new Error(`${problems.join('\n')}\n${log.slice(-25).join(' | ')}`);
      // An arrow that moved between cells is undone by the opposite arrow.
      if (OPP[key] && !init && fromOrigin && before?.kind === 'cell' && after?.kind === 'cell' && (before.row !== after.row || before.column !== after.column)) {
        log.push(`key ${OPP[key]} (back)`);
        press(OPP[key]);
        const back = m.g.kernel.focus;
        if (!(back?.kind === 'cell' && back.row === before.row && back.column === before.column)) {
          throw new Error(`${key} then ${OPP[key]}: from ${String(before.row)} ${before.column} to ${String(after.row)} ${after.column}, back at ${back?.kind === 'cell' ? `${String(back.row)} ${back.column}` : JSON.stringify(back)}\n${log.slice(-25).join(' | ')}`);
        }
        press(key);
      }
      if (!document.activeElement?.closest('.dzg-layer')) break;
    }
  }
}

function run(seed: number, opts: { steps?: number; spec?: (r: ReturnType<typeof rng>) => Spec } = {}): void {
  const r = rng(seed);
  const spec = opts.spec ? opts.spec(r) : randomSpec(r);
  const m = make(spec);
  const leaves = spec.columns.flatMap((c) => ('children' in c ? c.children : [c]));
  const log: string[] = [`seed ${seed}`, `spec ${JSON.stringify({ n: spec.rows.length, cols: leaves.map((c) => { const x = c as ColumnDef<R>; return [x.id, x.pinned ?? '', x.hidden ? 'h' : '', x.merge ? 'M' : x.rowSpan && x.colSpan ? 'RC' : x.rowSpan ? 'RS' : x.colSpan ? 'CS' : '', x.width]; }), s: Object.keys(spec.settings), dir: spec.settings.direction, block: spec.block, inline: spec.inline })}`];
  const verify = () => {
    const p = check(m);
    if (p.length) throw new Error(`${p.join('\n')}\n${log.join(' | ')}`);
  };
  verify();
  for (let i = 0; i < (opts.steps ?? Number(process.env.SPANS_STEPS ?? 14)); i++) {
    step(m, r, log);
    verify();
  }
}

describe('spans paint, over random grids', () => {
  const SEEDS = Number(process.env.SPANS_SEEDS ?? 150);
  for (let seed = 1; seed <= SEEDS; seed++) it(`seed ${seed}`, () => run(seed));
});

describe('spans paint, far from the top (rebased and scaled scrolling)', () => {
  // Runs far longer than two rebases (2 × 2^20 px = 65 536 rows of 32 px): the origin row sits clamped.
  const far = (r: ReturnType<typeof rng>): Spec => {
    const s = randomSpec(r, { rows: 150_000, longRuns: 120_000 });
    // At least one merged column, so that long runs exist.
    const c0 = ('children' in s.columns[0]! ? s.columns[0].children[0] : s.columns[0]) as { merge?: true; hidden?: boolean; rowSpan?: unknown; colSpan?: unknown };
    c0.merge = true;
    delete c0.hidden;
    delete c0.rowSpan;
    delete c0.colSpan;
    const { pagination: _, ...settings } = s.settings;
    return { ...s, settings, maxPhysical: r.chance(0.5) ? 1_000_000 : undefined };
  };
  for (let seed = 1; seed <= 6; seed++) {
    it(`seed ${seed}`, () => {
      const r = rng(1000 + seed);
      const spec = far(r);
      const m = make(spec);
      for (const row of [0, 20_000, 33_000, 66_000, 69_990, 70_010, 100_000, 110_000, 119_990, 120_010, 140_000, 149_990, 65_600, 35_000, 1]) {
        // The scroll is physical: map the logical row to it.
        const logical = row * H;
        const physical = m.ctx.scroll.mapper ? m.ctx.scroll.mapper.toPhysical(logical) : logical;
        m.scrollTo(physical);
        const p = check(m);
        if (p.length) throw new Error(`row ${row} (logical ${m.ctx.scroll.logicalTop}):\n${p.join('\n')}`);
      }
    }, 60_000);
  }
});
