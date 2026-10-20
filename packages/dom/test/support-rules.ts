// Shared fixtures for selection rules (step 21, docs/behaviors/selection-rules.md).
import { vi } from 'vitest';
import { dataKey, type GridEvent, type Problem, type RowKey, type RowNode, type SelectionState } from '@dzgrid/core';
import { sourceRows } from '@dzgrid/core/server';
import { createGrid, type GridInstance } from '../src/grid.js';
import type { GridSettings } from '../src/settings.js';
import type { Geometry, ViewportBox } from '../src/render/measure.js';
import type { GridFeature } from '../src/features.js';
import type { GridContext } from '../src/context.js';
import type { GridMessages } from '../src/messages.js';
import { rules } from '../src/rules.js';
import { pagination } from '../src/pagination.js';
import { EN } from '../src/locales/en.js';
import { FR } from '../src/locales/fr.js';
import { AR } from '../src/locales/ar.js';
import { EN_RULES } from '../src/locales/en-rules.js';
import { FR_RULES } from '../src/locales/fr-rules.js';
import { AR_RULES } from '../src/locales/ar-rules.js';
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

const join = (...b: { locale: string; text: object }[]): GridMessages => ({ locale: b[0]!.locale, text: Object.assign({}, ...b.map((x) => x.text)) });
export const BUNDLES = { en: join(EN, EN_RULES, EN_PAGINATION), fr: join(FR, FR_RULES, FR_PAGINATION), ar: join(AR, AR_RULES, AR_PAGINATION) } as const;
export const LOCALES = { en: 'en-US', fr: 'fr-FR', ar: 'ar-DZ' } as const;
export const ROWS: R[] = Array.from({ length: 30 }, (_, i) => ({ id: `r${i}`, name: `n${i}`, n: i }));
export const k = (id: string): RowKey => dataKey(id)!;
export const idOf = (key: RowKey): string => String(key).replace(/^d:\d+:/, '');
/** The ids a selection holds, sorted by number. */
export const held = (s: SelectionState): string[] => [...s.keys].map(idOf).sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));

export type Rule = (row: RowNode<R>, selection: SelectionState, context: unknown) => boolean | string;
/** A rule refusing these ids (the reason when given). */
export const refuse = (ids: string[], reason?: string): Rule => (row) => (ids.includes(row.data.id) ? reason ?? false : true);

export interface RMake {
  /** `client` (unpaged), `paged` (the browser's pages), `offset` or `cursor` (a server's pages, answered on demand), `fetched` (a server's whole set, paged in the browser). */
  readonly mode?: 'client' | 'paged' | 'offset' | 'cursor' | 'fetched';
  readonly lang?: keyof typeof BUNDLES;
  readonly rule?: Rule | null;
  readonly features?: readonly GridFeature[];
  readonly settings?: Partial<GridSettings<R>> & Record<string, unknown>;
  readonly rows?: R[];
  readonly pageSize?: number;
  readonly block?: number;
  readonly selection?: 'single' | 'multi';
}

/** A grid with `rules()`, a selection box column, synchronous paints and a fake geometry. */
export function rmake(o: RMake = {}) {
  const mode = o.mode ?? 'client';
  const lang = o.lang ?? 'en';
  const box: { -readonly [K in keyof ViewportBox]: ViewportBox[K] } = { block: o.block ?? 400, inline: 900, scrollTop: 0, scrollInline: 0 };
  const geometry: Geometry = { read: () => ({ ...box }), writeScrollTop: (px) => { box.scrollTop = px; }, writeScrollInline: (px) => { box.scrollInline = px; } };
  const host = document.createElement('div');
  document.body.append(host);
  const events: GridEvent<R>[] = [];
  const f = fakeSource();
  const page = { pageSize: o.pageSize ?? 10 };
  const data = mode === 'offset' || mode === 'cursor'
    ? { source: sourceRows(f.source, { paging: mode }), operations: 'server', pagination: page }
    : mode === 'fetched' ? { source: sourceRows(f.source), operations: 'client', pagination: page }
    : { rows: o.rows ?? ROWS, ...(mode === 'paged' && { pagination: page }) };
  const paged = mode !== 'client';
  const rule = o.rule === undefined ? refuse([]) : o.rule;
  const g = createGrid<R>(host, {
    ...data, getRowId: (r: R) => r.id, columns: [{ id: 'name', header: 'Name' }, { id: 'n', header: 'N', type: 'number' }],
    messages: BUNDLES[lang], locale: LOCALES[lang],
    selection: { mode: o.selection ?? 'multi', checkbox: true, ...(rule && { canSelect: rule }) },
    features: o.features ?? [rules(), ...(paged ? [pagination()] : [])], onEvent: (e: GridEvent<R>) => events.push(e), ...o.settings,
  } as never, { geometry, sync: true }) as GridInstance<R, any>;
  grids.push(g);
  const ctx = (g as unknown as { context: GridContext<unknown> }).context;
  const announce = vi.spyOn(ctx.live, 'announce');
  const vp = host.querySelector<HTMLElement>('.dzg-viewport')!;
  const rowEl = (id: string) => [...host.querySelectorAll<HTMLElement>('.dzg-body .dzg-row')].find((r) => ctx.rowRenderer.keyOf(r) === k(id)) ?? null;
  const check = (id: string) => rowEl(id)?.querySelector<HTMLElement>('.dzg-check') ?? null;
  const headerBox = () => ctx.headerRenderer.checkBox as HTMLElement | null;
  const said = () => announce.mock.calls.map((c) => c[0]);
  const problems = (): Problem[] => events.flatMap((e) => (e.type === 'problems' ? e.problems : []));
  const refusals = () => events.filter((e) => e.type === 'selectionRefused');
  const press = (k_: string, init: KeyboardEventInit = {}) => {
    const e = new KeyboardEvent('keydown', { key: k_, bubbles: true, cancelable: true, ...init });
    (document.activeElement as HTMLElement).dispatchEvent(e);
    return e;
  };
  /** Focus on a row's cell (the grid's own focus, as a click or the keys would put it). */
  const focusRow = (id: string) => g.api.focusCell(k(id), 'name');
  const clickBox = (id: string, init: MouseEventInit = {}) => {
    const c = check(id);
    if (!c) throw new Error(`no box for ${id}`);
    c.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ...init }));
  };
  const answer = (from: number, n: number, more: object = {}) => {
    const call = f.calls.at(-1)!;
    const at = call.req.page?.offset ?? from;
    call.ok({ rows: Array.from({ length: n }, (_, i) => ({ id: `r${at + i}`, name: `n${at + i}`, n: at + i })), ...more });
  };
  const scrollTo = (px: number) => { box.scrollTop = px; vp.dispatchEvent(new Event('scroll')); };
  return { g, host, vp, box, ctx, events, f, announce, said, problems, refusals, press, focusRow, clickBox, check, rowEl, headerBox, answer, scrollTo, rule };
}
