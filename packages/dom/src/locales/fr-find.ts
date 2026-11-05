import type { FindMessages } from '../part-texts.js';

/** Français, les textes de la recherche dans la grille (`@dzgrid/dom/find`) : ajoutés aux messages de la grille, `text: { ...FR.text, ...FR_FIND.text }`. `{i}` : le résultat courant, `{n}` : leur nombre. */
export const FR_FIND = {
  locale: 'fr',
  text: {
    'find.label': "Rechercher dans la grille",
    'find.count': "{i} / {n}",
    'find.said': "{i} sur {n}",
    'find.none': "Aucun résultat",
    'find.prev': "Résultat précédent",
    'find.next': "Résultat suivant",
    'find.close': "Fermer la recherche",
    'find.page': "Page chargée seulement",
    'find.held': "Lignes chargées seulement",
  },
} satisfies FindMessages;
