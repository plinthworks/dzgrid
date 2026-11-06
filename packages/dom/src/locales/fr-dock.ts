import type { DockMessages } from '../part-texts.js';

/** Français, les textes du dock (`@dzgrid/dom/dock`) : ajoutés aux messages de la grille, `text: { ...FR.text, ...FR_DOCK.text }`. `{panel}` : le titre d'un panneau ; `{grid}` : le nom de la grille. */
export const FR_DOCK = {
  locale: 'fr',
  text: {
    'dock.region': "{panel}, {grid}",
    'dock.tabs': "Panneaux",
    'dock.collapse': "Replier {panel}",
    'dock.expand': "Déplier {panel}",
    'dock.close': "Fermer {panel}",
    'dock.place': "Placer {panel}",
    'dock.start': "Au début",
    'dock.end': "À la fin",
    'dock.bottom': "En bas",
    'dock.width': "Largeur de {panel}",
    'dock.height': "Hauteur de {panel}",
  },
} satisfies DockMessages;
