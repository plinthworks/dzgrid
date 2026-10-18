import type { CellFocus, FocusOwner, FocusPos } from '../focus.js';
import type { Intent } from '../keys/intent.js';
import type { DisplayedRows } from '../row/displayed.js';
import { builtFor, type SpanCell, type SpanLookup, type SpanMap } from './map.js';

/**
 * Moving the focus over spanned cells (step 9b blueprint C), by position:
 * display indices and visible-column indices. The grid turns positions into
 * row keys and column ids, and keeps headers to itself.
 */

/** A place in the body: a display index and a visible-column index. */
export interface Slot {
  readonly row: number;
  readonly col: number;
}

export interface NavShape {
  readonly rows: number;
  readonly cols: number;
  /** Rows a page key moves by. */
  readonly page: number;
}

export interface NavMove {
  /** The origin of the cell to focus; row -1: above the first row (the header row). */
  readonly to: Slot;
  /** The slot aimed at: kept across a spanned cell so that moving on comes back to it. */
  readonly goal: Slot;
}

const ownerOf = (map: SpanLookup | null, row: number, col: number): SpanCell => map?.ownerAt(row, col) ?? { row, col, rows: 1, cols: 1 };

/** The origin of the cell owning a slot (the slot itself when plain). */
export const land = (map: SpanLookup | null, row: number, col: number): Slot => {
  const o = ownerOf(map, row, col);
  return { row: o.row, col: o.col };
};

/**
 * Where a `move`, `edge` or `page` intent goes from the cell owning `from`;
 * null for any other intent or an empty grid. Goal-based: the goal (the slot
 * the user aims at) is used while the cell focused still owns it, else the
 * cell's origin is. Vertical moves keep the goal column, horizontal ones the
 * goal row; Down leaves a tall cell below its last row, Up above its first,
 * Right and Left past its sides; landing in a spanned cell focuses its origin
 * and aims at the slot reached. A move that ends on the cell it starts from
 * (an edge, a full-width row's Left or Right) stays put and keeps the goal.
 * Without a map: one slot at a time, as the grid moves today.
 */
export function navigate(map: SpanLookup | null, s: NavShape, from: Slot, goal: Slot | null, intent: Intent): NavMove | null {
  if (!(s.rows > 0 && s.cols > 0)) return null;
  const o = ownerOf(map, from.row, from.col);
  const go = goal && goal.row >= 0 ? ownerOf(map, goal.row, goal.col) : null;
  const g: Slot = goal && go && go.row === o.row && go.col === o.col ? goal : { row: o.row, col: o.col };
  let r: number;
  let c: number;
  switch (intent.kind) {
    case 'move':
      if (intent.axis === 'row') {
        c = g.col;
        r = intent.delta > 0 ? o.row + o.rows : o.row - 1;
        if (r < 0) return { to: { row: -1, col: c }, goal: { row: -1, col: c } };
      } else {
        r = g.row;
        c = intent.delta > 0 ? o.col + o.cols : o.col - 1;
      }
      break;
    case 'edge': {
      const first = intent.to === 'first';
      r = intent.axis === 'col' ? g.row : first ? 0 : s.rows - 1;
      c = intent.axis === 'row' ? g.col : first ? 0 : s.cols - 1;
      break;
    }
    case 'page':
      r = g.row + intent.delta * s.page;
      c = g.col;
      break;
    default:
      return null;
  }
  r = Math.max(0, Math.min(s.rows - 1, r));
  c = Math.max(0, Math.min(s.cols - 1, c));
  const t = ownerOf(map, r, c);
  if (t.row === o.row && t.col === o.col) return { to: { row: o.row, col: o.col }, goal: g };
  return { to: { row: t.row, col: t.col }, goal: { row: r, col: c } };
}

/**
 * The kernel's focus owner for a span map (`setFocusOwner`): a focus left on
 * a covered slot after a sort or an update moves to the cell owning it.
 * `columns`: the visible columns' ids, in the map's order. Rows the map was
 * not built for, or a column it does not know, leave the focus alone.
 */
export function ownerFocus<T>(map: SpanMap, columns: readonly string[]): FocusOwner<T> {
  return (f: CellFocus, rows: DisplayedRows<T>): FocusPos => {
    if (!builtFor(map, rows as DisplayedRows<unknown>)) return f;
    const c = columns.indexOf(f.column);
    const r = rows.indexOf(f.row);
    const o = c < 0 || r < 0 ? null : map.ownerAt(r, c);
    if (!o || (o.row === r && o.col === c)) return f;
    return { kind: 'cell', row: rows.keyAt(rows.index(o.row)!), column: columns[o.col]! };
  };
}
