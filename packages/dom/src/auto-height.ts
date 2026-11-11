/**
 * `@dzgrid/dom/auto-height`: rows as tall as their wrapped text (Phase 6 step 9, docs/behaviors/auto-height.md; owner
 * Q-R1, Q9-1..Q9-4). Its own entry, so a grid of one-line rows carries none of it.
 */
export { autoHeight } from './auto-height/index.js';
/** Its layout CSS, for a page that sets `injectStyles: false` and loads it itself. */
export { WRAP_CSS } from './auto-height/index.js';
