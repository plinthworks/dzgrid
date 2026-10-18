import type { ResolvedColumn } from '../columns/defs.js';
import { isBlank } from '../value/codec.js';
import type { LocaleCtx } from '../value/locale.js';

/**
 * The run index of a merging column: for each row, the last row of the run
 * of equal neighbours it belongs to. `joins(i)` says whether rows i and i + 1
 * are one run, asked once per pair, top to bottom. O(n).
 */
export function runEnds(n: number, joins: (i: number) => boolean): Uint32Array {
  const ends = new Uint32Array(n);
  let from = 0;
  for (let i = 0; i < n; i++) {
    if (i < n - 1 && joins(i)) continue;
    ends.fill(i, from, i + 1);
    from = i + 1;
  }
  return ends;
}

/**
 * A cell's stable export text (what the value lists match on), or null for a
 * blank or unreadable value: what `merge: true` compares when the host gives
 * no reader of its own. A reader or codec that throws costs its cell only.
 */
export const exportText = <T>(ctx: LocaleCtx) => (col: ResolvedColumn<T>, row: Readonly<T>): string | null => {
  try {
    const raw = col.read(row);
    if (isBlank(raw)) return null;
    const v = col.codec.coerce(raw, ctx);
    return v === null ? null : col.codec.toExport(v);
  } catch {
    return null;
  }
};
