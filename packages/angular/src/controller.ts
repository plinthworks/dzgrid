import { Injectable, computed, signal, untracked } from '@angular/core';
import type { GridCommand, GridCommandResult, GridKernel, RowKey, RowModel } from '@dzgrid/core';
import type { GridFeature, GridInstance } from '@dzgrid/dom';
import type { EditApi, EditFeature } from '@dzgrid/dom/edit';
import type { RangeApi, RangeFeature } from '@dzgrid/dom/range';
import type { FillApi, FillFeature } from '@dzgrid/dom/fill';

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
  /**
   * The grid's edits (Phase 5 step 9, edit-angular.md 6): the `edit()` feature given in `features`, its api for this
   * grid (`undo()`, `redo()`, `reapply()`, `canUndo`, `commit`, …); null before the grid, without it, after it.
   */
  edit(): EditApi<T> | null {
    return this.#find<EditFeature<T>>('edit')?.api(this.#grid!) || null;
  }
  /** The grid's block of cells (Phase 5 step 12): the `range()` feature given in `features`; null before, without it, after. */
  range(): RangeApi | null {
    return this.#find<RangeFeature>('range')?.api(this.#grid!) || null;
  }
  /** The grid's fill (Phase 5 step 12): the `fill()` feature given in `features`; null before, without it, after. */
  fill(): FillApi | null {
    return this.#find<FillFeature>('fill')?.api(this.#grid!) || null;
  }
  #find<F>(id: string): F | undefined {
    return this.#grid ? (this.#features.find((f) => f.id === id) as F | undefined) : undefined;
  }
  #filters(): FilterOpener | undefined {
    return this.#find<FilterOpener>('filters');
  }
}
