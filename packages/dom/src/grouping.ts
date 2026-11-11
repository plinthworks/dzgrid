/**
 * `@dzgrid/dom/grouping`: rows grouped by columns, with totals (docs/behaviors/row-grouping.md, aggregation.md; Phase 7
 * step 5), kept out of the base. It reaches the base only through the grid it is set up on; its texts come in their own
 * bundles (`locales/<lang>-group`), its look in `@dzgrid/theme/grouping.css`.
 */
export { grouping, GROUP_KEYS, TREE_CSS } from './grouping/index.js';
export type { GroupingApi, GroupingFeature, GroupingFeatureOptions } from './grouping/index.js';
export type { GroupMessageKey, GroupMessages } from './part-texts.js';
