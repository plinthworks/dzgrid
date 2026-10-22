import type { TreeMessages } from '../part-texts.js';

/** Français, the tree's texts (`@dzgrid/dom/tree`): spread into the grid's messages, `text: { ...FR.text, ...FR_TREE.text }`. */
export const FR_TREE = {
  locale: 'fr',
  text: {
    'tree.expanded': { one: "{name} développé, {n} ligne", many: "{name} développé, {n} de lignes", other: "{name} développé, {n} lignes" },
    'tree.empty': "{name}, aucune ligne",
    'tree.collapsed': "{name} réduit",
    'tree.expandedSome': { one: "{n} ligne développée", many: "{n} de lignes développées", other: "{n} lignes développées" },
  },
} satisfies TreeMessages;
