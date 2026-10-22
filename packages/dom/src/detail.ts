/**
 * `@dzgrid/dom/detail`: master/detail on screen (docs/behaviors/master-detail.md, Phase 4 step 10),
 * kept out of the base. It reaches the base only through the grid it is set up on (and `createGrid`
 * by the package's own name, for `nestedGrid`); its texts come in their own bundles (`locales/<lang>-detail`).
 */
export { detail, DETAIL_KEYS } from './detail/index.js';
export type { DetailFeatureOptions } from './detail/index.js';
export { nestedGrid } from './detail/nested.js';
export type { NestedGridOptions, NestedContext } from './detail/nested.js';
export type { DetailMessageKey, DetailMessages } from './part-texts.js';
