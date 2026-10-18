import type { DisplayedRows, FocusPos, Intent, RowKey } from '@dzgrid/core';

/**
 * Where a key moves the focus, as a pure function of the grid's shape: no
 * DOM, no kernel. The router asks it, then focuses the answer.
 */

/** A spanned cell: its origin (top-start slot) and how many rows and columns it covers. */
export interface SpanCell {
  readonly row: number;
  readonly col: number;
  readonly rows: number;
  readonly cols: number;
}

/** What moving needs from a span map (`@dzgrid/core/spans`): the cell owning a slot, null for a plain one. */
export interface SpanLookup {
  ownerAt(row: number, col: number): SpanCell | null;
}

export interface MoveShape {
  readonly rows: Pick<DisplayedRows<unknown>, 'count' | 'index' | 'keyAt' | 'indexOf'>;
  /** The visible columns' ids, in order (start, centre, end). */
  readonly cols: readonly string[];
  /** Rows a page key moves by. */
  readonly page: number;
  /** Group header rows above the column headers (levels -bands to -1). */
  readonly bands: number;
  /** Header rows the features add under the column headers (levels 1 to extras). */
  readonly extras: number;
  /** A select-all box stands before the first column header. */
  readonly checkBox: boolean;
}

/**
 * Where the user aims: the row (null in the header) and the column they came
 * from, kept across a spanned cell so that moving on comes back to them.
 */
export interface Goal {
  readonly rowKey: RowKey | null;
  readonly colIndex: number;
}

export interface Move {
  /** `checkBox`: the select-all box, which is not a focus position. */
  readonly to: FocusPos | 'checkBox';
  readonly goal: Goal | null;
}

const header = (column: string, level?: number): FocusPos => (level ? { kind: 'header', column, level } : { kind: 'header', column });

/**
 * The move for a `move`, `edge` or `page` intent from `from`; null for any
 * other intent, or when the key leads nowhere (Up from the top header row).
 * `goal` is used only while it still names a slot `from` owns.
 */
export function moveFocus(map: SpanLookup | null, s: MoveShape, from: FocusPos, goal: Goal | null, intent: Intent): Move | null {
  const { rows: d, cols } = s;
  if (!cols.length) return null;
  const ci = Math.max(0, cols.indexOf(from.column));
  const ri = from.kind === 'cell' ? d.indexOf(from.row) : -1;
  // The goal, while the cell focused still owns its slot (a header's is the header itself).
  let gr = ri;
  let gc = ci;
  if (goal?.rowKey != null && ri !== -1) {
    const r = d.indexOf(goal.rowKey);
    const o = r === -1 ? null : map?.ownerAt(r, goal.colIndex) ?? { row: r, col: goal.colIndex };
    if (o?.row === ri && o.col === ci) {
      gr = r;
      gc = goal.colIndex;
    }
  }
  const lastRow = d.count - 1;
  const colAt = (i: number) => cols[Math.max(0, Math.min(cols.length - 1, i))]!;
  const level = from.kind === 'header' ? from.level ?? 0 : 0;
  // No rows: a move into the body stays in the header row it comes from.
  const cell = (r: number, c: number): FocusPos => (lastRow < 0 ? header(colAt(c), from.kind === 'header' ? from.level : undefined) : { kind: 'cell', row: d.keyAt(d.index(Math.max(0, Math.min(lastRow, r)))!), column: colAt(c) });
  let to: FocusPos | 'checkBox';
  switch (intent.kind) {
    case 'move':
      if (intent.axis === 'row' && from.kind === 'header') {
        // Up through the group rows, down through the header rows the features add, then the body.
        if (intent.delta < 0) {
          if (level <= -s.bands) return null;
          to = header(from.column, level - 1);
        } else to = level < s.extras ? header(from.column, level + 1) : cell(0, gc);
      } else if (intent.axis === 'row') {
        // Up from the first row: the last header row.
        if (ri === 0 && intent.delta < 0 && s.extras) to = { kind: 'header', column: from.column, level: s.extras };
        else to = ri + intent.delta < 0 ? { kind: 'header', column: colAt(gc) } : cell(ri + intent.delta, gc);
      } else if (from.kind === 'header') {
        // Back from the first column header: the select-all box, when there is one.
        to = !level && ci === 0 && intent.delta < 0 && s.checkBox ? 'checkBox' : header(colAt(ci + intent.delta), from.level);
      } else to = cell(gr, ci + intent.delta);
      break;
    case 'edge': {
      const c = intent.axis === 'row' ? gc : intent.to === 'first' ? 0 : cols.length - 1;
      if (intent.axis === 'col' && from.kind === 'header') to = header(colAt(c), from.level);
      else to = cell(intent.axis === 'col' ? gr : intent.to === 'first' ? 0 : lastRow, c);
      break;
    }
    case 'page':
      to = from.kind === 'header' ? cell(s.page - 1, gc) : cell(ri + intent.delta * s.page, gc);
      break;
    default:
      return null;
  }
  return { to, goal: to === 'checkBox' ? null : { rowKey: to.kind === 'cell' ? to.row : null, colIndex: cols.indexOf(to.column) } };
}
