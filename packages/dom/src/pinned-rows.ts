/**
 * `@dzgrid/dom/pinned-rows` (Phase 6 step 8b-1, docs/phase-6-steps/step08b-plan.md; owner Q-P = C, Q1–Q5, O8, C6): rows
 * pinned to the top and the bottom of the grid (a reference row, a totals row) — never sorted, filtered or paged, reached
 * by the keys, and edited through the grid's edit layer like body rows (docs/behaviors/pinned-rows.md). Its texts in
 * `locales/<lang>-pinned`, its look in `@dzgrid/theme/pinned-rows.css`. Blocks, paste and the fill inside a band: step 8b-2.
 */
export { pinnedRows, PINNED_KEYS } from './pinned-rows/index.js';
export type { PinnedRowsApi, PinnedRowsFeature, PinnedRowsOptions, PinnedSide } from './pinned-rows/index.js';
export type { PinnedMessageKey, PinnedMessages } from './part-texts.js';
