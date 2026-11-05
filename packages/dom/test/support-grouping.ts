// Shared fixtures for the grouping feature (Phase 7 step 5, docs/behaviors/row-grouping.md, aggregation.md). Made-up
// data: shops of two regions, their fruit and amounts.
import { vi } from 'vitest';
import { dataKey, type ColumnDef, type GridEvent, type RowKey } from '@dzgrid/core';
import { createGrid, type GridInstance } from '../src/grid.js';
import type { GridSettings } from '../src/settings.js';
import type { Geometry, ViewportBox } from '../src/render/measure.js';
import type { GridFeature } from '../src/features.js';
import type { GridContext } from '../src/context.js';
import type { GridMessages } from '../src/messages.js';
import { grouping, type GroupingFeature, type GroupingFeatureOptions } from '../src/grouping.js';
import { EN } from '../src/locales/en.js';
import { FR } from '../src/locales/fr.js';
import { AR } from '../src/locales/ar.js';
import { EN_GROUP } from '../src/locales/en-group.js';
import { FR_GROUP } from '../src/locales/fr-group.js';
import { AR_GROUP } from '../src/locales/ar-group.js';

export type R = { id: string; region: string | null; fruit: string; qty: number | null; price: number; day: string };

/**
 * Nord: apple ×2 (r1 r3), pear (r4); Sud: apple (r2), fig (r5); blank region: r6.
 */
export const ROWS: R[] = [
  { id: 'r1', region: 'Nord', fruit: 'apple', qty: 10, price: 1.5, day: '2026-03-02' },
  { id: 'r2', region: 'Sud', fruit: 'apple', qty: 5, price: 2, day: '2026-03-01' },
  { id: 'r3', region: 'Nord', fruit: 'apple', qty: 2.5, price: 1, day: '2026-03-05' },
  { id: 'r4', region: 'Nord', fruit: 'pear', qty: null, price: 3, day: '2026-03-04' },
  { id: 'r5', region: 'Sud', fruit: 'fig', qty: 7, price: 4, day: '2026-03-03' },
  { id: 'r6', region: null, fruit: 'fig', qty: 1, price: 5, day: '2026-03-06' },
];

export const COLUMNS: ColumnDef<R, any>[] = [
  { id: 'name', header: 'Shop', value: (r: R) => `Shop ${r.id.slice(1)}`, width: 160 },
  { id: 'region', header: 'Region', width: 120 },
  { id: 'fruit', header: 'Fruit', width: 120 },
  { id: 'qty', header: 'Qty', type: 'number', width: 100, aggFunc: 'sum' },
  { id: 'price', header: 'Price', type: 'number', width: 100 },
  { id: 'day', header: 'Day', type: 'day', width: 120 },
];

const join = (...b: { locale: string; text: object }[]): GridMessages => ({ locale: b[0]!.locale, text: Object.assign({}, ...b.map((x) => x.text)) });
export const BUNDLES = { en: join(EN, EN_GROUP), fr: join(FR, FR_GROUP), ar: join(AR, AR_GROUP) } as const;

export const k = (id: string): RowKey => dataKey(id)!;
export const idOf = (key: RowKey | null | undefined): string | null => (key == null ? null : String(key).replace(/^d:\d+:/, ''));

export const grids: GridInstance<R, any>[] = [];
export function cleanup(): void {
  for (const g of grids.splice(0)) g.destroy();
  document.body.innerHTML = '';
  vi.useRealTimers();
  vi.restoreAllMocks();
}

export interface GMake {
  readonly rows?: R[];
  readonly grouping?: GroupingFeatureOptions | null;
  readonly before?: readonly GridFeature[];
  readonly features?: readonly GridFeature[];
  readonly settings?: Partial<GridSettings<R>>;
  readonly columns?: ColumnDef<R, any>[];
  readonly lang?: keyof typeof BUNDLES;
  readonly block?: number;
}

