import type { ColumnsMessages } from '../part-texts.js';

/** العربية، نصوص نقل الأعمدة (`@dzgrid/dom/columns`): تُضاف إلى رسائل الجدول، `text: { ...AR.text, ...AR_COLUMNS.text }`. */
export const AR_COLUMNS = {
  locale: 'ar',
  text: {
    'move.placed': "{column}: العمود {n} من {total}",
    'move.edge': "{column}: في الطرف أصلًا",
    'move.locked': "{column}: لا يمكن نقله",
    'move.cancelled': "أُلغي النقل",
  },
} satisfies ColumnsMessages;
