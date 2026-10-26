import type { FillMessages } from '../part-texts.js';

/** Français, les textes de la recopie (`@dzgrid/dom/fill`) : à ajouter aux messages de la grille après ceux du bloc, `text: { ...FR.text, ...FR_RANGE.text, ...FR_FILL.text }`. */
export const FR_FILL = {
  locale: 'fr',
  text: {
    'fill.filled': "Cellules recopiées\u202F: {n}",
    'fill.bulk': "Cellules modifiées\u202F: {n}",
    'fill.mode': "Recopie\u202F: flèches pour étendre, Entrée pour écrire, Échap pour annuler",
    'fill.pick': "Recopie\u202F: cliquez la cellule jusqu\u2019où recopier\u202F; Échap pour annuler",
    'fill.cancel': "Recopie annulée",
    'fill.down': "Vers le bas\u202F: {n}",
    'fill.up': "Vers le haut\u202F: {n}",
    'fill.end': "Vers la fin\u202F: {n}",
    'fill.start': "Vers le début\u202F: {n}",
  },
} satisfies FillMessages;
