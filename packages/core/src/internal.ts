/**
 * Pieces the grid's own layers and tests need, which hosts should not build
 * on: their shape may change in any release. `@dzgrid/core/internal`.
 */
export { ColumnCache, THREW } from './model/column-cache.js';
export { flatDisplayed } from './row/displayed.js';
export { ctxKey, intlTag } from './value/locale.js';
export { separatorsFor } from './value/number.js';
export { clearFormatCaches, formatParts } from './i18n/format.js';
export { collatorKey } from './i18n/collate.js';
export { foldSlow } from './i18n/fold.js';
export { canonical } from './model/query.js';
