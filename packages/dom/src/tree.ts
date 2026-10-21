/**
 * `@dzgrid/dom/tree`: rows shown as a tree (docs/behaviors/tree-view.md, tree-keys.md, Phase 4
 * step 4), kept out of the base. It reaches the base only through the grid it is set up on; its
 * texts come in their own bundles (`locales/<lang>-tree`).
 */
export { tree, TREE_KEYS } from './tree/index.js';
export type { TreeFeatureOptions } from './tree/index.js';
export type { TreeMessageKey, TreeMessages } from './part-texts.js';
