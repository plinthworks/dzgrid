import type { RowNumbersMessages } from '../part-texts.js';

/** English, the row numbers' texts (`@dzgrid/dom/row-numbers`): added to the grid's messages, `text: { ...EN.text, ...EN_ROW_NUMBERS.text }`. */
export const EN_ROW_NUMBERS = {
  locale: 'en',
  text: {
    'rownum.header': "Row number",
  },
} satisfies RowNumbersMessages;
