/**
 * `@dzgrid/dom/editors-textarea` (1.14.0, docs/behaviors/editors.md 18–22): the long-text editor of
 * `@dzgrid/dom/editors` — a multi-line box over the cell, Enter for a new line, Ctrl/Cmd+Enter to keep — in its own
 * entry, so a grid without long-text columns does not carry it. Given to the editors:
 * `editors({ textarea: textareaEditor })`, on a column `edit: { editor: 'textarea' }`; without it, the one-line field
 * (one warning per column).
 */
export { textareaEditor, TEXTAREA_CSS } from './editors-textarea/index.js';
export type TextareaEditor = typeof import('./editors-textarea/index.js').textareaEditor;
