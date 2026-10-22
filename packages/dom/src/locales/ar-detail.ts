import type { DetailMessages } from '../part-texts.js';

/** العربية, the detail panels' texts (`@dzgrid/dom/detail`): spread into the grid's messages, `text: { ...AR.text, ...AR_DETAIL.text }`. `{name}`: the master's text in the row header column. To be read by an Arabic reader. */
export const AR_DETAIL = {
  locale: 'ar',
  text: {
    'detail.label': "تفاصيل {name}",
    'detail.expanded': "تم توسيع {name}",
    'detail.collapsed': "تم طي {name}",
  },
} satisfies DetailMessages;
