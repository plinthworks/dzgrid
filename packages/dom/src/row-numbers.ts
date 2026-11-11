/**
 * `@dzgrid/dom/row-numbers` (1.4.0, docs/behaviors/row-numbers.md; owner decisions 2026-11-03): 1, 2, 3… in a strip at
 * the inline start of every row, in display order; a click takes the row (`range()`, else the row selection). Never a
 * column. Its texts in `locales/<lang>-row-numbers`; its colours in `@dzgrid/theme/row-numbers.css`.
 */
export { rowNumbers, ROW_NUMBERS_KEYS } from './row-numbers/index.js';
/** Its layout CSS, for a page that sets `injectStyles: false` and loads it itself. */
export { ROW_NUMBERS_CSS } from './row-numbers/index.js';
export type { RowNumbersMessageKey, RowNumbersMessages } from './part-texts.js';
