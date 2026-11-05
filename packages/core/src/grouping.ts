/**
 * `@dzgrid/core/grouping`: rows grouped by columns, with totals (docs/behaviors/row-grouping.md, aggregation.md;
 * Phase 7), kept out of the base so a flat grid carries none of it. Handed to the client model as its `shape`.
 */
export { checkRowGroups, groupConflicts, groupShape } from './grouping/shape.js';
export type { GroupedRows, GroupingOptions, GroupShape } from './grouping/shape.js';
export type { AggCtx, AggFn, AggFuncName } from './columns/defs.js';
export type { FooterNode } from './row/node.js';
