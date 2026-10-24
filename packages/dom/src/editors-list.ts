/**
 * `@dzgrid/dom/editors-list` (Phase 5 step 6, owner S6-O7): the list editor of `@dzgrid/dom/editors` — an APG
 * select-only combobox with a folded type-ahead (editors.md 12–17) — in its own entry, so a grid without list
 * columns does not carry it. Given to the editors: `editors({ list: listEditor })`; without it a list column opens
 * a text field read by its codec (one warning per column).
 */
export { listEditor } from './editors-list/index.js';
export type ListEditor = typeof import('./editors-list/index.js').listEditor;
