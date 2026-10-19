import type { FilterMessages } from '../messages.js';

/** Français, les textes des filtres (`@dzgrid/dom/filters`) : à ajouter aux messages de la grille, `text: { ...FR.text, ...FR_FILTERS.text }`. */
export const FR_FILTERS = {
  locale: 'fr',
  text: {
    'filter.inputLabel': "Filtrer {column}",
    'filter.summaryActive': "Filtre actif",
    'filter.clear': "Effacer le filtre {column}",
    'filter.invalid': "{column}\u202F: nombre non valide",
    'announce.filtered': "Filtré. {rows}",
    'announce.filteredOpen': "Filtré. Nombre de lignes inconnu",
  },
} satisfies FilterMessages;
