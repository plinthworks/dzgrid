import { splitQuery, type GridEvent, type SelectionState } from '@dzgrid/core';
import type { DataRequest } from '@dzgrid/core/server';
import { canonical, emit, filterKindLookup } from '@dzgrid/core/internal';
import { csvColumns, csvRows, type CsvScope, type ExportRequest } from '@dzgrid/core/csv';
import type { GridContext } from '../../context.js';

/** What the server is asked, without the page and the signal. */
export type ServerPart = Omit<DataRequest, 'page' | 'signal'>;

/** How many rows a selection holds: its keys, or (everything-except) the query's count less them; null when unknown. */
export const selectionCount = (s: SelectionState, filtered: number | null): number | null =>
  s.mode === 'include' ? s.keys.size : filtered === null ? null : Math.max(0, filtered - s.keys.size);

/**
 * What the server would be asked for the query now, without the page (step 19, §3): the server's part
 * of the query (`splitQuery`), the filter in its wire form (`toWire`, from `@dzgrid/core/server`,
 * which a grid on a source already loads), the params and the zone, and its canonical key — as the
 * source model builds its own requests.
 */
export async function serverPart(g: GridContext<unknown>): Promise<ServerPart> {
  const { toWire } = await import('@dzgrid/core/server');
  const M = g.rows;
  const s = splitQuery(g.kernel.query, M.ops).server;
  const parts: { -readonly [K in keyof ServerPart]?: ServerPart[K] } = { params: M.scope.params, zone: M.scope.zone };
  const kinds = g.settings.filterKinds;
  if (s.filter) parts.filter = toWire(s.filter, { ctx: g.ctx, columns: g.columns, now: (g.settings.clock ?? Date.now)(), ...(kinds && { kinds: filterKindLookup(kinds).get }) }).filter;
  if (s.quick !== undefined) parts.quick = s.quick;
  if (s.sort) parts.sort = s.sort;
  return { ...parts, key: canonical(parts) } as ServerPart;
}

export interface Built {
  readonly request: ExportRequest;
  /** The rows the browser writes; null: the host's `exportAll`. */
  readonly held: ReturnType<typeof csvRows<unknown>>;
  /** `exportRequested` without what every event carries. */
  readonly event: Omit<Extract<GridEvent<unknown>, { type: 'exportRequested' }>, 'source' | 'id' | 'at' | 'scope'>;
}

/**
 * The request (`ExportRequest`, data only) for `scope`: the columns asked (or the visible ones, an
 * unknown id skipped and told), the query, the count, the selection for `selected`, the server's part
 * with a source; and the event that tells it, the selection as mode and count only.
 */
export async function buildRequest(g: GridContext<unknown>, scope: CsvScope, ids: readonly string[] | undefined): Promise<Built> {
  const { kernel: K, rows: M } = g;
  const { columns: cols, problems } = csvColumns(g.columns, ids);
  if (problems.length) emit(K, { type: 'problems', source: 'host', problems });
  const columns = cols.map((c) => c.id);
  const sel = K.selection;
  const held = csvRows(M, scope, sel);
  const picked = selectionCount(sel, M.counts.filtered);
  const count = held ? held.count : scope === 'all' ? M.counts.filtered : picked;
  const server = g.settings.source ? await serverPart(g) : null;
  const query = K.query;
  const request: ExportRequest = { scope, columns, query, count, ...(scope === 'selected' && { selection: sel }), ...(server && { server }) };
  return {
    request, held,
    event: {
      type: 'exportRequested', columns, query, queryKey: M.membershipOf(query), ...(server && { server }), count,
      ...(scope === 'selected' && { selection: { mode: sel.mode, count: picked } }), zone: g.ctx.timeZone, locale: g.ctx.locale,
    },
  };
}
