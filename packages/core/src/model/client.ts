import type { ColumnLookup } from '../columns/model.js';
import type { Json } from '../filter/model.js';
import type { AnyFilterKind } from '../filter/kind.js';
import { NO_OVERLAY, type ValueReader } from '../columns/defs.js';
import { compileFilter, filterIndices } from '../filter/compile.js';
import { canNarrow, compileQuick, quickWords } from '../filter/quick.js';
import { idOfDataKey, type RowIdInput, type RowKey } from '../ids.js';
import type { DataNode } from '../row/node.js';
import type { Problem } from '../problems.js';
import { flatDisplayed, type DisplayedRows } from '../row/displayed.js';
import { createRowStore, type RowStore, type RowTransaction, type TransactionResult } from '../row/store.js';

/** The store behind a client model — for the grid's own layers, through `@dzgrid/core/internal`. */
export const storeOf = <T>(m: ClientModel<T>): RowStore<T> => (m as unknown as { [STORE]: RowStore<T> })[STORE];
const STORE = Symbol('dzgrid.store');
import { sortIndices } from '../sort/compile.js';
import { ctxKey, type LocaleCtx } from '../value/locale.js';
import { ColumnCache, type ColumnEnv } from './column-cache.js';
import { canonical, EMPTY_QUERY, type Query } from './query.js';
import type { ChangeSource } from './types.js';
import type { Operations, OperationsInput } from './operations.js';
import type { AbortHandle } from '../abort.js';
import { checkPage, pageCountOf, pageOf, resizeIndex, resolvePageOptions, type PageOptions, type PageState } from './page.js';

export type ModelStatus =
  | { readonly phase: 'idle' }
  | { readonly phase: 'loading' }
  /** `key` and `page`: the request that failed, when a server's. */
  | { readonly phase: 'error'; readonly failure: unknown; readonly key?: string; readonly page?: number | null };

/** How many rows: all of them, after the filters, and shown now. A server may not know its total. */
export interface RowCounts {
  readonly total: number | null;
  readonly filtered: number | null;
  readonly displayed: number;
}

export interface ModelChange<T> {
  readonly source: ChangeSource;
  readonly displayed: DisplayedRows<T>;
  readonly kind: 'rows' | 'order' | 'query' | 'context' | 'page' | 'status';
  readonly transaction?: TransactionResult;
  readonly problems: readonly Problem[];
  /** Problems to tell once (a server's malformed answer, a fetched set too large): the kernel emits them. */
  readonly told?: readonly Problem[];
  /** A request that failed and counts (the latest): the host's error unchanged, the request's key and page. */
  readonly failure?: { readonly error: unknown; readonly key: string; readonly page: number | null };
}

/** What a select-all stands on besides the query: a server's params and the display zone. */
export interface RowScope {
  readonly params: Readonly<Record<string, Json>>;
  readonly zone: string;
}

/**
 * What the kernel needs of any row model, the browser's or a server's (Phase 3,
 * D1): it pushes the query, reads the counts, and asks its policies — what
 * "select all" means here, whether a selected key survives a change, and
 * which rows a query matches (what an everything-except selection is tied to).
 */
