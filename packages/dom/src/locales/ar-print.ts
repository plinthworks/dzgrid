import type { PrintMessages } from '../part-texts.js';

/** العربية، نصوص الجدول المطبوع (`@dzgrid/dom/print`): تُضاف إلى رسائل الجدول، `text: { ...AR.text, ...AR_PRINT.text }`. */
export const AR_PRINT = {
  locale: 'ar',
  text: {
    'print.truncated': "أول {n} صف من {total}",
    'print.page': "الصفحة {page} من {pages}",
  },
} satisfies PrintMessages;
