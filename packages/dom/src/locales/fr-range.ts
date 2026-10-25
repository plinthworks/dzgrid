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
    'range.copied': "Cellules copiées\u202F: {n}",
    'range.cut': "Cellules coupées\u202F: {n}",
    'range.pasted': "Cellules collées\u202F: {n}",
    'range.erased': "Cellules effacées\u202F: {n}",
    'range.refused': "\u202F; refusées\u202F: {n}",
    'range.readOnly': "\u202F; en lecture seule\u202F: {n}",
    'range.tooLong': "\u202F; trop longues\u202F: {n}",
    'range.outside': "\u202F; hors de la grille\u202F: {n}",
    'range.tooBig': "Collage trop grand\u202F: au plus {max} cellules\u202F; rien n\u2019est collé",
    'range.noCopy': "Copie non autorisée",
  },
} satisfies RangeMessages;
