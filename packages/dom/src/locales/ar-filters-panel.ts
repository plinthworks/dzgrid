import type { FiltersPanelMessages } from '../part-texts.js';

/** العربية، نصوص لوحة المرشحات (`@dzgrid/dom/filters-panel`): تُضاف إلى رسائل الجدول، `text: { ...AR.text, ...AR_FILTERS_PANEL.text }`. `{n}`: عدد. */
export const AR_FILTERS_PANEL = {
  locale: 'ar',
  text: {
    'fpanel.title': "المرشحات",
    'fpanel.close': "إغلاق المرشحات",
    'fpanel.clearAll': "مسح كل المرشحات",
    'fpanel.search': "البحث عن عمود",
    'fpanel.none': "لا يوجد عمود",
    'fpanel.matches': "الأعمدة الموجودة: {n}",
    'fpanel.active': "مرشح نشط",
    'fpanel.count': "النشطة: {n}",
  },
} satisfies FiltersPanelMessages;
