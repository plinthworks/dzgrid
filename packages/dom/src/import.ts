/**
 * `@dzgrid/dom/import`: a CSV or Excel file dropped on the grid or picked through the application's button, read into
 * rows handed to the application (docs/behaviors/file-import.md, 1.9.0) — the grid never changes its rows by itself.
 * Small and eager; the reading (`@dzgrid/core/import`, the ZIP inflated) is a chunk loaded at the first file. Texts in
 * `locales/<lang>-import`.
 */
export { fileImport, IMPORT_KEYS } from './import/index.js';
/** Its layout CSS, for a page that sets `injectStyles: false` and loads it itself. */
export { IMPORT_CSS } from './import/index.js';
export type { FileImportApi, FileImportFeature, FileImportOptions, ImportedFile, ImportFormat } from './import/index.js';
export type { ImportMessageKey, ImportMessages } from './part-texts.js';
