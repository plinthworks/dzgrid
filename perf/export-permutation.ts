/**
 * The CSV export's permutations (step 19, docs/behaviors/csv-export.md): a seed makes a query — a text
 * filter on the actor, a number filter on the duration, the outcome, a quick search of one or two words
 * (accents and case changed at random: the grid and the server fold them), a sort, a page — and a
 * selection, plays it on a grid in one of three configurations, exports `displayed`, `all` and
 * `selected`, parses each file (RFC 4180) and compares its rows, in order, with the oracle's.
 *
 * - `client`: rows in memory, paged in the browser (the browser's own filter, search and sort).
 * - `fetched` (A): the audit screen on a fetched set; the server filters, searches and sorts.
 * - `server` (B): the audit screen on server pages; `all` and `selected` are the server's own file
 *   (`FakeServer.exportAll`, from `queryAll`): the request the grid hands it must be what it asks
 *   its server for the rows (the page and the signal left out).
 *
 * The oracle reads the seed, never the grid: `oracleRows` filters, searches and sorts the universe on
 * its own. A row is known in a file by its time (`occurredAt`, one per row). No test framework here: a
 * broken expectation throws, with the seed, the configuration and the scope. Shared by the jsdom test
 * (packages/dom/test/export-permutations.test.ts).
 */
import type { ColumnFilter, FilterModel, GridEvent, SortItem } from '@dzgrid/core';
import { dataKey } from '@dzgrid/core';
import { canonical } from '@dzgrid/core/internal';
import type { DataRequest } from '@dzgrid/core/server';
import { createGrid, type GridEnv, type GridMessages } from '@dzgrid/dom';
import type { GridContext } from '../packages/dom/src/context.js';
import { csvExport, type CsvExportOptions } from '@dzgrid/dom/export';
import { EN } from '@dzgrid/dom/locales/en';
import { FR } from '@dzgrid/dom/locales/fr';
import { AR } from '@dzgrid/dom/locales/ar';
import { EN_EXPORT } from '@dzgrid/dom/locales/en-export';
import { FR_EXPORT } from '@dzgrid/dom/locales/fr-export';
import { AR_EXPORT } from '@dzgrid/dom/locales/ar-export';
import { EN_FILTERS } from '@dzgrid/dom/locales/en-filters';
import { FR_FILTERS } from '@dzgrid/dom/locales/fr-filters';
import { AR_FILTERS } from '@dzgrid/dom/locales/ar-filters';
import { EN_PAGINATION } from '@dzgrid/dom/locales/en-pagination';
import { FR_PAGINATION } from '@dzgrid/dom/locales/fr-pagination';
import { AR_PAGINATION } from '@dzgrid/dom/locales/ar-pagination';
import { parseCsv } from '../packages/core/test/support/rfc4180.js';
import { AUDIT_ZONE, auditColumns, auditWords, joinMessages, mountAudit, type AuditConfig, type AuditLang } from './audit-screen.js';
import { ACTIONS, ACTORS, auditRow, createFakeServer, fold, rng, STEP_MS, T0, type AuditRow, type FakeServer } from './fake-server.js';

export type ExportConfig = 'client' | 'fetched' | 'server';
export const UNIVERSE = 300;
const PAGE = 25;

export interface ExportIntent {
  readonly actor: string;
  readonly duration: { readonly op: 'gt' | 'lt'; readonly value: number } | null;
  readonly outcome: boolean | null;
  readonly quick: string;
  readonly sort: { readonly column: 'occurredAt' | 'durationMs'; readonly dir: 'asc' | 'desc' } | null;
  readonly page: number;
  /** Universe indices selected. */
  readonly picks: readonly number[];
}

const ACCENTS: Record<string, string> = { a: 'á', e: 'é', i: 'î', o: 'ô', u: 'ü' };

/** The query and selection of a seed. B sorts by time only (its server's columns), so its sort is time or none. */
export function exportIntent(seed: number, config: ExportConfig): ExportIntent {
  const r = rng(seed * 104_729 + 7);
  const fragment = (pool: readonly string[]): string => {
    const s = r.pick(pool).split(' ')[r.int(2)] ?? '';
    const at = r.int(Math.max(1, s.length - 2));
    let t = s.slice(at, at + 2 + r.int(2));
    // Accents and case the user may type differently: folded away by the grid and the server.
    if (r.int(2) === 0) t = [...t].map((c) => (r.int(2) === 0 ? ACCENTS[c] ?? c : c)).join('');
    return r.int(3) === 0 ? t.toUpperCase() : t;
  };
  const words = r.int(3) === 0 ? '' : r.int(4) === 0 ? `${fragment(ACTORS)} ${fragment(ACTORS)}` : fragment(ACTORS);
  const sorts = [null, { column: 'occurredAt', dir: 'asc' }, { column: 'occurredAt', dir: 'desc' }, { column: 'durationMs', dir: 'asc' }, { column: 'durationMs', dir: 'desc' }] as const;
  let sort: ExportIntent['sort'] = r.pick(sorts);
  if (config === 'server' && sort?.column === 'durationMs') sort = null;
  return {
    actor: r.int(3) === 0 ? fragment(ACTORS) : '',
    duration: r.int(3) === 0 ? { op: r.pick(['gt', 'lt'] as const), value: r.pick([500, 1200, 2500, 4000]) } : null,
    outcome: r.int(5) === 0 ? r.int(4) !== 0 : null,
    quick: r.int(3) === 0 ? ` ${words} ` : words,
    sort,
    page: r.int(4),
    picks: [...new Set(Array.from({ length: 2 + r.int(7) }, () => r.int(UNIVERSE)))],
  };
}

