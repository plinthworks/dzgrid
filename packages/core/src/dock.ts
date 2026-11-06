/**
 * `@dzgrid/core/dock` (Phase 9, docs/behaviors/dock.md; owner Q-SB5, « Dock — owner B » 2026-11-06): the dock's layout
 * as a grid's state keeps it — its types and `checkDock`, pure. The panels themselves are `@dzgrid/dom/dock`'s. Kept out
 * of the base and of `@dzgrid/core/state`: a grid without the dock carries none of it.
 */
export { checkDock, DOCK_AREAS } from './dock/layout.js';
export type { DockArea, DockAreaState, DockPanelState, DockState } from './dock/layout.js';
