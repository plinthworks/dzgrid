import type { FiltersPanelMessages } from '../part-texts.js';

/** English, the filters panel's texts (`@dzgrid/dom/filters-panel`): added to the grid's messages, `text: { ...EN.text, ...EN_FILTERS_PANEL.text }`. `{n}`: a number. */
export const EN_FILTERS_PANEL = {
  locale: 'en',
  text: {
    'fpanel.title': "Filters",
    'fpanel.close': "Close the filters",
    'fpanel.clearAll': "Clear all filters",
    'fpanel.search': "Find a column",
    'fpanel.none': "No column",
    'fpanel.matches': "Columns found: {n}",
    'fpanel.active': "filter active",
    'fpanel.count': "Active: {n}",
  },
} satisfies FiltersPanelMessages;
