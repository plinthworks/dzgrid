/**
 * `@dzgrid/core/pdf` (1.17.0, docs/behaviors/pdf-export.md): the PDF writer, kept out of the base and of the other
 * files' entries so a grid that never exports a PDF carries none of it. Pure: no DOM, no clock — the same rows give the
 * same bytes; it runs in a browser (the DOM layer compresses with `CompressionStream`) and on a Node server (`toPdf`,
 * stored, or `zlib`'s deflate injected). Helvetica (WinAnsi) by default, an application's TrueType font embedded for the
 * rest; right-to-left and shaped scripts refused (`pdf-script`).
 */
export { pdfFile, pdfParts, toPdf, PDF_MIME } from './pdf/write.js';
export type { PdfInput, PdfObject, PdfOptions, PdfPiece, PdfSummary, PdfText, PdfTextContext } from './pdf/write.js';
