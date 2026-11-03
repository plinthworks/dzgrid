/**
 * `@dzgrid/core/xlsx`: the Excel writer (docs/behaviors/xlsx-export.md, Phase 9), kept out of the base and of the CSV
 * entry so a grid that exports nothing, or CSV only, carries none of it. Pure: it runs in a browser (the DOM layer
 * deflates with `CompressionStream`) and on a Node server (stored, or `zlib`'s deflate injected).
 */
export { toXlsx, xlsxParts, serialOfDay, XLSX_COLUMNS, XLSX_MIME, XLSX_ROWS } from './xlsx/sheet.js';
export type { XlsxInput, XlsxOptions, XlsxPiece, XlsxStyle, XlsxStyleContext, XlsxSummary } from './xlsx/sheet.js';
export { numFmtFor, sheetNameOf } from './xlsx/xml.js';
export { crc32, utf8, zipFile } from './xlsx/zip.js';
export type { ZipEntry } from './xlsx/zip.js';