export interface RowModel<T> {
  readonly kind: 'client' | 'source';
  readonly ops: Operations;
  readonly displayed: DisplayedRows<T>;
  readonly status: ModelStatus;
  readonly counts: RowCounts;
  /** What the model was given that it refused or bent, and the query's problems. */
  readonly problems: readonly Problem[];
  /** `displayed`: the rows shown after the filters (an include set). `query`: everything the query matches, on the server (everything-except). */
  readonly selectAll: 'displayed' | 'query';
  /**
   * Whether a selected key survives a change. Server pages: always (rows on
   * other pages, never seen, are not gone). A fetched set or the browser: the
   * row is held — a fetched set holds the rows of its last accepted answer, so
   * a new answer drops the keys it no longer has, and a failed one drops none.
   */
  keeps(key: RowKey): boolean;
  /**
   * Which rows `q` matches here, as a key: equal keys, the same rows. It reads
   * the filters and the search as they are applied (a server's in their wire
   * form, so a half-typed filter changes nothing), the zone, a server's params,
   * and the columns a search in the browser reads. Never the sort or the page.
   */
  membershipOf(q: Query): string;
  /** In the browser (and a fetched set): whether a held row passes the filters and the search now. */
  matches?(key: RowKey): boolean;
  readonly scope: RowScope;
  /** A row by its key: any held row in the browser, the current page on a server. */
  row(key: RowKey): DataNode<T> | undefined;
  setQuery(q: Query, source?: ChangeSource): void;
  setColumns(columns: ColumnLookup<T>, source?: ChangeSource): void;
  setContext(ctx: LocaleCtx, source?: ChangeSource): void;
  /** Fetch or compute again (a server's retry). */
  invalidate(o?: { readonly purge?: boolean }): void;
  /** The page shown, when the rows are paged; null otherwise. */
  readonly page: PageState | null;
  /** Prepares the quick search in idle time, when the search runs in the browser. */
  warmSearch?(): SearchWarmup;
  /** Another page or size (a size first, then the index read in it); past the end clamps. */
  setPage(p: { readonly index?: number; readonly size?: number }, source?: ChangeSource): void;
  subscribe(fn: (c: ModelChange<T>) => void): () => void;
  destroy(): void;
}

export interface SearchWarmup {
  /** Builds up to `maxCells` cells; true when done (finished, given up or cancelled). */
  step(maxCells: number): boolean;
  /** 0 to 1. */
  readonly progress: number;
  cancel(): void;
}

export interface ClientOptions<T> {
  readonly rows: Iterable<T>;
  readonly getRowId: (row: T) => RowIdInput;
  readonly columns: ColumnLookup<T>;
  readonly ctx: LocaleCtx;
  readonly reader?: ValueReader<T>;
  /** Paged in the browser: the rows shown are one page of the filtered, sorted ones. Set once. */
  readonly page?: PageOptions;
  /** The custom filter kinds, by name. */
  readonly filterKinds?: (name: string) => AnyFilterKind | undefined;
}

export interface ClientModel<T> extends RowModel<T> {
  readonly kind: 'client';
  /** A row by its key, whatever the filter. */
  row(key: RowKey): DataNode<T> | undefined;
  readonly query: Query;
  readonly counts: { readonly total: number; readonly filtered: number; readonly displayed: number };
  /** The last load or transaction's problems, then the query's and the cells'. */
  readonly problems: readonly Problem[];
  setRows(rows: Iterable<T>, source?: ChangeSource): TransactionResult;
  applyTransaction(tx: RowTransaction<T>, source?: ChangeSource): TransactionResult;
  setColumns(columns: ColumnLookup<T>, source?: ChangeSource): void;
  setContext(ctx: LocaleCtx, source?: ChangeSource): void;
  /** Takes the edit overlay without reordering anything (K.14): rows move only on `reapply()`. */
  setReader(reader: ValueReader<T>): void;
  reapply(): void;
  /**
   * Prepares the quick search's haystacks a few cells at a time, for idle
   * time (D13): afterwards the first keystroke builds nothing. Given up when
   * the rows, the columns, the language or the reader change.
   */
  warmSearch(): SearchWarmup;
  readonly diagnostics: {
    readonly foldBuilds: number;
    readonly filterRuns: number;
    readonly sortRuns: number;
    readonly displayedBuilds: number;
    readonly retested: number;
    readonly keyBuilds: number;
    readonly rankBuilds: number;
    readonly quickScanned: number;
    readonly displayBuilds: number;
    /** Pages cut from the sorted rows: a page change cuts, it never filters or sorts again. */
    readonly pageCuts: number;
  };
}

/**
 * Rows held in memory, filtered and sorted here.
 *
 * Three stages — filter (with the quick search), sort, displayed rows — each
 * keeps its last result under the inputs it depends on, so a sort change does
 * not filter again, and a query equal to the current one does nothing. An
 * update that rewrites rows re-tests only those rows; when none of them moves
 * in or out of the filter and none changes a sort key, the order is kept.
 * Everything else recomputes, from caches that survive what they can.
 *
 * One notification per change, synchronous. The rows a host gave are never
 * written to.
 */
