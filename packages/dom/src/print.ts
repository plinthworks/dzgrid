/**
 * `@dzgrid/dom/print` (Phase 6 step 11, docs/phase-6-steps/step11-plan.md, docs/behaviors/print.md; owner Q-I, O9): the
 * grid's shown rows as a real table for the browser's print — `preparePrint()` builds it beside the grid and resolves with
 * its cleanup, `print()` also opens the print dialog and cleans up after. Takes the grid, not a feature: a grid that never
 * prints ships none of it. Its texts in `locales/<lang>-print`, its look in `@dzgrid/theme/print.css`.
 */
export { preparePrint, print, PRINT_KEYS } from './print/index.js';
export type { PrintOptions, PrintableGrid } from './print/index.js';
export type { PrintMessageKey, PrintMessages } from './part-texts.js';
