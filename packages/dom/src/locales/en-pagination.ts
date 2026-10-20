import type { PaginationMessages } from '../messages.js';

/** English, the pager's texts (`@dzgrid/dom/pagination`): spread into the grid's messages, `text: { ...EN.text, ...EN_PAGINATION.text }`. */
export const EN_PAGINATION = {
  locale: 'en',
  text: {
    'pager.label': "Pagination, {grid}",
    'pager.first': "First page",
    'pager.prev': "Previous page",
    'pager.next': "Next page",
    'pager.last': "Last page",
    'pager.page': "Page {page} of {count}",
    'pager.pageOpen': "Page {page}",
    'pager.size': "Rows per page",
    'count.range': "{from} to {to} of {total}",
    'count.rangeOpen': "{from} to {to}",
    'count.filtered': "{from} to {to} of {filtered} ({total} in all)",
    'selected.hidden': "{selected} (some not shown)",
    'selected.selectAll': { one: "Select {n} row", other: "Select all {n} rows" },
    'selected.clear': "Clear selection",
    'announce.page': "Page {page} of {count}. {range}",
    'announce.pageOpen': "Page {page}. {range}",
  },
} satisfies PaginationMessages;
