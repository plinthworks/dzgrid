import type { PartsMessages } from '../part-texts.js';

/** العربية, the ready cell parts' texts (`@dzgrid/dom/parts`): spread into the grid's messages, `text: { ...AR.text, ...AR_PARTS.text }`. To be read by an Arabic reader. */
export const AR_PARTS = {
  locale: 'ar',
  text: {
    'cell.yes': "نعم",
    'cell.no': "لا",
  },
} satisfies PartsMessages;
