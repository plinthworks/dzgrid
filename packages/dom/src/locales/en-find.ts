import type { FindMessages } from '../part-texts.js';

/** English, the find bar's texts (`@dzgrid/dom/find`): added to the grid's messages, `text: { ...EN.text, ...EN_FIND.text }`. `{i}`: the current hit, `{n}`: how many. */
export const EN_FIND = {
  locale: 'en',
  text: {
    'find.label': "Find in the grid",
    'find.count': "{i} / {n}",
    'find.said': "{i} of {n}",
    'find.none': "No results",
    'find.prev': "Previous result",
    'find.next': "Next result",
    'find.close': "Close find",
    'find.page': "Loaded page only",
  },
} satisfies FindMessages;
