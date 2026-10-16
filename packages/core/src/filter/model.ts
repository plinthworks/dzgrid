import type { Day } from '../value/day.js';

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
  | { readonly type: 'combined'; readonly join: 'and' | 'or'; readonly conditions: readonly ColumnFilter[] };

export type InstantFilter = Extract<ColumnFilter, { type: 'instant' }>;

export const TEXT_OPS: ReadonlySet<string> = new Set(['contains', 'notContains', 'equals', 'notEqual', 'startsWith', 'endsWith', 'blank', 'notBlank']);
export const NUM_OPS: ReadonlySet<string> = new Set(['equals', 'notEqual', 'lt', 'lte', 'gt', 'gte', 'between', 'blank', 'notBlank']);
export const INSTANT_OPS: ReadonlySet<string> = new Set(['onDay', 'betweenDays', 'before', 'after', 'between', 'blank', 'notBlank']);
