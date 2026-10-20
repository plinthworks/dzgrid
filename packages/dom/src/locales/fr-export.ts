import type { ExportMessages } from '../messages.js';

/** Français, les textes de l'export (`@dzgrid/dom/export`) : à ajouter aux messages de la grille, `text: { ...FR.text, ...FR_EXPORT.text }`. */
export const FR_EXPORT = {
  locale: 'fr',
  text: {
    'export.fileName': "export",
    'announce.exportStarted': "Export en cours…",
    'announce.exportDone': "Exporté. {rows}",
    'announce.exportDoneHidden': "Exporté. {rows}. Sélectionnées masquées par les filtres : {hidden}",
    'announce.exportDoneOpen': "Exporté",
    'announce.exportFailed': "Échec de l'export",
    'announce.exportRefused': "Export non autorisé",
    'announce.exportCancelled': "Export annulé",
  },
} satisfies ExportMessages;
