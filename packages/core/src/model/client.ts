import type { ColumnLookup } from '../columns/model.js';
import type { FilterModel, Json } from '../filter/model.js';
import type { AnyFilterKind } from '../filter/kind.js';
import { NO_OVERLAY, type ValueReader } from '../columns/defs.js';
import { compileFilter, filterIndices } from '../filter/compile.js';
import { canNarrow, compileQuick, quickWords } from '../filter/quick.js';
import { idOfDataKey, isDataKey, type RowIdInput, type RowKey } from '../ids.js';
import type { DataNode } from '../row/node.js';
import type { Problem } from '../problems.js';
import { flatDisplayed, type DisplayedRows } from '../row/displayed.js';
import { createRowStore, type RowSnapshot, type RowStore, type RowTransaction, type TransactionResult } from '../row/store.js';

/** The store behind a client model — for the grid's own layers, through `@dzgrid/core/internal`. */
export const storeOf = <T>(m: ClientModel<T>): RowStore<T> => (m as unknown as { [STORE]: RowStore<T> })[STORE];
const STORE = Symbol('dzgrid.store');
import { sortIndices } from '../sort/compile.js';
import { ctxKey, type LocaleCtx } from '../value/locale.js';
import { dayAt, hasRelative } from '../value/relative.js';
import { ColumnCache, type ColumnEnv } from './column-cache.js';
import { canonical, EMPTY_QUERY, type Query } from './query.js';
import type { ChangeSource } from './types.js';
import type { Operations, OperationsInput } from './operations.js';
import type { AbortHandle } from '../abort.js';
import { checkPage, pageCountOf, pageOf, resizeIndex, resolvePageOptions, type PageOptions, type PageState } from './page.js';
import { problem } from '../problems.js';
import { closedValues, EMPTY_LIST, tickedIn, ValuesBox, type ValuesHandle, type ValuesOptions } from './values.js';

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
  /** `expand`: rows opened or closed (a shape's flatten again, nothing filtered or sorted again). */
  readonly kind: 'rows' | 'order' | 'query' | 'context' | 'page' | 'status' | 'expand';
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
  /** Every row the query matches, on every page, in screen order: what a CSV of `all` writes. None on server pages. */
  readonly allRows?: DisplayedRows<T> | undefined;
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
  /**
   * A column's value list (value-list.md), kept fresh while open: from the
   * rows held when the filter runs in the browser, from the source's `values`
   * when it runs on a server. One per column: asking again closes the first.
   */
  setValues?(column: string, o?: ValuesOptions): ValuesHandle;
  /** Looks at the clock again: a date shortcut whose days moved (midnight in the grid's zone) filters or asks again, once. */
  tick?(): void;
  /** With a shape (a tree, details): the rows the user opened, kept apart from the query (D1). */
  readonly expansion?: ReadonlySet<RowKey>;
  /** Whether a row shows open now: under a filter, ancestors of matches open by themselves (tree-filter.md). */
  isExpanded?(key: RowKey): boolean;
  /** Replaces the rows opened (and drops the toggles made under a filter): shown again, never filtered or sorted again. */
  setExpansion?(set: ReadonlySet<RowKey>, source?: ChangeSource): void;
  /** Opens or closes rows as shown: the user's set, or under a filter a layer of its own, gone when it clears. The rows whose state changed. */
  expand?(rows: readonly RowKey[], expanded: boolean, source?: ChangeSource): readonly RowKey[];
  /** The rows that have children, above a depth (1: the roots only). */
  expandable?(depth?: number): readonly RowKey[];
  /**
   * Opens the rows with children above `depth`, or closes those from `depth` down (all: Infinity).
   * Under a filter, through its layer, over the rows it keeps: the user's set is left alone. The
   * rows whose state changed.
   */
  expandAll?(expanded: boolean, depth?: number, source?: ChangeSource): readonly RowKey[];
  subscribe(fn: (c: ModelChange<T>) => void): () => void;
  destroy(): void;
}

/** A list asked for a column that does not exist or cannot be filtered: closed, with its problem. */
export const refusedValues = (col: { filterable: boolean } | undefined, column: string): ValuesHandle | null =>
  col?.filterable ? null : closedValues([problem(col ? 'invalid-filter' : 'unknown-column', 'error', `values.${column}`)]);

export interface SearchWarmup {
  /** Builds up to `maxCells` cells; true when done (finished, given up or cancelled). */
  step(maxCells: number): boolean;
  /** 0 to 1. */
  readonly progress: number;
  cancel(): void;
}

