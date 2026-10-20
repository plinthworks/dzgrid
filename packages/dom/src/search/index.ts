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
   * Binds a field of the page (its own label, place and style) to the grid's search: to every grid
   * the feature is set up in, now and later (a grid made again after the last one is gone: a
   * remount). Binding a bound field again unbinds it first. Returns the unbind.
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
  /** The grids it is set up in, still alive. */
  const grids = new Set<GridContext<unknown>>();
  /** The fields bound (until their unbind): each binds itself to a grid. */
  const binds = new Set<(g: GridContext<unknown>) => void>();

  return {
    id: 'search',
    bind(input, o) {
      const offs = new Set<Off>();
      const attach = (g: GridContext<unknown>): void => void bindBox(g, input, o, offs);
      binds.add(attach);
      grids.forEach(attach);
      return () => {
        binds.delete(attach);
        offs.forEach((off) => off());
      };
    },
    setup(g) {
      grids.add(g);
      g.scope.add(g.kernel.subscribe(rowsSaid(g)));
      binds.forEach((attach) => attach(g));
      // Its fields' bindings end with the grid's scope.
      return { destroy: () => void grids.delete(g) };
    },
  };
}
