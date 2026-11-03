import type { MessageValue } from '../messages.js';
import type { ContextMenuMessages, ContextMenuXlsxKey } from '../part-texts.js';

/** « Export to Excel » (Phase 9): optional in an application's own bundle (`ContextMenuXlsxKey`). */
const XLSX: { readonly [K in ContextMenuXlsxKey]?: MessageValue } = { 'cmenu.exportXlsx': "Exporter en Excel" };

/** Français, les textes du menu de cellule (`@dzgrid/dom/context-menu`) : à ajouter aux messages de la grille, `text: { ...FR.text, ...FR_CONTEXT_MENU.text }`. `{keys}` : Ctrl+V, ou ⌘V sur un Mac. */
export const FR_CONTEXT_MENU = {
  locale: 'fr',
  text: {
    'cmenu.label': "Menu de la cellule",
    'cmenu.copy': "Copier",
    'cmenu.copyHeaders': "Copier avec les en-têtes",
    'cmenu.cut': "Couper",
    'cmenu.paste': "Coller",
    'cmenu.useCopyKey': "Utilisez {keys} pour copier",
    'cmenu.usePasteKey': "Utilisez {keys} pour coller",
    'cmenu.fillDown': "Recopier vers le bas",
    'cmenu.fillEnd': "Recopier vers la droite",
    'cmenu.undo': "Annuler",
    'cmenu.redo': "Rétablir",
    'cmenu.expand': "Déplier",
    'cmenu.collapse': "Replier",
    'cmenu.pinTop': "Épingler en haut",
    'cmenu.pinBottom': "Épingler en bas",
    'cmenu.unpin': "Désépingler",
    'cmenu.pinnedTop': "Ligne épinglée en haut",
    'cmenu.pinnedBottom': "Ligne épinglée en bas",
    'cmenu.unpinned': "Ligne désépinglée",
    'cmenu.exportCsv': "Exporter en CSV",
    ...XLSX,
  },
} satisfies ContextMenuMessages;
