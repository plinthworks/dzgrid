import type { RowKey } from '../ids.js';

/** One cell, by its row's key and its column's id: never a position (range-selection.md 1). */
export interface CellAddr {
  readonly row: RowKey;
  readonly column: string;
}

/**
 * A block of cells as the two corners the user reached: `anchor` where it started, `focus` the corner
 * that moves (and holds the keyboard focus, owner QB2). Turned into positions for one version of the
 * rows shown only (`rangeBox` in `@dzgrid/core/range`); a corner no longer shown drops the block.
 */
export interface CellRange {
  readonly anchor: CellAddr;
  readonly focus: CellAddr;
}
