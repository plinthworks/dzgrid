import type { ColumnsMessages } from '../part-texts.js';

/** Français, les textes du déplacement des colonnes (`@dzgrid/dom/columns`) : à ajouter aux messages de la grille, `text: { ...FR.text, ...FR_COLUMNS.text }`. */
export const FR_COLUMNS = {
  locale: 'fr',
  text: {
    'move.placed': "{column}\u202F: colonne {n} sur {total}",
    'move.edge': "{column}\u202F: déjà au bord",
    'move.locked': "{column}\u202F: ne se déplace pas",
    'move.cancelled': "Déplacement annulé",
  },
} satisfies ColumnsMessages;
