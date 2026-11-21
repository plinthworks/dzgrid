import type { AdvancedFilterMessages } from '../part-texts.js';

/** Français, les textes du filtre avancé (`@dzgrid/dom/advanced-filter`) : ajoutés aux messages de la grille, `text: { ...FR.text, ...FR_ADVANCED_FILTER.text }`. `{n}` : un nombre. */
export const FR_ADVANCED_FILTER = {
  locale: 'fr',
  text: {
    'adv.title': "Filtre avancé",
    'adv.join': "Garder les lignes qui vérifient",
    'adv.and': "Tous (ET)",
    'adv.or': "Au moins un (OU)",
    'adv.groupAnd': "Groupe\u202F: tous (ET)",
    'adv.groupOr': "Groupe\u202F: au moins un (OU)",
    'adv.addCondition': "+ Condition",
    'adv.addGroup': "+ Groupe",
    'adv.removeCondition': "Supprimer la condition",
    'adv.removeGroup': "Supprimer le groupe",
    'adv.column': "Colonne",
    'adv.pick': "Choisir une colonne",
    'adv.condition': "Condition {n}",
    'adv.apply': "Appliquer",
    'adv.clear': "Effacer",
    'adv.cancel': "Annuler",
    'adv.conditionAdded': "Condition ajoutée",
    'adv.groupAdded': "Groupe ajouté",
    'adv.removed': "Supprimé",
  },
} satisfies AdvancedFilterMessages;
