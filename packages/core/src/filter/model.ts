import type { ColumnType } from '../value/codec.js';
import type { Day } from '../value/day.js';
import type { LocaleCtx } from '../value/locale.js';

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
  | { readonly type: 'custom'; readonly kind: string; readonly state: Json };

export type InstantFilter = Extract<ColumnFilter, { type: 'instant' }>;

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
