import type { GroupMessages } from '../part-texts.js';

/** Français, row grouping's texts (`@dzgrid/dom/grouping`, `@dzgrid/dom/group-zone`, the column menu's items): spread into the grid's messages, `text: { ...FR.text, ...FR_GROUP.text }`. */
export const FR_GROUP = {
  locale: 'fr',
  text: {
    'group.label': "{name} ({n})",
    'group.blank': "(Vide)",
    'group.total': "Total {name}",
    'group.grandTotal': "Total",
    'group.expanded': { one: "{name} développé, {n} ligne", many: "{name} développé, {n} de lignes", other: "{name} développé, {n} lignes" },
    'group.collapsed': "{name} réduit",
    'group.expandedSome': { one: "{n} groupe développé", many: "{n} de groupes développés", other: "{n} groupes développés" },
    'zone.label': "Regroupement des lignes",
    'zone.empty': "Glissez une colonne ici pour regrouper",
    'zone.remove': "Ne plus regrouper par {column}",
    'zone.grouped': "Regroupé par {column}",
    'zone.removed': "Plus regroupé par {column}",
    'zone.placed': "{column} : niveau {n} sur {total}",
    'menu.groupBy': "Regrouper par cette colonne",
    'menu.groupOff': "Ne plus regrouper par cette colonne",
  },
} satisfies GroupMessages;
