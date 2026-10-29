import { idOfDataKey, type Query, type ResolvedColumn } from '@dzgrid/core';
import type { DzgController } from './controller';

/**
 * A column's own bag, `ui.data`, typed by the caller (Phase 6 step 12): `uiData<{ colours: Record<string, string> }>(c)`
 * from any part's context (`let-c`, a component's `cell()`); undefined when the column gives none. Tree-shaken unused.
 */
export function uiData<D = Readonly<Record<string, unknown>>>(c: { readonly column: ResolvedColumn<any> }): D | undefined {
  return c.column.def.ui?.data as D | undefined;
}

/**
 * The selection as a server understands it (Phase 6 step 12; allergen-detector's lesson): the row ids (`getRowId`'s, as
 * strings), never the grid's keys (`d:13:…`), for rows held or not; the mode (`exclude`: every row the query matches but
 * these, after « Select all »); the grid's query (filter model, sort, search) to replay that set. On a server grid the
 * query as the server reads it is the last `DataRequest` its `fetch` received (`filter` in wire form, `sort`, `quick`).
 * Null without a grid. Tree-shaken unused.
 */
export function selectedIds<T>(controller: DzgController<T>): { readonly mode: 'include' | 'exclude'; readonly ids: string[]; readonly query: Query } | null {
  const k = controller.kernel();
  return k && { mode: k.selection.mode, ids: [...k.selection.keys].map(idOfDataKey).filter((x) => x !== null), query: k.query };
}

/**
 * The open rows as the app saves them (step 16f, angular-parts.md « Saving the open rows by the app's own ids »): the
 * ids of the open data rows (`getRowId`'s, as strings), never the grid's keys; a path tree's fillers (no id), details'
 * and pinned rows' keys left out. Restore with `[expanded]` and `dataKey(id)`. Null without a grid. Tree-shaken unused.
 */
export function expandedIds<T>(controller: DzgController<T>): string[] | null {
  const k = controller.kernel();
  return k && [...k.expansion].map(idOfDataKey).filter((x) => x !== null);
}