/** What a shape is built from, each time the rows shown change. */
export interface ShapeInput<T> {
  readonly snap: RowSnapshot<T>;
  /** Every row sorted for a tree (ancestors keep their place among their siblings), the matches for details (the page's, when paged); null: the source order. */
  readonly order: Uint32Array | null;
  /** 1 for a row the filters and the search match; null when none is active. */
  readonly matched: Uint8Array | null;
  readonly filterActive: boolean;
  /** The rows the user opened. */
  readonly expansion: ReadonlySet<RowKey>;
  /** Under a filter, the rows opened or closed meanwhile (over the user's set and the ancestors of matches); null otherwise. */
  readonly layer: ReadonlyMap<RowKey, boolean> | null;
  /** Set by a toggle: the only keys whose state changed since the last build (nothing else did). */
  readonly changed?: readonly RowKey[];
  readonly version: number;
}

/**
 * How the rows are shown when they are not a flat list (Phase 4, D2): a tree (`@dzgrid/core/tree`)
 * or details under their masters. Set once, at creation. Opening a row builds again from the same
 * order and matches, by identity: a shape keeps what did not change.
 */
export interface RowShape<T> {
  readonly kind: 'tree' | 'detail';
  /** What is open at the first non-empty load: nothing, everything, or the levels above a depth. */
  readonly initial?: 'none' | 'all' | number;
  build(input: ShapeInput<T>): DisplayedRows<T>;
  /** Every row the filters keep, all open: what a CSV of `all` writes. */
  all?(): DisplayedRows<T>;
  /** The rows that have children, above `depth`; `shown`: those showing children in the last build (under a filter, kept ones). */
  parents?(snap: RowSnapshot<T>, depth: number, shown?: boolean): readonly RowKey[];
  /** Whether a row is open in the last build. */
  isOpen?(key: RowKey): boolean;
  /** Whether a row shows children when open, in the last build: opening one that does not is a no-op (tree-view.md). */
  opens?(key: RowKey): boolean;
  /** What the last build bent (an orphan, a cycle). */
  readonly problems: readonly Problem[];
  /** Nested rows made flat before the store (a tree's `children`): a load, then each transaction. */
  load?(rows: Iterable<T>, id: (row: T) => RowIdInput): Iterable<T>;
  tx?(tx: RowTransaction<T>, id: (row: T) => RowIdInput, snap: RowSnapshot<T>): RowTransaction<T>;
  /** After a change: what each open key becomes (a path tree's row taking a filler's place, or the reverse); null: unchanged. */
  rekey?(snap: RowSnapshot<T>): ((key: RowKey) => RowKey) | null;
  /** Called once by the model it is handed to (lazy children, tree-lazy.md): the model, and how to show its rows again. */
  attach?(model: ClientModel<T>, redraw: () => void): void;
  /** Called first by `invalidate` (a refresh): what the shape brought is dropped. */
  refresh?(): void;
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
  /** The clock, milliseconds since 1970 UTC: what a date shortcut counts from (filter-relative.md). Absent: a shortcut is refused. */
  readonly now?: () => number;
  /** A tree or details (D2). A tree refuses browser pages (`unsupported-combination`). */
  readonly shape?: RowShape<T>;
}

export interface ClientModel<T> extends RowModel<T> {
  readonly kind: 'client';
  /** Every row the query matches, across pages; the displayed rows when not paged. */
  readonly allRows: DisplayedRows<T>;
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
  setValues(column: string, o?: ValuesOptions): ValuesHandle;
  /**
   * Prepares the quick search's haystacks a few cells at a time, for idle
   * time (D13): afterwards the first keystroke builds nothing. Given up when
   * the rows, the columns, the language or the reader change.
   */
  warmSearch(): SearchWarmup;
  /** At midnight in the grid's zone (or whenever): filters again only if a shortcut's day changed, told as a query change. */
  tick(): void;
  isExpanded(key: RowKey): boolean;
  setExpansion(set: ReadonlySet<RowKey>, source?: ChangeSource): void;
  expand(rows: readonly RowKey[], expanded: boolean, source?: ChangeSource): readonly RowKey[];
  expandable(depth?: number): readonly RowKey[];
  expandAll(expanded: boolean, depth?: number, source?: ChangeSource): readonly RowKey[];
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
    /** Value lists: distinct indexes built, counts made under a set of other filters. */
    readonly indexBuilds: number;
    readonly countBuilds: number;
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
  const shape = o.shape;
  const tree = shape?.kind === 'tree';
  // A tree is not paged (D2): the tree is shown whole, and told. Details are: a page's masters, each with its detail.
  const pageRefused = tree && o.page !== undefined;
  const paging = resolvePageOptions(pageRefused ? undefined : o.page);
  const shapeProblems: readonly Problem[] = pageRefused ? [problem('unsupported-combination', 'warning', 'pagination', 'tree')] : [];
  /** The rows the user opened (changed in place by a toggle); under a filter, a layer of toggles of its own, tied to that filter. */
  let open = new Set<RowKey>();
  let layer: Map<RowKey, boolean> | null = null;
  let layerOf = '';
  let opened = false;
  /** The host or the user set the expansion: the shape's `initial` no longer applies. */
  let touched = false;
  /** The filter stage a shape's rows were last built from. */
  let shownFrom: unknown = null;
  const pageCfg = paging.config;
  let pageSize = pageCfg?.size ?? 0;
  let pageIndex = 0;

