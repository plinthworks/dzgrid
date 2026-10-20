import type { ColumnModel, ColumnState } from './columns/model.js';
import type { ColumnOrGroup } from './columns/defs.js';
import type { LocaleCtx } from './value/locale.js';
import { reconcileFocus, sameFocus, type FocusOwner, type FocusPos } from './focus.js';
import type { RowKey } from './ids.js';
import type { ModelChange, RowModel, RowScope } from './model/client.js';
import { isJson, type ColumnFilter, type FilterModel } from './filter/model.js';
import { canonical, makeQuery, type Query } from './model/query.js';
import { checkPage, samePage, type PageState } from './model/page.js';
import type { ChangeSource } from './model/types.js';
import { problem, type Problem } from './problems.js';
import type { DisplayedRows } from './row/displayed.js';
import type { RowNode } from './row/node.js';
import {
  clearSelection, isSelected, NO_SELECTION, reconcileSelection, selectionCount, selectOnly, selectRange, toggle, type SelectionState,
} from './selection/rows.js';
import type { SortItem } from './sort/compile.js';
import { nextSort } from './sort/toggle.js';
import { closedValues, type ValuesHandle, type ValuesOptions } from './model/values.js';

/**
 * The grid's state outside the DOM: the query (sort), the selection and its
 * anchor, and the focus. Everything that changes it is a command; everything
 * it changes is an event carrying who caused it (§3.17). The scroll position
 * is the DOM's.
 */
export type GridCommand =
  | { readonly type: 'sort.toggle'; readonly column: string; readonly multi: boolean }
  | { readonly type: 'sort.set'; readonly sort: readonly SortItem[] }
  | { readonly type: 'query.set'; readonly query: Query }
  | { readonly type: 'selection.toggle'; readonly row: RowKey }
  | { readonly type: 'selection.only'; readonly row: RowKey }
  | { readonly type: 'selection.range'; readonly target: RowKey; readonly additive: boolean }
  | { readonly type: 'selection.allDisplayed' }
  | { readonly type: 'selection.clear' }
  | { readonly type: 'selection.set'; readonly selection: SelectionState }
  | { readonly type: 'column.resize'; readonly column: string; readonly width: number; readonly finished: boolean }
  | { readonly type: 'column.state'; readonly patch: readonly ColumnState[] }
  | { readonly type: 'focus.set'; readonly focus: FocusPos | null }
  | { readonly type: 'filter.set'; readonly filter: FilterModel }
  | { readonly type: 'filter.column'; readonly column: string; readonly filter: ColumnFilter | null }
  | { readonly type: 'quick.set'; readonly text: string }
  /** Select all, as the model means it: the displayed rows, or the whole query on a server. */
  | { readonly type: 'selection.all' }
  /**
   * Every row the filters and the search match, on every page: everything-except, tied
   * to them, when the rows are paged (on server pages, `selection.all`); the displayed
   * rows otherwise (`selection.allDisplayed`). Nothing matching clears the selection.
   */
  | { readonly type: 'selection.allFiltered' }
  /** Whether a filter or search change keeps an include selection (true by default; the owner's `keepOnFilter`). */
  | { readonly type: 'selection.keepOnFilter'; readonly keep: boolean }
  /** Fetch or compute again (a server's retry). */
  | { readonly type: 'rows.refresh' }
  /** New column definitions from the host; what the user set (widths, order) is kept by id. */
  | { readonly type: 'columns.set'; readonly defs: readonly ColumnOrGroup<any>[] }
  | { readonly type: 'context.set'; readonly ctx: LocaleCtx }
  /** Another page (from 0; past the end shows the last), or another page size. */
  | { readonly type: 'page.go'; readonly index: number }
  | { readonly type: 'page.size'; readonly size: number };

export type GridCommandResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: string; readonly problems: readonly Problem[] };

