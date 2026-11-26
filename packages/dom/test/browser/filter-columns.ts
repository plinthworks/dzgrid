// A column's filter on its column (scripts/browser-filter-columns.mjs; filter-ui.md « On its column »): the floating
// row, the header buttons and the popup under column groups, with a column pinned at each end and enough columns to
// scroll sideways. `?lang=ar` right to left. Made-up rows: a library's loans.
import type { ColumnOrGroup, GridEvent, Problem } from '@dzgrid/core';
import { createGrid, type GridMessages } from '../../src/index.js';
import { filters } from '../../src/filters.js';
import { spans } from '../../src/spans.js';
import { FR } from '../../src/locales/fr.js';
import { AR } from '../../src/locales/ar.js';
import { FR_FILTERS } from '../../src/locales/fr-filters.js';
import { AR_FILTERS } from '../../src/locales/ar-filters.js';

const ar = new URLSearchParams(location.search).get('lang') === 'ar';
document.documentElement.lang = ar ? 'ar' : 'fr';
document.documentElement.dir = ar ? 'rtl' : 'ltr';
type L = { id: string; title: string; reader: string; days: number; fine: number; note: string; total: number } & Record<`c${number}`, string>;
const EXTRA = Array.from({ length: 8 }, (_, i) => `c${i}` as const);
const rows: L[] = Array.from({ length: 300 }, (_, i) => ({
  id: `p${i}`, title: `${ar ? 'كتاب' : 'Livre'} ${i}`, reader: `${ar ? 'قارئ' : 'Lecteur'} ${i % 37}`, days: i % 30, fine: (i % 7) * 0.5,
  note: i % 5 ? '' : 'retard', total: i * 3, ...Object.fromEntries(EXTRA.map((c, k) => [c, `${c}-${(i * (k + 3)) % 50}`])),
}) as L);
const columns: ColumnOrGroup<L>[] = [
  { id: 'id', header: 'ID', pinned: 'start', width: 90 },
  { id: 'loan', header: ar ? 'الإعارة' : 'Prêt', children: [
    { id: 'title', header: ar ? 'العنوان' : 'Titre', width: 160 },
    { id: 'reader', header: ar ? 'القارئ' : 'Lecteur', width: 140 },
  ] },
  { id: 'money', header: ar ? 'الحساب' : 'Compte', children: [
    { id: 'days', header: ar ? 'الأيام' : 'Jours', type: 'number', width: 110 },
    { id: 'fine', header: ar ? 'الغرامة' : 'Amende', type: 'number', width: 110 },
  ] },
  // No floating filter: its cell stays, empty, on the column.
  { id: 'note', header: ar ? 'ملاحظة' : 'Note', width: 120, filter: { floating: false } },
  ...EXTRA.map((c) => ({ id: c, header: c.toUpperCase(), width: 120 })),
  { id: 'total', header: ar ? 'المجموع' : 'Total', type: 'number', pinned: 'end', width: 100 },
];
const messages: GridMessages = ar ? { ...AR, text: { ...AR.text, ...AR_FILTERS.text } } : { ...FR, text: { ...FR.text, ...FR_FILTERS.text } };
const told: Problem[] = [];
const grid = createGrid<L>(document.getElementById('host')!, {
  rows, getRowId: (l) => l.id, columns, messages, locale: ar ? 'ar-DZ' : 'fr-FR', timeZone: 'UTC', ...(ar && { direction: 'rtl' as const }),
  features: [spans(), filters({ floating: true, popup: true })],
  onEvent: (e: GridEvent<L>) => { if (e.type === 'problems') told.push(...e.problems); },
});
Object.assign(window, { grid, told, ready: true });
