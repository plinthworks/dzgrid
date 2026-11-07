import type { AbortHandle, AbortSignalLike } from '../abort.js';
import type { AggFuncName } from '../columns/defs.js';
import type { RowKey } from '../ids.js';
import type { Json } from '../filter/model.js';
import type { ModelEnv, SourceBinding, SourceHandle } from '../model/client.js';
import type { SetValue } from '../model/values.js';
import type { SortItem } from '../sort/compile.js';
import type { GateDiagnostics } from './gate.js';
import type { WireFilterModel } from './wire.js';

/** What a request may carry to a server: data that survives JSON. */
export type { Json };

/**
 * The host's side of a server grid: one method that answers a request. It
 * may return a Promise, any thenable, or the answer itself; a throw is a
 * failure. The signal says when the grid no longer wants the answer.
 */
export interface DataSource<T> {
  readonly fetch: (req: DataRequest) => Promise<DataResponse<T>> | PromiseLike<DataResponse<T>> | DataResponse<T>;
  /**
   * A column's value list when the filter runs on the server (value-list.md):
   * the values present in the rows the request's filter keeps, with their
   * counts if known. Optional: without it the list falls back to the column's
   * options, never to the rows held.
   */
  readonly values?: (req: ValuesRequest) => Promise<ValuesResponse> | PromiseLike<ValuesResponse> | ValuesResponse;
  /**
   * A parent's children, when a lazy tree opens it (tree-lazy.md, B): every child, never paged. A
   * list or `{ rows }`; a throw or a rejection is a failure (the error row and its Retry).
   */
  readonly children?: (req: ChildRequest<T>) => Promise<ChildResponse<T>> | PromiseLike<ChildResponse<T>> | ChildResponse<T>;
}

/** A parent's children asked (B): the parent, the server's part of the query as sent for rows, the epoch. */
export interface ChildRequest<T> {
  readonly parent: RowKey;
  /** The parent's id, as text. */
  readonly id: string;
  readonly row: T;
  readonly filter?: WireFilterModel;
  readonly quick?: string;
  readonly sort?: readonly SortItem[];
  readonly params: Readonly<Record<string, Json>>;
  readonly zone: string;
  /** The query epoch it was asked in: a new filter, search, sort, zone, params or source makes another. */
  readonly epoch: number;
  /** Canonical, without the row: two requests with equal keys ask the same thing. */
  readonly key: string;
  readonly signal: AbortSignalLike;
}

export type ChildResponse<T> = readonly T[] | { readonly rows: readonly T[] };

export interface ValuesRequest {
  readonly column: string;
  /** Trimmed, as typed: the server folds it by its own rules. */
  readonly search: string;
  /** At most this many values (2 000 by default); more are cut, the list marked truncated. */
  readonly limit: number;
  /** The server's filter as sent (`toWire`), less this column's own: counts ignore it. */
  readonly filter?: WireFilterModel;
  /** Only when the search runs on the server and is not blank. */
  readonly quick?: string;
  readonly params: Readonly<Record<string, Json>>;
  readonly zone: string;
  /** Canonical: two requests with equal keys ask the same thing. */
  readonly key: string;
  readonly signal: AbortSignalLike;
}

/** The values in the host's order. A count of 0 is not listed; a bare array says nothing of blanks. */
export type ValuesResponse =
  | readonly SetValue[]
  | { readonly values: readonly SetValue[]; readonly blanks?: number | null; readonly truncated?: boolean };

export interface DataRequest {
  /** The server's part of the query, as `splitQuery` places it; an empty search is not sent. The filter in its wire form (`toWire`). */
  readonly filter?: WireFilterModel;
  readonly quick?: string;
  readonly sort?: readonly SortItem[];
  /** With server pages, and for a block (by offset). */
  readonly page?: PageWindow;
  /** A block of a list loaded as it scrolls (`@dzgrid/core/infinite`): its `page` is the block, by offset. */
  readonly blocks?: true;
  /** A level of a list grouped on the server (`@dzgrid/core/server-side`, server-side-groups.md): which groups, under which. */
  readonly group?: GroupPart;
  readonly params: Readonly<Record<string, Json>>;
  /** The zone instants are read in (a day filter's bounds depend on it). */
  readonly zone: string;
  /** Canonical: two requests with equal keys ask the same thing. */
  readonly key: string;
  readonly signal: AbortSignalLike;
}

/** A group's value as sent and sent back: a day as `YYYY-MM-DD`, an instant as epoch ms, null for the empty group. */
export type GroupValue = string | number | boolean | null;

