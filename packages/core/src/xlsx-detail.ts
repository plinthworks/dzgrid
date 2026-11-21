/**
 * `@dzgrid/core/xlsx-detail` (1.16.0, docs/behaviors/xlsx-export.md 12–19): the masters' detail blocks in the Excel file,
 * kept out of `@dzgrid/core/xlsx` so a file without details carries none of it. Handed in the writer's input:
 * `toXlsx({ …, details: xlsxDetails, expanded }, { detail: 'all', detailRows, detailColumns })`; the DOM export loads it
 * itself when its `xlsx.detail` option is set.
 */
export { xlsxDetails } from './xlsx/detail.js';
