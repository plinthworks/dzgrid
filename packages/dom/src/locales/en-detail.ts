import type { DetailMessages } from '../part-texts.js';

/** English, the detail panels' texts (`@dzgrid/dom/detail`): spread into the grid's messages, `text: { ...EN.text, ...EN_DETAIL.text }`. `{name}`: the master's text in the row header column. */
export const EN_DETAIL = {
  locale: 'en',
  text: {
    'detail.label': "Details of {name}",
    'detail.expanded': "{name} expanded",
    'detail.collapsed': "{name} collapsed",
  },
} satisfies DetailMessages;
