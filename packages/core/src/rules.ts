/**
 * `@dzgrid/core/rules` (step 21): the vetting of selection rules (docs/behaviors/selection-rules.md),
 * kept out of the base. The kernel's gate seam is in `@dzgrid/core/internal` (`setSelectionGate`).
 */
export { vetSelection, refusalProblems, ruleGate } from './rules/vet.js';
export type { SelectionRule } from './rules/vet.js';
