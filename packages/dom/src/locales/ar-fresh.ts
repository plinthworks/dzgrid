import type { FreshMessages } from '../part-texts.js';

/** العربية، جملة الصفوف الجديدة (`@dzgrid/dom/fresh-rows`): تُضاف إلى رسائل الجدول، `text: { ...AR.text, ...AR_FRESH.text }`. */
export const AR_FRESH = {
  locale: 'ar',
  text: {
    'announce.fresh': { zero: "{n} صف جديد", one: "صف جديد واحد ({n})", two: "صفان جديدان ({n})", few: "{n} صفوف جديدة", many: "{n} صفا جديدا", other: "{n} صف جديد" },
  },
} satisfies FreshMessages;
