import { problem, type Problem } from '../problems.js';
import type { ColumnType } from '../value/codec.js';

/** Where a part shows (Phase 3, the plug-in design B2). */
export type PartSlot = 'cell' | 'header' | 'filter' | 'floating' | 'overlay' | 'tooltip' | 'footer';

/** What naming needs of a column: plain data, so definitions can be saved and shared. */
export interface PartColumn {
  readonly id: string;
  readonly type: ColumnType;
  readonly ui?: { readonly cell?: string; readonly header?: string; readonly tooltip?: string };
  readonly filter?: false | { readonly kind?: string; readonly floating?: boolean; readonly debounceMs?: number; readonly ops?: readonly string[] };
}

/** A filter kind follows the type, an enum's being a value list (`set`). */
export const filterKindOf = (c: PartColumn): string => (c.filter && c.filter.kind) || (c.type === 'enum' ? 'set' : c.type);

/**
 * The part a column gets for a slot: its own name when it gives one, then the
 * part registered for its type (`cell.number`, `filter.set`…), then none —
 * the built-in. A name nobody registered is said (`unknown-part`) and the
 * next choice is taken.
 */
export function partNameFor(slot: PartSlot, column: PartColumn, available: ReadonlySet<string>): { readonly name: string | null; readonly problems: readonly Problem[] } {
  const problems: Problem[] = [];
  const own = slot === 'cell' || slot === 'header' || slot === 'tooltip' ? column.ui?.[slot] : slot === 'filter' || slot === 'floating' ? (column.filter ? column.filter.kind : undefined) : undefined;
  const typed = `${slot}.${slot === 'filter' || slot === 'floating' ? filterKindOf(column) : column.type}`;
  if (own !== undefined && slot !== 'filter' && slot !== 'floating') {
    if (available.has(own)) return { name: own, problems };
    problems.push(problem('unknown-part', 'error', `columns.${column.id}.ui.${slot}`, own));
  }
  return { name: available.has(typed) ? typed : null, problems };
}
