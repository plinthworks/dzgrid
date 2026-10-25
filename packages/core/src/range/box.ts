import type { DisplayedRows } from '../row/displayed.js';
import type { DataNode } from '../row/node.js';
import type { CellRange } from '../selection/cells.js';

/** Display positions (inclusive, top ≤ bottom) and indices into the visible columns (start ≤ end), for one `displayed` version. */
export interface RangeBox {
  readonly top: number;
  readonly bottom: number;
  readonly start: number;
  readonly end: number;
}

/**
 * A block's box for the rows shown now and the visible columns in reading order (range-selection.md 1–3;
 * R1): null when a corner's row is not shown or its column not visible (the DOM drops the block, B2).
 */
export function rangeBox(r: CellRange, displayed: DisplayedRows<unknown>, columns: readonly string[]): RangeBox | null {
  const a = displayed.indexOf(r.anchor.row);
  const f = displayed.indexOf(r.focus.row);
  const c = columns.indexOf(r.anchor.column);
  const d = columns.indexOf(r.focus.column);
  return a < 0 || f < 0 || c < 0 || d < 0 ? null : { top: Math.min(a, f), bottom: Math.max(a, f), start: Math.min(c, d), end: Math.max(c, d) };
}

/** The data rows of a box in display order: details, fillers and loading rows count for nothing (R2, D11). */
export function boxRows<T>(b: RangeBox, displayed: DisplayedRows<T>): DataNode<T>[] {
  const out: DataNode<T>[] = [];
  for (let i = b.top; i <= b.bottom; i++) {
    const at = displayed.index(i);
    const n = at === null ? null : displayed.nodeAt(at);
    if (n?.kind === 'data') out.push(n);
  }
  return out;
}

/** Data rows × columns: the size said and counted. */
export function boxSize(b: RangeBox, displayed: DisplayedRows<unknown>): { rows: number; cols: number; cells: number } {
  const rows = boxRows(b, displayed).length;
  const cols = b.end - b.start + 1;
  return { rows, cols, cells: rows * cols };
}
