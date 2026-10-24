import type { EditMessages } from '../part-texts.js';

/** English, the editing texts (`@dzgrid/dom/edit`): spread into the grid's messages, `text: { ...EN.text, ...EN_EDIT.text }`. `{reason}`: the host's reason or a `validation.<code>` text. */
export const EN_EDIT = {
  locale: 'en',
  text: {
    'edit.saving': "Saving",
    'edit.saveRefused': "{column}: not saved, {reason}. Previous value restored.",
    'edit.reasonUnknown': "refused by the server",
    'edit.reasonNetwork': "server unreachable",
    'edit.failedMark': "Not saved: {reason}",
    'edit.stale': "Order out of date: reapply from the header",
    'edit.rowStale': "No longer matches the filter",
    'edit.reapply': "Put back in order",
    'edit.reapplied': { one: "Back in order, {n} row", other: "Back in order, {n} rows" },
    'header.withStale': "{name}, order out of date",
    'validation.required': "a value is required",
    'validation.min': "at least {min}",
    'validation.max': "at most {max}",
    'validation.pattern': "wrong format",
    'validation.options': "choose a value from the list",
    'validation.invalid': "invalid value",
  },
} satisfies EditMessages;
