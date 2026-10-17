import type { AbortHandle, AbortSignalLike } from '../abort.js';
import type { FilterModel } from '../filter/model.js';
import type { ModelEnv, SourceBinding, SourceHandle } from '../model/client.js';
import type { SortItem } from '../sort/compile.js';
import type { GateDiagnostics } from './gate.js';

/** What a request may carry to a server: data that survives JSON. */
export type Json = null | boolean | number | string | readonly Json[] | { readonly [k: string]: Json };

/** The filters as the server receives them (step 6 turns instants into resolved bounds). */
export type WireFilterModel = FilterModel;

/**
 * The host's side of a server grid: one method that answers a request. It
 * may return a Promise, any thenable, or the answer itself; a throw is a
 * failure. The signal says when the grid no longer wants the answer.
 */
export interface DataSource<T> {
  readonly fetch: (req: DataRequest) => Promise<DataResponse<T>> | PromiseLike<DataResponse<T>> | DataResponse<T>;
}

export interface DataRequest {
  /** The server's part of the query, as `splitQuery` places it; an empty search is not sent. */
  readonly filter?: WireFilterModel;
  readonly quick?: string;
  readonly sort?: readonly SortItem[];
  /** With server pages only. */
  readonly page?: PageWindow;
  readonly params: Readonly<Record<string, Json>>;
  /** The zone instants are read in (a day filter's bounds depend on it). */
  readonly zone: string;
  /** Canonical: two requests with equal keys ask the same thing. */
  readonly key: string;
  readonly signal: AbortSignalLike;
}

/** A page asked for: by number and offset, or by the cursor the page before gave (null for the first). */
export interface PageWindow {
  readonly index: number;
  readonly size: number;
  readonly offset: number;
  readonly cursor: string | null;
}

/** One page of rows, or the whole fetched set. With server pages, `total` or `hasNext` says what follows. */
export interface DataResponse<T> {
  readonly rows: readonly T[];
  readonly total?: number;
  readonly hasNext?: boolean;
  readonly nextCursor?: string | null;
}

/** Fixed when the model is made: another binding given later brings its data and params only. */
export interface SourceRowsOptions {
  /** `offset` by default. */
  readonly paging?: 'offset' | 'cursor';
  /** A fetched set larger than this is warned of. 100 000 by default. */
  readonly maxRows?: number;
  readonly params?: Readonly<Record<string, Json>>;
  /** Taken before the grid's: `() => new AbortController()` fits. */
  readonly abort?: () => AbortHandle;
}

export interface SourceModel<T> extends SourceHandle<T> {
  readonly diagnostics: { readonly fetches: number; readonly gate: GateDiagnostics };
}

/** What `sourceRows` gives: a binding for the `source` setting, whose model also counts its fetches. */
export interface SourceRows<T> extends SourceBinding<T> {
  create(env: ModelEnv<T>): SourceModel<T>;
}
