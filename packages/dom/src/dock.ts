/**
 * `@dzgrid/dom/dock` (Phase 9, docs/behaviors/dock.md; owner Q-SB5, « Dock — owner B » 2026-11-06): the panels beside
 * and under the grid — areas `start`, `end`, `bottom`, tabs, the edge resized by the pointer and the keys, collapse, a
 * place menu, the layout in the grid's state (`@dzgrid/core/dock`). The columns panel (`@dzgrid/dom/columns-panel`) and
 * the filters panel (`@dzgrid/dom/filters-panel`) stand in it when it is used. Its texts in `locales/<lang>-dock`, its
 * colours in `@dzgrid/theme/dock.css`.
 */
export { dock, DOCK_KEYS } from './dock/index.js';
export type { DockApi, DockFeature, DockOptions, DockPanel } from './dock/index.js';
export type { DockArea, DockAreaState, DockPanelState, DockState } from '@dzgrid/core/dock';
export type { DockMessageKey, DockMessages } from './part-texts.js';