  /** What a stage's result depends on, besides the rows. */
  interface Inputs { snap: number; colsRef: ColumnLookup<T>; cols: number; ctx: string; reader: number; filter: string; quick: string; quickCols: string; day: string }
  let filtered: { in: Inputs; words: readonly string[]; order: Uint32Array | null; mask: Uint8Array | null; problems: readonly Problem[] } | null = null;
  let sorted: { in: Inputs; sort: string; input: Uint32Array | null; order: Uint32Array | null; problems: readonly Problem[] } | null = null;
  let displayed: DisplayedRows<T>;
  /** Paged: every sorted row, made when asked, dropped by the next show(). */
  let all: DisplayedRows<T> | null = null;
  /** The filters that apply, as a key, for a filter model under these columns and context. */
  let applied: { f: unknown; in: Inputs; m: FilterModel; key: string } | null = null;
  const appliedOf = (f: Query['filter']): NonNullable<typeof applied> => {
    const now = inputs();
    if (!applied || applied.f !== f || applied.in.colsRef !== now.colsRef || applied.in.cols !== now.cols || applied.in.ctx !== now.ctx) {
      const m = compileFilter(f, env(), o.filterKinds).applied;
      applied = { f, in: now, m, key: canonical(m) };
    }
    return applied;
  };
  const appliedKey = (f: Query['filter']): string => appliedOf(f).key;

  // The clock is read only by a compile that meets a shortcut.
  const env = (): ColumnEnv<T> => ({ source: store.snapshot, columns, ctx, reader, cache, get now() { return o.now?.(); } });
  /**
   * Today in the grid's zone when a filter holds a shortcut (hasRelative, by the filter's identity),
   * '' otherwise: the clock is read then only, and the day kept until it ends, the zone changes or the
   * clock goes back. A clock that reads no day is kept for nothing: the next call reads it again.
   */
  let today: { zone: string; at: number; day: string; until: number } | null = null;
  let held: { f: unknown; has: boolean } = { f: undefined, has: false };
  const dayOf = (f: Query['filter']): string => {
    if (held.f !== f) held = { f, has: hasRelative(f) };
    if (!o.now || !held.has) return '';
    const t = o.now();
    if (!today || today.zone !== ctx.timeZone || !(t >= today.at && t < today.until)) {
      const r = dayAt(t, ctx.timeZone);
      today = r && { zone: ctx.timeZone, at: t, day: r.day, until: r.until };
    }
    return today?.day ?? '';
  };
  /** The columns a search reads. */
  const visibleIds = (): string => columns.visible().map((c) => c.id).join(',');
  const inputs = (filter = canonical(query.filter)): Inputs => ({
    snap: store.snapshot.version,
    colsRef: columns,
    // Data, not layout: resizing a column must not filter and sort again.
    cols: columns.dataVersion,
    ctx: ctxKey(ctx),
    reader: reader.version,
    filter,
    quick: query.quick,
    quickCols: visibleIds(),
    day: dayOf(query.filter),
  });
  /** `quick`: all but the search; `query`: the data only (a tree's sort, over every row). */
  const same = (a: Inputs, b: Inputs, ignore?: 'quick' | 'query'): boolean =>
    a.snap === b.snap && a.colsRef === b.colsRef && a.cols === b.cols && a.ctx === b.ctx && a.reader === b.reader &&
    (ignore === 'query' || (a.filter === b.filter && a.day === b.day && a.quickCols === b.quickCols && (ignore === 'quick' || a.quick === b.quick)));

