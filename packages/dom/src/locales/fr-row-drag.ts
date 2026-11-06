import type { RowDragMessages } from '../part-texts.js';

/** Français, les textes du déplacement des lignes (`@dzgrid/dom/row-drag`) : à ajouter aux messages de la grille, `text: { ...FR.text, ...FR_ROW_DRAG.text }`. Les lignes sont nommées par leur place, jamais par leur contenu. */
export const FR_ROW_DRAG = {
  locale: 'fr',
  text: {
    'rmove.placed': "Ligne {n} sur {total}",
    'rmove.placedLevel': "Ligne {n} sur {total}, niveau {level}",
    'rmove.many': "{n} lignes déplacées",
    'rmove.hidden': "Ligne déplacée",
    'rmove.edge': "Déjà au bord",
    'rmove.locked': "Cette ligne ne se déplace pas",
    'rmove.sorted': "Tri actif\u202F: déplacement impossible",
    'rmove.grouped': "Regroupé\u202F: déplacement impossible",
    'rmove.refused': "Déplacement refusé ici",
    'rmove.tooMany': "Trop de lignes ({max} au plus)",
    'rmove.cancelled': "Déplacement annulé",
    'rmove.ghost': "{n} lignes",
    'rmove.up': "Monter",
    'rmove.down': "Descendre",
    'rmove.top': "En haut",
    'rmove.bottom': "En bas",
    'rmove.in': "Rentrer",
    'rmove.out': "Ressortir",
  },
} satisfies RowDragMessages;
