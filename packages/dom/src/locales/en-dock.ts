import type { DockMessages } from '../part-texts.js';

/** English, the dock's texts (`@dzgrid/dom/dock`): added to the grid's messages, `text: { ...EN.text, ...EN_DOCK.text }`. `{panel}`: a panel's title; `{grid}`: the grid's name. */
export const EN_DOCK = {
  locale: 'en',
  text: {
    'dock.region': "{panel}, {grid}",
    'dock.tabs': "Panels",
    'dock.collapse': "Collapse {panel}",
    'dock.expand': "Expand {panel}",
    'dock.close': "Close {panel}",
    'dock.place': "Place {panel}",
    'dock.start': "At the start",
    'dock.end': "At the end",
    'dock.bottom': "At the bottom",
    'dock.width': "Width of {panel}",
    'dock.height': "Height of {panel}",
  },
} satisfies DockMessages;
