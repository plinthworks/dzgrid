import type { RowNumbersMessages } from '../part-texts.js';

/** Français, les textes des numéros de ligne (`@dzgrid/dom/row-numbers`) : ajoutés aux messages de la grille, `text: { ...FR.text, ...FR_ROW_NUMBERS.text }`. */
export const FR_ROW_NUMBERS = {
  locale: 'fr',
  text: {
    'rownum.header': "N° de ligne",
  },
} satisfies RowNumbersMessages;
