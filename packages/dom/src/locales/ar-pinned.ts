import type { PinnedMessages } from '../part-texts.js';

/** العربية، نصوص الصفوف المثبّتة (`@dzgrid/dom/pinned-rows`): تُضاف إلى رسائل الجدول، `text: { ...AR.text, ...AR_PINNED.text }`. */
export const AR_PINNED = {
  locale: 'ar',
  text: {
    'pinned.top': "صفوف مثبّتة في الأعلى",
    'pinned.bottom': "صفوف مثبّتة في الأسفل",
  },
} satisfies PinnedMessages;
