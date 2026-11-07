import type { PivotBarMessages } from '../part-texts.js';

/** العربية، نصوص شريط الجدول المحوري (`@dzgrid/dom/pivot-bar`): تُضاف بعد نصوص -group و-pivot. `{column}`: اسم عمود؛ `{part}`: اسم جزء؛ `{n}` و`{total}`: مواضع. */
export const AR_PIVOT_BAR = {
  locale: 'ar',
  text: {
    'pivot.rows': "الصفوف",
    'pivot.columns': "الأعمدة",
    'pivot.values': "القيم",
    'pivot.valuesEmpty': "أضف قيمة لجمعها",
    'pivot.addValue': "إضافة قيمة",
    'pivot.removeValue': "إزالة {column} من القيم",
    'pivot.valueAdded': "أُضيفت قيمة: {column}",
    'pivot.valueRemoved': "أُزيل {column} من القيم",
    'pivot.valuePlaced': "{column}: الموضع {n} من {total}",
    'pivot.order': "ترتيب معكوس: {column}",
    'pivot.reversed': "{column}: ترتيب معكوس",
    'pivot.ordered': "{column}: الترتيب المعتاد",
    'pivot.refused': "لا يمكن وضع {column} في {part}",
    'pivot.mode': "الوضع المحوري",
  },
} satisfies PivotBarMessages;
