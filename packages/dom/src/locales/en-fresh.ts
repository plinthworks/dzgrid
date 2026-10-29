import type { FreshMessages } from '../part-texts.js';

/** English, the new rows' sentence (`@dzgrid/dom/fresh-rows`): added to the grid's messages, `text: { ...EN.text, ...EN_FRESH.text }`. */
export const EN_FRESH = {
  locale: 'en',
  text: {
    'announce.fresh': { one: "{n} new row", other: "{n} new rows" },
  },
} satisfies FreshMessages;