/**
 * Every row the intent matches, in its order: the oracle (each word of the search in the actor, the
 * resource or the action: the browser reads the action's label in the screen's language, the server its code).
 */
export function oracleRows(i: ExportIntent, config: ExportConfig, lang: AuditLang = 'en'): AuditRow[] {
  const labels = auditWords(lang).actions;
  const a = fold(i.actor);
  const words = fold(i.quick.trim()).split(/\s+/).filter(Boolean);
  const out: AuditRow[] = [];
  for (let x = 0; x < UNIVERSE; x++) {
    const row = auditRow(x);
    if (a && !fold(row.actor).includes(a)) continue;
    if (i.duration && !(i.duration.op === 'gt' ? row.durationMs > i.duration.value : row.durationMs < i.duration.value)) continue;
    if (i.outcome !== null && row.outcome !== i.outcome) continue;
    // The browser searches the visible columns' text (the action's label); the server reads the code and
    // takes the trimmed text as one word.
    const hay = [row.actor, row.resource ?? '', config === 'client' ? labels[ACTIONS.indexOf(row.action)]! : row.action].map(fold);
    const terms = config === 'client' ? words : words.length ? [words.join(' ')] : [];
    if (!terms.every((w) => hay.some((h) => h.includes(w)))) continue;
    out.push(row);
  }
  const s = i.sort;
  if (!s) return out;
  const sign = s.dir === 'asc' ? 1 : -1;
  return out.sort((p, q) => sign * (s.column === 'durationMs' ? p.durationMs - q.durationMs : p.occurredAt < q.occurredAt ? -1 : 1));
}

/** A row of a file, by its time: `YYYY-MM-DD HH:mm:ss` in Algiers (UTC+1, the grid's) or ISO UTC (the server's). */
export function rowOfTime(cell: string): string {
  const ms = /Z$/.test(cell) ? Date.parse(cell) : Date.UTC(+cell.slice(0, 4), +cell.slice(5, 7) - 1, +cell.slice(8, 10), +cell.slice(11, 13), +cell.slice(14, 16), +cell.slice(17, 19)) - 3_600_000;
  const n = (T0 - ms) / STEP_MS;
  if (!Number.isInteger(n) || n < 0) throw new Error(`no row at ${cell}`);
  return `e${n}`;
}

/**
 * The rows of a file, by id: its text (a BOM first), `;` or `,` as its header line has, the time in
 * its first column (`occurredAt` comes first in the audit columns, the grid's file and the server's).
 */
export async function fileRows(file: Blob | string): Promise<string[]> {
  const text = typeof file === 'string' ? file : new TextDecoder().decode(await file.arrayBuffer());
  const sep = text.slice(0, text.indexOf('\r\n')).includes(';') ? ';' : ',';
  const [, ...rows] = parseCsv(text.replace(/^\uFEFF/, ''), sep);
  return rows.map((r) => rowOfTime(r[0]!));
}

const BASES = { en: EN, fr: FR, ar: AR };
const FILTER_TEXTS = { en: EN_FILTERS, fr: FR_FILTERS, ar: AR_FILTERS };
const PAGER_TEXTS = { en: EN_PAGINATION, fr: FR_PAGINATION, ar: AR_PAGINATION };
const EXPORT_TEXTS = { en: EN_EXPORT, fr: FR_EXPORT, ar: AR_EXPORT };
export const exportMessages = (lang: AuditLang): GridMessages => joinMessages(BASES[lang], FILTER_TEXTS[lang], PAGER_TEXTS[lang], EXPORT_TEXTS[lang]);

export interface ExportGrid {
  readonly exporter: ReturnType<typeof csvExport>;
  readonly ctx: GridContext<unknown>;
  readonly server: FakeServer | null;
  destroy(): void;
}

/**
 * A grid with the export, in one of the three configurations, over `UNIVERSE` rows: `client` on rows in
 * memory paged in the browser, `fetched` and `server` the audit screen (B's `exportAll` the server's own).
 */
