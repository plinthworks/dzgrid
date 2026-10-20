import type { PaginationMessages } from '../messages.js';

/** العربية, the pager's texts (`@dzgrid/dom/pagination`): spread into the grid's messages, `text: { ...AR.text, ...AR_PAGINATION.text }`. To be read by an Arabic reader. */
export const AR_PAGINATION = {
  locale: 'ar',
  text: {
    'pager.label': "ترقيم الصفحات\u060C {grid}",
    'pager.first': "الصفحة الأولى",
    'pager.prev': "الصفحة السابقة",
    'pager.next': "الصفحة التالية",
    'pager.last': "الصفحة الأخيرة",
    'pager.page': "الصفحة {page} من {count}",
    'pager.pageOpen': "الصفحة {page}",
    'pager.size': "عدد الصفوف في الصفحة",
    'count.range': "{from} إلى {to} من {total}",
    'count.rangeOpen': "{from} إلى {to}",
    'count.filtered': "{from} إلى {to} من {filtered} ({total} في المجموع)",
    'selected.hidden': "{selected} (بعضها غير معروض)",
    'selected.selectAll': { zero: "تحديد {n} صف", one: "تحديد صف واحد ({n})", two: "تحديد الصفين ({n})", few: "تحديد كل الصفوف ({n})", many: "تحديد كل الصفوف ({n})", other: "تحديد كل الصفوف ({n})" },
    'selected.clear': "مسح التحديد",
    'announce.page': "الصفحة {page} من {count}. {range}",
    'announce.pageOpen': "الصفحة {page}. {range}",
  },
} satisfies PaginationMessages;
