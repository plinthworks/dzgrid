import type { GridContext } from '../context.js';
import type { FeatureHandle, GridFeature } from '../features.js';
import type { FilterMessageKey } from '../messages.js';
import { announceFilters } from './announce.js';
import { committer } from './commit.js';
import { floatingRow } from './floating.js';
import { booleanForm, numberForm, textForm } from './forms.js';
import { numberPart, textPart } from './inputs.js';
import { menu, type Menu } from './menu.js';
import { resolver } from './resolve.js';
import { injectFilterStyles } from './styles.js';
import { summaryPart } from './summary.js';

export interface FiltersOptions {
  /** A floating row under the headers, for every filterable column (a column's `filter.floating` wins). Fixed. */
  readonly floating?: boolean;
  /** The pause before a typed filter applies; 150 ms in the browser, 300 on a server by default. */
  readonly debounceMs?: number;
  /** The header's filter button and the popup (step 13); `false`: neither. On by default. */
  readonly popup?: boolean;
}

/** The feature, with the popup's handles (owner decision O6: here, not on the grid). */
export interface FiltersFeature extends GridFeature {
  /** Opens the column's popup: false when it has no `filter.<kind>` part, its header is not mounted, or its kind cannot filter here. */
  openFilter(column: string): boolean;
  closeFilter(): void;
}

const OPS = ['contains', 'notContains', 'equals', 'notEqual', 'startsWith', 'endsWith', 'blank', 'notBlank', 'lt', 'lte', 'gt', 'gte', 'between'] as const;

/** The texts `filters()` needs, from `@dzgrid/dom/locales/<lang>-filters`. */
export const FILTER_KEYS = [
  'filter.inputLabel', 'filter.summaryActive', 'filter.clear', 'filter.invalid', 'announce.filtered', 'announce.filteredOpen',
  'filter.popupLabel', 'header.withFilter', 'filter.op', 'filter.value', 'filter.valueTo', 'filter.apply',
  ...OPS.map((o) => `filter.op.${o}` as const), 'filter.all', 'filter.yes', 'filter.no',
] satisfies readonly FilterMessageKey[];

/**
 * `filters()`: the filter UI (docs/behaviors/filter-ui.md). Step 12: the floating row, with its
 * parts `floating.text`, `floating.number` and the summary (`floating`). Step 13: the popup, with
 * `filter.text`, `filter.number` and `filter.boolean`, opened from the header's button or with
 * Alt+ArrowDown. A host's part of the same name replaces each.
 *
 * ```ts
 * import { filters } from '@dzgrid/dom/filters';
 * import { FR_FILTERS } from '@dzgrid/dom/locales/fr-filters';
 * createGrid(host, { messages: { ...FR, text: { ...FR.text, ...FR_FILTERS.text } }, features: [filters({ floating: true })], … });
 * ```
 * `openFilter` and `closeFilter` act on the last grid the feature was set up on.
 */
export function filters(o: FiltersOptions = {}): FiltersFeature {
  let popup: Menu | null = null;
  return {
    id: 'filters',
    parts: {
      'floating.text': { slot: 'floating', part: textPart }, 'floating.number': { slot: 'floating', part: numberPart }, floating: { slot: 'floating', part: summaryPart },
      'filter.text': { slot: 'filter', part: textForm }, 'filter.number': { slot: 'filter', part: numberForm }, 'filter.boolean': { slot: 'filter', part: booleanForm },
    },
    setup: (g) => setup(g, o, (m) => (popup = m)),
    openFilter: (column) => !!popup?.open(column),
    closeFilter: () => popup?.close(),
  };
}

function setup(g: GridContext<unknown>, o: FiltersOptions, keep: (m: Menu) => void): FeatureHandle {
  const missing = FILTER_KEYS.filter((k) => g.settings.messages.text[k] === undefined);
  if (missing.length) throw new TypeError(`filters: missing ${missing.join(', ')}`);
  const root = g.el.root.getRootNode();
  if (g.settings.injectStyles !== false) injectFilterStyles(root.nodeType === 11 ? (root as ShadowRoot) : g.doc, g.settings.nonce);
  const quiet = announceFilters(g);
  const resolve = resolver(g, o);
  const commit = committer(g, o);
  const popup = menu(g, resolve, commit, o.popup !== false);
  keep(popup);
  const row = floatingRow(g, o, resolve, commit, popup);
  return {
    headerRows: row ? [row.spec] : [],
    decorateHeader: popup.decorate,
    afterRows(f) {
      row?.sweep();
      popup.paint(f);
    },
    destroy() {
      quiet();
      popup.close();
      row?.destroy();
    },
  };
}
