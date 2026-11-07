import type { PivotMessages } from '../part-texts.js';

/** Français, les textes du tableau croisé (`@dzgrid/dom/pivot`, la bande « Colonnes », le « Total » du menu) : ajoutés aux messages de la grille, `text: { ...FR.text, ...FR_GROUP.text, ...FR_PIVOT.text }`. `{column}` : l'en-tête d'une colonne ; `{n}` : un nombre ; `{name}` : l'en-tête d'une bande ; `{fn}` : le nom d'une fonction. */
export const FR_PIVOT = {
  locale: 'fr',
  text: {
    'pivot.label': "Colonnes du tableau croisé",
    'pivot.empty': "Ajoutez une colonne ici pour la mettre en colonnes",
    'pivot.remove': "Retirer {column} des colonnes",
    'pivot.grouped': "Mis en colonnes : {column}",
    'pivot.removed': "{column} retiré des colonnes",
    'pivot.placed': "{column} : niveau {n} sur {total}",
    'pivot.add': "Ajouter une colonne",
    'zone.add': "Ajouter une colonne",
    'pivot.total': "Total",
    'pivot.subtotal': "Total {name}",
    'pivot.count': { one: "{n} colonne", many: "{n} de colonnes", other: "{n} colonnes" },
    'pivot.tooMany': "{n} colonnes : trop pour l'écran ; retirez une colonne",
    'pivot.switch': "Tableau croisé",
    'pivot.fnSaid': "{column} : {fn}",
    'pivot.valueChip': "{fn}({column})",
    'menu.pivotBy': "Mettre en colonnes",
    'menu.pivotOff': "Ne plus mettre en colonnes",
    'menu.total': "Total",
    'fn.sum': "Somme",
    'fn.avg': "Moyenne",
    'fn.min': "Min",
    'fn.max': "Max",
    'fn.count': "Nombre",
  },
} satisfies PivotMessages;
