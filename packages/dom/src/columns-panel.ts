/**
 * `@dzgrid/dom/columns-panel` (Phase 6 step 4, docs/phase-6-steps/step04-plan.md; owner Q-C1, Q-C2, Q-H, O1, O5, O12,
 * Q4-1–Q4-4): « Choisir les colonnes », a dialog over the grid — every column ticked or not, a search, reordering by
 * Alt+arrows, ▲ ▼ and a handle — opened by the column menu or the application's button
 * (docs/behaviors/columns-chooser.md), in the popup host. Its texts in `locales/<lang>-columns`, its look in
 * `@dzgrid/theme/columns-panel.css`.
 */
export { columnsChooser, COLUMNS_CHOOSER_KEYS } from './columns-panel/index.js';
export type { ColumnsChooserApi, ColumnsChooserFeature, ColumnsChooserOptions } from './columns-panel/index.js';
export type { ColumnsChooserMessageKey, ColumnsMessages } from './part-texts.js';
