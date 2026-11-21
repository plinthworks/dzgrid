import type { PdfMessages } from '../part-texts.js';

/**
 * Arabic, the cell menu's « Export to PDF » (1.17.0, `contextMenu({ use: { pdf } })`, pdf-export.md): spread into the
 * grid's messages, `text: { ...AR.text, ...AR_CONTEXT_MENU.text, ...AR_PDF.text }`. An Arabic grid's PDF is refused
 * (`pdf-script`): give the item only when the grid holds Latin text, else offer `print()`.
 */
export const AR_PDF = {
  locale: 'ar',
  text: { 'cmenu.exportPdf': "تصدير إلى PDF" },
} satisfies PdfMessages;
