import type { ColumnType } from '../value/codec.js';
import type { Day } from '../value/day.js';
import type { LocaleCtx } from '../value/locale.js';
import { problem, type Problem } from '../problems.js';

/** Data that survives JSON: what a filter's state and a request may carry. */
export type Json = null | boolean | number | string | readonly Json[] | { readonly [k: string]: Json };

/**
 * A filter is plain JSON, the same on the client and on the server: what the
 * user chose, in machine values. A moment always carries its offset; a day
 * never has a zone.
 */
export type FilterModel = Readonly<Record<string, ColumnFilter>>;

export type TextOp = 'contains' | 'notContains' | 'equals' | 'notEqual' | 'startsWith' | 'endsWith' | 'blank' | 'notBlank';
export type NumOp = 'equals' | 'notEqual' | 'lt' | 'lte' | 'gt' | 'gte' | 'between' | 'blank' | 'notBlank';
export type InstantOp = 'onDay' | 'betweenDays' | 'before' | 'after' | 'between' | 'blank' | 'notBlank';
/** A date shortcut, tzslot's names (docs/behaviors/filter-relative.md): whole days counted from today in the grid's zone, both ends in. */
export type RelativeRange = 'today' | 'yesterday' | 'last7Days' | 'last30Days' | 'thisMonth' | 'lastMonth';

export type ColumnFilter =
  | { readonly type: 'text'; readonly op: TextOp; readonly value?: string; readonly caseSensitive?: boolean }
  | { readonly type: 'number'; readonly op: NumOp; readonly value?: number; readonly valueTo?: number }
  /** `relative`: the days of `range`, resolved against the clock (ColumnEnv.now). */
  | { readonly type: 'day'; readonly op: NumOp | 'relative'; readonly value?: Day | string; readonly valueTo?: Day | string; readonly range?: RelativeRange }
  | {
      readonly type: 'instant';
      readonly op: InstantOp | 'relative';
      readonly day?: Day | string;
      readonly dayTo?: Day | string;
      readonly at?: string;
      readonly atTo?: string;
      readonly range?: RelativeRange;
    }
  | { readonly type: 'boolean'; readonly value: boolean | null }
  | { readonly type: 'set'; readonly include?: readonly string[]; readonly exclude?: readonly string[]; readonly blanks?: 'include' | 'exclude' }
  | { readonly type: 'combined'; readonly join: 'and' | 'or'; readonly conditions: readonly ColumnFilter[] }
  /** A filter kind from a module (`FilterKind`, docs/behaviors/filter-custom.md): its state, read by the kind. */
  | { readonly type: 'custom'; readonly kind: string; readonly state: Json }
  /** The advanced filter (docs/behaviors/advanced-filter.md): one expression across columns, under the key `''` only. */
  | { readonly type: 'advanced'; readonly expression: FilterExpression };

/** A condition of the advanced filter: a column and its filter, written as a column filter is. */
export interface FilterCondition { readonly column: string; readonly filter: ColumnFilter }
/** A group of the advanced filter: its items joined by `and` (every one) or `or` (one at least); 5 levels at most. */
export interface FilterGroup { readonly join: 'and' | 'or'; readonly items: readonly FilterExpression[] }
export type FilterExpression = FilterGroup | FilterCondition;

/**
 * Walks an advanced filter's expression (advanced-filter.md 4, 5), alike for the browser (filter/compile.ts) and the
 * wire (server/wire.ts): a group joins its live items (`group`), a condition's column is checked (unknown, not
 * filtering) and its filter read by `leaf`. Null: refused (a bad item drops the whole expression, its problems told
 * with their paths); 0: nothing live (a half-typed condition, an empty group). Groups nest 5 deep at most.
 */
export function walkExpression<C extends { readonly filterable: boolean }, R>(
  e: FilterExpression,
  path: string,
  problems: Problem[],
  column: (id: string) => C | undefined,
  leaf: (col: C, f: ColumnFilter, path: string, e: FilterCondition) => R | 0 | null,
  group: (join: 'and' | 'or', items: R[]) => R,
  depth = 1,
): R | 0 | null {
  const bad = (): null => {
    problems.push(problem('invalid-filter', 'error', path));
    return null;
  };
  if (!e || typeof e !== 'object') return bad();
  if ('items' in e) {
    if (depth > 5 || (e.join !== 'and' && e.join !== 'or') || !Array.isArray(e.items)) return bad();
    const parts = e.items.map((x, i) => walkExpression(x, `${path}.items[${i}]`, problems, column, leaf, group, depth + 1));
    if (parts.includes(null)) return null;
    const live = parts.filter((p): p is R => p !== 0);
    return live.length ? group(e.join, live) : 0;
  }
  const col = typeof e.column == 'string' ? column(e.column) : undefined;
  if (!col) return problems.push(problem('unknown-column', 'error', `${path}.column`)), null;
  return col.filterable ? leaf(col, e.filter, `${path}.filter`, e) : bad();
}

