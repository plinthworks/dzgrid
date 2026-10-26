/**
 * `@dzgrid/core/state` (Phase 6 step 5, docs/phase-6-steps/step05-plan.md, docs/behaviors/grid-state.md): the grid's state as
 * the user arranged it — columns, header groups, sort, filters, search, page, density — captured as a small versioned JSON
 * and restored in one server request. Pure: no DOM, no clock, no storage (those are `@dzgrid/dom/state`'s).
 */
export { captureState, checkState, restoreState, stateText, STATE_UPGRADES, STATE_VERSION } from './state/state.js';
export type { Density, StateProblemCode, GridState, GridStateColumn, GroupsAdapter, StateEnv, StateOptions, StatePart } from './state/state.js';
