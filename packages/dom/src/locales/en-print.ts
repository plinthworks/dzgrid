import type { PrintMessages } from '../part-texts.js';

/** English, the print table's texts (`@dzgrid/dom/print`): added to the grid's messages, `text: { ...EN.text, ...EN_PRINT.text }`. */
export const EN_PRINT = {
  locale: 'en',
  text: {
    'print.truncated': "First {n} rows of {total}",
    'print.page': "Page {page} of {pages}",
  },
} satisfies PrintMessages;
