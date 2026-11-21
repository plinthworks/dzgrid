import type { FormsMessages } from '../part-texts.js';

/**
 * English, the form editing texts (1.15.0: `@dzgrid/dom/edit-batch`, `/editors-row`, `/editors-search`): spread into the
 * grid's messages after the editing ones, `text: { ...EN.text, ...EN_EDIT.text, ...EN_EDITORS.text, ...EN_FORMS.text }`.
 */
export const EN_FORMS = {
  locale: 'en',
  text: {
    "edit.unsaved": "Not saved",
    "edit.discarded": { one: "{n} change discarded", other: "{n} changes discarded" },
    "edit.notSent": "Nothing sent: {column}, {reason}",
    "edit.rowEditing": { one: "Editing row {row}, {n} field", other: "Editing row {row}, {n} fields" },
    "edit.rowCancelled": "Row not changed",
    "edit.searching": "Searching…",
    "edit.noResult": "No result",
    "edit.searchFailed": "Search failed",
  },
} satisfies FormsMessages;
