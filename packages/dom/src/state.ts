/**
 * `@dzgrid/dom/state` (Phase 6 step 5, docs/phase-6-steps/step05-plan.md, docs/behaviors/grid-state.md; owner Q-S2, O6, O7,
 * E5-1, E5-3): the grid's state for the application — `gridState()` (`state()`, `setState()`, `stateChanged`), the browser
 * storage (`persist` at creation, `persistLocal` later) and the page address (`toSearchParams`, `fromSearchParams`), over
 * `@dzgrid/core/state`. No text bundle: problems are codes.
 */
export { fromSearchParams, gridState, persistLocal, toSearchParams } from './state/index.js';
export type { GridStateApi, GridStateFeature, GridStateOptions } from './state/index.js';
export type { Density, GridState, GridStateColumn, StatePart } from '@dzgrid/core/state';
