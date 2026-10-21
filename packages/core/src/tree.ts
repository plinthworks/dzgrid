/**
 * `@dzgrid/core/tree`: rows shown as a tree (docs/behaviors/tree-view.md, tree-filter.md), kept out
 * of the base so a flat grid carries none of it. Handed to the client model as its `shape`.
 */
export { treeConflicts, treeShape } from './tree/shape.js';
export type { TreeOptions, TreeRows, TreeShape } from './tree/shape.js';
