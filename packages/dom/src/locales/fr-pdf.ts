import type { PdfMessages } from '../part-texts.js';

/**
 * French, the cell menu's « Exporter en PDF » (1.17.0, `contextMenu({ use: { pdf } })`, pdf-export.md): spread into the
 * grid's messages, `text: { ...FR.text, ...FR_CONTEXT_MENU.text, ...FR_PDF.text }`.
 */
export const FR_PDF = {
  locale: 'fr',
  text: { 'cmenu.exportPdf': "Exporter en PDF" },
} satisfies PdfMessages;
