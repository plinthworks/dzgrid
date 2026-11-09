/**
 * `@dzgrid/core/totals`: the totals of a flat grid's rows by column (docs/behaviors/totals-row.md, 1.9.0), the group
 * totals' rules (aggregation.md 2–7, 15) in one pure pass, kept out of the base. The DOM feature is `@dzgrid/dom/totals-row`.
 */
export { columnTotals } from './totals/flat.js';
export type { ColumnTotals } from './totals/flat.js';
