import type { DisplayedRows, RowKey } from '@dzgrid/core';
import type { SparseExtras } from '@dzgrid/core/detail';

/** Rows of their own heights, by display index (ascending), as `sparseRowLayout` takes them. */
export interface Extras {
  readonly at: number[];
  readonly heights: number[];
}

/**
 * The rows of their own height (docs/behaviors/auto-height.md 3, 8; step09-plan §1, §3): the measured rows taller than
 * the row height `h` (a row measured at `h` or less needs none: memory O(tall rows); not a finite number: never), found
 * by key in the rows shown now (a sort or a filter moves them, a row not shown has none), merged with `inner`'s (a
 * detail panel's, every one kept whatever its height: the panel's own). Ascending; one index once (the panel's).
 */
export function extrasOf(d: Pick<DisplayedRows<unknown>, 'indexOf'>, measured: Iterable<readonly [RowKey, number]>, h: number, inner?: SparseExtras): Extras {
  const own: [number, number][] = [];
  for (const [key, v] of measured) {
    const i = d.indexOf(key);
    if (i >= 0 && v > h && v < 1 / 0) own.push([i, v]);
  }
  own.sort((a, b) => a[0] - b[0]);
  const at: number[] = [];
  const heights: number[] = [];
  const n = inner?.at.length ?? 0;
  for (let a = 0, b = 0; a < own.length || b < n; ) {
    const i = b < n ? inner!.at[b]! : 1 / 0;
    const [j, v] = own[a] ?? [1 / 0, 0];
    // The smaller index first; the same index (never: a panel is its own row) is the panel's.
    if (i <= j) at.push(i), heights.push(inner!.heights[b++]!), (a += +(i === j));
    else at.push(j), heights.push(v), a++;
  }
  return { at, heights };
}
