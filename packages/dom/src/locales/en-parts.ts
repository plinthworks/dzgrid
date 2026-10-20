import type { PartsMessages } from '../part-texts.js';

/** English, the ready cell parts' texts (`@dzgrid/dom/parts`): spread into the grid's messages, `text: { ...EN.text, ...EN_PARTS.text }`. */
export const EN_PARTS = {
  locale: 'en',
  text: {
    'cell.yes': "Yes",
    'cell.no': "No",
  },
} satisfies PartsMessages;
