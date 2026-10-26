/**
 * `@dzgrid/dom/columns` (Phase 6 step 2, docs/phase-6-steps/step02-plan.md; owner Q-M3, Q-K2, Q-G, Q2-1, Q2-2): moving
 * columns — a header's drag (mouse and pen, never a finger), Ctrl/Cmd+Shift+arrows, `api.move()` for the menu, and the
 * drop protocol a group zone uses (docs/behaviors/column-move.md, group-drop-zone.md part 1). Its texts in
 * `locales/<lang>-columns`, its look in `@dzgrid/theme/columns.css`.
 */
export { columns, COLUMNS_KEYS } from './columns/index.js';
export type { ColumnsApi, ColumnsFeature, ColumnsOptions, DropTarget, MoveResult } from './columns/index.js';
export type { ColumnsMessageKey, ColumnsMessages } from './part-texts.js';
