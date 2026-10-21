import type { DisplayIndex } from '../ids.js';
import type { RowLayout } from '../layout/rows.js';
import type { DisplayedRows } from '../row/displayed.js';

/** The rows of their own height: display indices, strictly increasing, and their heights. */
export interface SparseExtras {
  readonly at: ArrayLike<number>;
  readonly heights: ArrayLike<number>;
}

export interface SparseLayout extends RowLayout {
  /**
   * Several heights at once (a frame's measures), the sums made once from the lowest row set. A row
   * that is not an extra keeps its height. True if a height was set to another value.
   */
  setHeights(changes: Iterable<readonly [DisplayIndex, number]>): boolean;
}

/** The first m in [0, n) for which `before(m)` is false (`before` true then false). */
export const lower = (n: number, before: (m: number) => boolean): number => {
  let lo = 0;
  while (lo < n) {
    const m = (lo + n) >>> 1;
    if (before(m)) lo = m + 1;
    else n = m;
  }
  return lo;
};

const size = (v: number): number => {
  if (!(v >= 0 && v < Infinity)) throw RangeError(`size ${v}`);
  return v;
};

/**
 * Every row `h` tall but a few (open details, D7, spike S12): those found by binary search, with
 * running sums of their extra heights. Memory O(D), nothing per row; offsetOf, heightOf and
 * indexAt O(log D); setHeight and a batch O(D). `at` is kept, not copied, and trusted (the detail shape makes it: rows of
 * the list, increasing); a height that is not a finite number ≥ 0 is a programming error: RangeError.
 */
export function sparseRowLayout(rows: Pick<DisplayedRows<unknown>, 'count' | 'index'>, h: number, x: SparseExtras): SparseLayout {
  const { count } = rows;
  const { at } = x;
  const D = at.length;
  const hs = Float64Array.from(x.heights);
  // pre[j]: the heights of the extras before the j-th, less h each.
  const pre = new Float64Array(D + 1);
  /** The sums from the j-th extra on, each height checked. */
  const sum = (j: number): void => {
    for (; j < D; j++) {
      pre[j + 1] = pre[j]! + size(hs[j]!) - h;
    }
  };
  sum(0);
  /** How many extras sit before row i. */
  const below = (i: number): number => lower(D, (m) => at[m]! < i);
  const startOf = (j: number): number => at[j]! * h + pre[j]!;
  /** The extra at row i, or -1. */
  const extra = (i: number): number => {
    const j = below(i);
    return at[j] === i ? j : -1;
  };
  const setHeights = (changes: Iterable<readonly [DisplayIndex, number]>): boolean => {
    let low = D;
    for (const [i, v] of changes) {
      const j = extra(i);
      if (hs[j] !== size(v) && j >= 0) (hs[j] = v), (low = Math.min(low, j));
    }
    sum(low);
    return low < D;
  };
  const layout: SparseLayout = {
    count,
    get total() { return count * h + pre[D]!; },
    uniform: false,
    offsetOf: (i) => i * h + pre[below(i)]!,
    heightOf: (i) => {
      const j = extra(i);
      return j < 0 ? h : hs[j]!;
    },
    indexAt(off) {
      let i = 0;
      if (off >= layout.total) i = count - 1;
      else if (off >= 0) {
        // The last extra starting at or before the offset: the offset is in it, or in the plain rows after it.
        const j = lower(D, (m) => startOf(m) <= off) - 1;
        const end = j < 0 ? 0 : startOf(j) + hs[j]!;
        i = off < end ? at[j]! : (j < 0 ? 0 : at[j]! + 1) + Math.floor((off - end) / h);
      }
      return Math.min(count - 1, i) as DisplayIndex;
    },
    setHeight: (i, v) => setHeights([[i, v]]),
    setHeights,
  };
  return layout;
}
