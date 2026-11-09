// Presentation settings in real browsers (scripts/browser-presentation.mjs; presentation-settings.md): alternate rows, a
// number column's title at the end, column lines, the pinned shadow, a custom sort icon, `?lang=ar`, `?dark=1`.
// Made-up rows: a seed library's packets.
import type { GridEvent, Problem } from '@dzgrid/core';
import { createGrid, type GridMessages } from '../../src/index.js';
import { theming } from '../../src/theme.js';
import { FR } from '../../src/locales/fr.js';
import { AR } from '../../src/locales/ar.js';

const q = new URLSearchParams(location.search);
const ar = q.get('lang') === 'ar';
if (q.get('dark')) document.documentElement.dataset['theme'] = 'dark';
document.documentElement.lang = ar ? 'ar' : 'fr';
type P = { id: string; seed: string; grams: number; jan: number; feb: number; mar: number; note: string };
const rows: P[] = Array.from({ length: 300 }, (_, i) => ({ id: `p${i}`, seed: ar ? `بذرة ${i}` : `Graine ${i}`, grams: (i * 37) % 1000, jan: i % 4, feb: (i * 3) % 5, mar: (i * 7) % 11, note: ar ? 'ملاحظة' : 'Note' }));
const messages: GridMessages = ar ? AR : FR;
const told: Problem[] = [];
const arrow = '<svg viewBox="0 0 16 16"><path d="M8 2l6 10H2z"/></svg>';
const grid = createGrid<P>(document.getElementById('host')!, {
  rows, getRowId: (p) => p.id, messages, locale: ar ? 'ar-DZ' : 'fr-FR', timeZone: 'UTC', direction: ar ? 'rtl' : 'ltr',
  columns: [
    { id: 'seed', header: ar ? 'البذرة' : 'Graine', width: 180, pinned: 'start' },
    { id: 'grams', header: ar ? 'غرام' : 'Grammes', type: 'number', width: 140, sortable: false },
    { id: 'jan', header: ar ? 'يناير' : 'Janvier', type: 'number', width: 160 },
    { id: 'feb', header: ar ? 'فبراير' : 'Février', type: 'number', width: 160 },
    { id: 'note', header: ar ? 'ملاحظة' : 'Note', width: 200 },
    { id: 'mar', header: ar ? 'مارس' : 'Mars', type: 'number', width: 110, pinned: 'end' },
  ],
  theme: {
    rowOddBg: 'color-mix(in srgb, var(--tz-accent) 7%, var(--tz-bg))',
    columnLine: 'var(--dzg-line, 1px) solid var(--tz-border)',
    pinnedShadow: '6px 0 6px -4px color-mix(in srgb, var(--tz-fg) 45%, transparent)',
  },
  icons: { sortAsc: arrow },
  features: [theming()],
  onEvent: (e: GridEvent<P>) => { if (e.type === 'problems') told.push(...e.problems); },
});
grid.kernel.dispatch({ type: 'sort.set', sort: [{ column: 'jan', dir: 'asc' }] }, 'host');
Object.assign(window, { grid, told, ready: true });
