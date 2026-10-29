/**
 * `@dzgrid/core/row-gaps`: a gap between two categories (docs/behaviors/row-gaps.md, 1.1.0 step 15), kept out of the
 * base so a grid without gaps carries none of it: where the gaps stand (`gapsOf`, the rule asked per shown row) and
 * the row layout that places them (`gapLayout`). The DOM feature is `@dzgrid/dom/row-gaps`.
 */
export { gapLayout } from './row-gaps/layout.js';
export { gapsOf, roots } from './row-gaps/rule.js';
export type { GapCtx, GapRule } from './row-gaps/rule.js';