  /** Runs the stages whose inputs changed; true when the displayed rows changed. */
  const run = (): boolean => {
    const now = inputs();
    if (!filtered || !same(filtered.in, now)) {
      d.filterRuns++;
      const e = env();
      const f = compileFilter(query.filter, e, o.filterKinds);
      applied = { f: query.filter, in: now, m: f.applied, key: canonical(f.applied) };
      const words = quickWords(query.quick);
      const q = compileQuick(query.quick, columns.visible(), e);
      // Typing on: when only the search changed and its words narrow the old ones, search the old matches.
      const within = filtered && same(filtered.in, now, 'quick') && canNarrow(filtered.words, words) ? filtered.order : null;
      const order = filterIndices(store.snapshot.count, [f, q], within);
      filtered = { in: now, words, order, mask: maskOf(order, store.snapshot.count), problems: f.problems };
    }
    const sortKey = canonical(query.sort);
    // A tree sorts every row: an ancestor shown for its matches keeps its place among its siblings,
    // and another filter sorts nothing again.
    const input = tree ? null : filtered.order;
    if (sorted && same(sorted.in, now, tree ? 'query' : undefined) && sorted.sort === sortKey && sorted.input === input) {
      if (!shape || shownFrom === filtered) return false;
    } else {
      d.sortRuns++;
      const r = query.sort.length ? sortIndices(query.sort, input, env()) : { order: input, problems: [] };
      sorted = { in: now, sort: sortKey, input, order: r.order, problems: r.problems };
    }
    show();
    return true;
  };

  const filteredCount = (): number => (filtered?.order ? filtered.order.length : store.size);
  /** The displayed rows: all the sorted ones, or the current page of them (the index clamped); a shape's over them. */
  const show = (changed?: readonly RowKey[]): void => {
    d.displayedBuilds++;
    all = null;
    let order = sorted!.order;
    if (pageCfg) {
      d.pageCuts++;
      const total = filteredCount();
      pageIndex = Math.min(pageIndex, pageCountOf(total, pageSize) - 1);
      const start = pageIndex * pageSize;
      const end = Math.min(total, start + pageSize);
      if (order) order = order.subarray(start, end);
      else {
        order = new Uint32Array(end - start);
        for (let i = 0; i < order.length; i++) order[i] = start + i;
      }
    }
    if (shape) {
      const f = filtered!;
      shownFrom = f;
      // The toggles made under a filter belong to it: another filter, or none, drops them.
      const of = f.order ? `${f.in.filter}|${f.words.join(' ')}` : '';
      if (of !== layerOf) (layer = null), (layerOf = of);
      if (!opened && store.size > 0) {
        opened = true;
        const initial = shape.initial;
        // Only when the host set nothing before (tree-view.md).
        if (!touched && initial !== undefined && initial !== 'none') open = new Set(shape.parents?.(store.snapshot, initial === 'all' ? Infinity : initial) ?? []);
      }
      displayed = shape.build({ snap: store.snapshot, order, matched: f.mask, filterActive: f.order !== null, expansion: open, layer, version: ++version, ...(changed && { changed }) });
      return;
    }
    displayed = flatDisplayed(store.snapshot, order, ++version);
  };

  /** A shape's problems last told: told again only when they change. */
  let shapeSaid = '';
  let shapeSeen: readonly Problem[] | null = null;
  const notify = (kind: ModelChange<T>['kind'], source: ChangeSource, transaction?: TransactionResult, told?: readonly Problem[]): void => {
    if (destroyed) return;
    // Tied to the structure: the same list (a toggle, a filter) is not read again.
    const sp = shape?.problems ?? [];
    if (sp !== shapeSeen) {
      shapeSeen = sp;
      const now = said(sp);
      if (now !== shapeSaid && sp.length) told = [...(told ?? []), ...sp];
      shapeSaid = now;
    }
    const c: ModelChange<T> = { source, displayed, kind, problems: currentProblems(), ...(transaction && { transaction }), ...(told && { told }) };
    for (const fn of [...listeners]) fn(c);
    for (const b of lists.values()) b.run();
  };

