import type { FillMessages } from '../part-texts.js';

/** English, the fill's texts (`@dzgrid/dom/fill`): added to the grid's messages after the range texts, `text: { ...EN.text, ...EN_RANGE.text, ...EN_FILL.text }`. */
export const EN_FILL = {
  locale: 'en',
  text: {
    'fill.filled': "Cells filled: {n}",
    'fill.bulk': "Cells changed: {n}",
    'fill.mode': "Fill: arrows to extend, Enter to write, Escape to cancel",
    'fill.pick': "Fill: click the cell to fill up to; Escape to cancel",
    'fill.cancel': "Fill cancelled",
    'fill.down': "Down: {n}",
    'fill.up': "Up: {n}",
    'fill.end': "To the end: {n}",
    'fill.start': "To the start: {n}",
  },
} satisfies FillMessages;
