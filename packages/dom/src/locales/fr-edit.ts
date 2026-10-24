import type { EditMessages } from '../part-texts.js';

/** Français, les textes de l'édition (`@dzgrid/dom/edit`) : à ajouter aux messages de la grille, `text: { ...FR.text, ...FR_EDIT.text }`. */
export const FR_EDIT = {
  locale: 'fr',
  text: {
    'edit.saving': "Enregistrement en cours",
    'edit.saveRefused': "{column}\u202F: non enregistré, {reason}. Valeur précédente rétablie.",
    'edit.reasonUnknown': "refusé par le serveur",
    'edit.reasonNetwork': "serveur injoignable",
    'edit.failedMark': "Non enregistré\u202F: {reason}",
    'edit.stale': "Ordre périmé\u202F: remettre en ordre depuis l\u2019en-tête",
    'edit.rowStale': "Ne correspond plus au filtre",
    'edit.reapply': "Remettre en ordre",
    'edit.reapplied': { one: "Remis en ordre, {n} ligne", other: "Remis en ordre, {n} lignes" },
    'edit.undone': "Annulé\u202F: {column}",
    'edit.undoneMany': { one: "Annulé\u202F: {n} cellule", other: "Annulé\u202F: {n} cellules" },
    'edit.redone': "Rétabli\u202F: {column}",
    'edit.redoneMany': { one: "Rétabli\u202F: {n} cellule", other: "Rétabli\u202F: {n} cellules" },
    'edit.undoSkipped': { one: "{n} non annulée\u202F: la valeur a changé depuis", other: "{n} non annulées\u202F: la valeur a changé depuis" },
    'edit.redoSkipped': { one: "{n} non rétablie\u202F: la valeur a changé depuis", other: "{n} non rétablies\u202F: la valeur a changé depuis" },
    'edit.nothingToUndo': "Rien à annuler",
    'edit.nothingToRedo': "Rien à rétablir",
    'header.withStale': "{name}, à remettre en ordre",
    'validation.required': "valeur obligatoire",
    'validation.min': "au moins {min}",
    'validation.max': "au plus {max}",
    'validation.pattern': "format incorrect",
    'validation.options': "choisir une valeur de la liste",
    'validation.invalid': "valeur invalide",
  },
} satisfies EditMessages;
