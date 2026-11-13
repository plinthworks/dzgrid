// 1.12.0 looks in real browsers (scripts/browser-1-12.mjs; presentation-settings.md 24–33): `?lang=ar`, `?dark=1`,
// `?css=unlayered`, `?preflight=1`, `?vars=0`, `?icons=1` (the app's own icons, sortNone included). Made-up rows: a
// seed library's packets.
import type { ColumnDef, GridEvent, Problem } from '@dzgrid/core';
import { createGrid, type GridMessages } from '../../src/index.js';
import { theming } from '../../src/theme.js';
import { filters } from '../../src/filters-base.js';
import { columnMenu } from '../../src/column-menu.js';
import { pagination } from '../../src/pagination.js';
import { FR } from '../../src/locales/fr.js';
import { AR } from '../../src/locales/ar.js';
import { FR_FILTERS } from '../../src/locales/fr-filters.js';
import { AR_FILTERS } from '../../src/locales/ar-filters.js';
import { FR_COLUMN_MENU } from '../../src/locales/fr-column-menu.js';
import { AR_COLUMN_MENU } from '../../src/locales/ar-column-menu.js';
import { FR_PAGINATION } from '../../src/locales/fr-pagination.js';
import { AR_PAGINATION } from '../../src/locales/ar-pagination.js';

const q = new URLSearchParams(location.search);
const ar = q.get('lang') === 'ar';
if (q.get('dark')) document.documentElement.dataset['theme'] = 'dark';
document.documentElement.lang = ar ? 'ar' : 'fr';
document.documentElement.dir = ar ? 'rtl' : 'ltr';

type P = { id: string; seed: string; grams: number; jan: number; feb: number; note: string; mar: number };
const rows: P[] = Array.from({ length: 40 }, (_, i) => ({ id: `p${i}`, seed: ar ? `بذرة ${i}` : `Graine ${i}`, grams: (i * 37) % 1000, jan: i % 4, feb: (i * 3) % 5, note: ar ? 'ملاحظة' : 'Note', mar: (i * 7) % 11 }));
const svg = (d: string) => `<svg viewBox="0 0 16 16"><path d="${d}"/></svg>`;
const icons = q.get('icons')
  ? { sortAsc: svg('M8 2l6 10H2z'), sortDesc: svg('M8 14L2 4h12z'), sortNone: svg('M8 1l4 5H4zM8 15l4-5H4z'), filter: svg('M1 1h14v14H1z'), filterActive: svg('M1 1h14L8 15z'), menu: svg('M1 1h14v4H1zM1 11h14v4H1z'), submenu: svg('M4 1l8 7-8 7z'), chevron: svg('M4 1l8 7-8 7z') }
  : undefined;
const t = ar ? { seed: 'البذرة', grams: 'غرام', jan: 'يناير', feb: 'فبراير', note: 'ملاحظة', mar: 'مارس' } : { seed: 'Graine', grams: 'Grammes', jan: 'Janvier', feb: 'Février', note: 'Note', mar: 'Mars' };
const columns: ColumnDef<P, any>[] = [
  { id: 'seed', header: t.seed, width: 160, pinned: 'start', filter: { kind: 'text' } },
  { id: 'grams', header: t.grams, type: 'number', width: 120, tooltip: (v) => `${v} g` },
  { id: 'jan', header: t.jan, type: 'number', width: 110 },
  { id: 'feb', header: t.feb, type: 'number', width: 110, sortable: false },
  { id: 'note', header: t.note, width: 160, ui: { cellClass: () => 'app-note' } },
  { id: 'mar', header: t.mar, type: 'number', width: 100, pinned: 'end' },
];
const base = ar ? AR : FR;
const messages: GridMessages = { ...base, text: { ...base.text, ...(ar ? AR_FILTERS : FR_FILTERS).text, ...(ar ? AR_COLUMN_MENU : FR_COLUMN_MENU).text, ...(ar ? AR_PAGINATION : FR_PAGINATION).text } };
const told: Problem[] = [];
const grid = createGrid<P>(document.getElementById('host')!, {
  rows, getRowId: (p) => p.id, columns, messages, locale: ar ? 'ar-DZ' : 'fr-FR', timeZone: 'UTC', direction: ar ? 'rtl' : 'ltr',
  label: ar ? 'البذور' : 'Graines', tooltips: { delayMs: 0 }, ...(icons && { icons }),
  pagination: { pageSize: 25 }, features: [theming(), filters({ floating: true }), columnMenu(), pagination()],
  onEvent: (e: GridEvent<P>) => { if (e.type === 'problems') told.push(...e.problems); },
});
grid.kernel.dispatch({ type: 'sort.set', sort: [{ column: 'jan', dir: 'asc' }] }, 'host');
Object.assign(window, { grid, told, ready: true });
