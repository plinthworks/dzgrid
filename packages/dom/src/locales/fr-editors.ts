import type { EditorsMessages } from '../part-texts.js';

/** Français, les textes des éditeurs (`@dzgrid/dom/editors`) : à ajouter après ceux de l'édition, `text: { ...FR.text, ...FR_EDIT.text, ...FR_EDITORS.text }`. */
export const FR_EDITORS = {
  locale: 'fr',
  text: {
    'edit.refused': "{column}\u202F: valeur refusée, {reason}",
    'edit.refusedDropped': "{column}\u202F: valeur refusée, modification annulée",
    'editors.fieldName': "{column}, {row}",
    'validation.parse': "nombre attendu",
    'validation.day': "date attendue ({pattern})",
    'validation.invalid-instant': "date et heure attendues",
    'validation.wall-time-skipped': "cette heure n\u2019existe pas ce jour-là (changement d\u2019heure)",
    'validation.wall-time-ambiguous': "cette heure existe deux fois ce jour-là",
  },
} satisfies EditorsMessages;
