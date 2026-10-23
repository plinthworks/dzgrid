import type { EditMessages } from '../part-texts.js';

/** Français, les textes de l'édition (`@dzgrid/dom/edit`) : à ajouter aux messages de la grille, `text: { ...FR.text, ...FR_EDIT.text }`. */
export const FR_EDIT = {
  locale: 'fr',
  text: {
    'edit.saving': "Enregistrement en cours",
    'edit.saveRefused': "{column}\u202F: non enregistré, {reason}. Valeur précédente rétablie.",
    'edit.reasonUnknown': "refusé par le serveur",
    'edit.failedMark': "Non enregistré\u202F: {reason}",
    'edit.stale': "Ordre périmé\u202F: remettre en ordre depuis l\u2019en-tête",
    'edit.rowStale': "Ne correspond plus au filtre",
    'edit.reapply': "Remettre en ordre",
    'edit.reapplied': { one: "Remis en ordre, {n} ligne", other: "Remis en ordre, {n} lignes" },
    'header.withStale': "{name}, à remettre en ordre",
    'validation.parse': "nombre attendu",
    'validation.day': "date attendue ({pattern})",
    'validation.invalid-instant': "date et heure attendues",
    'validation.wall-time-skipped': "cette heure n\u2019existe pas ce jour-là (changement d\u2019heure)",
    'validation.wall-time-ambiguous': "cette heure existe deux fois ce jour-là",
    'validation.required': "valeur obligatoire",
    'validation.min': "au moins {min}",
    'validation.max': "au plus {max}",
    'validation.pattern': "format incorrect",
    'validation.options': "choisir une valeur de la liste",
    'validation.invalid': "valeur invalide",
  },
} satisfies EditMessages;
