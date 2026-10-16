import type { RowKey } from '../ids.js';
import type { DisplayedRows } from '../row/displayed.js';

/**
 * Which rows are selected, by identity — never by position, so a selection
 * survives sorting, filtering and a refresh. *Select all* is stored as
 * "everything except", so it costs nothing at ten million rows. Every
 * operation returns a new state.
 */
export type SelectionState =
  | { readonly mode: 'include'; readonly keys: ReadonlySet<RowKey> }
  | { readonly mode: 'exclude'; readonly keys: ReadonlySet<RowKey> };

export const NO_SELECTION: SelectionState = { mode: 'include', keys: new Set() };

export function isSelected(s: SelectionState, k: RowKey): boolean {
  return s.mode === 'include' ? s.keys.has(k) : !s.keys.has(k);
}

/** How many rows are selected; null when everything-except is selected and the total is unknown. */
export function selectionCount(s: SelectionState, total: number | null): number | null {
  if (s.mode === 'include') return s.keys.size;
  return total === null ? null : Math.max(0, total - s.keys.size);
}

export const selectOnly = (keys: Iterable<RowKey>): SelectionState => ({ mode: 'include', keys: new Set(keys) });
export const selectAll = (): SelectionState => ({ mode: 'exclude', keys: new Set() });
export const clearSelection = (): SelectionState => NO_SELECTION;

export function toggle(s: SelectionState, k: RowKey): SelectionState {
  const keys = new Set(s.keys);
  if (keys.has(k)) keys.delete(k);
  else keys.add(k);
  return { mode: s.mode, keys };
}

export type RangeResult =
  | { readonly ok: true; readonly state: SelectionState }
  | { readonly ok: false; readonly reason: 'anchor-not-displayed' | 'target-not-displayed' };

/**
 * Selects the rows between `anchor` and `target` in the order on screen. A
 * bound no longer displayed cancels the range: the state is unchanged and the
 * reason given, never another run of rows that happens to sit there now.
 */
export function selectRange<T>(s: SelectionState, displayed: DisplayedRows<T>, anchor: RowKey, target: RowKey, o: { readonly additive?: boolean } = {}): RangeResult {
  const a = displayed.indexOf(anchor);
  if (a === -1) return { ok: false, reason: 'anchor-not-displayed' };
  const b = displayed.indexOf(target);
  if (b === -1) return { ok: false, reason: 'target-not-displayed' };
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  const span: RowKey[] = [];
  for (let i = lo; i <= hi; i++) span.push(displayed.keyAt(displayed.index(i)!));
  if (!o.additive) return { ok: true, state: selectOnly(span) };
  // Adding a range: selected rows join an include set, or leave an exclude set.
  const keys = new Set(s.keys);
  for (const k of span) {
    if (s.mode === 'include') keys.add(k);
    else keys.delete(k);
  }
  return { ok: true, state: { mode: s.mode, keys } };
}

/** Drops the keys of rows that no longer exist. */
export function reconcileSelection(s: SelectionState, has: (k: RowKey) => boolean): SelectionState {
  let changed = false;
  const keys = new Set<RowKey>();
  for (const k of s.keys) {
    if (has(k)) keys.add(k);
    else changed = true;
  }
  return changed ? { mode: s.mode, keys } : s;
}
