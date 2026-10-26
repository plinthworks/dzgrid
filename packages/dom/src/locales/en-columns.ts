import type { ColumnsMessages } from '../part-texts.js';

/** English, the texts of moving columns (`@dzgrid/dom/columns`): added to the grid's messages, `text: { ...EN.text, ...EN_COLUMNS.text }`. */
export const EN_COLUMNS = {
  locale: 'en',
  text: {
    'move.placed': "{column}: column {n} of {total}",
    'move.edge': "{column}: already at the edge",
    'move.locked': "{column}: cannot be moved",
    'move.cancelled': "Move cancelled",
  },
} satisfies ColumnsMessages;
