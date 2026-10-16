import type { ColumnLookup } from '../columns/model.js';
import { NO_OVERLAY, type ValueReader } from '../columns/defs.js';
import { compileFilter, filterIndices } from '../filter/compile.js';
import { canNarrow, compileQuick, quickWords } from '../filter/quick.js';
import type { RowIdInput, RowKey } from '../ids.js';
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

export type ModelStatus = { readonly phase: 'idle' };

export interface ModelChange<T> {
  readonly source: ChangeSource;
  readonly displayed: DisplayedRows<T>;
  readonly kind: 'rows' | 'order' | 'query' | 'context';
  readonly transaction?: TransactionResult;
  readonly problems: readonly Problem[];
}

export interface RowModel<T> {
  readonly kind: 'client' | 'paged' | 'infinite' | 'server-side';
  readonly displayed: DisplayedRows<T>;
  readonly status: ModelStatus;
  setQuery(q: Query, source?: ChangeSource): void;
  invalidate(o?: { keepScroll?: boolean }): void;
  subscribe(fn: (c: ModelChange<T>) => void): () => void;
  destroy(): void;
}

export interface ClientOptions<T> {
  readonly rows: Iterable<T>;
  readonly getRowId: (row: T) => RowIdInput;
  readonly columns: ColumnLookup<T>;
  readonly ctx: LocaleCtx;
  readonly reader?: ValueReader<T>;
}

export interface ClientModel<T> extends RowModel<T> {
  readonly kind: 'client';
  /** A row by its key, whatever the filter. */
  row(key: RowKey): DataNode<T> | undefined;
  readonly query: Query;
  readonly counts: { readonly total: number; readonly filtered: number };
  /** The last load or transaction's problems, then the query's and the cells'. */
  readonly problems: readonly Problem[];
  setRows(rows: Iterable<T>, source?: ChangeSource): TransactionResult;
  applyTransaction(tx: RowTransaction<T>, source?: ChangeSource): TransactionResult;
  setColumns(columns: ColumnLookup<T>): void;
  setContext(ctx: LocaleCtx): void;
  /** Takes the edit overlay without reordering anything (K.14): rows move only on `reapply()`. */
  setReader(reader: ValueReader<T>): void;
  reapply(): void;
  readonly diagnostics: {
    readonly filterRuns: number;
    readonly sortRuns: number;
    readonly displayedBuilds: number;
    readonly retested: number;
    readonly keyBuilds: number;
    readonly rankBuilds: number;
    readonly quickScanned: number;
    readonly displayBuilds: number;
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
  const d = { filterRuns: 0, sortRuns: 0, displayedBuilds: 0, retested: 0 };

  /** What a stage's result depends on, besides the rows. */
  interface Inputs { snap: number; colsRef: ColumnLookup<T>; cols: number; ctx: string; reader: number; filter: string; quick: string; quickCols: string }
  let filtered: { in: Inputs; words: readonly string[]; order: Uint32Array | null; mask: Uint8Array | null; problems: readonly Problem[] } | null = null;
  let sorted: { in: Inputs; sort: string; input: Uint32Array | null; order: Uint32Array | null; problems: readonly Problem[] } | null = null;
  let displayed: DisplayedRows<T>;

  const env = (): ColumnEnv<T> => ({ source: store.snapshot, columns, ctx, reader, cache });
  const inputs = (): Inputs => ({
    snap: store.snapshot.version,
    colsRef: columns,
    // Data, not layout: resizing a column must not filter and sort again.
    cols: columns.dataVersion,
    ctx: ctxKey(ctx),
    reader: reader.version,
    filter: canonical(query.filter),
    quick: query.quick,
    quickCols: columns.visible().map((c) => c.id).join(','),
  });
  const same = (a: Inputs, b: Inputs, ignore?: 'quick'): boolean =>
    a.snap === b.snap && a.colsRef === b.colsRef && a.cols === b.cols && a.ctx === b.ctx && a.reader === b.reader && a.filter === b.filter && a.quickCols === b.quickCols && (ignore === 'quick' || a.quick === b.quick);

  /** Runs the stages whose inputs changed; true when the displayed rows changed. */
  const run = (): boolean => {
    const now = inputs();
    if (!filtered || !same(filtered.in, now)) {
      d.filterRuns++;
      const e = env();
      const f = compileFilter(query.filter, e);
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

  const show = (): void => {
    d.displayedBuilds++;
    displayed = flatDisplayed(store.snapshot, sorted!.order, ++version);
  };

  const notify = (kind: ModelChange<T>['kind'], source: ChangeSource, transaction?: TransactionResult): void => {
    if (destroyed) return;
    const c: ModelChange<T> = { source, displayed, kind, problems: currentProblems(), ...(transaction && { transaction }) };
    for (const fn of [...listeners]) fn(c);
  };
  let loadProblems: readonly Problem[] = [];
  const currentProblems = (): readonly Problem[] => [...loadProblems, ...(filtered?.problems ?? []), ...(sorted?.problems ?? [])];

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
    const f = compileFilter(query.filter, e);
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
    filtered = { ...filtered, in: now, problems: f.problems };
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
    row: (key) => store.get(key),
    get query() { return query; },
    get displayed() { return displayed; },
    get problems() { return currentProblems(); },
    get counts() { return { total: store.size, filtered: filtered?.order ? filtered.order.length : store.size }; },
    get diagnostics() {
      return { ...d, keyBuilds: cache.stats.keyBuilds, rankBuilds: cache.stats.rankBuilds, quickScanned: cache.stats.quickScanned, displayBuilds: cache.stats.displayBuilds };
    },
    setQuery(q, source = 'api') {
      if (q.key === query.key) return;
      // The search box emptied: its haystacks are the largest caches; let them go.
      if (query.quick.trim() && !q.quick.trim()) cache.releaseSearch();
      query = q;
      if (run()) notify('query', source);
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
    setColumns(next) {
      columns = next;
      if (run()) notify('context', 'host');
    },
    setContext(next) {
      ctx = next;
      if (run()) notify('context', 'host');
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

function maskOf(order: Uint32Array | null, count: number): Uint8Array | null {
  if (!order) return null;
  const mask = new Uint8Array(count);
  for (const s of order) mask[s] = 1;
  return mask;
}
