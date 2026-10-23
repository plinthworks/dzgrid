/**
 * `@dzgrid/core/edit` (Phase 5 step 3, docs/phase-5-steps/step03-plan.md): the edit controller kept
 * out of the base. What a kept value is read as and checked against (edit-validation.md), the overlay
 * the rows read before the host saves (edit-save.md 3), the saves (one gesture, one request; serial per
 * cell; rollback to the last saved value), and undo / redo (edit-undo.md). The DOM (steps 4–8) calls it.
 */
export { createEdits } from './edit/controller.js';
export type { CellState, EditController, EditOptions, SaveHandler, SaveRequest, SaveChange, UndoResult, CommitResult } from './edit/controller.js';
export { checkValue, parseInput } from './edit/input.js';
export type { CellInput, Checked } from './edit/input.js';
