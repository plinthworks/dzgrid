import type { ColumnsMessages } from '../part-texts.js';

/** English, the texts of moving columns (`@dzgrid/dom/columns`) and of the column chooser (`@dzgrid/dom/columns-panel`): added to the grid's messages, `text: { ...EN.text, ...EN_COLUMNS.text }`. */
export const EN_COLUMNS = {
  locale: 'en',
  text: {
    'move.placed': "{column}: column {n} of {total}",
    'move.edge': "{column}: already at the edge",
    'move.locked': "{column}: cannot be moved",
    'move.cancelled': "Move cancelled",
    // The keyboard resize mode and auto-size (Phase 6 step 6, column-resize.md).
    'size.mode': "Resize {column}: {width} pixels. Arrows to change, Enter to keep, Escape to cancel",
    'size.modeHint': "resize mode",
    'size.width': "{column}: {width} pixels",
    'size.min': ", minimum",
    'size.max': ", maximum",
    'size.cancelled': "Resize cancelled",
    'size.autoAll': "Columns fitted: {n}",
    'size.locked': "{column}: fixed width",
    // The column chooser (`@dzgrid/dom/columns-panel`, Phase 6 step 4, owner Q4-1).
    'chooser.title': "Choose columns",
    'chooser.search': "Search a column",
    'chooser.list': "Columns",
    'chooser.handle': "Drag {column}",
    'chooser.up': "Move {column} up",
    'chooser.down': "Move {column} down",
    'chooser.placed': "{column}: place {n} of {total}",
    'chooser.showAll': "Show all",
    'chooser.reset': "Reset",
    'chooser.close': "Close",
    'chooser.none': "No column",
    'chooser.matches': "Columns found: {n}",
    'chooser.shown': "{column} shown",
    'chooser.hidden': "{column} hidden",
    'chooser.allShown': "All columns shown",
    'chooser.resetDone': "Columns reset",
    'chooser.pinnedStart': "pinned to the start",
    'chooser.pinnedEnd': "pinned to the end",
    'chooser.last': "the last shown column",
    'chooser.clearToMove': "Empty the search to change the order",
    'chooser.inClosedGroup': "hidden by its closed group",
    // Collapsible header groups (`@dzgrid/dom/spans`, Phase 6 step 7, owner Q8-1).
    'group.toggle': "Open or close {group}",
    'group.open': "{group}, group open",
    'group.closed': "{group}, group closed",
    'group.closedSaid': "{group} closed, columns shown: {n}",
    'group.openedSaid': "{group} open, columns shown: {n}",
  },
} satisfies ColumnsMessages;
