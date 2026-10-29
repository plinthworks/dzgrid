/**
 * `@dzgrid/dom/fresh-rows` (1.1.0 step 16h, docs/behaviors/fresh-rows.md; owner Q16-9 A): the rows a refresh brought,
 * marked for 5 s and counted once to a screen reader. Its own entry, so a grid without it carries none of it; its texts
 * in `locales/<lang>-fresh`, its look in `@dzgrid/theme/fresh-rows.css`. Needs `sameRow` for a full reload or a server.
 */
export { freshRows, FRESH_KEYS } from './fresh-rows/index.js';
export type { FreshRowsOptions } from './fresh-rows/index.js';
export type { FreshMessageKey, FreshMessages } from './part-texts.js';