export type GridEvent<T> =
  | { readonly type: 'modelUpdated'; readonly source: ChangeSource; readonly displayed: DisplayedRows<T>; readonly kind: ModelChange<T>['kind'] }
  | { readonly type: 'sortChanged'; readonly source: ChangeSource; readonly sort: readonly SortItem[] }
  /**
   * `query` and `scope`: the query, params and zone an everything-except selection stands
   * for (a host's bulk action sends them with the excluded keys); null otherwise. `reason`:
   * `scope-changed` when it was cleared because they changed (or, with `keepOnFilter` off, a
   * filter or the search did), `rows-dropped` when selected rows left the model.
   */
  | {
      readonly type: 'selectionChanged'; readonly source: ChangeSource; readonly selection: SelectionState; readonly count: number | null;
      readonly query: Query | null; readonly scope: RowScope | null; readonly reason: SelectionReason | null;
    }
  | { readonly type: 'filterChanged'; readonly source: ChangeSource; readonly filter: FilterModel }
  | { readonly type: 'quickChanged'; readonly source: ChangeSource; readonly text: string }
  | { readonly type: 'columnResized'; readonly source: ChangeSource; readonly column: string; readonly width: number; readonly finished: boolean }
  | { readonly type: 'columnsChanged'; readonly source: ChangeSource; readonly changed: readonly string[]; readonly layoutChanged: boolean }
  | { readonly type: 'focusChanged'; readonly source: ChangeSource; readonly focus: FocusPos | null }
  | { readonly type: 'cellClicked'; readonly source: 'user'; readonly row: RowNode<T>; readonly column: string }
  | { readonly type: 'rowClicked'; readonly source: 'user'; readonly row: RowNode<T> }
  | { readonly type: 'problems'; readonly source: ChangeSource; readonly problems: readonly Problem[] }
  | { readonly type: 'firstDataRendered'; readonly source: 'data' }
  /** The page, its size or what it counts changed (a filter sends it back to the first page). */
  | { readonly type: 'pageChanged'; readonly source: ChangeSource; readonly page: PageState }
  /** The latest request failed: the host's error unchanged; the rows shown stay, under the error overlay. */
  | { readonly type: 'fetchFailed'; readonly source: 'data'; readonly error: unknown; readonly key: string; readonly page: number | null };

export type SelectionReason = 'scope-changed' | 'rows-dropped';

/** What an everything-except selection stands for now: the query in force (its sort too), the params and the zone. */
export interface SelectionScope extends RowScope {
  readonly query: Query;
}

export interface GridKernel<T, M extends RowModel<T> = RowModel<T>> {
  readonly rows: M;
  readonly columns: ColumnModel<T>;
  /** The query: the kernel's own, pushed to the model (D1). */
  readonly query: Query;
  readonly selection: SelectionState;
  readonly anchor: RowKey | null;
  readonly focus: FocusPos | null;
  /** Non-null only for an everything-except selection tied to the query: what a host's bulk action reads. */
  readonly selectionScope: SelectionScope | null;
  /** The select-all box: over the displayed rows, or over the whole query on server pages (what its click acts on). */
  readonly headerState: HeaderSelection;
  dispatch(cmd: GridCommand, source: ChangeSource): GridCommandResult;
  /**
   * A column's value list (value-list.md): the model's, or a closed one when
   * it has none. Not a command: it changes no state. Its new problems are told
   * once (`problems`, source `data`).
   */
  values(column: string, o?: ValuesOptions): ValuesHandle;
  /**
   * Looks at the clock again (`RowModel.tick`): at midnight in the grid's zone a date shortcut's days
   * move (filter-relative.md). `@dzgrid/dom/filters` calls it; a host without that feature calls it itself.
   */
  tick(): void;
  subscribe(fn: (e: GridEvent<T>) => void): () => void;
  destroy(): void;
}

const OK: GridCommandResult = { ok: true };
const refuse = (reason: string, problems: readonly Problem[] = []): GridCommandResult => ({ ok: false, reason, problems });

/** For the DOM layer, through `@dzgrid/core/internal`: events the kernel cannot see (clicks, first render). */
export const EMIT = Symbol('dzgrid.emit');
/** For the DOM spans feature, through `@dzgrid/core/internal`: where a reconciled cell focus belongs. */
const OWNER = Symbol('dzgrid.owner');

