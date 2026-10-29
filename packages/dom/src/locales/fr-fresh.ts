import type { FreshMessages } from '../part-texts.js';

/** Français, la phrase des nouvelles lignes (`@dzgrid/dom/fresh-rows`) : ajoutée aux messages de la grille, `text: { ...FR.text, ...FR_FRESH.text }`. */
export const FR_FRESH = {
  locale: 'fr',
  text: {
    'announce.fresh': { one: "{n} nouvelle ligne", many: "{n} de nouvelles lignes", other: "{n} nouvelles lignes" },
  },
} satisfies FreshMessages;
