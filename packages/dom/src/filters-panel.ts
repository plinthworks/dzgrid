/**
 * `@dzgrid/dom/filters-panel` (Phase 9, docs/behaviors/filters-panel.md; owner answers 2026-11-03): every column's
 * filter in one side panel, beside `filters()` (from `@dzgrid/dom/filters` or `@dzgrid/dom/filters-base`) whose forms
 * it shows — it names no date kit itself, so it needs no `@tzslot/*`. Its texts in `locales/<lang>-filters-panel`; its
 * colours in `@dzgrid/theme/filters-panel.css`.
 */
export { filtersPanel, FILTERS_PANEL_KEYS } from './filters-panel/index.js';
/** Its layout CSS, for a page that sets `injectStyles: false` and loads it itself. */
export { FILTERS_PANEL_CSS } from './filters-panel/styles.js';
export type { FiltersPanelApi, FiltersPanelFeature, FiltersPanelOptions } from './filters-panel/index.js';
export type { FiltersPanelMessageKey, FiltersPanelMessages } from './part-texts.js';
