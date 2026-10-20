import type { RulesMessages } from '../part-texts.js';

/** Français, les textes des règles de sélection (`@dzgrid/dom/rules`) : à ajouter aux messages de la grille, `text: { ...FR.text, ...FR_RULES.text }`. `rules.refusedReason` : la phrase de la règle, telle quelle. */
export const FR_RULES = {
  locale: 'fr',
  text: {
    'rules.refused': { one: "Non sélectionnable", other: "{n} non sélectionnables" },
    'rules.refusedReason': "{reason}",
    'rules.partly': { one: "{selected}, {n} non sélectionnable", other: "{selected}, {n} non sélectionnables" },
  },
} satisfies RulesMessages;
