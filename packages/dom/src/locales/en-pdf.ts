import type { PdfMessages } from '../part-texts.js';

/**
 * English, the cell menu's « Export to PDF » (1.17.0, `contextMenu({ use: { pdf } })`, pdf-export.md): spread into the
 * grid's messages, `text: { ...EN.text, ...EN_CONTEXT_MENU.text, ...EN_PDF.text }`.
 */
export const EN_PDF = {
  locale: 'en',
  text: { 'cmenu.exportPdf': "Export to PDF" },
} satisfies PdfMessages;
