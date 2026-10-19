import type { DisplayIndex } from '../ids.js';
import type { RowModel } from '../model/client.js';
import type { Query } from '../model/query.js';
import type { DisplayedRows } from '../row/displayed.js';
import { isSelected, type SelectionState } from '../selection/rows.js';
import type { DataRequest } from '../server/source.js';

export type CsvScope = 'displayed' | 'selected' | 'all';

/** What `canExport` and `exportAll` receive (step 19): the request, never a row. */
export interface ExportRequest {
  readonly scope: CsvScope;
  readonly columns: readonly string[];
  readonly query: Query;
  /** Rows the file will hold; null when only the server knows. */
  readonly count: number | null;
  readonly selection?: SelectionState;
  /** With a source: what the server would be asked, without the page. */
  readonly server?: Omit<DataRequest, 'page' | 'signal'>;
}

/**
 * The rows a scope writes, from what the browser holds: `displayed` the rows
 * shown (the page), `all` every row the query matches, `selected` those of
 * them that are selected, in screen order (owner Q2: a selected row the
 * filters hide is not written). Null when the browser does not hold them
 * (server pages): the host's `exportAll` then.
 */
export function csvRows<T>(model: Pick<RowModel<T>, 'displayed' | 'allRows'>, scope: CsvScope, selection: SelectionState): { rows: DisplayedRows<T>; at: Uint32Array | null; count: number } | null {
  if (scope === 'displayed') return { rows: model.displayed, at: null, count: model.displayed.count };
  const rows = model.allRows;
  if (!rows) return null;
  if (scope === 'all') return { rows, at: null, count: rows.count };
  const at: number[] = [];
  for (let i = 0; i < rows.count; i++) if (isSelected(selection, rows.keyAt(i as DisplayIndex))) at.push(i);
  return { rows, at: Uint32Array.from(at), count: at.length };
}
