import type { ColumnsMessages } from '../part-texts.js';

/** Français, les textes du déplacement des colonnes (`@dzgrid/dom/columns`) et du choix des colonnes (`@dzgrid/dom/columns-panel`) : à ajouter aux messages de la grille, `text: { ...FR.text, ...FR_COLUMNS.text }`. */
export const FR_COLUMNS = {
  locale: 'fr',
  text: {
    'move.placed': "{column}\u202F: colonne {n} sur {total}",
    'move.edge': "{column}\u202F: déjà au bord",
    'move.locked': "{column}\u202F: ne se déplace pas",
    'move.cancelled': "Déplacement annulé",
    // Le choix des colonnes (`@dzgrid/dom/columns-panel`, Phase 6 étape 4, Q4-1).
    'chooser.title': "Choisir les colonnes",
    'chooser.search': "Rechercher une colonne",
    'chooser.list': "Colonnes",
    'chooser.handle': "Glisser {column}",
    'chooser.up': "Monter {column}",
    'chooser.down': "Descendre {column}",
    'chooser.placed': "{column}\u202F: place {n} sur {total}",
    'chooser.showAll': "Tout afficher",
    'chooser.reset': "Réinitialiser",
    'chooser.close': "Fermer",
    'chooser.none': "Aucune colonne",
    'chooser.matches': "Colonnes trouvées\u202F: {n}",
    'chooser.shown': "{column} affichée",
    'chooser.hidden': "{column} masquée",
    'chooser.allShown': "Toutes les colonnes affichées",
    'chooser.resetDone': "Colonnes réinitialisées",
    'chooser.pinnedStart': "épinglée au début",
    'chooser.pinnedEnd': "épinglée à la fin",
    'chooser.last': "dernière colonne affichée",
    'chooser.clearToMove': "Videz la recherche pour changer l'ordre",
  },
} satisfies ColumnsMessages;
