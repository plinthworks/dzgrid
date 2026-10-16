import { problem, type Problem } from './problems.js';

/**
 * Row identities and display positions, as types that cannot be confused.
 *
 * A grid that remembers *positions* breaks the moment a column is sorted: the
 * row at position 3 is no longer the row the user picked. So nothing that
 * outlives a render holds a position. It holds a `RowKey`, and turns it into a
 * position against one version of the displayed rows, right when it needs to.
 */

declare const rowKeyBrand: unique symbol;
/** A row's identity. Only {@link dataKey}, {@link groupKey}, {@link detailKey} and {@link pinnedKey} make one. */
export type RowKey = string & { readonly [rowKeyBrand]: true };

/** What a host's `getRowId` may return. */
export type RowIdInput = string | number;

declare const displayIndexBrand: unique symbol;
/**
 * A position among the displayed rows of one version. There is deliberately
 * no public way to build one from a number except through the displayed rows
 * themselves, which check the bounds.
 */
export type DisplayIndex = number & { readonly [displayIndexBrand]: true };

/** Prefixes keep the families apart: a host id can never pass for a group or a detail row. */
const lengthPrefixed = (s: string): string => `${s.length}:${s}`;

/**
 * The key of a data row, or null when the id cannot identify anything: an
 * empty string, a number that is not finite, or anything that is neither.
 *
 * `1` and `'1'` give the same key on purpose. Hosts mix them (a JSON id that
 * is a number in one payload and a string in the next), and treating them as
 * two rows would show one record twice.
 */
export function dataKey(id: unknown): RowKey | null {
  if (typeof id === 'number') {
    if (!Number.isFinite(id)) return null;
    // -0 and 0 are one id.
    return `d:${lengthPrefixed(String(id === 0 ? 0 : id))}` as RowKey;
  }
  if (typeof id !== 'string' || id === '') return null;
  return `d:${lengthPrefixed(id)}` as RowKey;
}

/** The key of a group row, from the values that lead to it. */
export function groupKey(path: readonly string[]): RowKey {
  return `g:${path.map(lengthPrefixed).join('')}` as RowKey;
}

/** The key of the detail row under a master row. */
export function detailKey(master: RowKey): RowKey {
  return `x:${master}` as RowKey;
}

/** The key of a row pinned to the top or the bottom. */
export function pinnedKey(side: 'top' | 'bottom', index: number): RowKey {
  return `p:${side === 'top' ? 't' : 'b'}:${index}` as RowKey;
}

/**
 * Keys a batch of ids, refusing what cannot be one.
 *
 * An invalid id rejects its row (`invalid-row-id`). A second row with an id
 * already seen is rejected too (`duplicate-row-id`) — the first one stays, so
 * the outcome does not depend on which copy is "newer".
 */
export function assignKeys(ids: readonly unknown[], path = 'rows'): {
  readonly keys: readonly (RowKey | null)[];
  readonly problems: readonly Problem[];
} {
  const seen = new Set<RowKey>();
  const keys: (RowKey | null)[] = [];
  const problems: Problem[] = [];
  ids.forEach((id, i) => {
    const key = dataKey(id);
    if (key === null) {
      keys.push(null);
      problems.push(problem('invalid-row-id', 'error', `${path}[${i}]`, describe(id)));
    } else if (seen.has(key)) {
      keys.push(null);
      problems.push(problem('duplicate-row-id', 'error', `${path}[${i}]`));
    } else {
      seen.add(key);
      keys.push(key);
    }
  });
  return { keys, problems };
}

/** The shape of a refused id, never its content beyond the type. */
function describe(id: unknown): string {
  if (id === null) return 'null';
  if (typeof id === 'number') return String(id);
  if (typeof id === 'string') return 'empty string';
  return typeof id;
}
