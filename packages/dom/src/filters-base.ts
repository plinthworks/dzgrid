/**
 * `@dzgrid/dom/filters-base` (1.2.0, docs/behaviors/filter-ui.md « Without tzslot »): `filters()` of
 * `@dzgrid/dom/filters` without tzslot's date forms, for an application that has no `@tzslot/*` installed — nothing
 * it reaches names them. Text, number, yes/no and the value list as with `filters()`. A day or instant column gets no
 * date form (no popup, no button) and one `missing-feature` warning, unless `loadDates` brings the kits.
 *
 * ```ts
 * import { filters } from '@dzgrid/dom/filters-base';
 * ```
 */
import { filtersWith, type FiltersFeature, type FiltersOptions } from './filters/index.js';

export { FILTER_KEYS } from './filters/index.js';
export type { FiltersFeature, FiltersOptions } from './filters/index.js';
export type { SetKit } from './filters/set.js';
export type { DateAdapter, DateCalendarOptions, DateField, DateKit, DateKitName, DatePart, DateSettings } from './filters/dates.js';

/** The filter UI, as `filters()` of `@dzgrid/dom/filters`; date forms only through `loadDates`. */
export function filters(o: FiltersOptions = {}): FiltersFeature {
  return filtersWith(o);
}
