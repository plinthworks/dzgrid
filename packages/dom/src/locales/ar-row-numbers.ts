import type { RowNumbersMessages } from '../part-texts.js';

/** العربية، نصوص أرقام الصفوف (`@dzgrid/dom/row-numbers`): تُضاف إلى رسائل الجدول، `text: { ...AR.text, ...AR_ROW_NUMBERS.text }`. */
export const AR_ROW_NUMBERS = {
  locale: 'ar',
  text: {
    'rownum.header': "رقم الصف",
  },
} satisfies RowNumbersMessages;