/** The advanced filter's expression in a filter model, null when there is none. */
export const advancedOf = (filter: FilterModel | null | undefined): FilterExpression | null => {
  const f = filter?.[''];
  return f?.type === 'advanced' ? f.expression : null;
};
/** Writes the expression in force on a grid (null removes it), the column filters kept: what `filter.set` answers. */
export const setAdvanced = (
  k: { readonly query: { readonly filter: FilterModel }; dispatch(cmd: { readonly type: 'filter.set'; readonly filter: FilterModel }, source: 'api' | 'host' | 'user'): { readonly ok: boolean } },
  expression: FilterExpression | null,
  source: 'api' | 'host' | 'user' = 'api',
): boolean => k.dispatch({ type: 'filter.set', filter: withAdvanced(k.query.filter, expression) }, source).ok;
/** A copy of a filter model with this expression (null: none); the column filters kept. */
export const withAdvanced = (filter: FilterModel | null | undefined, expression: FilterExpression | null): FilterModel => {
  const { '': _, ...rest } = filter ?? {};
  return expression ? { ...rest, '': { type: 'advanced', expression } } : rest;
};

export type InstantFilter = Extract<ColumnFilter, { type: 'instant' }>;

/**
 * What is wrong with a set filter, read alike by the browser (filter/compile.ts) and the wire form (server/wire.ts):
 * the end of its path and the detail, nothing when sound. The shape first; then, on a column whose `filter` says
 * `exclude: false` (`d`), an `exclude` or a `blanks` (docs/behaviors/filter-set.md « Include only »).
 */
export const setFault = (f: Extract<ColumnFilter, { type: 'set' }>, d: false | { readonly exclude?: false } | undefined): readonly [string, string?] | undefined => {
  const list = f.include ?? f.exclude;
  return (f.include && f.exclude) || (list !== undefined && (!Array.isArray(list) || list.some((x) => typeof x !== 'string'))) ? ['']
    : f.blanks !== undefined && f.blanks !== 'include' && f.blanks !== 'exclude' ? ['.blanks']
    : (d as { exclude?: false } | undefined)?.exclude === false && (f.exclude || f.blanks) ? [f.exclude ? '.exclude' : '.blanks', 'exclude: false']
    : undefined;
};

export const TEXT_OPS: ReadonlySet<string> = new Set(['contains', 'notContains', 'equals', 'notEqual', 'startsWith', 'endsWith', 'blank', 'notBlank']);
export const NUM_OPS: ReadonlySet<string> = new Set(['equals', 'notEqual', 'lt', 'lte', 'gt', 'gte', 'between', 'blank', 'notBlank']);
export const DAY_OPS: ReadonlySet<string> = new Set([...NUM_OPS, 'relative']);
export const INSTANT_OPS: ReadonlySet<string> = new Set(['onDay', 'betweenDays', 'before', 'after', 'between', 'blank', 'notBlank', 'relative']);
export const RELATIVE_RANGES: ReadonlySet<RelativeRange> = new Set(['today', 'yesterday', 'last7Days', 'last30Days', 'thisMonth', 'lastMonth']);

/**
 * What the wire form needs of a custom filter kind (step 8's `FilterKind`
 * satisfies it): read its state (`'invalid'` refuses it), say whether it
 * filters at all, and optionally the form the server receives (the state
 * itself otherwise). `types`: the column types it applies to, all when absent.
 */
export interface WireKind {
  read(state: Json): Json | 'invalid';
  active(state: Json): boolean;
  wire?(state: Json, ctx: LocaleCtx, zone: string, context?: unknown): Json;
  readonly types?: readonly ColumnType[];
}

/** JSON as a server reads it back: finite numbers, plain objects and arrays, no hole, depth 20 at most (a cycle never ends). */
export function isJson(v: unknown, depth = 0): boolean {
  if (depth > 20) return false;
  if (v === null || typeof v === 'string' || typeof v === 'boolean') return true;
  if (typeof v === 'number') return Number.isFinite(v);
  if (typeof v !== 'object') return false;
  if (Array.isArray(v)) {
    for (let i = 0; i < v.length; i++) if (!isJson(v[i], depth + 1)) return false;
    return true;
  }
  const proto = Object.getPrototypeOf(v);
  return (proto === Object.prototype || proto === null) && Object.values(v).every((x) => isJson(x, depth + 1));
}
