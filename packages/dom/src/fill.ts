/**
 * `@dzgrid/dom/fill` (Phase 5 step 12, docs/phase-5-steps/step12-plan.md; owner S11-Q5, S12-Q1–Q8): the fill handle,
 * its drag and its no-drag click, the keyboard fill mode, Ctrl/Cmd+D and Ctrl/Cmd+R, bulk edit's seam
 * (docs/behaviors/fill.md), over the block of `@dzgrid/dom/range`. Its texts in `locales/<lang>-fill`, its look in
 * `@dzgrid/theme/fill.css`.
 */
export { fill, FILL_KEYS } from './fill/index.js';
export type { FillApi, FillCounts, FillFeature, FillFeatureOptions } from './fill/index.js';
export type { FillMessageKey, FillMessages } from './part-texts.js';
