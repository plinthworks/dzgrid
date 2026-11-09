/**
 * `@dzgrid/dom/responsive`: columns that collapse under their rows when the view is too narrow for them
 * (docs/behaviors/responsive-columns.md, 1.9.0), shown as « Title: value » lines in a detail panel. Over
 * `@dzgrid/dom/detail`'s rows (its texts, `locales/<lang>-detail`); the decision in the core's column model.
 */
export { responsive } from './responsive/index.js';
export type { ResponsiveOptions } from './responsive/index.js';
