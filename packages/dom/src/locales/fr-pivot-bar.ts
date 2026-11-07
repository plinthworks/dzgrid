import type { PivotBarMessages } from '../part-texts.js';

/** Français, les textes de la barre du tableau croisé (`@dzgrid/dom/pivot-bar`) : ajoutés après ceux de -group et -pivot, `text: { ...FR.text, ...FR_GROUP.text, ...FR_PIVOT.text, ...FR_PIVOT_BAR.text }`. `{column}` : le nom d'une colonne ; `{part}` : le nom d'une partie ; `{n}`, `{total}` : des places. */
export const FR_PIVOT_BAR = {
  locale: 'fr',
  text: {
    'pivot.rows': "Lignes",
    'pivot.columns': "Colonnes",
    'pivot.values': "Valeurs",
    'pivot.valuesEmpty': "Ajoutez une valeur à totaliser",
    'pivot.addValue': "Ajouter une valeur",
    'pivot.removeValue': "Retirer {column} des valeurs",
    'pivot.valueAdded': "Valeur ajoutée : {column}",
    'pivot.valueRemoved': "{column} retiré des valeurs",
    'pivot.valuePlaced': "{column} : place {n} sur {total}",
    'pivot.order': "Ordre inverse : {column}",
    'pivot.reversed': "{column} : ordre inverse",
    'pivot.ordered': "{column} : ordre habituel",
    'pivot.refused': "{column} ne peut pas aller dans {part}",
    'pivot.mode': "Mode pivot",
  },
} satisfies PivotBarMessages;
