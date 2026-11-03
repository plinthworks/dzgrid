/**
 * `@dzgrid/dom/context-menu` (Phase 9, docs/phase-9-steps/context-menu-plan.md; owner Q-CM1–Q-CM4): the cell menu — a
 * right-click on a body cell, Shift+F10 / the Menu key on a focused cell — copy, cut, paste, fill, undo, the tree's
 * toggle, pin and export, then the application's items (docs/behaviors/context-menu.md), in the popup host, through the
 * column menu's shared list. Its texts in `locales/<lang>-context-menu`, its look in `@dzgrid/theme/menu.css`.
 */
export { contextMenu, CONTEXT_MENU_KEYS } from './context-menu/index.js';
export type { CellMenuContext, ContextMenuApi, ContextMenuFeature, ContextMenuOptions, EditApiLike, FillApiLike, MenuEntry, MenuItem, PinnedRowsApiLike, RangeApiLike, StatusApiLike, TreeApiLike } from './context-menu/index.js';
export type { ContextMenuMessageKey, ContextMenuMessages } from './part-texts.js';
