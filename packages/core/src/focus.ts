import type { ColumnLookup } from './columns/model.js';
import type { RowKey } from './ids.js';
import type { DisplayedRows } from './row/displayed.js';

/** Where keyboard focus is, by identity: a row key and a column id, never positions. */
export type FocusPos =
  | { readonly kind: 'cell'; readonly row: RowKey; readonly column: string }
  /**
   * `level`: which header row, signed. 0 (the column headers) when absent; positive for the
   * rows features add under them (a floating filter row is 1); negative for the group rows
   * above them (-1 just above the column headers).
   */
  | { readonly kind: 'header'; readonly column: string; readonly level?: number };

/** A focus on a cell, by identity. */
export type CellFocus = Extract<FocusPos, { readonly kind: 'cell' }>;

/**
 * Where a cell's focus really belongs once the rows are known: the cell that
 * owns its place (a spanned cell's origin). The spans feature sets one; the
 * base has none.
 */
export type FocusOwner<T> = (f: CellFocus, rows: DisplayedRows<T>) => FocusPos;

/**
 * Focus after the rows or the columns changed. A row no longer displayed
 * gives its place to the row now at its old index (the previous one at the
 * end); no rows at all sends focus to the header. A column no longer visible
 * gives way to the first visible column; no columns, no focus. `owner`, when
 * given, moves a cell's focus to the cell owning its place.
 */
export function reconcileFocus<T>(f: FocusPos | null, before: DisplayedRows<T>, after: DisplayedRows<T>, columns: ColumnLookup<T>, owner?: FocusOwner<T>): FocusPos | null {
  if (!f) return null;
  const visible = columns.visible();
  if (!visible.length) return null;
  const column = visible.some((c) => c.id === f.column) ? f.column : visible[0]!.id;
  if (f.kind === 'header') return column === f.column ? f : f.level ? { kind: 'header', column, level: f.level } : { kind: 'header', column };
  if (after.count === 0) return { kind: 'header', column };
  let to: CellFocus;
  if (after.indexOf(f.row) !== -1) to = column === f.column ? f : { kind: 'cell', row: f.row, column };
  else {
    const was = before.indexOf(f.row);
    const at = Math.min(was === -1 ? 0 : was, after.count - 1);
    to = { kind: 'cell', row: after.keyAt(after.index(at)!), column };
  }
  return owner ? owner(to, after) : to;
}

export function sameFocus(a: FocusPos | null, b: FocusPos | null): boolean {
  if (a === b) return true;
  if (!a || !b || a.kind !== b.kind || a.column !== b.column) return false;
  if (a.kind === 'header') return (a.level ?? 0) === ((b as typeof a).level ?? 0);
  return a.row === (b as typeof a).row;
}