export function clientRows<T>(o: ClientOptions<T>): ClientModel<T> {
  const store = createRowStore<T>(o.getRowId);
  const cache = new ColumnCache<T>();
  let columns = o.columns;
  let ctx = o.ctx;
  let reader = o.reader ?? (NO_OVERLAY as ValueReader<T>);
  let query = EMPTY_QUERY;
  const listeners = new Set<(c: ModelChange<T>) => void>();
  let destroyed = false;
  let version = 0;
  const d = { filterRuns: 0, sortRuns: 0, displayedBuilds: 0, retested: 0, pageCuts: 0 };
  const paging = resolvePageOptions(o.page);
  const pageCfg = paging.config;
  let pageSize = pageCfg?.size ?? 0;
  let pageIndex = 0;

  /** What a stage's result depends on, besides the rows. */
  interface Inputs { snap: number; colsRef: ColumnLookup<T>; cols: number; ctx: string; reader: number; filter: string; quick: string; quickCols: string }
  let filtered: { in: Inputs; words: readonly string[]; order: Uint32Array | null; mask: Uint8Array | null; problems: readonly Problem[] } | null = null;
  let sorted: { in: Inputs; sort: string; input: Uint32Array | null; order: Uint32Array | null; problems: readonly Problem[] } | null = null;
  let displayed: DisplayedRows<T>;
  /** The filters that apply, as a key, for a filter model under these columns and context. */
  let applied: { f: unknown; in: Inputs; key: string } | null = null;
  const appliedKey = (f: Query['filter']): string => {
    const now = inputs();
    if (!applied || applied.f !== f || applied.in.colsRef !== now.colsRef || applied.in.cols !== now.cols || applied.in.ctx !== now.ctx) {
      applied = { f, in: now, key: canonical(compileFilter(f, env(), o.filterKinds).applied) };
    }
    return applied.key;
  };

  const env = (): ColumnEnv<T> => ({ source: store.snapshot, columns, ctx, reader, cache });
  /** The columns a search reads. */
  const visibleIds = (): string => columns.visible().map((c) => c.id).join(',');
  const inputs = (): Inputs => ({
    snap: store.snapshot.version,
    colsRef: columns,
    // Data, not layout: resizing a column must not filter and sort again.
    cols: columns.dataVersion,
    ctx: ctxKey(ctx),
    reader: reader.version,
    filter: canonical(query.filter),
    quick: query.quick,
    quickCols: visibleIds(),
  });
  const same = (a: Inputs, b: Inputs, ignore?: 'quick'): boolean =>
    a.snap === b.snap && a.colsRef === b.colsRef && a.cols === b.cols && a.ctx === b.ctx && a.reader === b.reader && a.filter === b.filter && a.quickCols === b.quickCols && (ignore === 'quick' || a.quick === b.quick);

  /** Runs the stages whose inputs changed; true when the displayed rows changed. */
  const run = (): boolean => {
    const now = inputs();
    if (!filtered || !same(filtered.in, now)) {
      d.filterRuns++;
      const e = env();
      const f = compileFilter(query.filter, e, o.filterKinds);
      applied = { f: query.filter, in: now, key: canonical(f.applied) };
      const words = quickWords(query.quick);
      const q = compileQuick(query.quick, columns.visible(), e);
      // Typing on: when only the search changed and its words narrow the old ones, search the old matches.
      const within = filtered && same(filtered.in, now, 'quick') && canNarrow(filtered.words, words) ? filtered.order : null;
      const order = filterIndices(store.snapshot.count, [f, q], within);
      filtered = { in: now, words, order, mask: maskOf(order, store.snapshot.count), problems: f.problems };
    }
    const sortKey = canonical(query.sort);
    if (sorted && same(sorted.in, now) && sorted.sort === sortKey && sorted.input === filtered.order) return false;
    d.sortRuns++;
    const r = query.sort.length ? sortIndices(query.sort, filtered.order, env()) : { order: filtered.order, problems: [] };
    sorted = { in: now, sort: sortKey, input: filtered.order, order: r.order, problems: r.problems };
    show();
    return true;
  };

  const filteredCount = (): number => (filtered?.order ? filtered.order.length : store.size);
  /** The displayed rows: all the sorted ones, or the current page of them (the index clamped). */
  const show = (): void => {
    d.displayedBuilds++;
    const order = sorted!.order;
    if (!pageCfg) {
      displayed = flatDisplayed(store.snapshot, order, ++version);
      return;
    }
    d.pageCuts++;
    const total = filteredCount();
    pageIndex = Math.min(pageIndex, pageCountOf(total, pageSize) - 1);
    const start = pageIndex * pageSize;
    const end = Math.min(total, start + pageSize);
    let cut: Uint32Array;
    if (order) cut = order.subarray(start, end);
    else {
      cut = new Uint32Array(end - start);
      for (let i = 0; i < cut.length; i++) cut[i] = start + i;
    }
    displayed = flatDisplayed(store.snapshot, cut, ++version);
  };

  const notify = (kind: ModelChange<T>['kind'], source: ChangeSource, transaction?: TransactionResult, told?: readonly Problem[]): void => {
    if (destroyed) return;
    const c: ModelChange<T> = { source, displayed, kind, problems: currentProblems(), ...(transaction && { transaction }), ...(told && { told }) };
    for (const fn of [...listeners]) fn(c);
  };
  let loadProblems: readonly Problem[] = [];
  const currentProblems = (): readonly Problem[] => [...paging.problems, ...loadProblems, ...(filtered?.problems ?? []), ...(sorted?.problems ?? [])];

  /** A sort column's key array for the current generation. */
  const keysOf = (col: NonNullable<ReturnType<ColumnLookup<T>['get']>>): Float64Array => {
    const e = env();
    return col.codec.keyKind === 'number' ? cache.keys(col, e).keys : cache.ranks(col, e).ranks;
  };

  /** After a transaction: an update re-tests only its rows; anything else recomputes. */
  const afterTransaction = (r: TransactionResult, source: ChangeSource): void => {
    loadProblems = r.problems;
    if (r.kind === 'none') return;
    const delta = store.lastDelta;
    const follow = () => cache.patch(delta, store.snapshot, () => ({ columns, ctx, reader }));
    if (delta.kind !== 'update' || !delta.changedSrc || !filtered || !sorted) {
      follow();
      filtered = null;
      sorted = null;
      run();
      return notify('rows', source, r);
    }
    // The old sort keys of the changed rows, read before the cache follows the store.
    const sortCols = query.sort.map((s) => columns.get(s.column)).filter((c) => c !== undefined);
    const oldSnap = { ...env(), source: storeBefore };
    const before = sortCols.map((c) => Array.from(delta.changedSrc!, (src) => (c.codec.keyKind === 'number' ? cache.keys(c, oldSnap).keys : cache.ranks(c, oldSnap).ranks)[src]));
    follow();
    const after = sortCols.map((c) => Array.from(delta.changedSrc!, (src) => keysOf(c)[src]));
    const e = env();
    const f = compileFilter(query.filter, e, o.filterKinds);
    const q = compileQuick(query.quick, columns.visible(), e);
    let moved = false;
    for (const src of delta.changedSrc) {
      d.retested++;
      const was = filtered.mask ? filtered.mask[src] === 1 : true;
      if (f.test(src) && q.test(src)) {
        if (!was) moved = true;
      } else if (was) moved = true;
    }
    const keysMoved = before.some((ks, i) => ks.some((k, j) => !Object.is(k, after[i]![j])));
    if (moved || keysMoved) {
      filtered = null;
      sorted = null;
      run();
      return notify('rows', source, r);
    }
    // Same rows in the same order: only their data changed. Problems follow the patched cells.
    const now = inputs();
    const sortProblems = sortCols.flatMap((c) => (c.codec.keyKind === 'number' ? cache.keys(c, e).problems : cache.ranks(c, e).problems));
    // A rerun of the changed rows only: the problems of the full run stay, those of these rows join.
    const kept = new Set(filtered.problems.map((p) => said([p])));
    filtered = { ...filtered, in: now, problems: [...filtered.problems, ...f.problems.filter((p) => !kept.has(said([p])))] };
    sorted = { ...sorted, in: now, problems: sortProblems };
    show();
    notify('rows', source, r);
  };

  // The generation a transaction starts from, so the old sort keys can be read.
  let storeBefore = store.snapshot;
  const transact = (apply: () => TransactionResult, source: ChangeSource): TransactionResult => {
    storeBefore = store.snapshot;
    const r = apply();
    afterTransaction(r, source);
    return r;
  };

  loadProblems = store.replaceAll(o.rows).problems;
  run();

  const model: ClientModel<T> & { [STORE]: RowStore<T> } = {
    [STORE]: store,
    kind: 'client',
    status: { phase: 'idle' },
    ops: { filter: 'client', quick: 'client', sort: 'client', page: pageCfg ? 'client' : 'off' },
    selectAll: 'displayed',
    keeps: (key) => store.get(key) !== undefined,
    // Which rows match: the filters that apply (a half-typed one is none), the search by its
    // words (spaces aside), over the set of columns it reads (their order and pinning aside).
    membershipOf: (q) => {
      const words = quickWords(q.quick);
      return canonical({ filter: appliedKey(q.filter), quick: words.join(' '), zone: ctx.timeZone, cols: words.length ? columns.visible().map((c) => c.id).sort().join(',') : null });
    },
    matches: (key) => {
      const src = store.snapshot.lookup(idOfDataKey(key) ?? '');
      return src !== -1 && (!filtered?.mask || filtered.mask[src] === 1);
    },
    get scope() { return { params: NO_PARAMS, zone: ctx.timeZone }; },
    row: (key) => store.get(key),
    get query() { return query; },
    get displayed() { return displayed; },
    get page() { return pageCfg ? pageOf({ size: pageSize, sizes: pageCfg.sizes }, pageIndex, filteredCount()) : null; },
    setPage(p, source = 'api') {
      if (!pageCfg || checkPage(p).length) return;
      let size = pageSize;
      let index = pageIndex;
      if (p.size !== undefined && p.size !== size) {
        index = resizeIndex(index, size, p.size);
        size = p.size;
      }
      if (p.index !== undefined) index = p.index;
      index = Math.min(index, pageCountOf(filteredCount(), size) - 1);
      if (size === pageSize && index === pageIndex) return;
      pageSize = size;
      pageIndex = index;
      show();
      notify('page', source);
    },
    get problems() { return currentProblems(); },
    get counts() { return { total: store.size, filtered: filtered?.order ? filtered.order.length : store.size, displayed: displayed.count }; },
    get diagnostics() {
      return { ...d, keyBuilds: cache.stats.keyBuilds, rankBuilds: cache.stats.rankBuilds, quickScanned: cache.stats.quickScanned, displayBuilds: cache.stats.displayBuilds, foldBuilds: cache.stats.foldBuilds };
    },
    warmSearch() {
      // What a word without digits searches: text and enum columns (enums by label and by value).
      const start = env();
      const builders: { step(n: number): boolean; readonly built: number; readonly total: number }[] = [];
      for (const col of start.columns.visible()) {
        const textual = col.type === 'text' || col.type === 'enum' || (col.type === 'custom' && col.codec.keyKind === 'text');
        if (!textual) continue;
        for (const kind of col.type === 'enum' ? (['search', 'export'] as const) : (['search'] as const)) {
          const b = cache.haystackBuilder(kind, col, start, env);
          if (b) builders.push(b);
        }
      }
      const total = builders.reduce((a, b) => a + b.total, 0);
      let at = 0;
      let stopped = false;
      return {
        get progress() {
          return total === 0 ? 1 : builders.reduce((a, b) => a + b.built, 0) / total;
        },
        step(maxCells) {
          let budget = maxCells;
          while (!stopped && at < builders.length && budget > 0) {
            const b = builders[at]!;
            const before = b.built;
            const done = b.step(budget);
            budget -= Math.max(1, b.built - before);
            if (!done) return false;
            // A builder that gave up means the model moved on: the rest would be stale too.
            if (b.built < b.total) stopped = true;
            at++;
          }
          return stopped || at >= builders.length;
        },
        cancel() {
          stopped = true;
        },
      };
    },
    setQuery(q, source = 'api') {
      if (q.key === query.key) return;
      // The search box emptied: its haystacks are the largest caches; let them go.
      if (query.quick.trim() && !q.quick.trim()) cache.releaseSearch();
      // Another filter, search or sort shows other rows at each place: back to the first page.
      const reset = pageCfg !== null && pageIndex !== 0;
      const was = said(filtered!.problems);
      query = q;
      if (reset) pageIndex = 0;
      // Another key always changes a stage's input, so run() cuts the first page.
      if (!run()) return;
      // A filter refused anew is told once (filter-custom.md).
      const now = filtered!.problems;
      notify('query', source, undefined, now.length && said(now) !== was ? now : undefined);
    },
    // keepScroll is the DOM's concern; the model has no scroll to keep.
    invalidate() {
      cache.invalidateAll();
      filtered = null;
      sorted = null;
      run();
      notify('rows', 'api');
    },
    setRows: (rows, source = 'host') => transact(() => store.replaceAll(rows), source),
    applyTransaction: (tx, source = 'host') => transact(() => store.apply(tx), source),
    setColumns(next, source = 'host') {
      columns = next;
      if (run()) notify('context', source);
    },
    setContext(next, source = 'host') {
      ctx = next;
      if (run()) notify('context', source);
    },
    // Taken, not applied: what is shown keeps its order until reapply() (K.14).
    setReader(next) {
      reader = next;
      // The stages count as up to date for this reader: nothing reruns because of it alone.
      if (filtered) filtered = { ...filtered, in: { ...filtered.in, reader: next.version } };
      if (sorted) sorted = { ...sorted, in: { ...sorted.in, reader: next.version } };
    },
    reapply() {
      filtered = null;
      sorted = null;
      run();
      notify('order', 'user');
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => void listeners.delete(fn);
    },
    destroy() {
      destroyed = true;
      listeners.clear();
    },
  };
  return model;
}

