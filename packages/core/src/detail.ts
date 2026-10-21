/**
 * `@dzgrid/core/detail`: master/detail rows (docs/behaviors/master-detail.md, Phase 4 step 8), kept
 * out of the base: a detail row under each open master, and the sparse row layout that places them.
 * Handed to the client model as its `shape`; the DOM (steps 9–10) draws the panels.
 */
export { detailConflicts, detailShape } from './detail/shape.js';
export type { DetailOptions, DetailRows, DetailShape } from './detail/shape.js';
export { sparseRowLayout } from './detail/layout.js';
export type { SparseExtras, SparseLayout } from './detail/layout.js';
