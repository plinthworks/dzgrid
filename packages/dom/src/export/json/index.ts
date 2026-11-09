import type { DisplayIndex, DisplayedRows, LocaleCtx, Problem, ResolvedColumn, RowKey } from '@dzgrid/core';
import type { GridContext } from '../../context.js';
import type { CsvExportOptions } from '../index.js';
import { batcher, drain, type SliceEnv } from '../run/slice.js';

/** What a cell is read through: the edit overlay (`g.edit.read`), or the column. */
type Read = ((col: ResolvedColumn<unknown>, row: unknown, key: RowKey) => unknown) | undefined;

/**
 * The JSON file (docs/behaviors/json-export.md 4–8), the lazy part of a JSON export: one array of objects, one per data row
 * of `held` in its order, keyed by the columns' ids; raw values (a number, a boolean, a day, an instant as ISO UTC text,
 * an enum's code, a text), or the cells' text with `display`; `null` for a blank or an unreadable cell (counted). A chunk
 * of `size` rows at a time; returns the counts.
 */
export function* jsonChunks(
  held: { readonly rows: DisplayedRows<unknown>; readonly at: Uint32Array | null; readonly count: number },
  cols: readonly ResolvedColumn<unknown>[], ctx: LocaleCtx, read: Read, display: boolean, size = 500,
): Generator<string, { rows: number; columns: number; blank: number; invalid: number }> {
  const { rows, at } = held;
  const sum = { rows: 0, columns: cols.length, blank: 0, invalid: 0 };
  let out = '[\n';
  const n = at ? at.length : rows.count;
  for (let k = 0; k < n; k++) {
    const node = rows.nodeAt((at ? at[k]! : k) as DisplayIndex);
    // Data rows only (7): no group, totals, filler, loading row or detail.
    if (node.kind !== 'data') continue;
    const rec: Record<string, unknown> = {};
    for (const col of cols) {
      const c = col.codec;
      let v: unknown = null;
      try {
        const raw = read ? read(col, node.data, node.key) : col.read(node.data);
        if (raw == null || raw === '' || c.isEmpty(raw)) sum.blank++;
        else if ((v = c.coerce(raw, ctx)) === null) sum.invalid++;
        else v = display ? c.format(v as never, ctx) : typeof v == 'boolean' || (typeof v == 'number' && c.kind === 'number') ? (Number.isFinite(v) || typeof v == 'boolean' ? v : null) : c.toExport(v as never);
      } catch {
        sum.invalid++;
        v = null;
      }
      rec[col.id] = v;
    }
    out += (sum.rows++ ? ',\n' : '') + JSON.stringify(rec);
    if (sum.rows % size === 0) {
      yield out;
      out = '';
    }
  }
  yield `${out}${sum.rows ? '\n' : ''}]\n`;
  return sum;
}

/** The JSON export's build (json-export.md 9): the file in slices, null when cancelled. */
export async function build(
  g: GridContext<unknown>, o: CsvExportOptions, held: Parameters<typeof jsonChunks>[0], columns: readonly string[], env: SliceEnv,
): Promise<{ readonly blob: Blob; readonly sum: { rows: number; columns: number; blank: number; invalid: number; problems: Problem[] } } | null> {
  const b = batcher();
  const sum = await drain(jsonChunks(held, columns.map((id) => g.columns.get(id)!), g.ctx, g.edit?.read, o.text === 'display'), env, b.push);
  return sum && { blob: b.blob('application/json'), sum: { ...sum, problems: [] } };
}
