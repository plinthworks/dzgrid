/**
 * `@dzgrid/dom/filters`: the filter UI (docs/behaviors/filter-ui.md), kept out of the base so a
 * grid without it carries none. Step 12: the floating row; step 13: the popup; step 14: dates; step 15: the value list (a lazy chunk). It reaches the base only through the
 * grid it is set up on; its texts come in their own bundles (`locales/<lang>-filters`). Its date forms are tzslot's
 * (`@tzslot/core` and `@tzslot/dom`, needed at build time): without them, `@dzgrid/dom/filters-base` (1.2.0).
 */
import { filtersWith, type FiltersFeature, type FiltersOptions } from './filters/index.js';
import type { DateKit, DateKitName } from './filters/dates.js';

export { FILTER_KEYS } from './filters/index.js';
/** Its layout CSS, for a page that sets `injectStyles: false` and loads it itself. */
export { FILTERS_CSS } from './filters/styles.js';
export type { FiltersFeature, FiltersOptions } from './filters/index.js';
export type { SetKit } from './filters/set.js';
export type { DateAdapter, DateCalendarOptions, DateField, DateKit, DateKitName, DatePart, DateSettings } from './filters/dates.js';

const KITS: Record<DateKitName, () => Promise<DateKit>> = {
  date: () => import('./filters/dates/date.js'),
  range: () => import('./filters/dates/range.js'),
  moment: () => import('./filters/dates/moment.js'),
};

/**
 * `filters()`: the filter UI (docs/behaviors/filter-ui.md): the floating row, the popup (text, number, yes/no, the
 * value list, tzslot's date forms loaded on demand; `loadDates` replaces that import).
 *
 * ```ts
 * import { filters } from '@dzgrid/dom/filters';
 * createGrid(host, { messages: { ...FR, text: { ...FR.text, ...FR_FILTERS.text } }, features: [filters({ floating: true })], … });
 * ```
 */
export function filters(o: FiltersOptions = {}): FiltersFeature {
  return filtersWith(o, (k) => KITS[k]());
}
