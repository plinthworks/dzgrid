// Shared fixtures for the CSV export feature (step 19, docs/behaviors/csv-export.md).
import { vi } from 'vitest';
import type { ColumnOrGroup, GridEvent, Problem } from '@dzgrid/core';
import { sourceRows } from '@dzgrid/core/server';
import { createGrid, type GridInstance } from '../src/grid.js';
import type { GridSettings } from '../src/settings.js';
import type { Geometry, ViewportBox } from '../src/render/measure.js';
import type { GridFeature } from '../src/features.js';
import type { GridContext } from '../src/context.js';
import type { GridMessages } from '../src/messages.js';
import { csvExport, type CsvExport, type CsvExportOptions } from '../src/export.js';
import { EN } from '../src/locales/en.js';
import { FR } from '../src/locales/fr.js';
import { AR } from '../src/locales/ar.js';
import { EN_EXPORT } from '../src/locales/en-export.js';
import { FR_EXPORT } from '../src/locales/fr-export.js';
import { AR_EXPORT } from '../src/locales/ar-export.js';
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
export const BUNDLES = { en: join(EN, EN_EXPORT), fr: join(FR, FR_EXPORT), ar: join(AR, AR_EXPORT) } as const;
export const LOCALES = { en: 'en-US', fr: 'fr-FR', ar: 'ar-DZ' } as const;
export const ROWS: R[] = Array.from({ length: 30 }, (_, i) => ({ id: `r${i}`, name: i % 3 ? `bob${i}` : `ann${i}`, n: i }));
export const COLUMNS: ColumnOrGroup<R>[] = [{ id: 'name', header: 'Name' }, { id: 'n', header: 'N', type: 'number' }];

/** What `deliver` was handed, the Blob's text read later. */
export interface Delivered { blob?: Blob; url?: string; fileName: string }

export interface XMake {
  /** `client` (the browser's rows), `paged` (paged in the browser), `offset` (a server's pages), `fetched` (a fetched set). */
  readonly mode?: 'client' | 'paged' | 'offset' | 'fetched';
  readonly lang?: keyof typeof BUNDLES;
  readonly rows?: R[];
  readonly columns?: ColumnOrGroup<R>[];
  /** The export's options over `canExport: true`, a `deliver` that records, and the chunk imported directly. */
  readonly options?: Partial<CsvExportOptions>;
  readonly features?: readonly GridFeature[];
  readonly settings?: Partial<GridSettings<R>> & Record<string, unknown>;
  /** Use this feature object instead of a new one. */
  readonly feature?: CsvExport;
}

/** A grid with `csvExport()`, synchronous paints, a fake geometry. Server modes answer only when told. */
export function xmake(o: XMake = {}) {
  const mode = o.mode ?? 'client';
  const lang = o.lang ?? 'en';
  const box: { -readonly [K in keyof ViewportBox]: ViewportBox[K] } = { block: 400, inline: 900, scrollTop: 0, scrollInline: 0 };
  const geometry: Geometry = { read: () => ({ ...box }), writeScrollTop: (px) => { box.scrollTop = px; }, writeScrollInline: (px) => { box.scrollInline = px; } };
  const host = document.createElement('div');
  document.body.append(host);
  const events: GridEvent<R>[] = [];
  const delivered: Delivered[] = [];
  const f = fakeSource();
  const data = mode === 'offset' ? { source: sourceRows(f.source, { paging: 'offset' }), operations: 'server', pagination: { pageSize: 10 } }
    : mode === 'fetched' ? { source: sourceRows(f.source), operations: { filter: 'server', quick: 'server', sort: 'server', page: 'client' }, pagination: { pageSize: 10 } }
    : { rows: o.rows ?? ROWS, ...(mode === 'paged' && { pagination: { pageSize: 10 } }) };
  const feature = o.feature ?? csvExport({ canExport: true, deliver: (d) => void delivered.push(d), loadRun: () => import('../src/export/run/index.js'), ...o.options } as CsvExportOptions);
  const g = createGrid<R>(host, {
    ...data, getRowId: (r: R) => r.id, columns: o.columns ?? COLUMNS,
    messages: BUNDLES[lang], locale: LOCALES[lang], timeZone: 'Africa/Algiers',
    selection: { mode: 'multi', checkbox: true },
    features: o.features ?? [feature], onEvent: (e: GridEvent<R>) => events.push(e), ...o.settings,
  } as never, { geometry, sync: true }) as GridInstance<R, any>;
  grids.push(g);
  const ctx = (g as unknown as { context: GridContext<unknown> }).context;
  const announce = vi.spyOn(ctx.live, 'announce');
  // A host's error is reported (window.reportError): recorded here, not thrown at the test runner.
  const report = vi.spyOn(ctx, 'report').mockImplementation(() => {});
  const problems = (): Problem[] => events.flatMap((e) => (e.type === 'problems' ? e.problems : []));
  const said = () => announce.mock.calls.map((c) => c[0]);
  const exportEvents = () => events.filter((e) => e.type.startsWith('export'));
  const key = (id: string) => { const d = g.kernel.rows.displayed; for (let i = 0; i < d.count; i++) { const k = d.keyAt(d.index(i)!); if ((g.kernel.rows.row(k)?.data as R).id === id) return k; } throw new Error(`no row ${id} shown`); };
  /** The server's last call answered with rows `from`…`from+n-1`. */
  const answer = (n: number, more: object = {}) => {
    const req = f.calls.at(-1)!.req;
    const from = req.page?.offset ?? 0;
    f.calls.at(-1)!.ok({ rows: Array.from({ length: n }, (_, i) => ({ id: `r${from + i}`, name: `x${from + i}`, n: from + i })), ...more });
  };
  return { g, host, ctx, report, feature, events, delivered, f, problems, said, announce, exportEvents, key, answer };
}

/** The bytes of a Blob, and its text without the BOM. */
export async function read(b: Blob): Promise<{ bytes: number[]; text: string }> {
  const buf = new Uint8Array(await b.arrayBuffer());
  return { bytes: [...buf.slice(0, 3)], text: new TextDecoder('utf-8', { ignoreBOM: false }).decode(buf) };
}

/** Lets the promises and the 0 ms timers run (the chunk's yields). */
export const flush = async (n = 20): Promise<void> => {
  for (let i = 0; i < n; i++) await new Promise((r) => setTimeout(r, 0));
};
