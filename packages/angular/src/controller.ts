import { Injectable, computed, signal, untracked } from '@angular/core';
import { makeQuery, type GridCommand, type GridCommandResult, type GridKernel, type Problem, type RowKey, type RowModel, type RowTransaction, type TransactionResult } from '@dzgrid/core';
import type { GridFeature, GridInstance } from '@dzgrid/dom';
import type { EditApi } from '@dzgrid/dom/edit';
import type { RangeApi } from '@dzgrid/dom/range';
import type { FillApi } from '@dzgrid/dom/fill';
import type { GridStateApi } from '@dzgrid/dom/state';
import type { GroupingApi } from '@dzgrid/dom/grouping';
import type { RowDragApi } from '@dzgrid/dom/row-drag';

/** A model that takes a host's live changes: the client's, `infiniteRows`', `serverSideRows`'. */
type Live<T> = { applyTransaction?(tx: RowTransaction<T>, source?: 'api'): TransactionResult; applyTransactionAsync?(tx: RowTransaction<T>, done?: (r: TransactionResult) => void): void };
type FilterOpener = GridFeature & { openFilter(column: string): boolean; closeFilter(): void };

/**
 * One grid's handle for the application and for its parts: inject it inside `<dz-grid>` (a
 * part component, a template, a child), or take it from `(gridReady)` or `#g="dzGrid"`. Null
 * and false before the grid exists, after it is gone, and on a server; ready and dispatching from
 * the first paint (a part's init), `focusCell`, `ensureVisible`, `refresh` and `announce` once
 * that paint is over.
 */
@Injectable()
export class DzgController<T = unknown> {
  readonly #kernel = signal<GridKernel<T, RowModel<T>> | null>(null);
  #grid: GridInstance<T, RowModel<T>> | null = null;
  #features: readonly GridFeature[] = [];
  /** True from the grid's first paint on (its parts' init included). */
  readonly ready = computed(() => !!this.#kernel());
  readonly kernel = this.#kernel.asReadonly();

  /** @internal `<dz-grid>` sets it: the kernel before the first paint, the grid once made. */
  _attach(k: GridKernel<T, RowModel<T>> | null, g: GridInstance<T, RowModel<T>> | null = null, features: readonly GridFeature[] = []): void {
    this.#kernel.set(k);
    this.#grid = g;
    this.#features = features;
  }

  #api() {
    return this.#grid?.api;
  }

