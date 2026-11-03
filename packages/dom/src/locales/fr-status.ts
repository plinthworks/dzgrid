import type { StatusMessages } from '../part-texts.js';

/** Français, les textes de la barre d'état (`@dzgrid/dom/statusbar`) : ajoutés aux messages de la grille, `text: { ...FR.text, ...FR_STATUS.text }`. `{v}` : le chiffre. */
export const FR_STATUS = {
  locale: 'fr',
  text: {
    'status.label': "Barre d'état, {grid}",
    'status.rows': "Lignes\u202F: {v}",
    'status.filtered': "Filtrées\u202F: {v}",
    'status.selected': "Sélectionnées\u202F: {v}",
    'status.all': "Sélectionnées\u202F: toutes",
    'status.count': "Nombre\u202F: {v}",
    'status.sum': "Somme\u202F: {v}",
    'status.avg': "Moyenne\u202F: {v}",
    'status.min': "Min\u202F: {v}",
    'status.max': "Max\u202F: {v}",
    'status.partial': "(partiel)",
    'status.read': "Lire les totaux",
    'status.none': "Aucun total",
    'status.sep': ", ",
  },
} satisfies StatusMessages;