  /** The open value lists, by column: each recomputes after every change, and tells only when its list changed. */
  const lists = new Map<string, ValuesBox>();
  const listOf = (column: string, search: string, max: number | undefined) => {
    const col = columns.get(column);
    if (!col?.filterable) return EMPTY_LIST;
    // The other filters: every column's but this one's, whole, as they apply (a half-typed one counts
    // nothing again); the search over the columns it reads.
    const others = { ...query.filter };
    const counted = { ...appliedOf(query.filter).m };
    delete others[column];
    delete counted[column];
    const words = quickWords(query.quick);
    return cache.distinct(col, env(), {
      search,
      ...(max !== undefined && { max }),
      selected: tickedIn(query.filter, column),
      others: {
        // The columns a search reads are data too: showing or hiding one moves `dataVersion`;
        // another lookup brings other column objects, which rebuild the index and its counts.
        key: canonical([counted, words, columns.dataVersion, dayOf(query.filter)]),
        test: () => {
          const e = env();
          const f = compileFilter(others, e, o.filterKinds);
          const qt = compileQuick(query.quick, columns.visible(), e);
          return f.active || qt.active ? (src) => f.test(src) && qt.test(src) : null;
        },
      },
    });
  };
  let loadProblems: readonly Problem[] = [];
  const currentProblems = (): readonly Problem[] => [...shapeProblems, ...paging.problems, ...loadProblems, ...(shape?.problems ?? []), ...(filtered?.problems ?? []), ...(sorted?.problems ?? [])];

  /** A sort column's key array for the current generation. */
  const keysOf = (col: NonNullable<ReturnType<ColumnLookup<T>['get']>>): Float64Array => {
    const e = env();
    return col.codec.keyKind === 'number' ? cache.keys(col, e).keys : cache.ranks(col, e).ranks;
  };

