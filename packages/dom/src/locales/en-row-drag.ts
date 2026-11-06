import type { RowDragMessages } from '../part-texts.js';

/** English, the texts of moving rows (`@dzgrid/dom/row-drag`): added to the grid's messages, `text: { ...EN.text, ...EN_ROW_DRAG.text }`. Rows are named by place, never by value. */
export const EN_ROW_DRAG = {
  locale: 'en',
  text: {
    'rmove.placed': "Row {n} of {total}",
    'rmove.placedLevel': "Row {n} of {total}, level {level}",
    'rmove.many': "{n} rows moved",
    'rmove.hidden': "Row moved",
    'rmove.edge': "Already at the edge",
    'rmove.locked': "This row cannot be moved",
    'rmove.sorted': "Sorted: rows cannot be moved",
    'rmove.grouped': "Grouped: rows cannot be moved",
    'rmove.refused': "Cannot go there",
    'rmove.tooMany': "Too many rows ({max} at most)",
    'rmove.cancelled': "Move cancelled",
    'rmove.ghost': "{n} rows",
    'rmove.up': "Move up",
    'rmove.down': "Move down",
    'rmove.top': "Move to top",
    'rmove.bottom': "Move to bottom",
    'rmove.in': "Indent",
    'rmove.out': "Outdent",
  },
} satisfies RowDragMessages;
