import type { PaginationMessages } from '../messages.js';

/** Français, les textes du pied de page (`@dzgrid/dom/pagination`) : à ajouter aux messages de la grille, `text: { ...FR.text, ...FR_PAGINATION.text }`. */
export const FR_PAGINATION = {
  locale: 'fr',
  text: {
    'pager.label': "Pagination, {grid}",
    'pager.first': "Première page",
    'pager.prev': "Page précédente",
    'pager.next': "Page suivante",
    'pager.last': "Dernière page",
    'pager.page': "Page {page} sur {count}",
    'pager.pageOpen': "Page {page}",
    'pager.size': "Lignes par page",
    'count.range': "{from} à {to} sur {total}",
    'count.rangeOpen': "{from} à {to}",
    'count.filtered': "{from} à {to} sur {filtered} ({total} au total)",
    'selected.hidden': "{selected} (certaines non affichées)",
    'selected.selectAll': { one: "Sélectionner {n} ligne", many: "Sélectionner les {n} de lignes", other: "Sélectionner les {n} lignes" },
    'selected.clear': "Effacer la sélection",
    'announce.page': "Page {page} sur {count}. {range}",
    'announce.pageOpen': "Page {page}. {range}",
  },
} satisfies PaginationMessages;