const NO_PARAMS: Readonly<Record<string, Json>> = Object.freeze({});

/** What a list of problems says: equal lists are told once. */
const said = (ps: readonly Problem[]): string => canonical(ps.map((p) => [p.code, p.path, p.detail]));

function maskOf(order: Uint32Array | null, count: number): Uint8Array | null {
  if (!order) return null;
  const mask = new Uint8Array(count);
  for (const s of order) mask[s] = 1;
  return mask;
}

/**
 * What a grid gives the model it makes from a binding (`source:
 * sourceRows(data, …)` from `@dzgrid/core/server`): the base only knows these
 * types, so a grid on rows in memory carries none of the server code.
 */
export interface ModelEnv<T> {
  readonly getRowId: (row: T) => RowIdInput;
  readonly columns: ColumnLookup<T>;
  readonly ctx: LocaleCtx;
  readonly page?: PageOptions;
  readonly operations?: OperationsInput;
  readonly query?: Query;
  readonly abort?: () => AbortHandle;
  /** The grid's custom filter kinds, by name: for the filter sent to a server and the one run in the browser. */
  readonly filterKinds?: (name: string) => AnyFilterKind | undefined;
}

/** A model to make once the grid knows its columns and language. */
export interface SourceBinding<T> {
  create(env: ModelEnv<T>): SourceHandle<T>;
}

export interface SourceHandle<T> extends RowModel<T> {
  readonly kind: 'source';
  /** Another source, live: a new epoch, the first page, the old rows shown stale until the answer. */
  setSource(next: SourceBinding<T>, source?: ChangeSource): void;
}
