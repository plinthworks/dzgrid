import type { ColumnsMessages } from '../part-texts.js';

/** العربية، نصوص نقل الأعمدة (`@dzgrid/dom/columns`): تُضاف إلى رسائل الجدول، `text: { ...AR.text, ...AR_COLUMNS.text }`. */
export const AR_COLUMNS = {
  locale: 'ar',
  text: {
    'move.placed': "{column}: العمود {n} من {total}",
    'move.edge': "{column}: في الطرف أصلًا",
    'move.locked': "{column}: لا يمكن نقله",
    'move.cancelled': "أُلغي النقل",
    // اختيار الأعمدة (`@dzgrid/dom/columns-panel`، المرحلة 6، الخطوة 4).
    'chooser.title': "اختيار الأعمدة",
    'chooser.search': "البحث عن عمود",
    'chooser.list': "الأعمدة",
    'chooser.handle': "سحب {column}",
    'chooser.up': "نقل {column} إلى الأعلى",
    'chooser.down': "نقل {column} إلى الأسفل",
    'chooser.placed': "{column}: الموضع {n} من {total}",
    'chooser.showAll': "إظهار الكل",
    'chooser.reset': "إعادة التعيين",
    'chooser.close': "إغلاق",
    'chooser.none': "لا يوجد عمود",
    'chooser.matches': "الأعمدة الموجودة: {n}",
    'chooser.shown': "{column} ظاهر",
    'chooser.hidden': "{column} مخفي",
    'chooser.allShown': "كل الأعمدة ظاهرة",
    'chooser.resetDone': "أُعيد تعيين الأعمدة",
    'chooser.pinnedStart': "مثبّت في البداية",
    'chooser.pinnedEnd': "مثبّت في النهاية",
    'chooser.last': "آخر عمود ظاهر",
    'chooser.clearToMove': "أفرغ البحث لتغيير الترتيب",
  },
} satisfies ColumnsMessages;