  /** A command, as the API (`source: 'api'`); refused when there is no grid. */
  dispatch(cmd: GridCommand): GridCommandResult {
    const k = untracked(this.kernel);
    return k ? k.dispatch(cmd, 'api') : { ok: false, reason: 'no grid', problems: [] };
  }
  focusCell(row: RowKey, column: string): void {
    this.#api()?.focusCell(row, column);
  }
  ensureVisible(row: RowKey, column?: string): void {
    this.#api()?.ensureVisible(row, column);
  }
  /** A column into view sideways only, no row named (column-layout.md, step 16d). */
  ensureColumnVisible(column: string): void {
    this.#api()?.ensureColumnVisible?.(column);
  }
  /**
   * Paints again, nothing more: no request is sent, the rows stay as held. To ask the data again, `reload()` (1.12.0)
   * — or this method with an object, `refresh({})`.
   */
  refresh(): void;
  /**
   * With an object, the rows are asked again, then painted (Phase 8, Q-NG A) — unlike `refresh()`, which only paints:
   * `{}` asks the window (or page) behind the rows shown (the thin busy line), as `reload()` does; `{ purge: true }`
   * lets everything go and the list starts again at its top.
   */
  refresh(o: { readonly purge?: boolean }): void;
  refresh(o?: { readonly purge?: boolean }): void {
    if (o) untracked(this.kernel)?.rows.invalidate(o);
    this.#api()?.refresh();
  }
  /**
   * Asks the data again, then paints (reload.md, 1.12.0): on a server, the page or the window's blocks fetched again,
   * the rows shown kept meanwhile and the filters, sort, page and selection unchanged; on rows the application gives,
   * nothing to fetch — they are worked out again and painted. The same as `refresh({})`; `refresh()` only paints.
   * Nothing without a grid.
   */
  reload(): void {
    this.refresh({});
  }
  /** A host's live change (row-transactions-async.md): the client's rows, or the rows held of a list in blocks. Null without a grid or on pages. */
  applyTransaction(tx: RowTransaction<T>): TransactionResult | null {
    return (untracked(this.kernel)?.rows as Live<T> | undefined)?.applyTransaction?.(tx, 'api') ?? null;
  }
  /** The same, gathered by a list in blocks (50 ms or the next frame); elsewhere applied at once. `done` with its result. */
  applyTransactionAsync(tx: RowTransaction<T>, done?: (r: TransactionResult) => void): void {
    const rows = untracked(this.kernel)?.rows as Live<T> | undefined;
    if (rows?.applyTransactionAsync) return rows.applyTransactionAsync(tx, done);
    const r = this.applyTransaction(tx);
    if (r) done?.(r);
  }
  announce(text: string): void {
    this.#api()?.announce(text);
  }
  /** Opens a column's filter popup (the `filters()` feature in `features`); false without it. */
  openFilter(column: string): boolean {
    return !!this.#filters()?.openFilter(column);
  }
  closeFilter(): void {
    this.#filters()?.closeFilter();
  }
  /** Empties every column filter and the quick search, keeps the sort; one request on a server; stateChanged follows as a gesture. False before the grid. */
  clearFilters(): boolean {
    return this.dispatch({ type: 'query.set', query: makeQuery({ sort: untracked(this.kernel)?.query.sort }) }).ok;
  }
  /**
   * Back to the grid as defined at creation (needs `gridState()` in `features`): columns, groups, sort, filters, search,
   * page, density, in one request; stateChanged follows. Null without the feature or the grid, else the restore's problems.
   */
  resetState(): Problem[] | null {
    return this._by<GridStateApi>('state')?.reset() ?? null;
  }
  /**
   * The grid's edits (Phase 5 step 9, edit-angular.md 6): the `edit()` feature given in `features`, its api for this
   * grid (`undo()`, `redo()`, `reapply()`, `canUndo`, `commit`, …); null before the grid, without it, after it.
   */
  edit(): EditApi<T> | null {
    return this._by<EditApi<T>>('edit');
  }
  /** The grid's block of cells (Phase 5 step 12): the `range()` feature given in `features`; null before, without it, after. */
  range(): RangeApi | null {
    return this._by<RangeApi>('range');
  }
  /** The grid's fill (Phase 5 step 12): the `fill()` feature given in `features`; null before, without it, after. */
  fill(): FillApi | null {
    return this._by<FillApi>('fill');
  }
  /** The grid's row grouping (Phase 7): the `grouping()` feature given in `features` (`by`, `setBy`, `totals`…); null before, without it, after. */
  grouping(): GroupingApi | null {
    return this._by<GroupingApi>('grouping');
  }
  /** The grid's row moves (Phase 9): the `rowDrag()` feature given in `features` (`move`, `step`, `dropTargets`); null before, without it, after. */
  rowDrag(): RowDragApi | null {
    return this._by<RowDragApi>('row-drag');
  }
  /**
   * A feature's api for this grid (Phase 6 step 12): `use(chooser)?.open(button)`, `use(pins)?.set({ bottom })`,
   * `use(state)?.state()` — typed from the feature object, no cast; null before the grid, after it, and on a server.
   */
  use<A>(feature: { api(grid: GridInstance<T, RowModel<T>>): A | null }): A | null {
    return this.#grid && feature.api(this.#grid);
  }
  /** The grid instance (Phase 6 step 12; `print(ctrl.grid()!, …)`): same lifetime as `kernel()`, null outside it. */
  grid(): GridInstance<T, RowModel<T>> | null {
    return this.#grid;
  }
  /** @internal The api of the feature given in `features` with this id; null without it or without the grid. */
  _by<A>(id: string): A | null {
    return this.#find<{ api(g: object): A | null }>(id)?.api(this.#grid!) || null;
  }
  #find<F>(id: string): F | undefined {
    return this.#grid ? (this.#features.find((f) => f.id === id) as F | undefined) : undefined;
  }
  #filters(): FilterOpener | undefined {
    return this.#find<FilterOpener>('filters');
  }
}
