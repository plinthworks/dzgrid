// Shared fixtures for the pagination footer (step 17, docs/behaviors/pagination-footer.md).
import { vi } from 'vitest';
import type { GridEvent, Problem } from '@dzgrid/core';
import { sourceRows } from '@dzgrid/core/server';
import { createGrid, type GridInstance } from '../src/grid.js';
import type { GridSettings } from '../src/settings.js';
import type { Geometry, ViewportBox } from '../src/render/measure.js';
import type { GridFeature } from '../src/features.js';
import type { GridContext } from '../src/context.js';
import type { GridMessages } from '../src/messages.js';
import { pagination } from '../src/pagination.js';
import { EN } from '../src/locales/en.js';
import { FR } from '../src/locales/fr.js';
import { AR } from '../src/locales/ar.js';
import { EN_PAGINATION } from '../src/locales/en-pagination.js';
import { FR_PAGINATION } from '../src/locales/fr-pagination.js';
import { AR_PAGINATION } from '../src/locales/ar-pagination.js';
import { fakeSource, type R } from './support-filters.js';

export type { R };
export const grids: GridInstance<R, any>[] = [];
export function cleanup(): void {
  for (const g of grids.splice(0)) g.destroy();
  document.body.innerHTML = '';
  vi.useRealTimers();
  vi.restoreAllMocks();
}

const join = (b: GridMessages, p: { locale: string; text: object }): GridMessages => ({ locale: b.locale, text: { ...b.text, ...p.text } as GridMessages['text'] });
export const BUNDLES = { en: join(EN, EN_PAGINATION), fr: join(FR, FR_PAGINATION), ar: join(AR, AR_PAGINATION) } as const;
export const LOCALES = { en: 'en-US', fr: 'fr-FR', ar: 'ar-DZ' } as const;
export const ROWS: R[] = Array.from({ length: 30 }, (_, i) => ({ id: `r${i}`, name: i % 3 ? `bob${i}` : `ann${i}`, n: i }));

export interface PMake {
  /** `client` (the browser's rows, paged), `offset` or `cursor` (a server's pages), `off` (no paging). */
  readonly mode?: 'client' | 'offset' | 'cursor' | 'off';
  readonly lang?: keyof typeof BUNDLES;
  readonly rows?: R[];
  readonly pageSize?: number;
  readonly pageSizes?: number[];
  readonly features?: readonly GridFeature[];
  readonly settings?: Partial<GridSettings<R>> & Record<string, unknown>;
  readonly selection?: 'none' | 'single' | 'multi';
}

/** A paged grid with `pagination()`, synchronous paints, a fake geometry. Server modes answer only when told. */
export function pmake(o: PMake = {}) {
  const mode = o.mode ?? 'client';
  const lang = o.lang ?? 'en';
  const box: { -readonly [K in keyof ViewportBox]: ViewportBox[K] } = { block: 400, inline: 900, scrollTop: 0, scrollInline: 0 };
  const geometry: Geometry = { read: () => ({ ...box }), writeScrollTop: (px) => { box.scrollTop = px; }, writeScrollInline: (px) => { box.scrollInline = px; } };
  const host = document.createElement('div');
  document.body.append(host);
  const events: GridEvent<R>[] = [];
  const f = fakeSource();
  const page = { pageSize: o.pageSize ?? 10, ...(o.pageSizes && { pageSizes: o.pageSizes }) };
  const data = mode === 'offset' || mode === 'cursor'
    ? { source: sourceRows(f.source, { paging: mode }), operations: 'server', pagination: page }
    : { rows: o.rows ?? ROWS, ...(mode === 'client' && { pagination: page }) };
  const g = createGrid<R>(host, {
    ...data, getRowId: (r: R) => r.id, columns: [{ id: 'name', header: 'Name' }, { id: 'n', header: 'N', type: 'number' }],
    messages: BUNDLES[lang], locale: LOCALES[lang],
    selection: { mode: o.selection ?? 'multi', checkbox: true },
    features: o.features ?? [pagination()], onEvent: (e: GridEvent<R>) => events.push(e), ...o.settings,
  } as never, { geometry, sync: true }) as GridInstance<R, any>;
  grids.push(g);
  const ctx = (g as unknown as { context: GridContext<unknown> }).context;
  const announce = vi.spyOn(ctx.live, 'announce');
  const footer = () => host.querySelector<HTMLElement>('.dzg-footer');
  const nav = () => footer()?.querySelector<HTMLElement>('nav') ?? null;
  /** A pager button by its role in the pager (`data-go`). */
  const btn = (go: 'first' | 'prev' | 'next' | 'last') => footer()?.querySelector<HTMLButtonElement>(`button[data-go="${go}"]`) ?? null;
  const pageText = () => footer()?.querySelector('.dzg-ppage')?.textContent ?? null;
  const countEl = () => footer()?.querySelector<HTMLElement>('.dzg-pcount') ?? null;
  const countText = () => countEl()?.textContent ?? null;
  const sizeSelect = () => footer()?.querySelector<HTMLSelectElement>('select') ?? null;
  const sel = () => footer()?.querySelector<HTMLElement>('.dzg-psel') ?? null;
  const selText = () => sel()?.querySelector('.dzg-pseltext')?.textContent ?? null;
  const act = (a: 'all' | 'clear') => sel()?.querySelector<HTMLButtonElement>(`button[data-act="${a}"]`) ?? null;
  const problems = (): Problem[] => events.flatMap((e) => (e.type === 'problems' ? e.problems : []));
  const pageEvents = () => events.filter((e) => e.type === 'pageChanged');
  const said = () => announce.mock.calls.map((c) => c[0]);
  const ids = () => { const d = g.kernel.rows.displayed; return Array.from({ length: d.count }, (_, i) => String((g.kernel.rows.row(d.keyAt(d.index(i)!))?.data as R).id)); };
  const key = (id: string) => { const d = g.kernel.rows.displayed; for (let i = 0; i < d.count; i++) { const k = d.keyAt(d.index(i)!); if ((g.kernel.rows.row(k)?.data as R).id === id) return k; } throw new Error(`no row ${id} shown`); };
  /** The server's last call answered with rows `from`…`from+n-1` (ids r<i>), and what it says of the rest. */
  const answer = (n: number, more: object) => {
    const req = f.calls.at(-1)!.req;
    const from = req.page?.offset ?? 0;
    f.calls.at(-1)!.ok({ rows: Array.from({ length: n }, (_, i) => ({ id: `r${from + i}`, name: `x${from + i}`, n: from + i })), ...more });
  };
  const click = (b: HTMLElement | null) => {
    if (!b) throw new Error('no such control');
    b.focus();
    b.click();
  };
  return { g, host, box, ctx, events, f, footer, nav, btn, pageText, countEl, countText, sizeSelect, sel, selText, act, problems, pageEvents, said, announce, ids, key, answer, click };
}
