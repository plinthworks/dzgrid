/**
 * `@dzgrid/core/range` (Phase 5 step 10, docs/phase-5-steps/step10-plan.md): blocks of cells kept out of
 * the base. A block's positions for one version of the rows shown (range-selection.md), the clipboard's
 * TSV and the values a copy writes (clipboard.md), the paste plan, and the fill plan (fill.md). Pure: the
 * DOM (`@dzgrid/dom/range`, steps 11–12) hands the planned cells to the editing commit, which reads and
 * checks them (one place for the rules); bulk edit is the paste plan of one value.
 */
export { boxRows, boxSize, rangeBox } from './range/box.js';
export type { RangeBox } from './range/box.js';
export { decodeTsv, encodeTsv } from './range/tsv.js';
export { copyMatrix } from './range/copy.js';
export type { CopyOptions } from './range/copy.js';
export { PASTE_MAX, pasteText, planPaste } from './range/paste.js';
export type { PastePlan, PlannedCell } from './range/paste.js';
export { fillTarget, planFill } from './range/fill.js';
export type { FillOptions, FillWay } from './range/fill.js';
