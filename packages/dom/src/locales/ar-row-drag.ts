import type { RowDragMessages } from '../part-texts.js';

/** العربية، نصوص نقل الصفوف (`@dzgrid/dom/row-drag`): تُضاف إلى رسائل الشبكة، `text: { ...AR.text, ...AR_ROW_DRAG.text }`. يُسمّى الصف بموضعه، لا بمحتواه. */
export const AR_ROW_DRAG = {
  locale: 'ar',
  text: {
    'rmove.placed': "الصف {n} من {total}",
    'rmove.placedLevel': "الصف {n} من {total}، المستوى {level}",
    'rmove.many': "الصفوف المنقولة: {n}",
    'rmove.hidden': "نُقل الصف",
    'rmove.edge': "الصف عند الحافة",
    'rmove.locked': "لا يمكن نقل هذا الصف",
    'rmove.sorted': "الترتيب مفعّل: لا يمكن نقل الصفوف",
    'rmove.grouped': "الصفوف مجمّعة: لا يمكن نقلها",
    'rmove.refused': "لا يمكن النقل إلى هنا",
    'rmove.tooMany': "صفوف كثيرة جدًا ({max} على الأكثر)",
    'rmove.cancelled': "أُلغي النقل",
    'rmove.ghost': "صفوف: {n}",
    'rmove.up': "نقل لأعلى",
    'rmove.down': "نقل لأسفل",
    'rmove.top': "إلى الأعلى",
    'rmove.bottom': "إلى الأسفل",
    'rmove.in': "إزاحة للداخل",
    'rmove.out': "إزاحة للخارج",
  },
} satisfies RowDragMessages;
