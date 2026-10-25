import type { RangeMessages } from '../part-texts.js';

/** Français, les textes du bloc de cellules (`@dzgrid/dom/range`) : à ajouter aux messages de la grille, `text: { ...FR.text, ...FR_RANGE.text }`. */
export const FR_RANGE = {
  locale: 'fr',
  text: {
    'range.rows': { one: "{n} ligne", other: "{n} lignes" },
    'range.cols': { one: "{n} colonne", other: "{n} colonnes" },
    'range.size': "{rows}, {cols} sélectionnées",
    'range.cleared': "Sélection effacée",
    'range.reordered': "Sélection effacée\u202F: l\u2019ordre a changé",
  },
} satisfies RangeMessages;
