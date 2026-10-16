import type { ColumnLookup } from './columns/model.js';
import type { RowKey } from './ids.js';
import type { DisplayedRows } from './row/displayed.js';

/** Where keyboard focus is, by identity: a row key and a column id, never positions. */
export type FocusPos =
  | { readonly kind: 'cell'; readonly row: RowKey; readonly column: string }
  | { readonly kind: 'header'; readonly column: string };

/**
 * Focus after the rows or the columns changed. A row no longer displayed
 * gives its place to the row now at its old index (the previous one at the
 * end); no rows at all sends focus to the header. A column no longer visible
 * gives way to the first visible column; no columns, no focus.
 */
export function reconcileFocus<T>(f: FocusPos | null, before: DisplayedRows<T>, after: DisplayedRows<T>, columns: ColumnLookup<T>): FocusPos | null {
  if (!f) return null;
  const visible = columns.visible();
  if (!visible.length) return null;
  const column = visible.some((c) => c.id === f.column) ? f.column : visible[0]!.id;
  if (f.kind === 'header') return column === f.column ? f : { kind: 'header', column };
  if (after.indexOf(f.row) !== -1) return column === f.column ? f : { kind: 'cell', row: f.row, column };
  if (after.count === 0) return { kind: 'header', column };
  const was = before.indexOf(f.row);
  const at = Math.min(was === -1 ? 0 : was, after.count - 1);
  return { kind: 'cell', row: after.keyAt(after.index(at)!), column };
}

export function sameFocus(a: FocusPos | null, b: FocusPos | null): boolean {
  if (a === b) return true;
  if (!a || !b || a.kind !== b.kind || a.column !== b.column) return false;
  return a.kind === 'header' || a.row === (b as typeof a).row;
}
