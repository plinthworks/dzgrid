/**
 * `@dzgrid/core/tree-lazy`: children loaded when their parent opens (docs/behaviors/tree-lazy.md,
 * Phase 4 step 7), kept out of the base and of `@dzgrid/core/tree`: a tree with every row in memory
 * carries none of it. Wraps a `treeShape`; a server's model (`sourceRows` with `children`) gives it
 * its loader.
 */
export { lazyShape } from './tree/lazy.js';
export type { ChildLoader, LazyControl, LazyOptions, LazyShape } from './tree/lazy.js';