export function mountExportGrid(config: ExportConfig, o: {
  readonly host: HTMLElement; readonly search: HTMLInputElement; readonly lang?: AuditLang; readonly button?: HTMLElement;
  readonly options?: Partial<CsvExportOptions>; readonly env?: GridEnv; readonly mode?: 'hold' | 'timers'; readonly onEvent?: (e: GridEvent<AuditRow>) => void;
}): ExportGrid {
  const lang = o.lang ?? 'en';
  const server = config === 'client' ? null : createFakeServer({ universe: UNIVERSE, fetched: config === 'fetched', total: true, mode: o.mode ?? 'hold', latency: 0 });
  if (!server) {
    const exporter = csvExport({ canExport: true, ...o.options } as CsvExportOptions);
    const grid = createGrid<AuditRow>(o.host, {
      rows: Array.from({ length: UNIVERSE }, (_, i) => auditRow(i)), getRowId: (r) => r.id, columns: auditColumns('fetched', lang),
      messages: exportMessages(lang), locale: { en: 'en-US', fr: 'fr-FR', ar: 'ar-DZ' }[lang], timeZone: AUDIT_ZONE, pagination: { pageSize: PAGE },
      selection: { mode: 'multi', checkbox: true }, features: [exporter], ...(o.onEvent && { onEvent: o.onEvent }),
    }, o.env);
    const unbind = o.button ? exporter.bind(o.button, { scope: 'all' }) : null;
    return { exporter, ctx: (grid as unknown as { context: GridContext<unknown> }).context, server, destroy: () => (unbind?.(), grid.destroy()) };
  }
  const screen = mountAudit({
    host: o.host, search: o.search, config: config as AuditConfig, lang, messages: exportMessages(lang), source: server.source, pageSize: PAGE,
    ...(o.env && { env: o.env }), ...(o.onEvent && { onEvent: o.onEvent }),
    export: { ...o.options, ...(o.button && { button: o.button }), ...(config === 'server' && { exportAll: (r, c) => server.exportAll(r, c) }) },
  });
  return { exporter: screen.exporter!, ctx: (screen.grid as unknown as { context: GridContext<unknown> }).context, server, destroy: () => screen.destroy() };
}

/** The intent's query, page and selection, dispatched as a user would (the query, then the page, then the selection). */
export async function applyIntent(g: ExportGrid, intent: ExportIntent, settle: () => Promise<void>): Promise<void> {
  const K = g.ctx.kernel;
  const filter: Record<string, ColumnFilter> = {};
  if (intent.actor) filter['actor'] = { type: 'text', op: 'contains', value: intent.actor };
  if (intent.duration) filter['durationMs'] = { type: 'number', op: intent.duration.op, value: intent.duration.value };
  if (intent.outcome !== null) filter['outcome'] = { type: 'boolean', value: intent.outcome };
  K.dispatch({ type: 'filter.set', filter: filter as FilterModel }, 'user');
  K.dispatch({ type: 'quick.set', text: intent.quick }, 'user');
  K.dispatch({ type: 'sort.set', sort: intent.sort ? [intent.sort as SortItem] : [] }, 'user');
  await settle();
  K.dispatch({ type: 'page.go', index: intent.page }, 'user');
  await settle();
  K.dispatch({ type: 'selection.set', selection: { mode: 'include', keys: new Set(intent.picks.map((x) => dataKey(`e${x}`)!)) } }, 'user');
  await settle();
}

const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));
/** Releases every request the hold server keeps, until none comes for two turns (or `p` settles). */
export async function drive(server: FakeServer | null, p?: Promise<unknown>): Promise<void> {
  let done = false;
  p?.then(() => (done = true), () => (done = true));
  let calm = 0;
  for (let k = 0; k < 500; k++) {
    await tick();
    const waiting = server?.pending() ?? [];
    for (const e of waiting) server!.release(e.seq);
    if (p ? done : waiting.length === 0 && ++calm >= 2) return;
    if (waiting.length) calm = 0;
  }
  throw new Error('the grid never settled');
}

export interface SeedResult {
  readonly files: number;
  readonly rows: number;
  readonly hidden: number;
  readonly viaServer: number;
}

