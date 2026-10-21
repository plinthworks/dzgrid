// Shared fixtures for the tree feature (Phase 4 step 4, docs/behaviors/tree-view.md, tree-keys.md).
import { vi } from 'vitest';
import { dataKey, type ColumnDef, type GridEvent, type RowKey } from '@dzgrid/core';
import { createGrid, type GridInstance } from '../src/grid.js';
import type { GridSettings } from '../src/settings.js';
import type { Geometry, ViewportBox } from '../src/render/measure.js';
import type { GridFeature } from '../src/features.js';
import type { GridContext } from '../src/context.js';
import type { GridMessages } from '../src/messages.js';
import { tree, type TreeFeatureOptions } from '../src/tree.js';
import { EN } from '../src/locales/en.js';
import { FR } from '../src/locales/fr.js';
import { AR } from '../src/locales/ar.js';
import { EN_TREE } from '../src/locales/en-tree.js';
import { FR_TREE } from '../src/locales/fr-tree.js';
import { AR_TREE } from '../src/locales/ar-tree.js';

export type T = { id: string; parent: string | null; name: string; n: number };

/**
 * S0
 *   P1
 *     V1
 *     V2
 *   P2
 * S1
 *   P3
 * S2
 */
export const SMALL: T[] = [
  { id: 'S0', parent: null, name: 'Service 0', n: 0 },
  { id: 'P1', parent: 'S0', name: 'Patient 1', n: 1 },
  { id: 'V1', parent: 'P1', name: 'Visit 1', n: 2 },
  { id: 'V2', parent: 'P1', name: 'Visit 2', n: 3 },
  { id: 'P2', parent: 'S0', name: 'Patient 2', n: 4 },
  { id: 'S1', parent: null, name: 'Service 1', n: 5 },
  { id: 'P3', parent: 'S1', name: 'Patient 3', n: 6 },
  { id: 'S2', parent: null, name: 'Service 2', n: 7 },
];

/** `services` roots of `per` children each (ids `S<i>` and `S<i>-<j>`). */
export const wide = (services: number, per: number): T[] =>
  Array.from({ length: services }, (_, i) => [
    { id: `S${i}`, parent: null, name: `Service ${i}`, n: i },
    ...Array.from({ length: per }, (_, j): T => ({ id: `S${i}-${j}`, parent: `S${i}`, name: `Patient ${i}.${j}`, n: j })),
  ]).flat();

export const COLUMNS: ColumnDef<T, any>[] = [
  { id: 'name', header: 'Name', width: 160 },
  { id: 'n', header: 'N', type: 'number', width: 100 },
  { id: 't', header: 'T', value: (r: T) => `t${r.n}`, width: 100 },
];

const join = (...b: { locale: string; text: object }[]): GridMessages => ({ locale: b[0]!.locale, text: Object.assign({}, ...b.map((x) => x.text)) });
export const BUNDLES = { en: join(EN, EN_TREE), fr: join(FR, FR_TREE), ar: join(AR, AR_TREE) } as const;

export const k = (id: string): RowKey => dataKey(id)!;
export const idOf = (key: RowKey | null | undefined): string | null => (key == null ? null : String(key).replace(/^d:\d+:/, ''));

export const grids: GridInstance<T, any>[] = [];
export function cleanup(): void {
  for (const g of grids.splice(0)) g.destroy();
  document.body.innerHTML = '';
  vi.useRealTimers();
  vi.restoreAllMocks();
}

export interface TMake {
  readonly rows?: T[];
  readonly tree?: Partial<TreeFeatureOptions<T>> | null;
  readonly features?: readonly GridFeature[];
  readonly settings?: Partial<GridSettings<T>>;
  readonly lang?: keyof typeof BUNDLES;
  readonly block?: number;
  readonly raf?: Pick<Window, 'requestAnimationFrame' | 'cancelAnimationFrame'>;
}

/** A grid of the tree feature (parent ids), synchronous paints (or `raf`), a fake geometry. */
export function tmake(o: TMake = {}) {
  const box: { -readonly [K in keyof ViewportBox]: ViewportBox[K] } = { block: o.block ?? 320, inline: 600, scrollTop: 0, scrollInline: 0 };
  const geometry: Geometry = { read: () => ({ ...box }), writeScrollTop: (px) => { box.scrollTop = px; }, writeScrollInline: (px) => { box.scrollInline = px; } };
  const host = document.createElement('div');
  document.body.append(host);
  const events: GridEvent<T>[] = [];
  const features = [...(o.tree === null ? [] : [tree<T>({ parentId: (r) => r.parent, ...o.tree })]), ...(o.features ?? [])];
  const g = createGrid<T>(host, {
    rows: o.rows ?? SMALL, getRowId: (r) => r.id, columns: COLUMNS, messages: BUNDLES[o.lang ?? 'en'],
    ...(o.lang === 'ar' && { direction: 'rtl' as const }), features, onEvent: (e) => events.push(e), ...o.settings,
  }, { geometry, ...(o.raf ? { raf: o.raf } : { sync: true }) });
  grids.push(g);
  const ctx = (g as unknown as { context: GridContext<T> }).context;
  const announce = vi.spyOn(ctx.live, 'announce');
  const vp = host.querySelector<HTMLElement>('.dzg-viewport')!;
  const row = (id: string) => [...host.querySelectorAll<HTMLElement>('.dzg-layer > .dzg-row')].find((r) => ctx.rowRenderer.keyOf(r) === k(id)) ?? null;
  const cell = (id: string, col = 'name') => row(id)?.querySelector<HTMLElement>(`.dzg-cell[data-col="${col}"]`) ?? null;
  const toggle = (id: string) => cell(id)?.querySelector<HTMLElement>('.dzg-toggle') ?? null;
  /** The rows shown, by id, in order. */
  const shown = () => {
    const d = g.kernel.rows.displayed;
    return Array.from({ length: d.count }, (_, i) => idOf(d.keyAt(d.index(i)!)));
  };
  const active = () => document.activeElement as HTMLElement;
  /** Where the DOM focus is: row id / column. */
  const where = () => {
    const a = active();
    const r = a.closest('.dzg-row');
    return `${r ? idOf(ctx.rowRenderer.keyOf(r)) : null}/${a.dataset['col'] ?? null}`;
  };
  const press = (key: string, mods: KeyboardEventInit = {}) => active().dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...mods }));
  const focus = (id: string, col = 'name') => g.api.focusCell(k(id), col);
  const expand = (ids: string[], expanded = true, source: 'user' | 'api' = 'api') => g.kernel.dispatch({ type: 'rows.expand', rows: ids.map(k), expanded }, source);
  const expandedEvents = () => events.filter((e) => e.type === 'rowExpanded') as Extract<GridEvent<T>, { type: 'rowExpanded' }>[];
  const scroll = (top: number) => { box.scrollTop = top; vp.dispatchEvent(new Event('scroll')); };
  const said = () => announce.mock.calls.map((c) => c[0]);
  return { g, ctx, host, vp, box, events, announce, said, row, cell, toggle, shown, active, where, press, focus, expand, expandedEvents, scroll };
}

/** A click as a pointer makes it: down, up, click, on `el`. */
export function click(el: HTMLElement, init: MouseEventInit = {}): void {
  el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, ...init }));
  el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, ...init }));
  el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, ...init }));
  el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, ...init }));
  el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ...init }));
}
