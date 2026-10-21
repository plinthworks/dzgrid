// S12 — a sparse row layout: every row `h` tall except a few (open details), found by binary
// search over those few, with prefix sums of their extra heights. No per-row memory.
// Throwaway prototype of D7's `sparseRowLayout` (phase-4-plan §2); the real one is step 8's.
import type { RowLayout } from '/packages/core/src/index.ts';

export interface SparseLayout extends RowLayout {
  /** How many rows have their own height. */
  readonly extras: number;
}

/**
 * `at`: display indices of the rows with their own height, strictly increasing; `heights`: theirs.
 * offsetOf O(log D), indexAt O(log D), setHeight O(D) (prefix sums from the changed row on).
 */
export function sparseRowLayout(count: number, h: number, at: ArrayLike<number>, heights: ArrayLike<number>): SparseLayout {
  const D = at.length;
  const idx = Float64Array.from(at);
  const hts = Float64Array.from(heights);
  const pre = new Float64Array(D + 1); // pre[j] = Σ_{k<j} (hts[k] − h)
  for (let j = 0; j < D; j++) {
    if (j > 0 && !(idx[j]! > idx[j - 1]!)) throw new RangeError('indices must increase');
    pre[j + 1] = pre[j]! + hts[j]! - h;
  }
  /** How many special rows sit before display index i. */
  const below = (i: number): number => {
    let lo = 0, hi = D;
    while (lo < hi) { const m = (lo + hi) >>> 1; if (idx[m]! < i) lo = m + 1; else hi = m; }
    return lo;
  };
  const startOf = (j: number): number => idx[j]! * h + pre[j]!;
  const layout: SparseLayout = {
    count,
    extras: D,
    get total() { return count * h + pre[D]!; },
    uniform: false,
    offsetOf: (i) => i * h + pre[below(i)]!,
    heightOf: (i) => { const j = below(i); return j < D && idx[j] === i ? hts[j]! : h; },
    indexAt: (offset) => {
      if (count === 0) return 0 as never;
      const total = count * h + pre[D]!;
      const off = offset < 0 || offset !== offset ? 0 : offset >= total ? total - 1e-9 : offset;
      // Last special row starting at or before `off`.
      let lo = 0, hi = D;
      while (lo < hi) { const m = (lo + hi) >>> 1; if (startOf(m) <= off) lo = m + 1; else hi = m; }
      const j = lo - 1;
      let i: number;
      if (j < 0) i = Math.floor(off / h);
      else {
        const s = startOf(j);
        if (off < s + hts[j]!) i = idx[j]!;
        else i = idx[j]! + 1 + Math.floor((off - s - hts[j]!) / h);
      }
      return Math.max(0, Math.min(count - 1, i)) as never;
    },
    setHeight: (i, height) => {
      const j = below(i);
      if (j >= D || idx[j] !== i || hts[j] === height) return false;
      hts[j] = height;
      for (let k = j; k < D; k++) pre[k + 1] = pre[k]! + hts[k]! - h;
      return true;
    },
  };
  return layout;
}
