// Shared fixtures for the floating filter row (step 12, docs/behaviors/filter-ui.md).
import { vi } from 'vitest';
import type { ColumnOrGroup, GridEvent, Problem } from '@dzgrid/core';
import { sourceRows, type DataRequest, type DataSource } from '@dzgrid/core/server';
import { createGrid, type GridInstance } from '../src/grid.js';
import type { GridSettings } from '../src/settings.js';
import type { Geometry, ViewportBox } from '../src/render/measure.js';
import type { GridFeature } from '../src/features.js';
import { filters } from '../src/filters.js';
import { EN } from '../src/locales/en.js';
import { EN_FILTERS } from '../src/locales/en-filters.js';
import type { GridMessages } from '../src/messages.js';

export type R = { id: string; name: string; n: number; d?: string };
export const grids: GridInstance<R, any>[] = [];
export function cleanup(): void {
  for (const g of grids.splice(0)) g.destroy();
  document.body.innerHTML = '';
  vi.useRealTimers();
  vi.restoreAllMocks();
}

export const MESSAGES: GridMessages = { locale: 'en', text: { ...EN.text, ...EN_FILTERS.text } };
export const ROWS: R[] = Array.from({ length: 30 }, (_, i) => ({ id: `r${i}`, name: i % 3 ? `bob${i}` : `ann${i}`, n: i, d: '2024-01-01' }));
export const COLUMNS: ColumnOrGroup<R>[] = [
  { id: 'name', header: 'Name' },
  { id: 'n', header: 'N', type: 'number' },
  { id: 'd', header: 'D', type: 'day' },
];

export function fakeSource(values?: DataSource<R>['values']) {
  const calls: { req: DataRequest; ok(v: unknown): void; err(e: unknown): void }[] = [];
  const source: DataSource<R> = {
    ...(values && { values }),
    fetch: (req) => ({ then(ok: (v: never) => void, err: (e: unknown) => void) { calls.push({ req, ok: ok as never, err }); } }) as never,
  };
  const answer = (ids: string[], more: object = { total: ids.length }) => calls.at(-1)!.ok({ rows: ids.map((id, n) => ({ id, name: id, n })), ...more });
  return { source, calls, answer, fail: (e: unknown) => calls.at(-1)!.err(e) };
}

export interface Make {
  readonly columns?: ColumnOrGroup<R>[];
  readonly rows?: R[];
  readonly features?: readonly GridFeature[];
  readonly settings?: Partial<GridSettings<R>> & Record<string, unknown>;
  readonly server?: boolean;
  readonly inline?: number;
  /** The grid inside an open shadow root (its host in the body). */
  readonly shadow?: boolean;
  /** The server source's `values` (step 15, the set filter's list). */
  readonly values?: DataSource<R>['values'];
}

/** A grid with `filters({ floating: true })` by default, synchronous paints, a fake geometry. */
export function make(o: Make = {}) {
  const box: { -readonly [K in keyof ViewportBox]: ViewportBox[K] } = { block: 400, inline: o.inline ?? 900, scrollTop: 0, scrollInline: 0 };
  const geometry: Geometry = { read: () => ({ ...box }), writeScrollTop: (px) => { box.scrollTop = px; }, writeScrollInline: (px) => { box.scrollInline = px; } };
  const host = document.createElement('div');
  if (o.shadow) {
    const outer = document.createElement('div');
    document.body.append(outer);
    outer.attachShadow({ mode: 'open' }).append(host);
  } else document.body.append(host);
  const events: GridEvent<R>[] = [];
  const f = fakeSource(o.values);
  const data = o.server ? { source: sourceRows(f.source), operations: 'server' } : { rows: o.rows ?? ROWS };
  const g = createGrid<R>(host, {
    ...data, getRowId: (r: R) => r.id, columns: o.columns ?? COLUMNS, messages: MESSAGES,
    features: o.features ?? [filters({ floating: true })], onEvent: (e: GridEvent<R>) => events.push(e), ...o.settings,
  } as never, { geometry, sync: true }) as GridInstance<R, any>;
  grids.push(g);
  const vp = host.querySelector<HTMLElement>('.dzg-viewport')!;
  const hrows = () => [...host.querySelectorAll<HTMLElement>('.dzg-header > [role=row]')];
  /** The floating cell of a column (the header row at level 1). */
  const cell = (col: string) => host.querySelector<HTMLElement>(`.dzg-hextra[data-col="${col}"]`)!;
  const input = (col: string) => cell(col)?.querySelector<HTMLInputElement>('input') ?? null;
  const type = (col: string, text: string) => {
    const i = input(col)!;
    i.value = text;
    i.dispatchEvent(new InputEvent('input', { bubbles: true }));
  };
  const key = (target: HTMLElement, k: string, init: KeyboardEventInit = {}) => {
    const e = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init });
    target.dispatchEvent(e);
    return e;
  };
  const press = (k: string, init: KeyboardEventInit = {}) => key(document.activeElement as HTMLElement, k, init);
  const problems = (): Problem[] => events.flatMap((e) => (e.type === 'problems' ? e.problems : []));
  const filterEvents = () => events.filter((e) => e.type === 'filterChanged');
  const ids = () => { const d = g.kernel.rows.displayed; return Array.from({ length: d.count }, (_, i) => (g.kernel.rows.row(d.keyAt(d.index(i)!))?.data as R).id); };
  const scrollInline = (x: number) => { box.scrollInline = x; vp.dispatchEvent(new Event('scroll')); };
  return { g, host, vp, box, events, f, hrows, cell, input, type, key, press, problems, filterEvents, ids, scrollInline, live: (g as unknown as { context: { live: { announce(t: string): void; said: string } } }).context.live };
}
