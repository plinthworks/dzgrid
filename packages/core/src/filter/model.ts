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

export type ColumnFilter =
  | { readonly type: 'text'; readonly op: TextOp; readonly value?: string; readonly caseSensitive?: boolean }
  | { readonly type: 'number'; readonly op: NumOp; readonly value?: number; readonly valueTo?: number }
  | { readonly type: 'day'; readonly op: NumOp; readonly value?: Day | string; readonly valueTo?: Day | string }
  | {
      readonly type: 'instant';
      readonly op: InstantOp;
      readonly day?: Day | string;
      readonly dayTo?: Day | string;
      readonly at?: string;
      readonly atTo?: string;
    }
  | { readonly type: 'boolean'; readonly value: boolean | null }
  | { readonly type: 'set'; readonly include?: readonly string[]; readonly exclude?: readonly string[]; readonly blanks?: 'include' | 'exclude' }
  | { readonly type: 'combined'; readonly join: 'and' | 'or'; readonly conditions: readonly ColumnFilter[] }
  /** A filter kind from a module (step 8): its state, read by the kind. Refused by the browser until then. */
  | { readonly type: 'custom'; readonly kind: string; readonly state: Json };

export type InstantFilter = Extract<ColumnFilter, { type: 'instant' }>;

export const TEXT_OPS: ReadonlySet<string> = new Set(['contains', 'notContains', 'equals', 'notEqual', 'startsWith', 'endsWith', 'blank', 'notBlank']);
export const NUM_OPS: ReadonlySet<string> = new Set(['equals', 'notEqual', 'lt', 'lte', 'gt', 'gte', 'between', 'blank', 'notBlank']);
export const INSTANT_OPS: ReadonlySet<string> = new Set(['onDay', 'betweenDays', 'before', 'after', 'between', 'blank', 'notBlank']);

/**
 * What the wire form needs of a custom filter kind (step 8's `FilterKind`
 * satisfies it): read its state (`'invalid'` refuses it), say whether it
 * filters at all, and optionally the form the server receives (the state
 * itself otherwise). `types`: the column types it applies to, all when absent.
 */
export interface WireKind {
  read(state: Json): Json | 'invalid';
  active(state: Json): boolean;
  wire?(state: Json, ctx: LocaleCtx, zone: string): Json;
  readonly types?: readonly ColumnType[];
}
