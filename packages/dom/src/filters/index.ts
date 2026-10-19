import type { GridContext } from '../context.js';
import type { FeatureHandle, GridFeature } from '../features.js';
import type { FilterMessageKey } from '../messages.js';
import { announceFilters } from './announce.js';
import { floatingRow } from './floating.js';
import { numberPart, textPart } from './inputs.js';
import { injectFilterStyles } from './styles.js';
import { summaryPart } from './summary.js';

export interface FiltersOptions {
  /** A floating row under the headers, for every filterable column (a column's `filter.floating` wins). Fixed. */
  readonly floating?: boolean;
  /** The pause before a typed filter applies; 150 ms in the browser, 300 on a server by default. */
  readonly debounceMs?: number;
}

/** The texts `filters()` needs, from `@dzgrid/dom/locales/<lang>-filters`. */
export const FILTER_KEYS = ['filter.inputLabel', 'filter.summaryActive', 'filter.clear', 'filter.invalid', 'announce.filtered', 'announce.filteredOpen'] as const satisfies readonly FilterMessageKey[];

/**
 * `filters()`: the filter UI (docs/behaviors/filter-ui.md). Step 12: the floating row, with its
 * parts `floating.text`, `floating.number` and the summary (`floating`), which a host's own of
 * the same name replace.
 *
 * ```ts
 * import { filters } from '@dzgrid/dom/filters';
 * import { FR_FILTERS } from '@dzgrid/dom/locales/fr-filters';
 * createGrid(host, { messages: { ...FR, text: { ...FR.text, ...FR_FILTERS.text } }, features: [filters({ floating: true })], … });
 * ```
 */
export function filters(o: FiltersOptions = {}): GridFeature {
  return { id: 'filters', parts: { 'floating.text': { slot: 'floating', part: textPart }, 'floating.number': { slot: 'floating', part: numberPart }, floating: { slot: 'floating', part: summaryPart } }, setup: (g) => setup(g, o) };
}

function setup(g: GridContext<unknown>, o: FiltersOptions): FeatureHandle {
  const missing = FILTER_KEYS.filter((k) => g.settings.messages.text[k] === undefined);
  if (missing.length) throw new TypeError(`filters: missing ${missing.join(', ')}`);
  const root = g.el.root.getRootNode();
  if (g.settings.injectStyles !== false) injectFilterStyles(root.nodeType === 11 ? (root as ShadowRoot) : g.doc, g.settings.nonce);
  const quiet = announceFilters(g);
  const row = floatingRow(g, o);
  return {
    headerRows: row ? [row.spec] : [],
    afterRows: () => row?.sweep(),
    destroy() {
      quiet();
      row?.destroy();
    },
  };
}
