import type { FilterMessages } from '../messages.js';

/** العربية, the filters' texts (`@dzgrid/dom/filters`): spread into the grid's messages, `text: { ...AR.text, ...AR_FILTERS.text }`. To be read by an Arabic reader. */
export const AR_FILTERS = {
  locale: 'ar',
  text: {
    'filter.inputLabel': "ترشيح {column}",
    'filter.summaryActive': "المرشح نشط",
    'filter.clear': "مسح مرشح {column}",
    'filter.invalid': "{column}: ليس رقما صالحا",
    'announce.filtered': "تم الترشيح. {rows}",
    'announce.filteredOpen': "تم الترشيح. عدد الصفوف غير معروف",
  },
} satisfies FilterMessages;
