import type { ResolvedColumn } from './defs.js';
import type { RowNode } from '../row/node.js';

/**
 * Whether a cell can be edited (editing.md 1–2): a data row (never a detail, a filler or a loading
 * row), a column whose `editable` is `true` or whose rule returns exactly `true`, and not a column
 * locked as a tree's structure. A rule that throws says no; `threw` hears it.
 */
export function editableAt<T>(
  node: RowNode<T> | undefined, col: ResolvedColumn<T> | undefined, context: unknown,
  locked?: ReadonlySet<string>, threw?: (column: string) => void,
): boolean {
  if (node?.kind !== 'data' || !col || locked?.has(col.id)) return false;
  const rule = col.def.editable;
  try {
    return rule === true || (typeof rule === 'function' && rule(node.data, context) === true);
  } catch {
    threw?.(col.id);
    return false;
  }
}
