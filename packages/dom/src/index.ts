/**
 * @dzgrid/dom — the grid in the browser, on @dzgrid/core. Built step by step
 * in Phase 2 (docs/phase-2-plan.md); the guards in test/guards.test.ts hold
 * every file here to: no colour, no visible text that is not a message, no
 * physical side outside dir.ts, no HTML injection, no invisible character.
 */
export { MESSAGE_KEYS, msg } from './messages.js';
export type { ExportMessageKey, ExportMessages, FilterMessageKey, FilterMessages, GridMessages, MessageKey, MessageValue, PaginationMessageKey, PaginationMessages, PluralForms } from './messages.js';
export { createGrid } from './grid.js';
export type { GridApi, GridInstance } from './grid.js';
export type { GridEnv } from './context.js';
export type { GridSettings, RowClassContext } from './settings.js';
/** Which settings `update` takes live and which only at creation (`@dzgrid/dom/detail` reads it: a nested grid made again only for a fixed one). */
export { UPDATE_POLICY, type UpdatePolicy } from './update.js';
export type { Geometry, ViewportBox } from './render/measure.js';
export { LAYOUT_CSS, injectStyles } from './styles.js';
export { checkMessages } from './messages.js';
export { definePart } from './part.js';
export type { Part, PartBase, PartHandle, SlotContext, SlotPart } from './part.js';
export type { PartsMessageKey, PartsMessages } from './part-texts.js';
export type { GridFeature, FeatureHandle } from './features.js';
export type { HeaderRowSpec } from './render/header.js';
