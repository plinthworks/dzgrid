// Shared fixtures for `@dzgrid/dom/range` (Phase 5 step 11a, docs/behaviors/range-selection.md,
// docs/phase-5-steps/step11a-plan.md): a grid with the block feature, synchronous paints, a fake geometry, frames
// the test runs (`tick`), boxes for the pointer (`at(id, col)` is the middle of a cell, from the column widths).
import { vi } from 'vitest';
import { dataKey, type CellRange, type ColumnDef, type GridEvent, type RowKey } from '@dzgrid/core';
import { createGrid, type GridInstance } from '../src/grid.js';
import type { GridSettings } from '../src/settings.js';
import type { Geometry, ViewportBox } from '../src/render/measure.js';
import type { GridContext } from '../src/context.js';
import type { GridFeature } from '../src/features.js';
import type { GridMessages } from '../src/messages.js';
import { range, type RangeFeature, type RangeOptions } from '../src/range.js';
import { EN } from '../src/locales/en.js';
import { FR } from '../src/locales/fr.js';
import { AR } from '../src/locales/ar.js';
import { EN_RANGE } from '../src/locales/en-range.js';
import { FR_RANGE } from '../src/locales/fr-range.js';
import { AR_RANGE } from '../src/locales/ar-range.js';
import { CHECK_WIDTH } from '../src/render/write.js';
import { tree } from '../src/tree.js';
import { EN_TREE } from '../src/locales/en-tree.js';

export type R = { id: string; name: string; n: number; s: string; q: number; parent?: string | null };

export const rowsOf = (n: number): R[] => Array.from({ length: n }, (_, i) => ({ id: `r${i}`, name: `Name ${i}`, n: i, s: `s${i % 7}`, q: (i * 37) % 101 }));

/** Four columns, 360 px together: no inline scroll in the 600 px view. */
export const COLUMNS: ColumnDef<R, any>[] = [
  { id: 'name', header: 'Name', width: 120 },
  { id: 'n', header: 'N', type: 'number', width: 80 },
  { id: 's', header: 'S', width: 80 },
  { id: 'q', header: 'Q', type: 'number', width: 80 },
];

/** Ten columns of 100 px (c0 … c9): 1 000 px in the 600 px view, the centre scrolls. */
export const WIDE: ColumnDef<R, any>[] = Array.from({ length: 10 }, (_, i) => ({ id: `c${i}`, header: `C${i}`, width: 100, value: (r: R) => `${r.id}.${i}` }));

export const k = (id: string): RowKey => dataKey(id)!;
export const idOf = (key: RowKey | null | undefined): string | null => (key == null ? null : String(key).replace(/^x:/, 'x').replace(/d:\d+:/, ''));
export const join = (...b: { locale: string; text: object }[]): GridMessages => ({ locale: b[0]!.locale, text: Object.assign({}, ...b.map((x) => x.text)) });
export const MSG = { en: join(EN, EN_RANGE), fr: join(FR, FR_RANGE), ar: join(AR, AR_RANGE) } as const;
/** The header's height in the fake boxes. */
export const HEADER = 40;

export const grids: GridInstance<R, any>[] = [];
export function cleanup(): void {
  for (const g of grids.splice(0)) g.destroy();
  document.body.innerHTML = '';
  vi.useRealTimers();
  vi.restoreAllMocks();
}

export interface RMake {
  readonly rows?: R[];
  readonly columns?: ColumnDef<R, any>[];
  readonly settings?: Partial<GridSettings<R>>;
  /** The feature list around the range feature (default: it alone). */
  readonly features?: (r: RangeFeature) => readonly GridFeature[];
  readonly range?: RangeOptions;
  /** A feature object to reuse (several grids, one feature). */
  readonly feature?: RangeFeature;
  readonly lang?: keyof typeof MSG;
  readonly messages?: GridMessages;
  readonly block?: number;
  readonly mac?: boolean;
  readonly maxPhysical?: number;
  readonly host?: HTMLElement;
}

