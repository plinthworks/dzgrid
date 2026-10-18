import { problem, type Problem } from '../problems.js';
import type { ColumnType } from '../value/codec.js';
import type { LocaleCtx } from '../value/locale.js';
import type { Json } from './model.js';

/**
 * A filter kind from a module (docs/behaviors/filter-custom.md): what a
 * `{type: 'custom', kind, state}` filter means. `S`, the state, is JSON
 * (write it as a `type` alias, not an interface); `V` is what the column's
 * codec reads a cell as, null for a blank or unreadable one.
 */
export interface FilterKind<S extends Json = Json, V = unknown> {
  /** Not empty, no dot, not a built-in name. Its UI parts: `filter.<name>`, `floating.<name>`. */
  readonly name: string;
  /** The column types it applies to; all when absent. */
  readonly types?: readonly ColumnType[];
  /** Checks a state from the host, a saved view or a URL; `'invalid'` refuses it. */
  read(state: unknown): S | 'invalid';
  /** False for a half-typed state: no filter, no problem. */
  active(s: S): boolean;
  /** The browser's rule: per row, the cell's value and the host's row. A kind without one runs on a server only. */
  test?(s: S, ctx: LocaleCtx): (value: V | null, row: Readonly<unknown>) => boolean;
  /** What the server receives; the state itself when absent. */
  wire?(s: S, ctx: LocaleCtx, zone: string): Json;
}

export type AnyFilterKind = FilterKind<any, any>;

const RESERVED: ReadonlySet<string> = new Set(['text', 'number', 'day', 'instant', 'boolean', 'set', 'custom', 'combined']);

/**
 * The grid's kinds by name, read once. A bad name or a second kind of a name
 * is refused (`invalid-filter` at `filterKinds[i]`, detail `name` or
 * `duplicate`); the first of a name wins.
 */
export function filterKindLookup(kinds?: readonly AnyFilterKind[]): { get(name: string): AnyFilterKind | undefined; readonly problems: readonly Problem[] } {
  const byName = new Map<string, AnyFilterKind>();
  const problems: Problem[] = [];
  (kinds ?? []).forEach((k, i) => {
    const name = k?.name;
    const why = typeof name !== 'string' || !name || name.includes('.') || RESERVED.has(name) ? 'name' : byName.has(name) ? 'duplicate' : null;
    if (why) problems.push(problem('invalid-filter', 'error', `filterKinds[${i}]`, why));
    else byName.set(name, k);
  });
  return { get: (name) => byName.get(name), problems };
}
