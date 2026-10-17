import type { ColumnModel, ColumnState } from './columns/model.js';
import { reconcileFocus, sameFocus, type FocusPos } from './focus.js';
import type { RowKey } from './ids.js';
import type { ModelChange, RowModel } from './model/client.js';
import type { ColumnFilter, FilterModel } from './filter/model.js';
import { canonical, makeQuery, type Query } from './model/query.js';
import type { ChangeSource } from './model/types.js';
import { problem, type Problem } from './problems.js';
import type { DisplayedRows } from './row/displayed.js';
import type { RowNode } from './row/node.js';
import {
  clearSelection, isSelected, NO_SELECTION, reconcileSelection, selectionCount, selectOnly, selectRange, toggle, type SelectionState,
} from './selection/rows.js';
import type { SortItem } from './sort/compile.js';
import { nextSort } from './sort/toggle.js';

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
  /** Fetch or compute again (a server's retry). */
  | { readonly type: 'rows.refresh' };

export type GridCommandResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: string; readonly problems: readonly Problem[] };

export type GridEvent<T> =
  | { readonly type: 'modelUpdated'; readonly source: ChangeSource; readonly displayed: DisplayedRows<T>; readonly kind: ModelChange<T>['kind'] }
  | { readonly type: 'sortChanged'; readonly source: ChangeSource; readonly sort: readonly SortItem[] }
  /** `query`: the query an everything-except selection stands for (a host's bulk action sends both); null otherwise. */
  | { readonly type: 'selectionChanged'; readonly source: ChangeSource; readonly selection: SelectionState; readonly count: number | null; readonly query: Query | null }
  | { readonly type: 'filterChanged'; readonly source: ChangeSource; readonly filter: FilterModel }
  | { readonly type: 'quickChanged'; readonly source: ChangeSource; readonly text: string }
  | { readonly type: 'columnResized'; readonly source: ChangeSource; readonly column: string; readonly width: number; readonly finished: boolean }
  | { readonly type: 'columnsChanged'; readonly source: ChangeSource; readonly changed: readonly string[]; readonly layoutChanged: boolean }
  | { readonly type: 'focusChanged'; readonly source: ChangeSource; readonly focus: FocusPos | null }
  | { readonly type: 'cellClicked'; readonly source: 'user'; readonly row: RowNode<T>; readonly column: string }
  | { readonly type: 'problems'; readonly source: ChangeSource; readonly problems: readonly Problem[] }
  | { readonly type: 'firstDataRendered'; readonly source: 'data' };

export interface GridKernel<T, M extends RowModel<T> = RowModel<T>> {
  readonly rows: M;
  readonly columns: ColumnModel<T>;
  /** The query: the kernel's own, pushed to the model (D1). */
  readonly query: Query;
  readonly selection: SelectionState;
  readonly anchor: RowKey | null;
  readonly focus: FocusPos | null;
  dispatch(cmd: GridCommand, source: ChangeSource): GridCommandResult;
  subscribe(fn: (e: GridEvent<T>) => void): () => void;
  destroy(): void;
}

const OK: GridCommandResult = { ok: true };
const refuse = (reason: string, problems: readonly Problem[] = []): GridCommandResult => ({ ok: false, reason, problems });

/** For the DOM layer, through `@dzgrid/core/internal`: events the kernel cannot see (clicks, first render). */
export const EMIT = Symbol('dzgrid.emit');

