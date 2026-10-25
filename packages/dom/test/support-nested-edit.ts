// Shared fixtures for editing beside details (Phase 5 step 8, step08-plan.md « Behaviour » 12–14): an outer grid of
// orders with `edit()` and `editors()`, each order's panel a nested grid of its lines with its own `edit()` and
// `editors()` (and, `deep`, each line's panel a grid of its lots); saves held by the test, per level.
import { vi } from 'vitest';
import { dataKey, detailKey, type ColumnDef, type GridEvent, type RowKey } from '@dzgrid/core';
import type { SaveRequest } from '@dzgrid/core/edit';
import { createGrid, type GridInstance } from '../src/grid.js';
import type { Geometry } from '../src/render/measure.js';
import type { GridContext, GridEnv } from '../src/context.js';
import { detail, nestedGrid, type NestedContext } from '../src/detail.js';
import { edit, type EditApi, type EditFeature } from '../src/edit.js';
import { editors } from '../src/editors.js';
import { EN } from '../src/locales/en.js';
import { EN_DETAIL } from '../src/locales/en-detail.js';
import { EN_EDIT } from '../src/locales/en-edit.js';
import { EN_EDITORS } from '../src/locales/en-editors.js';
import { EN_RANGE } from '../src/locales/en-range.js';
import { range, type RangeOptions } from '../src/range.js';

export type O = { id: string; name: string; qty: number };
export type L = { id: string; item: string; qty: number };
export const MSG = { locale: 'en', text: { ...EN.text, ...EN_DETAIL.text, ...EN_EDIT.text, ...EN_EDITORS.text, ...EN_RANGE.text } };
export const k = (id: string): RowKey => dataKey(id)!;
export const x = (id: string): RowKey => detailKey(k(id));
const OCOLS: ColumnDef<O, any>[] = [
  { id: 'name', header: 'Order', width: 200, editable: true },
  { id: 'qty', header: 'Qty', type: 'number', width: 100, editable: true },
];
const LCOLS: ColumnDef<L, any>[] = [
  { id: 'item', header: 'Item', width: 160, editable: true },
  { id: 'qty', header: 'Units', type: 'number', width: 100, editable: true },
];
const geometryOf = (block: number, inline = 600) => {
  const box = { block, inline, scrollTop: 0, scrollInline: 0 };
  const geometry: Geometry = { read: () => ({ ...box }), writeScrollTop: (px) => { box.scrollTop = px; }, writeScrollInline: (px) => { box.scrollInline = px; } };
  return { box, geometry };
};

export interface Held { readonly req: SaveRequest<unknown>; ok(): void; no(e: unknown): void }
export interface Inner { readonly grid: GridInstance<L, any>; readonly c: NestedContext; readonly events: GridEvent<L>[]; readonly alive: () => boolean; readonly api: () => EditApi<L> | null }

export const grids: GridInstance<any, any>[] = [];
export function cleanup(): void {
  for (const g of grids.splice(0)) g.destroy();
  document.body.innerHTML = '';
  vi.useRealTimers();
  vi.restoreAllMocks();
}

