import type { PartsMessages } from '../part-texts.js';

/** Français, les textes des pièces de cellule (`@dzgrid/dom/parts`) : à ajouter aux messages de la grille, `text: { ...FR.text, ...FR_PARTS.text }`. */
export const FR_PARTS = {
  locale: 'fr',
  text: {
    'cell.yes': "Oui",
    'cell.no': "Non",
  },
} satisfies PartsMessages;
