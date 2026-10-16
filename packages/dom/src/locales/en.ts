import type { GridMessages } from '../messages.js';

/** English. */
export const EN = {
  locale: 'en',
  text: {
    'grid.label': "Data grid",
    'grid.noRows': "No rows",
    'grid.noMatches': "No rows match the filters",
    'grid.loading': "Loading\u2026",
    'grid.error': "The data could not be loaded",
    'sort.ascending': "Sorted ascending",
    'sort.descending': "Sorted descending",
    'sort.none': "Not sorted",
    'sort.priority': "Sort {n}",
    'announce.sorted': "Sorted by {column}, {direction}",
    'announce.sortCleared': "Sort removed",
    'announce.rows': { one: "{n} row", other: "{n} rows" },
    'announce.selected': { one: "{n} row selected", other: "{n} rows selected" },
    'announce.rangeCancelled': "Range cancelled: its first row is no longer shown",
    'announce.loading': "Loading",
    'announce.error': "Loading failed",
    'selection.row': "Select row",
    'selection.all': "Select all rows",
    'selection.column': "Selection",
    'resize.handle': "Resize {column}",
    'pinned.start': "Pinned at the start",
    'pinned.end': "Pinned at the end",
    'header.sortHint': "Press Enter to sort, Shift+Enter to add to the sort",
  },
} satisfies GridMessages;
