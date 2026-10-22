import type { TreeMessages } from '../part-texts.js';

/** English, the tree's texts (`@dzgrid/dom/tree`): spread into the grid's messages, `text: { ...EN.text, ...EN_TREE.text }`. `{name}`: the row's label in the tree column. */
export const EN_TREE = {
  locale: 'en',
  text: {
    'tree.expanded': { one: "{name} expanded, {n} row", other: "{name} expanded, {n} rows" },
    'tree.empty': "{name}, no rows",
    'tree.collapsed': "{name} collapsed",
    'tree.expandedSome': { one: "{n} row expanded", other: "{n} rows expanded" },
  },
} satisfies TreeMessages;