export function createKernel<T, M extends RowModel<T> = RowModel<T>>(o: { readonly rows: M; readonly columns: ColumnModel<T>; readonly query?: Query }): GridKernel<T, M> {
  const { rows, columns } = o;
  let query: Query = o.query ?? makeQuery();
  if (o.query) rows.setQuery(query, 'host');
  let selection: SelectionState = NO_SELECTION;
  /** The query an everything-except selection stands for: any other query drops it. */
  let allOf: string | null = null;
  let anchor: RowKey | null = null;
  let focus: FocusPos | null = null;
  let shown = rows.displayed;
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
  const changed = (source: ChangeSource): GridEvent<T> => ({
    type: 'selectionChanged', source, selection,
    count: selectionCount(selection, rows.counts.total),
    query: selection.mode === 'exclude' && allOf !== null ? query : null,
  });
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
  const onModel = (head: GridEvent<T> | null): void => {
    if (anchor !== null && !exists(anchor)) anchor = null;
    const prevSelection = selection;
    const prevFocus = focus;
    selection = reconcileSelection(selection, exists);
    focus = reconcileFocus(focus, shown, rows.displayed, columns);
    shown = rows.displayed;
    if (head) emit(head);
    if (!sameSelection(prevSelection, selection)) emit(changed('data'));
    if (!sameFocus(prevFocus, focus)) emit({ type: 'focusChanged', source: 'data', focus });
  };

  const unsubscribe = rows.subscribe((c) => {
    onModel({ type: 'modelUpdated', source: c.source, displayed: c.displayed, kind: c.kind });
    // Rows the host gave that were refused or bent: told, not only stored on the model.
    const told = c.transaction?.problems ?? [];
    if (told.length) emit({ type: 'problems', source: c.source, problems: told });
  });

  const setQuery = (q: Query, source: ChangeSource): void => {
    const before = query;
    if (before.key === q.key) return;
    query = q;
    // "All" meant all the rows of that query: another query does not inherit it.
    if (selection.mode === 'exclude' && allOf !== null && allOf !== q.key) {
      selection = clearSelection();
      allOf = null;
      emit(changed('data'));
    }
    rows.setQuery(q, source);
    if (canonical(before.sort) !== canonical(q.sort)) emit({ type: 'sortChanged', source, sort: q.sort });
    if (canonical(before.filter) !== canonical(q.filter)) emit({ type: 'filterChanged', source, filter: q.filter });
    if (before.quick !== q.quick) emit({ type: 'quickChanged', source, text: q.quick });
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
      case 'filter.set':
        setQuery(makeQuery({ sort: query.sort, filter: cmd.filter, quick: query.quick }), source);
        return OK;
      case 'filter.column': {
        if (!columns.get(cmd.column)) return refuse('unknown-column', [problem('unknown-column', 'error', 'filter', cmd.column)]);
        const next: Record<string, ColumnFilter> = { ...query.filter };
        if (cmd.filter === null) delete next[cmd.column];
        else next[cmd.column] = cmd.filter;
        setQuery(makeQuery({ sort: query.sort, filter: next, quick: query.quick }), source);
        return OK;
      }
      case 'quick.set':
        setQuery(makeQuery({ sort: query.sort, filter: query.filter, quick: cmd.text }), source);
        return OK;
      case 'rows.refresh':
        rows.invalidate();
        return OK;
      case 'selection.all':
        if (rows.selectAll === 'query') {
          // Everything the query matches, never held as keys: everything-except, tied to this query.
          allOf = query.key;
          anchor = null;
          selection = { mode: 'exclude', keys: new Set() };
          emit(changed(source));
          return OK;
        }
        return dispatch({ type: 'selection.allDisplayed' }, source);
      case 'selection.allDisplayed': {
        // The client's *all* is what the filters show (D8): an include set of those keys.
        const d = rows.displayed;
        const keys: RowKey[] = [];
        for (let i = 0; i < d.count; i++) keys.push(d.keyAt(d.index(i)!));
        setSelection(selectOnly(keys), source);
        return OK;
      }
      case 'selection.clear':
        anchor = null;
        setSelection(clearSelection(), source);
        return OK;
      case 'selection.set':
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
        setFocus(f, source);
        return OK;
      }
    }
  }

  const kernel: GridKernel<T, M> & { [EMIT]: (e: GridEvent<T>) => void } = {
    rows,
    columns,
    get selection() { return selection; },
    get anchor() { return anchor; },
    get focus() { return focus; },
    get query() { return query; },
    dispatch,
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
  };
  return kernel;
}

/** Emits an event the DOM saw (a click, the first render). */
export const emit = <T>(k: GridKernel<T>, e: GridEvent<T>): void => (k as unknown as { [EMIT]: (e: GridEvent<T>) => void })[EMIT](e);

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
