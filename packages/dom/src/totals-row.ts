/**
 * `@dzgrid/dom/totals-row`: a totals row on a flat grid (docs/behaviors/totals-row.md, 1.9.0) — each column's `total`, in
 * the pinned bottom band (`pinnedRows()` is needed), always in view, printed and exported. Its own entry; its text in
 * `locales/<lang>-totals`, its look in `@dzgrid/theme/pinned-rows.css`.
 */
export { totalsRow, TOTALS_KEYS } from './totals-row/index.js';
export type { TotalsRowApi, TotalsRowFeature } from './totals-row/index.js';
export type { TotalsMessageKey, TotalsMessages } from './part-texts.js';
