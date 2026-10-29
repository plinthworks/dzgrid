import type { DisplayIndex } from '../ids.js';
import type { RowLayout } from '../layout/rows.js';

/**
 * The rows of `inner` with a gap above some of them (docs/behaviors/row-gaps.md « Layout »): `at`, the rows a gap
 * stands before, ascending; `sizes`, each gap's pixels. A gap belongs to the slot of the row under it: the row's box
 * starts after its gap (`offsetOf`), its height is its own (`heightOf`), the total counts every gap, a point inside a
 * gap is the row under it (`indexAt`). `inner` is read at every call (heights set on it later are followed);
 * `setHeight` goes to it. O(gaps) memory, O(log gaps) per call. No gap: `inner` itself.
 */
export function gapLayout(inner: RowLayout, at: readonly number[], sizes: readonly number[]): RowLayout {
  const g = at.length;
  if (!g) return inner;
  // sum[k]: the gaps before the k-th, so sum[k + 1] counts it.
  const sum = [0];
  for (let k = 0; k < g; k++) sum.push(sum[k]! + sizes[k]!);
  /** How many gaps stand at rows up to `i` (the last k with at[k] <= i, plus one). */
  const upTo = (i: number): number => {
    let lo = 0;
    let hi = g;
    while (lo < hi) {
      const m = (lo + hi) >> 1;
      if (at[m]! <= i) lo = m + 1;
      else hi = m;
    }
    return lo;
  };
  return {
    count: inner.count,
    get total() {
      return inner.total + sum[g]!;
    },
    uniform: false,
    offsetOf: (i) => inner.offsetOf(i) + sum[upTo(i)]!,
    heightOf: (i) => inner.heightOf(i),
    indexAt(y) {
      // The last gap whose slot (the gap, then its row) starts at or above y.
      let lo = 0;
      let hi = g;
      while (lo < hi) {
        const m = (lo + hi) >> 1;
        if (inner.offsetOf(at[m] as DisplayIndex) + sum[m]! <= y) lo = m + 1;
        else hi = m;
      }
      // Inside that gap: its row; else the inner layout, the gaps above taken off.
      const y0 = y - sum[lo]!;
      return lo && y0 < inner.offsetOf(at[lo - 1] as DisplayIndex) ? (at[lo - 1] as DisplayIndex) : inner.indexAt(y0);
    },
    setHeight: (i, h) => inner.setHeight(i, h),
  };
}
