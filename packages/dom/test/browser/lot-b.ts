// 1.9.0 lot B in real browsers (scripts/browser-lot-b.mjs): columns that collapse under their rows, a file import.
// `?lang=fr|ar`. Made-up rows: a seed library's packets.
import type { ColumnDef, GridEvent, Problem } from '@dzgrid/core';
import { createGrid, type GridMessages } from '../../src/index.js';
import { responsive } from '../../src/responsive.js';
import { rowNumbers } from '../../src/row-numbers.js';
import { fileImport } from '../../src/import.js';
import { csvExport, type CsvExportOptions } from '../../src/export.js';
import { FR } from '../../src/locales/fr.js';
import { AR } from '../../src/locales/ar.js';
import { FR_DETAIL } from '../../src/locales/fr-detail.js';
import { AR_DETAIL } from '../../src/locales/ar-detail.js';
import { FR_ROW_NUMBERS } from '../../src/locales/fr-row-numbers.js';
import { AR_ROW_NUMBERS } from '../../src/locales/ar-row-numbers.js';
import { FR_IMPORT } from '../../src/locales/fr-import.js';
import { AR_IMPORT } from '../../src/locales/ar-import.js';
import { FR_EXPORT } from '../../src/locales/fr-export.js';
import { AR_EXPORT } from '../../src/locales/ar-export.js';

const ar = new URLSearchParams(location.search).get('lang') === 'ar';
type P = { id: string; seed: string; grams: number; shelf: string; sown: string; note: string; stock: number };
const words = ar ? ['بذور الريحان', 'بذور الطماطم', 'بذور الجزر'] : ['Basilic', 'Tomate cerise', 'Carotte'];
const rows: P[] = Array.from({ length: 120 }, (_, i) => ({ id: `p${i}`, seed: `${words[i % 3]} ${i}`, grams: (i % 9) + 0.5, shelf: `B-${(i % 12) + 1}`, sown: `2026-0${(i % 9) + 1}-1${i % 10}`, note: ar ? 'تُحفظ في مكان بارد' : 'Garder au frais', stock: (i * 7) % 40 }));
const columns: ColumnDef<P>[] = [
  { id: 'seed', header: ar ? 'البذرة' : 'Graine', width: 170, pinned: 'start' },
  { id: 'grams', header: ar ? 'غرام' : 'Grammes', type: 'number', width: 110 },
  { id: 'shelf', header: ar ? 'الرف' : 'Étagère', width: 110, collapsePriority: 2 },
  { id: 'sown', header: ar ? 'تاريخ الزرع' : 'Semé le', type: 'day', width: 140 },
  { id: 'note', header: ar ? 'ملاحظة' : 'Note', width: 220 },
  { id: 'stock', header: ar ? 'المخزون' : 'Stock', type: 'number', width: 80, collapsePriority: 0 },
];
const base = ar ? AR : FR;
const messages: GridMessages = { ...base, text: { ...base.text, ...(ar ? AR_DETAIL : FR_DETAIL).text, ...(ar ? AR_ROW_NUMBERS : FR_ROW_NUMBERS).text, ...(ar ? AR_IMPORT : FR_IMPORT).text, ...(ar ? AR_EXPORT : FR_EXPORT).text } };
const told: Problem[] = [];
const got: { rows: unknown[]; problems: readonly Problem[]; name: string; format: string | null }[] = [];
const files: Blob[] = [];
document.documentElement.lang = ar ? 'ar' : 'fr';
document.documentElement.dir = ar ? 'rtl' : 'ltr';
const imp = fileImport({ onRows: (r, problems, f) => got.push({ rows: r, problems, name: f.name, format: f.format }) });
const exp = csvExport({ canExport: true, xlsx: true, deliver: (d) => void (d.blob && files.push(d.blob)) } as CsvExportOptions);
const grid = createGrid<P>(document.getElementById('host')!, {
  rows, getRowId: (p) => p.id, columns, messages, locale: ar ? 'ar-DZ' : 'fr-FR', timeZone: 'UTC', label: ar ? 'البذور' : 'Graines',
  selection: { mode: 'multi', checkbox: true },
  features: [responsive(), rowNumbers(), imp, exp],
  onEvent: (e: GridEvent<P>) => { if (e.type === 'problems') told.push(...e.problems); },
});
imp.api(grid)!.bind(document.getElementById('import')!);
Object.assign(window, { grid, told, got, files, exp, ready: true });
