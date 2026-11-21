/**
 * `@dzgrid/dom/editors-row` (1.15.0, docs/behaviors/edit-row.md): full-row editing for `editors({ row: rowEditor })` —
 * every editable cell of a row opened at once, kept as one gesture, checked as a whole (`validateRow`). Its texts in
 * `@dzgrid/dom/locales/<lang>-forms`; the row's outline in `@dzgrid/theme/forms.css`.
 */
export { rowEditor, ROW_KEYS } from './editors-row/index.js';
export type { RowEditor, RowPlug } from './editors/index.js';
export type { RowRefusal, RowRule } from '@dzgrid/core/edit';
