/**
 * `@dzgrid/core/pivot` (Phase 10, docs/behaviors/pivot.md; owner answers docs/phase-10-steps/questions.md): a grouping
 * with crossings — the values of pivot columns turned into created columns, a total at each crossing — and `checkPivot`
 * and `pivotState` for a saved state's `pivot`. Pure; built over `@dzgrid/core/grouping`, kept out of it so a grouped grid carries none of it.
 */
export { checkPivot, pivotShape, pivotState } from './pivot/shape.js';
export type { PivotColumns, PivotOptions, PivotSeries, PivotShape } from './pivot/shape.js';
