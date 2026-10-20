import type { ExportMessages } from '../messages.js';

/** English, the export's texts (`@dzgrid/dom/export`): spread into the grid's messages, `text: { ...EN.text, ...EN_EXPORT.text }`. */
export const EN_EXPORT = {
  locale: 'en',
  text: {
    'export.fileName': "export",
    'announce.exportStarted': "Exporting…",
    'announce.exportDone': "Exported. {rows}",
    'announce.exportDoneHidden': "Exported. {rows}. Selected, hidden by filters: {hidden}",
    'announce.exportDoneOpen': "Exported",
    'announce.exportFailed': "Export failed",
    'announce.exportRefused': "Export not allowed",
    'announce.exportCancelled': "Export cancelled",
  },
} satisfies ExportMessages;
