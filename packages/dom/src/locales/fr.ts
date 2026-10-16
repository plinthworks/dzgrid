import type { GridMessages } from '../messages.js';

/** Français. */
export const FR = {
  locale: 'fr',
  text: {
    'grid.label': "Grille de données",
    'grid.noRows': "Aucune ligne",
    'grid.noMatches': "Aucune ligne ne correspond aux filtres",
    'grid.loading': "Chargement\u2026",
    'grid.error': "Les données n\u2019ont pas pu être chargées",
    'sort.ascending': "ordre croissant",
    'sort.descending': "ordre décroissant",
    'sort.none': "non trié",
    'sort.priority': "Tri {n}",
    'announce.sorted': "Trié par {column}, {direction}. {rows}",
    'announce.sortCleared': "Tri retiré",
    'announce.rows': { one: "{n} ligne", many: "{n} de lignes", other: "{n} lignes" },
    'announce.selected': { one: "{n} ligne sélectionnée", many: "{n} de lignes sélectionnées", other: "{n} lignes sélectionnées" },
    'announce.rangeCancelled': "Plage annulée\u202F: sa première ligne n\u2019est plus affichée",
    'announce.loading': "Chargement",
    'announce.error': "Échec du chargement",
    'selection.row': "Sélectionner la ligne",
    'selection.all': "Sélectionner toutes les lignes",
    'selection.column': "Sélection",
    'resize.handle': "Redimensionner {column}",
    'pinned.start': "Épinglée au début",
    'pinned.end': "Épinglée à la fin",
    'header.withSort': "{header}, {priority}",
    'header.sortHint': "Entrée pour trier, Maj+Entrée pour ajouter au tri",
  },
} satisfies GridMessages;
