import type { DisplayIndex, RowKey } from '../ids.js';
import { problem, type Problem } from '../problems.js';
import type { DisplayedRows } from '../row/displayed.js';
import type { DataNode } from '../row/node.js';

/** What a gap rule is told about a shown row (row-gaps.md « API »). */
export interface GapCtx<T> {
  /** The row's data; null for a path tree's filler or a loading row. */
  readonly row: Readonly<T> | null;
  readonly key: RowKey;
  /** Its place among the rows shown (never 0: the first row has no gap). */
  readonly index: number;
  /** Its depth: 0 for a root, and on a flat grid. */
  readonly level: number;
  /** The data of the row shown above it; null when that one is not data. */
  readonly prev: Readonly<T> | null;
}

/** `true`: a gap of the feature's size; a number: that many pixels; `false`, `0`, `null`, `undefined`: none. */
export type GapRule<T> = (c: GapCtx<T>) => boolean | number | null | undefined;

/** A gap before each top-level row but the first (three tables in one tree). */
export const roots = (c: GapCtx<unknown>): boolean => c.level === 0;

/**
 * Where the gaps stand on these rows (row-gaps.md): the rule asked for each shown row but the first; `at` ascending,
 * `sizes` in pixels at the default text size (`true` is `size`). A rule that throws, or answers anything but a
 * boolean, a nullish value or a non-negative finite number: no gap there, one `invalid-gap` per kind (`threw`, `not a
 * size`), never the row's data. Pure.
 */
export function gapsOf<T>(rows: DisplayedRows<T>, rule: GapRule<T>, size: number): { at: number[]; sizes: number[]; problems: Problem[] } {
  const at: number[] = [];
  const sizes: number[] = [];
  const told = new Set<string>();
  const dataOf = (i: number): T | null => {
    const n = rows.nodeAt(i as DisplayIndex);
    return n.kind === 'data' ? (n as DataNode<T>).data : null;
  };
  for (let i = 1; i < rows.count; i++) {
    const n = rows.nodeAt(i as DisplayIndex);
    let v: unknown;
    try {
      v = rule({ row: dataOf(i), key: n.key, index: i, level: n.level, prev: dataOf(i - 1) });
    } catch {
      told.add('threw');
      continue;
    }
    if (v === true) v = size;
    if (v === false || v == null || v === 0) continue;
    if (typeof v === 'number' && v > 0 && v < Infinity) at.push(i), sizes.push(v);
    else told.add('not a size');
  }
  return { at, sizes, problems: [...told].map((d) => problem('invalid-gap', 'warning', 'rowGaps.before', d)) };
}
