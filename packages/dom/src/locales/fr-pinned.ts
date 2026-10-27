import type { PinnedMessages } from '../part-texts.js';

/** Français, les textes des lignes épinglées (`@dzgrid/dom/pinned-rows`) : ajoutés aux messages de la grille, `text: { ...FR.text, ...FR_PINNED.text }`. */
export const FR_PINNED = {
  locale: 'fr',
  text: {
    'pinned.top': "Lignes épinglées en haut",
    'pinned.bottom': "Lignes épinglées en bas",
  },
} satisfies PinnedMessages;
