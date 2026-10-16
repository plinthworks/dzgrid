import type { ColumnModel, ColumnState } from './columns/model.js';
import { reconcileFocus, sameFocus, type FocusPos } from './focus.js';
import type { RowKey } from './ids.js';
import type { ClientModel, ModelChange } from './model/client.js';
import { makeQuery, type Query } from './model/query.js';
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
  | { readonly type: 'focus.set'; readonly focus: FocusPos | null };

export type GridCommandResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: string; readonly problems: readonly Problem[] };

export type GridEvent<T> =
  | { readonly type: 'modelUpdated'; readonly source: ChangeSource; readonly displayed: DisplayedRows<T>; readonly kind: ModelChange<T>['kind'] }
  | { readonly type: 'sortChanged'; readonly source: ChangeSource; readonly sort: readonly SortItem[] }
  | { readonly type: 'selectionChanged'; readonly source: ChangeSource; readonly selection: SelectionState; readonly count: number | null }
  | { readonly type: 'columnResized'; readonly source: ChangeSource; readonly column: string; readonly width: number; readonly finished: boolean }
  | { readonly type: 'focusChanged'; readonly source: ChangeSource; readonly focus: FocusPos | null }
  | { readonly type: 'cellClicked'; readonly source: 'user'; readonly row: RowNode<T>; readonly column: string }
  | { readonly type: 'problems'; readonly source: ChangeSource; readonly problems: readonly Problem[] }
  | { readonly type: 'firstDataRendered'; readonly source: 'data' };

export interface GridKernel<T> {
  readonly rows: ClientModel<T>;
  readonly columns: ColumnModel<T>;
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

export function createKernel<T>(o: { readonly rows: ClientModel<T>; readonly columns: ColumnModel<T> }): GridKernel<T> {
  const { rows, columns } = o;
  let selection: SelectionState = NO_SELECTION;
  let anchor: RowKey | null = null;
  let focus: FocusPos | null = null;
  let shown = rows.displayed;
  let destroyed = false;
  const listeners = new Set<(e: GridEvent<T>) => void>();
  const emit = (e: GridEvent<T>): void => {
    for (const fn of [...listeners]) fn(e);
  };

  const setSelection = (s: SelectionState, source: ChangeSource): void => {
    if (s === selection) return;
    selection = s;
    emit({ type: 'selectionChanged', source, selection, count: selectionCount(selection, rows.counts.total) });
  };
  const setFocus = (f: FocusPos | null, source: ChangeSource): void => {
    if (sameFocus(f, focus)) return;
    focus = f;
    emit({ type: 'focusChanged', source, focus });
  };
  /** After the rows or the columns moved: what no longer exists lets go. Always source `data`. */
  const reconcile = (): void => {
    const exists = (key: RowKey): boolean => rows.row(key) !== undefined;
    if (anchor !== null && !exists(anchor)) anchor = null;
    setSelection(reconcileSelection(selection, exists), 'data');
    setFocus(reconcileFocus(focus, shown, rows.displayed, columns), 'data');
    shown = rows.displayed;
  };

  const unsubscribe = rows.subscribe((c) => {
    emit({ type: 'modelUpdated', source: c.source, displayed: c.displayed, kind: c.kind });
    reconcile();
  });

  const setQuery = (q: Query, source: ChangeSource): void => {
    const before = rows.query;
    rows.setQuery(q, source);
    if (before.key === rows.query.key) return;
    if (before.sort !== rows.query.sort && JSON.stringify(before.sort) !== JSON.stringify(rows.query.sort))
      emit({ type: 'sortChanged', source, sort: rows.query.sort });
  };
  const withSort = (sort: readonly SortItem[]): Query => makeQuery({ sort, filter: rows.query.filter, quick: rows.query.quick });

  function dispatch(cmd: GridCommand, source: ChangeSource): GridCommandResult {
    if (destroyed) return refuse('destroyed');
    switch (cmd.type) {
      case 'sort.toggle': {
        const col = columns.get(cmd.column);
        if (!col) return refuse('unknown-column', [problem('unknown-column', 'error', 'column', cmd.column)]);
        if (!col.sortable) return refuse('not-sortable', [problem('invalid-sort', 'error', 'column', cmd.column)]);
        setQuery(withSort(nextSort(rows.query.sort, cmd.column, cmd.multi)), source);
        return OK;
      }
      case 'sort.set':
        setQuery(withSort(cmd.sort), source);
        return OK;
      case 'query.set':
        setQuery(cmd.query, source);
        return OK;
      case 'selection.toggle':
        anchor = cmd.row;
        setSelection(toggle(selection, cmd.row), source);
        return OK;
      case 'selection.only':
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
        setSelection(reconcileSelection(cmd.selection, (key) => rows.row(key) !== undefined), source);
        if (anchor !== null && !isSelected(selection, anchor)) anchor = null;
        return OK;
      case 'column.resize': {
        if (!columns.get(cmd.column)) return refuse('unknown-column', [problem('unknown-column', 'error', 'column', cmd.column)]);
        const change = columns.apply([{ id: cmd.column, width: cmd.width }], source);
        const width = columns.state().find((s) => s.id === cmd.column)?.width ?? cmd.width;
        if (change.problems.length) emit({ type: 'problems', source, problems: change.problems });
        emit({ type: 'columnResized', source, column: cmd.column, width, finished: cmd.finished });
        return OK;
      }
      case 'column.state': {
        const change = columns.apply(cmd.patch, source);
        if (change.problems.length) emit({ type: 'problems', source, problems: change.problems });
        rows.setColumns(columns);
        reconcile();
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

  const kernel: GridKernel<T> & { [EMIT]: (e: GridEvent<T>) => void } = {
    rows,
    columns,
    get selection() { return selection; },
    get anchor() { return anchor; },
    get focus() { return focus; },
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

export function headerSelection<T>(s: SelectionState, d: DisplayedRows<T>): HeaderSelection {
  if (d.count === 0) return 'none';
  let selected = 0;
  if (s.mode === 'include' && s.keys.size < d.count) {
    for (const key of s.keys) if (d.indexOf(key) !== -1) selected++;
  } else {
    for (let i = 0; i < d.count; i++) if (isSelected(s, d.keyAt(d.index(i)!))) selected++;
  }
  return selected === 0 ? 'none' : selected === d.count ? 'all' : 'some';
}
