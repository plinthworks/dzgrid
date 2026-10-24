import type { EditorsMessages } from '../part-texts.js';

/** English, the editors' texts (`@dzgrid/dom/editors`): spread into the grid's messages after the editing ones, `text: { ...EN.text, ...EN_EDIT.text, ...EN_EDITORS.text }`. `{reason}`: a `validation.<code>` text. */
export const EN_EDITORS = {
  locale: 'en',
  text: {
    'edit.refused': "{column}: value refused, {reason}",
    'edit.refusedDropped': "{column}: value refused, change cancelled",
    'editors.fieldName': "{column}, {row}",
    'validation.parse': "number expected",
    'validation.day': "date expected ({pattern})",
    'validation.invalid-instant': "date and time expected",
    'validation.wall-time-skipped': "this time does not exist that day (clock change)",
    'validation.wall-time-ambiguous': "this time occurs twice that day",
    'edit.calendar': "Open calendar",
    'edit.calendarLoading': "Loading calendar",
    'edit.calendarFailed': "Calendar could not load",
    'edit.optionNotInList': "{label} (not in the list)",
    'edit.rowRemoved': "Row removed, change cancelled",
    'edit.pageDropped': "{column}: change not sent, the page changed",
  },
} satisfies EditorsMessages;
