import type { FindMessages } from '../part-texts.js';

/** العربية، نصوص البحث في الجدول (`@dzgrid/dom/find`): تُضاف إلى رسائل الجدول، `text: { ...AR.text, ...AR_FIND.text }`. `{i}`: النتيجة الحالية، `{n}`: عددها. */
export const AR_FIND = {
  locale: 'ar',
  text: {
    'find.label': "البحث في الجدول",
    'find.count': "{i} / {n}",
    'find.said': "{i} من {n}",
    'find.none': "لا نتائج",
    'find.prev': "النتيجة السابقة",
    'find.next': "النتيجة التالية",
    'find.close': "إغلاق البحث",
    'find.page': "الصفحة المحمّلة فقط",
  },
} satisfies FindMessages;
