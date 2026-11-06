/**
 * `@dzgrid/dom/row-drag` (Phase 9, docs/behaviors/row-move.md; owner answers « Row drag » 2026-11-05): moving rows — a grip
 * dragged by a mouse, a pen or a finger, Alt+Shift+arrows, the cell menu's items, drop targets; one `rowMove` event, the
 * application reorders (or `apply: true`). Its rules in `@dzgrid/core/row-drag`; its texts in `locales/<lang>-row-drag`;
 * its look in `@dzgrid/theme/row-drag.css`.
 */
export { rowDrag, ROW_DRAG_KEYS } from './row-drag/index.js';
export type { RowDragApi, RowDragFeature, RowDragOptions, RowDropInfo, RowDropTarget, RowMoveResult } from './row-drag/index.js';
export type { RowDragMessageKey, RowDragMessages } from './part-texts.js';
export type { DropWhere, MoveStep, RowDrop, RowMove } from '@dzgrid/core/row-drag';
