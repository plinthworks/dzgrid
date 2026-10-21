/**
 * `@dzgrid/dom/tree-lazy`: children loaded when their parent opens (docs/behaviors/tree-lazy.md,
 * Phase 4 step 7), given to `tree({ lazy: lazyChildren({ has, load }) })`: a tree with every row in
 * memory carries none of it. Its texts are the base bundle's (`grid.loading`, `grid.error`,
 * `grid.retry`, `announce.loading`, `announce.error`).
 */
export { lazyChildren } from './tree/lazy.js';
export type { LazyChildren, LazyDom } from './tree/lazy.js';
export type { LazyOptions } from '@dzgrid/core/tree-lazy';
