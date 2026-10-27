import type { PinnedMessages } from '../part-texts.js';

/** English, the pinned rows' texts (`@dzgrid/dom/pinned-rows`): added to the grid's messages, `text: { ...EN.text, ...EN_PINNED.text }`. */
export const EN_PINNED = {
  locale: 'en',
  text: {
    'pinned.top': "Rows pinned at the top",
    'pinned.bottom': "Rows pinned at the bottom",
  },
} satisfies PinnedMessages;
