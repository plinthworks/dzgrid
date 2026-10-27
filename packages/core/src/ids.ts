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

declare const sourceIndexBrand: unique symbol;
/**
 * A position among the host's rows as stored — internal plumbing only. Its
 * own brand keeps a `DisplayIndex` from being passed where a source position
 * is expected: that confusion was bug 1 of the grid this one replaces.
 */
export type SourceIndex = number & { readonly [sourceIndexBrand]: true };

/** Prefixes keep the families apart: a host id can never pass for a group or a detail row. */
const lengthPrefixed = (s: string): string => `${s.length}:${s}`;

/**
 * The canonical text of an id, or null when it cannot identify anything: an
 * empty string, a number that is not finite, or anything that is neither.
 *
 * `1` and `'1'` give the same text on purpose. Hosts mix them (a JSON id that
 * is a number in one payload and a string in the next), and treating them as
 * two rows would show one record twice. `-0` is `0`.
 */
export function canonicalId(id: unknown): string | null {
  if (typeof id === 'number') return Number.isFinite(id) ? String(id === 0 ? 0 : id) : null;
  if (typeof id !== 'string' || id === '') return null;
  return id;
}

/** The key of a data row, or null when its id identifies nothing (see {@link canonicalId}). */
export function dataKey(id: unknown): RowKey | null {
  const c = canonicalId(id);
  return c === null ? null : (`d:${lengthPrefixed(c)}` as RowKey);
}

/**
 * The canonical id inside a data key, or null for any other family or a key
 * whose length prefix does not match what follows it.
 */
export function idOfDataKey(key: RowKey): string | null {
  if (!key.startsWith('d:')) return null;
  const colon = key.indexOf(':', 2);
  if (colon < 0) return null;
  const digits = key.slice(2, colon);
  if (!/^(0|[1-9]\d*)$/.test(digits)) return null;
  const id = key.slice(colon + 1);
  return id.length === Number(digits) && id !== '' ? id : null;
}

/** The key of a group row, from the values that lead to it. */
export function groupKey(path: readonly string[]): RowKey {
  return `g:${path.map(lengthPrefixed).join('')}` as RowKey;
}

/** The key of the detail row under a master row. */
export function detailKey(master: RowKey): RowKey {
  return `x:${master}` as RowKey;
}

/**
 * The key of a row pinned to the top or the bottom (Phase 6 step 8b-1, pinned-rows.md 1): its id's, length first, in a
 * family per side, so the same id keeps its key across the application's `set()` and never meets a body row's. Null when
 * the id identifies nothing (see {@link canonicalId}).
 */
export function pinnedKey(side: 'top' | 'bottom', id: unknown): RowKey | null {
  const c = canonicalId(id);
  return c === null ? null : (`p:${side[0]}:${lengthPrefixed(c)}` as RowKey);
}

/**
 * Keys a batch of ids, refusing what cannot be one.
 *
 * An invalid id rejects its row (`invalid-row-id`). A second row with an id
 * already seen is rejected too (`duplicate-row-id`) — the first one stays, so
 * the outcome does not depend on which copy is "newer". `make`: the key of an id (a pinned side's, step 8b-1); a data key by default.
 */
export function assignKeys(ids: readonly unknown[], path = 'rows', make: (id: unknown) => RowKey | null = dataKey): {
  readonly keys: readonly (RowKey | null)[];
  readonly problems: readonly Problem[];
} {
  const seen = new Set<RowKey>();
  const keys: (RowKey | null)[] = [];
  const problems: Problem[] = [];
  // A plain loop: forEach skips the holes of a sparse array, and keys would no
  // longer line up with the rows they belong to.
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    const key = make(id);
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
  }
  return { keys, problems };
}

/** The shape of a refused id, never its content beyond the type. */
function describe(id: unknown): string {
  if (id === null) return 'null';
  if (id === undefined) return 'undefined';
  if (typeof id === 'number') return String(id);
  if (typeof id === 'string') return 'empty string';
  return typeof id;
}

/** Whether a key is a data row's (not a filler's, a detail's or a pinned row's): what selection takes. */
export const isDataKey = (key: RowKey): boolean => key.startsWith('d:');

/** Whether a key is a row whose cells take the focus and edits: a data row's or a pinned row's (step 8b-1; never selected). */
export const isCellKey = (key: RowKey): boolean => key[0] === 'd' || key[0] === 'p';
