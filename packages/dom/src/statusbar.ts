/**
 * `@dzgrid/dom/statusbar` (Phase 9, docs/behaviors/status-bar.md; owner Q-SB1–Q-SB4): the strip under the rows with the
 * block's figures (count, sum, mean, min, max) in the column's format and the grid's digits, the row counts on request,
 * the application's own items; one strip with the pager. Its texts in `locales/<lang>-status`; its colours the footer's.
 */
export { statusBar, STATUS_KEYS } from './statusbar/index.js';
export type { StatusBarApi, StatusBarFeature, StatusBarOptions } from './statusbar/index.js';
export type { StatusStats } from './part.js';
export type { StatusMessageKey, StatusMessages } from './part-texts.js';