/** `shared`: one `edit()` object for every inner grid (each still its own controller); `deep`: lots under each line; `range`: blocks and the clipboard on the outer grid (step 11b), `rangeOpts` its options. */
export function nest(o: { shared?: boolean; deep?: boolean; keep?: number; range?: boolean; rangeOpts?: RangeOptions } = {}) {
  const saves: { outer: Held[]; inner: Held[]; lots: Held[] } = { outer: [], inner: [], lots: [] };
  const held = (into: Held[]) => (req: SaveRequest<unknown>) => new Promise<void>((ok, no) => void into.push({ req, ok: () => ok(), no }));
  const made: Inner[] = [];
  const sharedEdit = edit<L>({ save: held(saves.inner) as never });
  const editsOf = new Map<Inner, EditFeature<L>>();
  const lotsPart = nestedGrid<L>({
    env: (): GridEnv => ({ geometry: geometryOf(150).geometry, sync: true }),
    settings: (c) => ({
      rows: [1, 2, 3].map((n) => ({ id: `${(c.row as L).id}-lot${n}`, item: `Lot ${n}`, qty: n })), getRowId: (r) => r.id, columns: LCOLS, messages: MSG, label: `Lots of ${(c.row as L).item}`,
      features: [edit<L>({ save: held(saves.lots) as never }), editors()],
    }),
  });
  let pending: { e: EditFeature<L>; events: GridEvent<L>[] } | null = null;
  const lines = nestedGrid<L>({
    ...(o.keep !== undefined && { keep: o.keep }),
    env: (): GridEnv => ({ geometry: geometryOf(200).geometry, sync: true }),
    settings: (c) => {
      const e = o.shared ? sharedEdit : edit<L>({ save: held(saves.inner) as never });
      const events: GridEvent<L>[] = [];
      pending = { e, events };
      return {
        rows: Array.from({ length: 5 }, (_, i) => ({ id: `${(c.row as O).id}-L${i}`, item: `Item ${i}`, qty: i + 1 })), getRowId: (r: L) => r.id, columns: LCOLS, messages: MSG,
        label: `Lines of ${(c.row as O).name}`, onEvent: (ev: GridEvent<L>) => events.push(ev),
        features: [e, editors(), ...(o.deep ? [detail<L>({ part: lotsPart, height: 180 })] : [])],
      };
    },
    onGrid: (grid, c) => {
      let alive = true;
      const was = grid.destroy;
      grid.destroy = () => ((alive = false), was.call(grid));
      const p = pending!;
      const m: Inner = { grid: grid as GridInstance<L, any>, c, events: p.events, alive: () => alive, api: () => p.e.api(grid as never) };
      editsOf.set(m, p.e);
      made.push(m);
    },
  });
  const { box, geometry } = geometryOf(500, 600);
  const host = document.body.appendChild(document.createElement('div'));
  const events: GridEvent<O>[] = [];
  const outerEdit = edit<O>({ save: held(saves.outer) as never });
  const blocks = range(o.rangeOpts);
  const g = createGrid<O>(host, {
    rows: Array.from({ length: 30 }, (_, i) => ({ id: `O${i}`, name: `Order ${i}`, qty: i })), getRowId: (r) => r.id, columns: OCOLS, messages: MSG, label: 'Orders',
    onEvent: (e) => events.push(e), features: [outerEdit, editors(), detail<O>({ part: lines, height: 240 }), ...(o.range ? [blocks] : [])],
  }, { geometry, sync: true });
  grids.push(g);
  const ctx = (g as unknown as { context: GridContext<O> }).context;
  const api = outerEdit.api(g)!;
  const innerOf = (id: string) => [...made].reverse().find((m) => m.c.master === k(id))!;
  const ictx = (m: Inner) => (m.grid as unknown as { context: GridContext<L> }).context;
  const active = () => document.activeElement as HTMLElement;
  const key = (k: string, init: KeyboardEventInit = {}, on: Element = active()) => {
    const ev = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init });
    on.dispatchEvent(ev);
    return ev;
  };
  const expand = (ids: readonly string[], expanded = true) => g.kernel.dispatch({ type: 'rows.expand', rows: ids.map(k), expanded }, 'api');
  const cellOf = (c: GridContext<any>, key: RowKey, col: string) => c.rowRenderer.cell(key, col);
  const field = (root: ParentNode = host) => root.querySelector<HTMLInputElement>('.dzg-field');
  const scroll = (top: number) => { box.scrollTop = top; ctx.el.viewport.dispatchEvent(new Event('scroll')); };
  return { g, ctx, api, host, box, events, made, saves, innerOf, ictx, active, key, expand, cellOf, field, scroll, editsOf, blocks };
}

export const settle = async () => {
  for (let i = 0; i < 8; i++) await Promise.resolve();
};
export const tick = () => new Promise<void>((r) => setTimeout(r, 0));
