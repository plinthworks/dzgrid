import type { PrintMessages } from '../part-texts.js';

/** Français, les textes du tableau imprimé (`@dzgrid/dom/print`) : ajoutés aux messages de la grille, `text: { ...FR.text, ...FR_PRINT.text }`. */
export const FR_PRINT = {
  locale: 'fr',
  text: {
    'print.truncated': "{n} premières lignes sur {total}",
    'print.page': "Page {page} sur {pages}",
  },
} satisfies PrintMessages;
