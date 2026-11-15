// 1.13.0 in real browsers (scripts/browser-1-12.mjs (12); presentation-settings.md 42–43): the columns panel docked at
// the end, narrow columns with a filter button and the app's unsorted mark, a column that cannot be hidden. `?lang=ar`,
// `?dark=1`, `?css=unlayered`, `?preflight=1`. Made-up rows: a bakery's oven logs. `?app=1` (13; presentation-settings.md
// 44–47): header parts holding a search box at each alignment, one column without its filter button.
import type { ColumnDef, GridEvent, Problem } from '@dzgrid/core';
import { createGrid, type GridMessages } from '../../src/index.js';
import { theming } from '../../src/theme.js';
import { filters } from '../../src/filters-base.js';
import { columns as moves } from '../../src/columns.js';
import { columnsChooser } from '../../src/columns-panel.js';
import { dock } from '../../src/dock.js';
import { FR } from '../../src/locales/fr.js';
import { AR } from '../../src/locales/ar.js';
import { FR_FILTERS } from '../../src/locales/fr-filters.js';
import { AR_FILTERS } from '../../src/locales/ar-filters.js';
import { FR_COLUMNS } from '../../src/locales/fr-columns.js';
import { AR_COLUMNS } from '../../src/locales/ar-columns.js';
import { FR_DOCK } from '../../src/locales/fr-dock.js';
import { AR_DOCK } from '../../src/locales/ar-dock.js';
import { slots } from '../../src/slots.js';
import { definePart } from '../../src/part.js';

const q = new URLSearchParams(location.search);
const ar = q.get('lang') === 'ar';
if (q.get('dark')) document.documentElement.dataset['theme'] = 'dark';
document.documentElement.lang = ar ? 'ar' : 'fr';
document.documentElement.dir = ar ? 'rtl' : 'ltr';

type L = { id: string; at: string; oven: string; batch: string; kind: string; log: string; ok: string; act: string };
const rows: L[] = Array.from({ length: 30 }, (_, i) => ({ id: `l${i}`, at: `2026-11-15 0${i % 10}:1${i % 6}`, oven: `f-${(i % 9) + 1}`, batch: ar ? `دفعة-${i}` : `fournée-${i}`, kind: ar ? 'خبز' : 'CUISSON', log: ar ? `سجل ${i}` : `Contrôle du four ${i}`, ok: i % 5 ? '✓' : '✗', act: '…' }));
const t = ar
  ? { at: 'التاريخ', oven: 'فرن', batch: 'الدفعة', kind: 'النوع', log: 'السجل', ok: 'الحالة', act: 'إجراء' }
  : { at: 'Date de traitement', oven: 'VM', batch: 'Micro-service', kind: 'Type', log: 'Log', ok: 'Statut', act: 'Action' };
const svg = (d: string) => `<svg viewBox="0 0 16 16"><path d="${d}"/></svg>`;
// An app's header part (13): a box filling what it is given, taking the focus on Enter or F2.
const search = definePart('header', {
  mount(host, c) {
    const i = document.createElement('input');
    i.className = 'app-q';
    i.setAttribute('aria-label', c.label);
    i.placeholder = c.label;
    i.style.cssText = 'display:block;inline-size:100%;box-sizing:border-box;min-inline-size:0';
    host.append(i);
    return { focus: () => (i.focus(), true) };
  },
});
const app = !!q.get('app');
const columns: ColumnDef<L, any>[] = app ? [
  // No alignment: with its filter button, and without (45).
  { id: 'at', header: t.at, width: 280, filter: { kind: 'text' }, ui: { header: 'search' } },
  { id: 'oven', header: t.oven, width: 280, filter: { kind: 'text' }, ui: { header: 'search' }, filterButton: false },
  { id: 'batch', header: t.batch, width: 280, filter: { kind: 'text' }, ui: { header: 'search' }, headerAlign: 'center' },
  { id: 'kind', header: t.kind, width: 280, filter: { kind: 'text' }, ui: { header: 'search' }, headerAlign: 'end' },
  { id: 'log', header: t.log, width: 280, filter: { kind: 'text' }, ui: { header: 'search' }, headerAlign: 'start' },
] : [
  { id: 'at', header: t.at, width: 170, filter: { kind: 'text' } },
  // Narrow ones at the floor (80 px, column-resize.md 21) and a little above: the title first (43).
  { id: 'oven', header: t.oven, width: 80, filter: { kind: 'text' } },
  { id: 'batch', header: t.batch, width: 80, filter: { kind: 'text' } },
  { id: 'kind', header: t.kind, width: 90, filter: { kind: 'text' } },
  { id: 'log', header: t.log, width: 220, filter: { kind: 'text' } },
  { id: 'ok', header: t.ok, width: 100, filter: { kind: 'text' } },
  // Cannot be hidden: the lock in its box's place (42).
  { id: 'act', header: t.act, width: 90, hideable: false, sortable: false },
];
const base = ar ? AR : FR;
const messages: GridMessages = { ...base, text: { ...base.text, ...(ar ? AR_FILTERS : FR_FILTERS).text, ...(ar ? AR_COLUMNS : FR_COLUMNS).text, ...(ar ? AR_DOCK : FR_DOCK).text } };
// Every header part in view (13).
if (app) document.getElementById('host')!.style.inlineSize = '1800px';
const told: Problem[] = [];
const chooser = columnsChooser();
const mv = moves();
const grid = createGrid<L>(document.getElementById('host')!, {
  rows, getRowId: (r) => r.id, columns, messages, locale: ar ? 'ar-DZ' : 'fr-FR', timeZone: 'UTC', direction: ar ? 'rtl' : 'ltr',
  label: ar ? 'السجلات' : 'Journaux',
  // The app's unsorted mark, as the owner's app has (presentation-settings.md 25).
  icons: { sortNone: svg('M8 1l4 5H4zM8 15l4-5H4z') },
  ...(app && { parts: { search } }),
  features: [theming(), filters(), mv, chooser, dock({ open: { columns: 'end' } }), ...(app ? [slots()] : [])],
  onEvent: (e: GridEvent<L>) => { if (e.type === 'problems') told.push(...e.problems); },
});
Object.assign(window, { grid, told, chooser: chooser.api(grid), moves: mv.api(grid), ready: true });
