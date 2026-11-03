import type { FiltersPanelMessages } from '../part-texts.js';

/** Français, les textes du panneau des filtres (`@dzgrid/dom/filters-panel`) : ajoutés aux messages de la grille, `text: { ...FR.text, ...FR_FILTERS_PANEL.text }`. `{n}` : un nombre. */
export const FR_FILTERS_PANEL = {
  locale: 'fr',
  text: {
    'fpanel.title': "Filtres",
    'fpanel.close': "Fermer les filtres",
    'fpanel.clearAll': "Effacer tous les filtres",
    'fpanel.search': "Chercher une colonne",
    'fpanel.none': "Aucune colonne",
    'fpanel.matches': "Colonnes trouvées\u202F: {n}",
    'fpanel.active': "filtre actif",
    'fpanel.count': "Actifs\u202F: {n}",
  },
} satisfies FiltersPanelMessages;
