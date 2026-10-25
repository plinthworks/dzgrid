/**
 * `@dzgrid/dom/range` (Phase 5 step 11a, docs/phase-5-steps/step11a-plan.md): blocks of cells selected by the keys and
 * the pointer (docs/behaviors/range-selection.md), kept out of the base. It reaches the base only through the grid it
 * is set up on (the feature seam, the `multi` flag); its texts come in their own bundles (`locales/<lang>-range`), its
 * look in `@dzgrid/theme/range.css`. Step 11b adds the clipboard (docs/behaviors/clipboard.md): copy, cut, paste and Delete on a block; the fill handle is step 12's, in its own entry.
 */
export { range, RANGE_KEYS } from './range/index.js';
export type { ClipboardText, CopyAsk, PasteCounts, RangeApi, RangeFeature, RangeOptions } from './range/index.js';
export type { RangeMessageKey, RangeMessages } from './part-texts.js';
