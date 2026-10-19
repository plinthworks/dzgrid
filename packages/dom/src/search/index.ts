import type { GridContext } from '../context.js';
import type { GridFeature } from '../features.js';
import { bindBox, type Off } from './bind.js';
import { rowsSaid } from './said.js';

export interface QuickSearchOptions {
  /** The pause before a typed search applies (a finite number of 0 or more); default 150 ms in the browser, 300 ms on a server. */
  readonly debounceMs?: number;
}

export interface QuickSearch extends GridFeature {
  /**
   * Binds a field of the page (its own label, place and style) to the grid's search. Before the
   * grid is made: waits for it; after it is gone: does nothing. Binding a bound field again
   * unbinds it first. Returns the unbind.
   */
  bind(input: HTMLInputElement, o?: QuickSearchOptions): () => void;
}

/**
 * `quickSearch()`: the page's own search fields drive the grid's quick search
 * (docs/behaviors/quick-search-box.md, step 16, owner decisions Q1–Q3).
 *
 * ```ts
 * import { quickSearch } from '@dzgrid/dom/search';
 * const search = quickSearch();
 * createGrid(host, { features: [search], … });
 * const unbind = search.bind(document.querySelector('#q')!, { debounceMs: 200 });
 * ```
 */
export function quickSearch(): QuickSearch {
  let g: GridContext<unknown> | null = null;
  /** Binds waiting for the grid; null once it is made (then gone). */
  let waiting: Set<() => void> | null = new Set();
  const boxes = new Map<HTMLInputElement, Off>();

  return {
    id: 'search',
    bind(input, o) {
      let off: Off | undefined;
      const attach = (): void => {
        off = bindBox(g!, input, o, boxes);
      };
      if (g) attach();
      else waiting?.add(attach);
      return () => {
        waiting?.delete(attach);
        off?.();
      };
    },
    setup(ctx) {
      g = ctx;
      ctx.scope.add(ctx.kernel.subscribe(rowsSaid(ctx)));
      for (const attach of waiting!) attach();
      waiting = null;
      return {
        destroy() {
          for (const off of boxes.values()) off();
          g = null;
        },
      };
    },
  };
}
