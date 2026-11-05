/**
 * `@dzgrid/core/infinite` (Phase 8, infinite-scroll.md): a server's list loaded in blocks as it scrolls. Kept out of the
 * base and of `@dzgrid/core/server`, so a grid on pages carries none of it.
 */
export { infiniteRows } from './server/infinite.js';
export type { InfiniteDiagnostics, InfiniteModel, InfiniteOptions, InfiniteRows } from './server/infinite.js';