  /** After a transaction: an update re-tests only its rows; anything else recomputes. */
  const afterTransaction = (r: TransactionResult, source: ChangeSource): void => {
    loadProblems = r.problems;
    if (r.kind === 'none') return;
    // The keys of removed rows leave what is open (a reload: those whose rows are gone).
    if (shape) {
      const re = shape.rekey?.(store.snapshot);
      if (re) {
        open = new Set([...open].map(re));
        if (layer) layer = new Map([...layer].map(([k, v]) => [re(k), v]));
      }
      const gone = r.kind === 'delta' ? new Set(r.removed) : null;
      // Removed and added again in one transaction: kept.
      const left = (k: RowKey) => (!gone || gone.has(k)) && isDataKey(k) && !store.get(k);
      for (const k of [...open]) if (left(k)) open.delete(k);
      if (layer) for (const k of [...layer.keys()]) if (left(k)) layer.delete(k);
    }
    const delta = store.lastDelta;
    const follow = () => cache.patch(delta, store.snapshot, () => ({ columns, ctx, reader }));
    // A new day since the last run (a shortcut, before the tick): everything again.
    if (delta.kind !== 'update' || !delta.changedSrc || !filtered || !sorted || filtered.in.day !== inputs().day) {
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

  /** Rows as the store takes them: a shape's nested rows made flat first. */
  const flat = (rows: Iterable<T>): Iterable<T> => shape?.load?.(rows, o.getRowId) ?? rows;
  loadProblems = store.replaceAll(flat(o.rows)).problems;
  run();
  shapeSeen = shape?.problems ?? null;
  shapeSaid = said(shapeSeen ?? []);
  const isExpanded = (key: RowKey): boolean => (shape?.isOpen ? shape.isOpen(key) : (layer?.get(key) ?? open.has(key)));
  function setExpansion(set: ReadonlySet<RowKey>, source: ChangeSource = 'api'): void {
    if (!shape) return;
    touched = true;
    open = new Set(set);
    layer = null;
    show();
    notify('expand', source);
  }
  /** Opens or closes rows as shown; a row that shows no children is left alone (tree-view.md). */
  function expand(keys: readonly RowKey[], expanded: boolean, source: ChangeSource = 'api'): readonly RowKey[] {
    if (!shape) return [];
    const changed = [...new Set(keys)].filter((k) => isExpanded(k) !== expanded && (shape.opens?.(k) ?? true));
    if (!changed.length) return changed;
    touched = true;
    // The filter's layer is a tree's (tree-filter.md); a detail stays open whatever the query (D1).
    if (tree && filtered!.order) {
      layer ??= new Map();
      for (const k of changed) layer.set(k, expanded);
    } else for (const k of changed) expanded ? open.add(k) : open.delete(k);
    show(changed);
    notify('expand', source);
    return changed;
  }

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
      return canonical({ filter: appliedKey(q.filter), day: dayOf(q.filter), quick: words.join(' '), zone: ctx.timeZone, cols: words.length ? columns.visible().map((c) => c.id).sort().join(',') : null });
    },
    matches: (key) => {
      const src = store.snapshot.lookup(idOfDataKey(key) ?? '');
      return src !== -1 && (!filtered?.mask || filtered.mask[src] === 1);
    },
    get scope() { return { params: NO_PARAMS, zone: ctx.timeZone }; },
    row: (key) => store.get(key),
    get query() { return query; },
    get displayed() { return displayed; },
    // A shape without its own (details): the filtered, sorted rows, never a detail.
    get allRows() { return shape?.all?.() ?? (shape || pageCfg ? (all ??= flatDisplayed(store.snapshot, sorted!.order, version)) : displayed); },
    // Undefined without a shape: the kernel then refuses to expand.
    get expansion() { return shape ? open : (undefined as never); },
    isExpanded,
    setExpansion,
    expand,
    expandable: (depth = Infinity) => shape?.parents?.(store.snapshot, depth) ?? [],
    expandAll(expanded, depth = Infinity, source = 'api') {
      if (!shape) return [];
      const parents = (d: number) => shape.parents?.(store.snapshot, d, true) ?? [];
      // Collapse all, unfiltered (details: always): the set emptied (keys of rows without children too).
      if (!expanded && depth === Infinity && !(tree && filtered!.order)) {
        const changed = [...open];
        if (changed.length) setExpansion(new Set(), source);
        return changed;
      }
      // Otherwise toggles over the rows with children above `depth`, or from `depth` down: under a
      // filter through its layer, over the rows it keeps (tree-filter.md).
      const above = new Set(parents(expanded || depth < Infinity ? depth : 0));
      return expand(expanded ? [...above] : parents(Infinity).filter((k) => !above.has(k)), expanded, source);
    },
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
      const st = cache.stats;
      return { ...d, keyBuilds: st.keyBuilds, rankBuilds: st.rankBuilds, quickScanned: st.quickScanned, displayBuilds: st.displayBuilds, foldBuilds: st.foldBuilds, indexBuilds: st.indexBuilds, countBuilds: st.countBuilds };
    },
    setValues(column, vo = {}) {
      lists.get(column)?.close();
      const refused = refusedValues(columns.get(column), column);
      if (refused) return refused;
      const b: ValuesBox = new ValuesBox(true, String(vo.search ?? '').trim(), () => {
        b.result = listOf(column, b.q, vo.max);
        b.ping();
      }, () => lists.delete(column));
      b.run();
      lists.set(column, b);
      return b;
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
    tick() {
      const was = said(filtered!.problems);
      if (!run()) return;
      const now = filtered!.problems;
      notify('query', 'data', undefined, now.length && said(now) !== was ? now : undefined);
    },
    // keepScroll is the DOM's concern; the model has no scroll to keep.
    invalidate() {
      shape?.refresh?.();
      cache.invalidateAll();
      filtered = null;
      sorted = null;
      run();
      notify('rows', 'api');
    },
    setRows: (rows, source = 'host') => transact(() => store.replaceAll(flat(rows)), source),
    applyTransaction: (tx, source = 'host') => transact(() => store.apply(shape?.tx?.(tx, o.getRowId, store.snapshot) ?? tx), source),
    setColumns(next, source = 'host') {
      columns = next;
      if (run()) notify('context', source);
      else for (const b of lists.values()) b.run();
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
      for (const b of [...lists.values()]) b.close();
    },
  };
  shape?.attach?.(model, () => (show(), notify('expand', 'data')));
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
  /** The clock (milliseconds since 1970 UTC), for date shortcuts: sent resolved, and run in the browser (filter-relative.md). */
  readonly now?: () => number;
  /** A tree (a feature's shape): the rows the server sends are shown as one (tree-lazy.md). */
  readonly shape?: RowShape<T>;
}

/** A model to make once the grid knows its columns and language. */
export interface SourceBinding<T> {
  create(env: ModelEnv<T>): SourceHandle<T>;
}

export interface SourceHandle<T> extends RowModel<T> {
  readonly kind: 'source';
  /** Another source, live: a new epoch, the first page, the old rows shown stale until the answer. */
  setSource(next: SourceBinding<T>, source?: ChangeSource): void;
  /** Looks at the clock again: a shortcut's wire form made again, a request (a new epoch) only if it changed. */
  tick(): void;
}