/** One seed on one configuration: three exports checked against the oracle. Throws on a mismatch. */
export async function runExportSeed(seed: number, config: ExportConfig): Promise<SeedResult> {
  const fail = (msg: string, detail?: unknown): never => {
    throw new Error(`export seed ${seed} (${config}): ${msg}${detail === undefined ? '' : ` ${JSON.stringify(detail).slice(0, 600)}`}`);
  };
  const intent = exportIntent(seed, config);
  const box = { block: 400, inline: 1200, scrollTop: 0, scrollInline: 0 };
  const geometry = { read: () => ({ ...box }), writeScrollTop: (px: number) => void (box.scrollTop = px), writeScrollInline: (px: number) => void (box.scrollInline = px) };
  const host = document.createElement('div');
  const search = document.createElement('input');
  search.setAttribute('aria-label', 'Search the journal');
  document.body.append(search, host);
  const events: GridEvent<AuditRow>[] = [];
  const files: { blob?: Blob; url?: string; fileName: string }[] = [];
  const asked: unknown[] = [];
  const options: Partial<CsvExportOptions> = { canExport: (r) => (asked.push(r), true), deliver: (f) => void files.push(f) };
  const onEvent = (e: GridEvent<AuditRow>) => void events.push(e);
  const g = mountExportGrid(config, { host, search, options, env: { geometry, sync: true }, onEvent });
  const { exporter, ctx, server } = g;
  const said: string[] = [];
  const announce = ctx.live.announce.bind(ctx.live);
  ctx.live.announce = (t) => (said.push(t), announce(t));
  const K = ctx.kernel;
  try {
    await drive(server);
    await applyIntent(g, intent, () => drive(server));

    const all = oracleRows(intent, config).map((r) => r.id);
    const pages = Math.max(1, Math.ceil(all.length / PAGE));
    const index = Math.min(intent.page, pages - 1);
    if (ctx.rows.page?.index !== index) fail(`page ${ctx.rows.page?.index} shown, the oracle's ${index}`, { count: all.length, intent });
    const picked = new Set(intent.picks.map((x) => `e${x}`));
    const expected = { displayed: all.slice(index * PAGE, index * PAGE + PAGE), all, selected: all.filter((id) => picked.has(id)) };
    let rows = 0;
    let hidden = 0;
    let viaServer = 0;
    for (const scope of ['displayed', 'all', 'selected'] as const) {
      const before = { files: files.length, events: events.length, asked: asked.length };
      const p = exporter.run(scope);
      await drive(server, p);
      const outcome = await p;
      if (outcome !== 'done') fail(`${scope}: ${outcome}`, events.slice(before.events));
      const fin = events.slice(before.events).find((e) => e.type === 'exportFinished') as Extract<GridEvent<AuditRow>, { type: 'exportFinished' }>;
      const req = events.slice(before.events).find((e) => e.type === 'exportRequested') as Extract<GridEvent<AuditRow>, { type: 'exportRequested' }>;
      const f = files[before.files];
      if (!f?.blob) fail(`${scope}: no file`);
      const got = await fileRows(f!.blob!);
      const want = expected[scope];
      if (got.length !== want.length || got.some((id, k) => id !== want[k])) fail(`${scope}: the file's rows are not the oracle's`, { got: got.slice(0, 30), want: want.slice(0, 30), intent });
      // The request: its count, and on a source what the server is asked for the rows (no page, no signal).
      const request = asked[before.asked] as { count: number | null; server?: unknown };
      const count = scope === 'selected' && fin.via === 'server' ? picked.size : want.length;
      if (request.count !== count || req.count !== count) fail(`${scope}: count ${request.count} asked, ${count} expected`);
      if (server) {
        const last = server.log.filter((e) => e.channel === 'rows' && e.state === 'ok').at(-1)!.req as DataRequest;
        const { page: _p, signal: _s, key: _k, ...parts } = last;
        if (canonical(request.server) !== canonical({ ...parts, key: canonical(parts) })) fail(`${scope}: the request's server part is not what the grid asks its server`, { request: request.server, parts });
        if (canonical(req.server) !== canonical(request.server)) fail(`${scope}: the event's server part differs from the request's`);
      }
      // Hidden: the selected rows the query does not show (told by a browser export only).
      const lost = fin.via === 'browser' && scope === 'selected' ? K.selection.keys.size - want.length : 0;
      if ((fin.hidden ?? 0) !== lost) fail(`${scope}: hidden ${fin.hidden}, expected ${lost}`);
      if (config === 'client' && scope === 'selected' && K.selection.keys.size !== picked.size) fail('the selection lost keys in the browser');
      if (fin.via === 'server') viaServer++;
      rows += got.length;
      hidden += fin.hidden ?? 0;
      // Data only: no row key nor cell value of the file in any event, problem or sentence.
      const told = JSON.stringify([events.slice(before.events).filter((e) => e.type.startsWith('export') || e.type === 'problems'), said]);
      for (const id of got.slice(0, 40)) {
        const r = auditRow(Number(id.slice(1)));
        for (const v of [`"${id}"`, r.actor, r.resource, r.occurredAt]) if (v && told.includes(v)) fail(`${scope}: ${v} told`);
      }
    }
    return { files: 3, rows, hidden, viaServer };
  } finally {
    g.destroy();
    document.body.innerHTML = '';
  }
}