/** A grid grouped by region by default, synchronous paints, a fake geometry. */
export function gmake(o: GMake = {}) {
  const box: { -readonly [K in keyof ViewportBox]: ViewportBox[K] } = { block: o.block ?? 320, inline: 900, scrollTop: 0, scrollInline: 0 };
  const geometry: Geometry = { read: () => ({ ...box }), writeScrollTop: (px) => { box.scrollTop = px; }, writeScrollInline: (px) => { box.scrollInline = px; } };
  const host = document.createElement('div');
  document.body.append(host);
  const events: GridEvent<R>[] = [];
  const feature: GroupingFeature | null = o.grouping === null ? null : grouping(o.grouping ?? { by: ['region'] });
  const features = [...(o.before ?? []), ...(feature ? [feature] : []), ...(o.features ?? [])];
  const g = createGrid<R>(host, {
    rows: o.rows ?? ROWS, getRowId: (r) => r.id, columns: o.columns ?? COLUMNS, messages: BUNDLES[o.lang ?? 'en'],
    ...(o.lang === 'ar' && { direction: 'rtl' as const }), features, onEvent: (e) => events.push(e), ...o.settings,
  }, { geometry, sync: true });
  grids.push(g);
  const ctx = (g as unknown as { context: GridContext<R> }).context;
  const announce = vi.spyOn(ctx.live, 'announce');
  const vp = host.querySelector<HTMLElement>('.dzg-viewport')!;
  const rowEls = () => [...host.querySelectorAll<HTMLElement>('.dzg-layer > .dzg-row')].sort((a, b) => parseFloat(a.style.top || a.style.insetBlockStart || '0') - parseFloat(b.style.top || b.style.insetBlockStart || '0'));
  /** A row element by key text: a data row's id, or a group / totals key as is. */
  const row = (id: string) => rowEls().find((r) => { const key = ctx.rowRenderer.keyOf(r); return key === k(id) || key === id; }) ?? null;
  const cell = (id: string, col = 'name') => row(id)?.querySelector<HTMLElement>(`.dzg-cell[data-col="${col}"]`) ?? null;
  const toggle = (id: string) => cell(id)?.querySelector<HTMLElement>('.dzg-toggle') ?? null;
  const label = (id: string, col = 'name') => cell(id, col)?.querySelector('.dzg-label')?.textContent ?? null;
  /** The rows shown: a data row by id, a group as `[label]`, a totals row as `Σlabel`. */
  const shown = () => {
    const d = g.kernel.rows.displayed;
    return Array.from({ length: d.count }, (_, i) => {
      const n = d.nodeAt(d.index(i)!);
      return n.kind === 'data' ? idOf(n.key) : n.kind === 'group' ? `[${n.label}]` : n.kind === 'footer' ? `Σ${n.label}` : n.kind;
    });
  };
  /** The key of the shown row at a place. */
  const keyAt = (i: number) => g.kernel.rows.displayed.keyAt(g.kernel.rows.displayed.index(i)!);
  const active = () => document.activeElement as HTMLElement;
  const where = () => {
    const a = active();
    const r = a.closest('.dzg-row');
    const key = r ? ctx.rowRenderer.keyOf(r) : null;
    return `${key ? (key.startsWith('d:') ? idOf(key) : key) : null}/${a.dataset['col'] ?? null}`;
  };
  const press = (key: string, mods: KeyboardEventInit = {}) => active().dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...mods }));
  const focusKey = (key: RowKey, col = 'name') => g.api.focusCell(key, col);
  const api = () => feature!.api(g)!;
  const problems = () => events.flatMap((e) => (e.type === 'problems' ? e.problems : []));
  const expandedEvents = () => events.filter((e) => e.type === 'rowExpanded') as Extract<GridEvent<R>, { type: 'rowExpanded' }>[];
  const said = () => announce.mock.calls.map((c) => c[0]);
  return { g, ctx, host, vp, box, events, feature, api, announce, said, row, rowEls, cell, toggle, label, shown, keyAt, active, where, press, focusKey, problems, expandedEvents };
}

/** A click as a pointer makes it: down, up, click, on `el`. */
export function click(el: HTMLElement, init: MouseEventInit = {}): void {
  el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, ...init }));
  el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, ...init }));
  el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, ...init }));
  el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, ...init }));
  el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ...init }));
}
