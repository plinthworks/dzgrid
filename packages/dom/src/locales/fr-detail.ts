import type { DetailMessages } from '../part-texts.js';

/** Français, the detail panels' texts (`@dzgrid/dom/detail`): spread into the grid's messages, `text: { ...FR.text, ...FR_DETAIL.text }`. `{name}`: the master's text in the row header column. */
export const FR_DETAIL = {
  locale: 'fr',
  text: {
    'detail.label': "Détails de {name}",
    'detail.expanded': "{name} développé",
    'detail.collapsed': "{name} réduit",
  },
} satisfies DetailMessages;
