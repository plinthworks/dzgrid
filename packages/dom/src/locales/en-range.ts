import type { RangeMessages } from '../part-texts.js';

/** English, the block's texts (`@dzgrid/dom/range`): spread into the grid's messages, `text: { ...EN.text, ...EN_RANGE.text }`. */
export const EN_RANGE = {
  locale: 'en',
  text: {
    'range.rows': { one: "{n} row", other: "{n} rows" },
    'range.cols': { one: "{n} column", other: "{n} columns" },
    'range.size': "{rows}, {cols} selected",
    'range.cleared': "Selection cleared",
    'range.reordered': "Selection cleared: the order changed",
  },
} satisfies RangeMessages;
