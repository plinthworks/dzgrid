import { Injectable, computed, signal, untracked } from '@angular/core';
import { makeQuery, type GridCommand, type GridCommandResult, type GridKernel, type Problem, type RowKey, type RowModel } from '@dzgrid/core';
import type { GridFeature, GridInstance } from '@dzgrid/dom';
import type { EditApi } from '@dzgrid/dom/edit';
import type { RangeApi } from '@dzgrid/dom/range';
import type { FillApi } from '@dzgrid/dom/fill';
import type { GridStateApi } from '@dzgrid/dom/state';

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
  refresh(): void {
    this.#api()?.refresh();
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
