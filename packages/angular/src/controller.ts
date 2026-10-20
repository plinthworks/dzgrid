import { Injectable, computed, signal, untracked } from '@angular/core';
import type { GridCommand, GridCommandResult, GridKernel, RowKey, RowModel } from '@dzgrid/core';
import type { GridFeature, GridInstance } from '@dzgrid/dom';

type FilterOpener = GridFeature & { openFilter(column: string): boolean; closeFilter(): void };

/**
 * One grid's handle for the application and for its parts: inject it inside `<dz-grid>` (a
 * part component, a template, a child), or take it from `(gridReady)` or `#g="dzGrid"`. Null
 * and false before the grid exists, after it is gone, and on a server.
 */
@Injectable()
export class DzgController<T = unknown> {
  readonly #grid = signal<GridInstance<T, RowModel<T>> | null>(null);
  #features: readonly GridFeature[] = [];
  readonly ready = computed(() => !!this.#grid());
  readonly kernel = computed<GridKernel<T, RowModel<T>> | null>(() => this.#grid()?.kernel ?? null);

  /** @internal `<dz-grid>` sets it. */
  _attach(g: GridInstance<T, RowModel<T>> | null, features: readonly GridFeature[] = []): void {
    this.#grid.set(g);
    this.#features = features;
  }

  #api() {
    return untracked(this.#grid)?.api;
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
  #filters(): FilterOpener | undefined {
    return untracked(this.#grid) ? (this.#features.find((f) => f.id === 'filters') as FilterOpener | undefined) : undefined;
  }
}
