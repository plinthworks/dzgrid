import type { ColumnsMessages } from '../part-texts.js';

/** Français, les textes du déplacement des colonnes (`@dzgrid/dom/columns`) et du choix des colonnes (`@dzgrid/dom/columns-panel`) : à ajouter aux messages de la grille, `text: { ...FR.text, ...FR_COLUMNS.text }`. */
export const FR_COLUMNS = {
  locale: 'fr',
  text: {
    'move.placed': "{column}\u202F: colonne {n} sur {total}",
    'move.edge': "{column}\u202F: déjà au bord",
    'move.locked': "{column}\u202F: ne se déplace pas",
    'move.cancelled': "Déplacement annulé",
    // Le mode redimensionner au clavier et l'ajustement (Phase 6 étape 6, column-resize.md).
    'size.mode': "Redimensionner {column}\u202F: {width}\u00A0pixels. Flèches pour changer, Entrée pour garder, Échap pour annuler",
    'size.modeHint': "mode redimensionner",
    'size.width': "{column}\u202F: {width}\u00A0pixels",
    'size.min': ", minimum",
    'size.max': ", maximum",
    'size.cancelled': "Redimensionnement annulé",
    'size.autoAll': "Colonnes ajustées\u202F: {n}",
    'size.locked': "{column}\u202F: largeur fixe",
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
    'chooser.inClosedGroup': "masquée par son groupe replié",
    // Groupes d'en-tête repliables (`@dzgrid/dom/spans`, phase 6, étape 7, Q8-1).
    'group.toggle': "Ouvrir ou fermer {group}",
    'group.open': "{group}, groupe ouvert",
    'group.closed': "{group}, groupe fermé",
    'group.closedSaid': "{group} fermé, colonnes affichées : {n}",
    'group.openedSaid': "{group} ouvert, colonnes affichées : {n}",
  },
} satisfies ColumnsMessages;
