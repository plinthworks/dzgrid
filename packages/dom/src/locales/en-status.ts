import type { StatusMessages } from '../part-texts.js';

/** English, the status bar's texts (`@dzgrid/dom/statusbar`): added to the grid's messages, `text: { ...EN.text, ...EN_STATUS.text }`. `{v}`: the figure. */
export const EN_STATUS = {
  locale: 'en',
  text: {
    'status.label': "Status bar, {grid}",
    'status.rows': "Rows: {v}",
    'status.filtered': "Filtered: {v}",
    'status.selected': "Selected: {v}",
    'status.all': "Selected: all",
    'status.count': "Count: {v}",
    'status.sum': "Sum: {v}",
    'status.avg': "Average: {v}",
    'status.min': "Min: {v}",
    'status.max': "Max: {v}",
    'status.partial': "(partial)",
    'status.read': "Read the totals",
    'status.none': "No totals",
    'status.sep': ", ",
  },
} satisfies StatusMessages;