export function createKernel<T, M extends RowModel<T> = RowModel<T>>(o: {
  readonly rows: M;
  readonly columns: ColumnModel<T>;
  readonly query?: Query;
  /** False: a filter or search change clears the selection (the owner's `keepOnFilter`). True by default. */
  readonly keepSelectionOnFilter?: boolean;
}): GridKernel<T, M> {
  const { rows, columns } = o;
  let query: Query = o.query ?? makeQuery();
  if (o.query) rows.setQuery(query, 'host');
  let selection: SelectionState = NO_SELECTION;
  /**
   * Which rows an everything-except selection stands for: the model's
   * membership of the query at that moment (filters, search, params, zone;
   * not the sort, which changes no row's membership). Another membership
   * drops it: "all" meant all the rows of that one.
   */
  let allOf: string | null = null;
  let keepOnFilter = o.keepSelectionOnFilter !== false;
  let anchor: RowKey | null = null;
  let focus: FocusPos | null = null;
  let owner: FocusOwner<T> | undefined;
  let shown = rows.displayed;
  let lastPage: PageState | null = rows.page;
  let destroyed = false;
  const listeners = new Set<(e: GridEvent<T>) => void>();
  // Events queue: a listener that dispatches while being told does not make
  // the others hear the new event before the old one. Each event goes to the
  // listeners subscribed when it is delivered.
  const queue: GridEvent<T>[] = [];
  let draining = false;
  const emit = (e: GridEvent<T>): void => {
    queue.push(e);
    if (draining) return;
    draining = true;
    try {
      for (let ev = queue.shift(); ev; ev = queue.shift()) {
        for (const fn of [...listeners]) if (listeners.has(fn)) fn(ev);
      }
    } finally {
      draining = false;
      queue.length = 0;
    }
  };

  const sameSelection = (a: SelectionState, b: SelectionState): boolean => {
    if (a === b) return true;
    if (a.mode !== b.mode || a.keys.size !== b.keys.size) return false;
    for (const key of a.keys) if (!b.keys.has(key)) return false;
    return true;
  };
  /** State first, then the event: whoever hears it reads the new state. */
  // Everything-except over the rows the filters match: their count, not the total's. In the
  // browser, less the unticked rows that match (one the filters hide takes nothing away);
  // on server pages, less every unticked key.
  const countNow = (): number | null => {
    const n = allOf !== null ? rows.counts.filtered : rows.counts.total;
    if (allOf === null || n === null || !rows.matches) return selectionCount(selection, n);
    let c = n;
    for (const key of selection.keys) if (rows.matches(key)) c--;
    return c;
  };
  /** The count last told: an everything-except selection is told again when a server's answer moves it. */
  let toldCount: number | null = null;
  const tied = (): boolean => selection.mode === 'exclude' && allOf !== null;
  const changed = (source: ChangeSource, reason: SelectionReason | null = null): GridEvent<T> => ({
    type: 'selectionChanged', source, selection,
    count: (toldCount = countNow()),
    query: tied() ? query : null,
    scope: tied() ? rows.scope : null,
    reason,
  });
  /** "All" stood for other rows than the query matches now: cleared (state only; the caller tells). */
  const dropStale = (membership: () => string): boolean => {
    if (!tied() || allOf === membership()) return false;
    selection = clearSelection();
    allOf = null;
    anchor = null;
    return true;
  };
  const setSelection = (s: SelectionState, source: ChangeSource): void => {
    if (sameSelection(s, selection)) return;
    selection = s;
    if (selection.mode !== 'exclude') allOf = null;
    emit(changed(source));
  };
  const setFocus = (f: FocusPos | null, source: ChangeSource): void => {
    if (sameFocus(f, focus)) return;
    focus = f;
    emit({ type: 'focusChanged', source, focus });
  };
  // Which selected keys survive a change is the model's to say: a server keeps rows of other pages.
  const exists = (key: RowKey): boolean => rows.keeps(key);

  /**
   * After the rows or the columns moved: what no longer exists lets go —
   * before anyone hears `modelUpdated`, so a renderer reads a focus and a
   * selection that exist. The reconciling events follow, with source `data`.
   */
  const onModel = (head: GridEvent<T> | null, source: ChangeSource = 'data'): void => {
    const prevSelection = selection;
    const prevFocus = focus;
    // The zone, the params or the columns a search reads may have moved what "all" stood for.
    const stale = dropStale(() => rows.membershipOf(query));
    if (anchor !== null && !exists(anchor)) anchor = null;
    selection = reconcileSelection(selection, exists);
    focus = reconcileFocus(focus, shown, rows.displayed, columns, owner);
    shown = rows.displayed;
    if (head) emit(head);
    // The model holds the page (its index follows the filtered count); the kernel tells it.
    const page = rows.page;
    if (!samePage(page, lastPage)) {
      lastPage = page;
      if (page) emit({ type: 'pageChanged', source, page });
    }
    if (!sameSelection(prevSelection, selection)) emit(changed('data', stale ? 'scope-changed' : selection.mode === 'include' ? 'rows-dropped' : null));
    // An everything-except selection's count follows the total: a server's answer may bring it.
    else if (selection.mode === 'exclude' && countNow() !== toldCount) emit(changed('data'));
    if (!sameFocus(prevFocus, focus)) emit({ type: 'focusChanged', source: 'data', focus });
  };

  const unsubscribe = rows.subscribe((c) => {
    onModel({ type: 'modelUpdated', source: c.source, displayed: c.displayed, kind: c.kind }, c.source);
    // Rows the host gave that were refused or bent, a server's answer bent: told, not only stored.
    const told = [...(c.transaction?.problems ?? []), ...(c.told ?? [])];
    if (told.length) emit({ type: 'problems', source: c.source, problems: told });
    if (c.failure) emit({ type: 'fetchFailed', source: 'data', ...c.failure });
  });

  const setQuery = (q: Query, source: ChangeSource): void => {
    const before = query;
    if (before.key === q.key) return;
    query = q;
    const filtered = canonical(before.filter) !== canonical(q.filter);
    const searched = before.quick !== q.quick;
    // "All" meant all the rows of that query: another membership does not inherit it.
    // With keepOnFilter off, any filter or search change clears what was selected.
    // Told before the model, so whoever hears modelUpdated reads the new selection.
    let cleared = dropStale(() => rows.membershipOf(q));
    if (!keepOnFilter && (filtered || searched) && (selection.mode === 'exclude' || selection.keys.size > 0)) {
      selection = clearSelection();
      allOf = null;
      anchor = null;
      cleared = true;
    }
    if (cleared) emit(changed('data', 'scope-changed'));
    rows.setQuery(q, source);
    if (canonical(before.sort) !== canonical(q.sort)) emit({ type: 'sortChanged', source, sort: q.sort });
    if (filtered) emit({ type: 'filterChanged', source, filter: q.filter });
    if (searched) emit({ type: 'quickChanged', source, text: q.quick });
  };
  /** Every sorted column exists and can sort; the first that does not refuses the whole sort. */
  const checkSort = (sort: readonly SortItem[]): GridCommandResult | null => {
    for (const item of sort) {
      const col = columns.get(item.column);
      if (!col) return refuse('unknown-column', [problem('unknown-column', 'error', 'sort', item.column)]);
      if (!col.sortable) return refuse('not-sortable', [problem('invalid-sort', 'error', 'sort', item.column)]);
    }
    return null;
  };
  /** Everything the query matches, never held as keys: everything-except, tied to its membership. */
  const selectQuery = (source: ChangeSource): GridCommandResult => {
    const tie = rows.membershipOf(query);
    // Already everything, nothing unticked: no change, nothing told.
    if (selection.mode === 'exclude' && selection.keys.size === 0 && allOf === tie) return OK;
    allOf = tie;
    anchor = null;
    selection = { mode: 'exclude', keys: new Set() };
    emit(changed(source));
    return OK;
  };
  const withSort = (sort: readonly SortItem[]): Query => makeQuery({ sort, filter: query.filter, quick: query.quick });

  function dispatch(cmd: GridCommand, source: ChangeSource): GridCommandResult {
    if (destroyed) return refuse('destroyed');
    switch (cmd.type) {
      case 'sort.toggle': {
        const col = columns.get(cmd.column);
        if (!col) return refuse('unknown-column', [problem('unknown-column', 'error', 'column', cmd.column)]);
        if (!col.sortable) return refuse('not-sortable', [problem('invalid-sort', 'error', 'column', cmd.column)]);
        setQuery(withSort(nextSort(query.sort, cmd.column, cmd.multi)), source);
        return OK;
      }
      case 'sort.set': {
        const bad = checkSort(cmd.sort);
        if (bad) return bad;
        setQuery(withSort(cmd.sort), source);
        return OK;
      }
      case 'query.set':
        setQuery(cmd.query, source);
        return OK;
      case 'selection.toggle':
        if (!exists(cmd.row)) return refuse('unknown-row');
        anchor = cmd.row;
        setSelection(toggle(selection, cmd.row), source);
        return OK;
      case 'selection.only':
        if (!exists(cmd.row)) return refuse('unknown-row');
        anchor = cmd.row;
        setSelection(selectOnly([cmd.row]), source);
        return OK;
      case 'selection.range': {
        if (anchor === null) return refuse('anchor-not-displayed');
        const r = selectRange(selection, rows.displayed, anchor, cmd.target, { additive: cmd.additive });
        if (!r.ok) return refuse(r.reason);
        setSelection(r.state, source);
        return OK;
      }
      case 'filter.set': {
        const next: Record<string, ColumnFilter> = {};
        for (const [col, f] of Object.entries(cmd.filter ?? {})) {
          const t = takeFilter(f, `filter.${col}`);
          if ('refused' in t) return t.refused;
          next[col] = t.filter;
        }
        setQuery(makeQuery({ sort: query.sort, filter: next, quick: query.quick }), source);
        return OK;
      }
      case 'filter.column': {
        if (!columns.get(cmd.column)) return refuse('unknown-column', [problem('unknown-column', 'error', 'filter', cmd.column)]);
        const t = cmd.filter ? takeFilter(cmd.filter, `filter.${cmd.column}`) : null;
        if (t && 'refused' in t) return t.refused;
        const next: Record<string, ColumnFilter> = { ...query.filter };
        if (!t) delete next[cmd.column];
        else next[cmd.column] = t.filter;
        setQuery(makeQuery({ sort: query.sort, filter: next, quick: query.quick }), source);
        return OK;
      }
      case 'quick.set':
        setQuery(makeQuery({ sort: query.sort, filter: query.filter, quick: cmd.text }), source);
        return OK;
      case 'columns.set': {
        const change = columns.setDefs(cmd.defs);
        if (change.problems.length) emit({ type: 'problems', source, problems: change.problems });
        if (change.changed.length) emit({ type: 'columnsChanged', source, changed: change.changed, layoutChanged: change.layoutChanged });
        const before = rows.displayed;
        rows.setColumns(columns, source);
        if (rows.displayed === before) onModel(null);
        return OK;
      }
      case 'context.set':
        rows.setContext(cmd.ctx, source);
        return OK;
      case 'page.go':
      case 'page.size': {
        const p = cmd.type === 'page.go' ? { index: cmd.index } : { size: cmd.size };
        const problems = checkPage(p);
        if (problems.length) return refuse('invalid-page', problems);
        if (!rows.page) return refuse('paging-off');
        rows.setPage(p, source);
        return OK;
      }
      case 'rows.refresh':
        rows.invalidate();
        return OK;
      case 'selection.all':
        // An all-pages selection stays one: "all" again ticks the rows unticked, never only the page.
        if (rows.selectAll === 'query' || tied()) return selectQuery(source);
        return dispatch({ type: 'selection.allDisplayed' }, source);
      case 'selection.allFiltered':
        if (rows.selectAll === 'query') return selectQuery(source);
        // Unpaged, the rows displayed are all the filtered ones: the include set (D8).
        if (rows.page === null) return dispatch({ type: 'selection.allDisplayed' }, source);
        if (rows.counts.filtered === 0) return dispatch({ type: 'selection.clear' }, source);
        return selectQuery(source);
      case 'selection.keepOnFilter':
        keepOnFilter = cmd.keep;
        return OK;
      case 'selection.allDisplayed': {
        // The client's *all* is what the filters show (D8): an include set of those keys. On pages
        // (step 17, owner Q1) the page's keys are added to what is ticked: other pages keep theirs.
        const d = rows.displayed;
        const keys: RowKey[] = rows.page && selection.mode === 'include' ? [...selection.keys] : [];
        for (let i = 0; i < d.count; i++) keys.push(d.keyAt(d.index(i)!));
        setSelection(selectOnly(keys), source);
        return OK;
      }
      case 'selection.clear':
        anchor = null;
        setSelection(clearSelection(), source);
        return OK;
      case 'selection.set':
        // A host's everything-except is tied to the filters in force, like the user's select-all.
        if (cmd.selection.mode === 'exclude') allOf = rows.membershipOf(query);
        // The anchor stays while its row exists: a host echoing the selection back must not
        // break the next Shift+click (an unticked row is still where a range starts).
        setSelection(reconcileSelection(cmd.selection, exists), source);
        return OK;
      case 'column.resize': {
        if (!columns.get(cmd.column)) return refuse('unknown-column', [problem('unknown-column', 'error', 'column', cmd.column)]);
        if (!Number.isFinite(cmd.width) || cmd.width <= 0) return refuse('invalid-width', [problem('invalid-column', 'error', 'width', String(cmd.width))]);
        const change = columns.apply([{ id: cmd.column, width: cmd.width }], source);
        // The width drawn: the layout clamps to min and max (the state keeps what was asked).
        const L = columns.layout;
        let width = cmd.width;
        for (const slice of [L.start, L.center, L.end]) {
          const i = slice.columns.findIndex((c) => c.id === cmd.column);
          if (i !== -1) width = slice.widths.sizeAt(i);
        }
        if (change.problems.length) emit({ type: 'problems', source, problems: change.problems });
        emit({ type: 'columnResized', source, column: cmd.column, width, finished: cmd.finished });
        return OK;
      }
      case 'column.state': {
        const change = columns.apply(cmd.patch, source);
        if (change.problems.length) emit({ type: 'problems', source, problems: change.problems });
        if (change.changed.length) emit({ type: 'columnsChanged', source, changed: change.changed, layoutChanged: change.layoutChanged });
        const before = rows.displayed;
        rows.setColumns(columns, source);
        // Columns can change without the rows changing (a column hidden that no filter reads):
        // the focus still has to leave a hidden column.
        if (rows.displayed === before) onModel(null);
        return OK;
      }
      case 'focus.set': {
        const f = cmd.focus;
        if (f) {
          if (!columns.visible().some((c) => c.id === f.column)) return refuse('unknown-column', [problem('unknown-column', 'error', 'focus.column', f.column)]);
          if (f.kind === 'cell' && rows.displayed.indexOf(f.row) === -1) return refuse('row-not-displayed');
        }
        // A cell a span covers (the focus owner, set by the spans feature): the cell owning it, at once.
        setFocus(f?.kind === 'cell' && owner ? owner(f, rows.displayed) : f, source);
        return OK;
      }
    }
  }

  // Read on every paint while a box shows it: kept per selection, rows shown and count.
  let header: { s: SelectionState; d: DisplayedRows<T>; n: number | null; state: HeaderSelection } | null = null;
  const headerState = (): HeaderSelection => {
    if (rows.selectAll === 'displayed') return headerSelection(selection, rows.displayed);
    const n = rows.counts.filtered;
    if (header && header.s === selection && header.d === rows.displayed && header.n === n) return header.state;
    let state: HeaderSelection;
    // Server pages: the box's click acts on the whole query, so it speaks for it.
    if (selection.mode === 'exclude') state = countNow() === 0 ? 'none' : selection.keys.size === 0 ? 'all' : 'some';
    // Include: as many keys as the query matches is not enough (they may be another query's):
    // every row shown must be ticked too.
    else state = selection.keys.size === 0 ? 'none' : n === selection.keys.size && headerSelection(selection, rows.displayed) === 'all' ? 'all' : 'some';
    header = { s: selection, d: rows.displayed, n, state };
    return state;
  };

  const kernel: GridKernel<T, M> & { [EMIT]: (e: GridEvent<T>) => void; [OWNER]: (fn?: FocusOwner<T>) => void } = {
    rows,
    columns,
    get selection() { return selection; },
    get anchor() { return anchor; },
    get focus() { return focus; },
    get query() { return query; },
    get selectionScope() { return tied() ? { query, ...rows.scope } : null; },
    get headerState() { return headerState(); },
    dispatch,
    tick: () => rows.tick?.(),
    values(column, vo) {
      const h = rows.setValues ? rows.setValues(column, vo) : closedValues();
      // Told by content, like the rows' problems: the same bad entry answered again is not told again.
      let told = '';
      const tell = (): void => {
        const now = canonical(h.problems.map((p) => [p.code, p.path, p.detail]));
        if (now !== told && h.problems.length) emit({ type: 'problems', source: 'data', problems: h.problems });
        told = now;
      };
      tell();
      h.subscribe(tell);
      return h;
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    destroy() {
      destroyed = true;
      unsubscribe();
      listeners.clear();
    },
    [EMIT]: emit,
    [OWNER]: (fn) => { owner = fn; },
  };
  return kernel;
}

/**
 * A custom state that is not JSON (a cycle, a BigInt, a function) is refused
 * before the query key is made from it: the filter in force stays.
 */
function notJson(f: ColumnFilter, path: string, depth = 0): GridCommandResult | null {
  // As deep as isJson looks: a cycle nested deeper than the filters compile must not reach the key.
  if (!f || typeof f !== 'object' || depth > 20) return null;
  if (f.type === 'custom' && !isJson(f.state)) return refuse('invalid-filter', [problem('invalid-filter', 'error', path, 'not json')]);
  if (f.type === 'combined' && Array.isArray(f.conditions)) {
    for (let i = 0; i < f.conditions.length; i++) {
      const no = notJson(f.conditions[i]!, `${path}.conditions[${i}]`, depth + 1);
      if (no) return no;
    }
  }
  return null;
}

/**
 * A filter as the grid keeps it: refused when it is not plain data (a cycle, a getter that
 * throws, a BigInt), and custom states copied once, so the key and the kind read one same state.
 */
function takeFilter(f: ColumnFilter, path: string): { readonly filter: ColumnFilter } | { readonly refused: GridCommandResult } {
  const notData = { refused: refuse('invalid-filter', [problem('invalid-filter', 'error', path, 'not json')]) };
  try {
    const no = notJson(f, path);
    if (no) return { refused: no };
    const copy = snapshot(f, 0);
    canonical(copy);
    return { filter: copy };
  } catch {
    return notData;
  }
}

function snapshot(f: ColumnFilter, depth: number): ColumnFilter {
  if (!f || typeof f !== 'object' || depth > 20) return f;
  if (f.type === 'custom') return { ...f, state: JSON.parse(JSON.stringify(f.state)) };
  if (f.type === 'combined' && Array.isArray(f.conditions)) return { ...f, conditions: f.conditions.map((c) => snapshot(c, depth + 1)) };
  return f;
}

/** Emits an event the DOM saw (a click, the first render). */
export const emit = <T>(k: GridKernel<T>, e: GridEvent<T>): void => (k as unknown as { [EMIT]: (e: GridEvent<T>) => void })[EMIT](e);

/** Sets (or, without `fn`, removes) the kernel's focus owner: the spans feature's. */
export const setFocusOwner = <T>(k: GridKernel<T>, fn?: FocusOwner<T>): void => (k as unknown as { [OWNER]: (fn?: FocusOwner<T>) => void })[OWNER](fn);

/** The header box over the displayed rows: none, some or all of them selected. */
export type HeaderSelection = 'none' | 'some' | 'all';

const headerMemo = new WeakMap<SelectionState, { displayed: DisplayedRows<unknown>; state: HeaderSelection }>();

/** Read once per selection and displayed rows: it runs on every paint while a box shows it. */
export function headerSelection<T>(s: SelectionState, d: DisplayedRows<T>): HeaderSelection {
  const hit = headerMemo.get(s);
  if (hit && hit.displayed === d) return hit.state;
  const state = readHeader(s, d);
  headerMemo.set(s, { displayed: d as DisplayedRows<unknown>, state });
  return state;
}

function readHeader<T>(s: SelectionState, d: DisplayedRows<T>): HeaderSelection {
  if (d.count === 0) return 'none';
  let selected = 0;
  if (s.mode === 'include' && s.keys.size <= d.count) {
    for (const key of s.keys) if (d.indexOf(key) !== -1) selected++;
  } else {
    for (let i = 0; i < d.count; i++) if (isSelected(s, d.keyAt(d.index(i)!))) selected++;
  }
  return selected === 0 ? 'none' : selected === d.count ? 'all' : 'some';
}
