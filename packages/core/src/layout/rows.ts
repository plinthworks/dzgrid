import type { DisplayIndex } from '../ids.js';
import type { DisplayedRows } from '../row/displayed.js';
import { PrefixSums } from './prefix-sums.js';

/** What a layout needs from the displayed rows: their count, and the one place positions are made. */
type IndexMint = Pick<DisplayedRows<unknown>, 'count' | 'index'>;

/** Where each displayed row sits, top to bottom. */
export interface RowLayout {
  readonly count: number;
  readonly total: number;
  readonly uniform: boolean;
  offsetOf(i: DisplayIndex): number;
  heightOf(i: DisplayIndex): number;
  /** The row at an offset, clamped to the rows there are; only when count > 0. */
  indexAt(offset: number): DisplayIndex;
  /** True if it changed; always false for uniform rows. */
  setHeight(i: DisplayIndex, h: number): boolean;
}

/** Every row the same height: no memory per row, O(1) everything. */
export function uniformRowLayout(rows: IndexMint, height: number): RowLayout {
  const h = Number.isFinite(height) && height > 0 ? height : 0;
  const count = rows.count;
  return {
    count,
    total: count * h,
    uniform: true,
    offsetOf: (i) => i * h,
    heightOf: () => h,
    indexAt: (offset) => rows.index(h === 0 ? 0 : Math.min(count - 1, Math.max(0, Math.floor(offset / h))))!,
    setHeight: () => false,
  };
}

/** Rows of their own heights (auto height): running totals in a Fenwick tree. */
export function variableRowLayout(rows: IndexMint, estimate: number, heights?: ArrayLike<number>): RowLayout {
  const count = rows.count;
  if (heights && heights.length !== count) throw new RangeError(`${heights.length} heights for ${count} rows`);
  const sizes = heights ?? new Float64Array(count).fill(Number.isFinite(estimate) && estimate > 0 ? estimate : 0);
  const ps = new PrefixSums(sizes);
  return {
    count,
    get total() { return ps.total; },
    uniform: false,
    offsetOf: (i) => ps.offsetOf(i),
    heightOf: (i) => ps.sizeAt(i),
    indexAt: (offset) => rows.index(Math.max(0, ps.indexAt(offset)))!,
    setHeight: (i, h) => ps.set(i, h),
  };
}