/**
 * The group part of a request (server-side-groups.md, owner Q-WIRE A): `by` the grouping columns, `path` the typed values
 * of the open groups from the top (empty: the first level), `aggs` the totals asked, by Phase 7's names. The level asked
 * is `path.length`: groups while it is less than `by.length`, the rows at the last one.
 */
export interface GroupPart {
  readonly by: readonly string[];
  readonly path: readonly GroupValue[];
  readonly aggs: readonly { readonly column: string; readonly fn: AggFuncName }[];
  /** With `serverPivot()` (`@dzgrid/core/server-pivot`, server-pivot.md): the pivot asked, at every level and block. */
  readonly pivot?: PivotPart;
}

/**
 * The pivot part of a request (server-pivot.md): the pivot columns in use, the reversed ones, sub-totals asked, the most
 * crossings the grid takes (`limit`; above it answer `count` alone), a sort on a crossing's total. Column ids and typed
 * values only: never a created column's id.
 */
export interface PivotPart {
  readonly columns: readonly string[];
  readonly desc?: readonly string[];
  readonly subtotals?: true;
  readonly limit: number;
  /** The groups ordered by one crossing's total: its typed path, its value column, the direction. */
  readonly sort?: { readonly crossing: readonly GroupValue[]; readonly column: string; readonly dir: 'asc' | 'desc' };
  /** In an export's `server.group` only: the crossings the screen shows, in order. */
  readonly crossings?: readonly (readonly GroupValue[])[];
}

/** A crossing's cells by crossing index (its place in `pivot.crossings`), then by value column: sparse, an absent one empty. */
export type PivotCells = Readonly<Record<string, Readonly<Record<string, Json>>>>;

/**
 * A server's answer at a level of groups with a pivot (server-pivot.md): each group's `cells`; the first level's first
 * block also `pivot` — the crossings as typed paths in the order to show (or `count` alone above `limit`), and the grand
 * total row's cells.
 */
export interface PivotResponse extends Omit<GroupResponse, 'groups'> {
  readonly groups: readonly (GroupResponse['groups'][number] & { readonly cells?: PivotCells })[];
  readonly pivot?: { readonly crossings?: readonly (readonly GroupValue[])[]; readonly count?: number; readonly totals?: PivotCells };
}

/** A server's answer at a level of groups: each group's value, row count and totals; `totals` the grand ones (any block may send them). */
export interface GroupResponse {
  readonly groups: readonly { readonly value: GroupValue; readonly count?: number; readonly aggs?: Readonly<Record<string, Json>> }[];
  readonly total?: number;
  readonly hasNext?: boolean;
  readonly totals?: Readonly<Record<string, Json>>;
}

/** A page asked for: by number and offset, or by the cursor the page before gave (null for the first). */
export interface PageWindow {
  readonly index: number;
  readonly size: number;
  readonly offset: number;
  readonly cursor: string | null;
}

/**
 * One page of rows, or the whole fetched set. With server pages, `total` or
 * `hasNext` says what follows, and by cursor `nextCursor` is how to ask it.
 * A fetched set is its rows: the other fields are not read.
 */
export interface DataResponse<T> {
  readonly rows: readonly T[];
  readonly total?: number;
  readonly hasNext?: boolean;
  readonly nextCursor?: string | null;
}

/** Fixed when the model is made: another binding given later brings its data and params only. */
export interface SourceRowsOptions {
  /** `offset` by default. By cursor, only pages reached can be asked (no jump), and a new size starts again at page 0. */
  readonly paging?: 'offset' | 'cursor';
  /** A fetched set larger than this is warned of (`fetched-set-large`), and kept. 100 000 by default. */
  readonly maxRows?: number;
  readonly params?: Readonly<Record<string, Json>>;
  /** Taken before the grid's: `() => new AbortController()` fits. */
  readonly abort?: () => AbortHandle;
}

export interface SourceModel<T> extends SourceHandle<T> {
  /** `valueFetches`: the value list requests made; `childFetches` (a lazy tree only): its children asked. */
  readonly diagnostics: { readonly fetches: number; readonly valueFetches: number; readonly childFetches?: number; readonly gate: GateDiagnostics };
}

/** What `sourceRows` gives: a binding for the `source` setting, whose model also counts its fetches. */
export interface SourceRows<T> extends SourceBinding<T> {
  create(env: ModelEnv<T>): SourceModel<T>;
}
