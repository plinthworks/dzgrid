import type { FormsMessages } from '../part-texts.js';

/**
 * French, the form editing texts (1.15.0: `@dzgrid/dom/edit-batch`, `/editors-row`, `/editors-search`): spread into the
 * grid's messages after the editing ones, `text: { ...FR.text, ...FR_EDIT.text, ...FR_EDITORS.text, ...FR_FORMS.text }`.
 */
export const FR_FORMS = {
  locale: 'fr',
  text: {
    "edit.unsaved": "Non enregistré",
    "edit.discarded": { one: "{n} modification abandonnée", other: "{n} modifications abandonnées" },
    "edit.notSent": "Rien n'est envoyé : {column}, {reason}",
    "edit.rowEditing": { one: "Modification de la ligne {row}, {n} champ", other: "Modification de la ligne {row}, {n} champs" },
    "edit.rowCancelled": "Ligne inchangée",
    "edit.searching": "Recherche…",
    "edit.noResult": "Aucun résultat",
    "edit.searchFailed": "La recherche a échoué",
  },
} satisfies FormsMessages;
