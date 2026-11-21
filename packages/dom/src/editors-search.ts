/**
 * `@dzgrid/dom/editors-search` (1.15.0, docs/behaviors/editors.md 23–29): the searching list — a column's
 * `edit: { search }` asked while the user types — for `editors({ search: searchEditor })`. Its texts in
 * `@dzgrid/dom/locales/<lang>-forms`; its look in `@dzgrid/theme/edit.css` (the list's) and `forms.css`.
 */
export { searchEditor, SEARCH_KEYS } from './editors-search/index.js';
export type { SearchEditor } from './editors/index.js';
export type { OptionSearch } from '@dzgrid/core';
