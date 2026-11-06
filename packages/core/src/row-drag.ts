/**
 * `@dzgrid/core/row-drag` (Phase 9, docs/behaviors/row-move.md; owner answers 2026-11-05): the rules of moving rows,
 * pure — where a dragged row may land, the keyboard's steps among siblings, a row's place for a sentence, and
 * `moveRows`, the reorder an application applies to its rows when the grid tells it `rowMove`. Kept out of the base: a
 * grid that never moves rows carries none of it.
 */
export { dropPlace, movableAt, moveRows, movingRows, nextPlace, parentAfter, placeOf, siblings, unchanged, within } from './row-drag/rules.js';
export type { DropWhere, MoveRowsOptions, MoveStep, RowDrop, RowMove } from './row-drag/rules.js';