/** A grid with `range()`, synchronous paints, a fake geometry and frames the test runs. */
export function rmake(o: RMake = {}) {
  if (o.mac !== undefined) vi.spyOn(window.navigator, 'platform', 'get').mockReturnValue(o.mac ? 'MacIntel' : 'Win32');
  const box: { -readonly [K in keyof ViewportBox]: ViewportBox[K] } = { block: o.block ?? 320, inline: 600, scrollTop: 0, scrollInline: 0 };
  const geometry: Geometry = { read: () => ({ ...box }), writeScrollTop: (px) => { box.scrollTop = px; }, writeScrollInline: (px) => { box.scrollInline = Math.max(0, px); } };
  let frames: (FrameRequestCallback | null)[] = [];
  const raf = { requestAnimationFrame: (cb: FrameRequestCallback) => frames.push(cb), cancelAnimationFrame: (id: number) => void (frames[id - 1] = null) };
  /** Runs the frames asked so far (those they ask run at the next tick); returns how many ran. */
  const tick = (): number => {
    const now = frames;
    frames = [];
    let n = 0;
    for (const f of now) if (f) (n++, f(0));
    return n;
  };
  const pending = () => frames.filter(Boolean).length;
  const host = o.host ?? document.body.appendChild(document.createElement('div'));
  const events: GridEvent<R>[] = [];
  const feature = o.feature ?? range(o.range);
  const g = createGrid<R>(host, {
    rows: o.rows ?? rowsOf(200), getRowId: (r) => r.id, columns: o.columns ?? COLUMNS, messages: o.messages ?? MSG[o.lang ?? 'en'],
    ...(o.lang === 'ar' && { direction: 'rtl' as const }), features: o.features ? o.features(feature) : [feature], onEvent: (e) => events.push(e), ...o.settings,
  }, { geometry, sync: true, raf, ...(o.maxPhysical !== undefined && { maxPhysical: o.maxPhysical }) });
  grids.push(g);
  const ctx = (g as unknown as { context: GridContext<R> }).context;
  const announce = vi.spyOn(ctx.live, 'announce');
  const vp = host.querySelector<HTMLElement>('.dzg-viewport')!;
  const rtl = o.lang === 'ar';
  // Boxes the pointer needs (jsdom has no layout): the view 600 px wide, the header HEADER px high.
  vp.getBoundingClientRect = () => ({ left: 0, right: 600, top: 0, bottom: HEADER + box.block, width: 600, height: HEADER + box.block, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
  ctx.el.header.getBoundingClientRect = () => ({ left: 0, right: 600, top: 0, bottom: HEADER, width: 600, height: HEADER, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
  const rowEl = (id: string) => [...host.querySelectorAll<HTMLElement>('.dzg-layer > .dzg-row')].find((r) => ctx.rowRenderer.keyOf(r) === (id.startsWith('x') ? (`x:${k(id.slice(1))}` as RowKey) : k(id))) ?? null;
  const cell = (id: string, col = 'name') => rowEl(id)?.querySelector<HTMLElement>(`.dzg-cell[data-col="${col}"]`) ?? null;
  const active = () => document.activeElement as HTMLElement;
  /** Where the DOM focus is: row id / column. */
  const where = () => {
    const a = active();
    const r = a.closest('.dzg-layer > .dzg-row');
    return `${r ? idOf(ctx.rowRenderer.keyOf(r)) : a.closest('.dzg-hcell') ? 'header' : null}/${a.dataset['col'] ?? (a.classList.contains('dzg-dcell') ? '*' : null)}`;
  };
  const press = (key: string, mods: KeyboardEventInit = {}, at: Element = active()) => {
    const e = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...mods });
    at.dispatchEvent(e);
    return e;
  };
  const focus = (id: string, col = 'name') => g.api.focusCell(k(id), col);
  /** Every mounted body cell carrying the block's tint, as `row/col`, in DOM order. */
  const ranged = (root: ParentNode = ctx.el.layer) => [...root.querySelectorAll<HTMLElement>('.dzg-cell.dzg-cell--range')].map((c) => `${idOf(ctx.rowRenderer.keyOf(c.closest('.dzg-row')!))}/${c.dataset['col']}`).sort();
  /** Every element carrying aria-selected on a cell (true or not). */
  const selectedCells = () => [...host.querySelectorAll<HTMLElement>('.dzg-cell[aria-selected], .dzg-dcell[aria-selected], .dzg-check[aria-selected]')].map((c) => `${idOf(ctx.rowRenderer.keyOf(c.closest('.dzg-row')!))}/${c.dataset['col']}=${c.getAttribute('aria-selected')}`).sort();
  /** The edge classes of a cell: s, e, t, b. */
  const edges = (id: string, col = 'name') => {
    const c = cell(id, col);
    return c ? (['rs', 're', 'rt', 'rb'] as const).filter((x) => c.classList.contains(`dzg-cell--${x}`)).map((x) => x[1]).join('') : null;
  };
  const changes = () => events.filter((e) => e.type === 'rangeChanged') as Extract<GridEvent<R>, { type: 'rangeChanged' }>[];
  const said = () => announce.mock.calls.map((c) => c[0]);
  const api = () => feature.api(g)!;
  const block = (): string | null => {
    const r = feature.api(g)?.get() ?? null;
    return r ? `${idOf(r.anchor.row)}/${r.anchor.column}:${idOf(r.focus.row)}/${r.focus.column}` : null;
  };
  const scroll = (top: number) => { box.scrollTop = top; vp.dispatchEvent(new Event('scroll')); };
  const h = () => ctx.rowHeight();
  /** The middle of a cell on screen, from the core's column layout and the row layout (the oracle's own boxes). */
  const at = (id: string, col = 'name'): { clientX: number; clientY: number } => {
    const d = g.kernel.rows.displayed;
    const i = d.indexOf(id.startsWith('x') ? (`x:${k(id.slice(1))}` as RowKey) : k(id));
    const L = ctx.columns.layout;
    const extra = ctx.settings.selection?.checkbox && (ctx.settings.selection.mode ?? 'none') !== 'none' ? CHECK_WIDTH : 0;
    let x: number;
    const si = L.start.columns.findIndex((c) => c.id === col);
    const ci = L.center.columns.findIndex((c) => c.id === col);
    const ei = L.end.columns.findIndex((c) => c.id === col);
    if (si !== -1) x = extra + L.start.widths.offsetOf(si) + L.start.widths.sizeAt(si) / 2;
    else if (ci !== -1) x = extra + L.start.width + L.center.widths.offsetOf(ci) - box.scrollInline + L.center.widths.sizeAt(ci) / 2;
    else x = Math.min(600, L.totalWidth + extra) - L.end.width + L.end.widths.offsetOf(ei) + L.end.widths.sizeAt(ei) / 2;
    const y = HEADER + ctx.layout!.offsetOf(i as never) - ctx.scroll.logicalTop + ctx.layout!.heightOf(i as never) / 2;
    return { clientX: rtl ? 600 - x : x, clientY: y };
  };
  /** A pointer press as the browser makes it: pointerdown, then (not prevented) mousedown and the native focus. */
  const down = (target: Element, pt: { clientX: number; clientY: number }, init: PointerEventInit = {}) => {
    const p = new PointerEvent('pointerdown', { bubbles: true, cancelable: true, composed: true, button: 0, buttons: 1, pointerId: 1, pointerType: 'mouse', isPrimary: true, ...pt, ...init });
    target.dispatchEvent(p);
    const m = new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: init.button ?? 0, ...pt, shiftKey: !!init.shiftKey });
    if (!p.defaultPrevented) target.dispatchEvent(m);
    if (!p.defaultPrevented && !m.defaultPrevented) (target.closest<HTMLElement>('[tabindex], input, button') ?? null)?.focus();
    return p;
  };
  const move = (pt: { clientX: number; clientY: number }, init: PointerEventInit = {}) => document.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, cancelable: true, buttons: 1, pointerId: 1, pointerType: 'mouse', isPrimary: true, ...pt, ...init }));
  const up = (pt: { clientX: number; clientY: number }, target: EventTarget = document, init: PointerEventInit = {}) => target.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, button: 0, pointerId: 1, pointerType: 'mouse', isPrimary: true, ...pt, ...init }));
  const click = (target: Element, init: MouseEventInit = {}) => target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ...init }));
  /** A drag from one cell to another, released there, and the click the browser sends after it. */
  const drag = (from: [string, string], to: [string, string], o2: { shift?: boolean } = {}) => {
    down(cell(...from)!, at(...from), { shiftKey: !!o2.shift });
    move(at(...to), { shiftKey: !!o2.shift });
    up(at(...to));
    // The browser's click after a drag lands on what holds both cells (the capture: the body); here the cell
    // released on, the strongest case (it would be a cell and row click).
    click(cell(...to) ?? ctx.el.body);
  };
  return { g, ctx, host, vp, box, events, announce, said, rowEl, cell, active, where, press, focus, ranged, selectedCells, edges, changes, api, block, scroll, h, at, down, move, up, click, drag, tick, pending, feature };
}

/** The block's cells by hand (the oracle): rows `ids` × columns `cols`, as `row/col`, sorted. */
export const cells = (ids: readonly string[], cols: readonly string[]) => ids.flatMap((r) => cols.map((c) => `${r}/${c}`)).sort();
export const ids = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => `r${from + i}`);
export type { CellRange };

/** A block by its corners' ids and columns. */
export const R_ = (a: [string, string], f: [string, string]): CellRange => ({ anchor: { row: k(a[0]), column: a[1] }, focus: { row: k(f[0]), column: f[1] } });
/** A tree: one parent S with 60 children, open; the range feature first, the tree after it (its paint must still come last). */
export const treeGrid = () => {
  const rows: R[] = [{ ...rowsOf(1)[0]!, id: 'S', parent: null }, ...rowsOf(60).map((r) => ({ ...r, parent: 'S' }))];
  const t = rmake({ rows, messages: join(EN, EN_RANGE, EN_TREE), features: (r) => [r, tree<R>({ parentId: (x) => x.parent ?? null })] });
  t.g.kernel.dispatch({ type: 'rows.expand', rows: [k('S')], expanded: true }, 'api');
  return t;
};

