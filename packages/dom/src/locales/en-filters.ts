import type { FilterMessages } from '../messages.js';

/** English, the filters' texts (`@dzgrid/dom/filters`): spread into the grid's messages, `text: { ...EN.text, ...EN_FILTERS.text }`. */
export const EN_FILTERS = {
  locale: 'en',
  text: {
    'filter.inputLabel': "Filter {column}",
    'filter.summaryActive': "Filter active",
    'filter.clear': "Clear filter {column}",
    'filter.invalid': "{column}: not a valid number",
    'announce.filtered': "Filtered. {rows}",
    'announce.filteredOpen': "Filtered. Count unknown",
  },
} satisfies FilterMessages;
