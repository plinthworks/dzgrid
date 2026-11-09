// 1.9.0 lot A in real browsers (scripts/browser-lot-a.mjs): vertical titles, hidden headers, the totals row.
// `?lang=fr|ar&mode=vertical|hidden|totals`. Made-up rows: a seed library's packets.
import type { ColumnDef, GridEvent, Problem } from '@dzgrid/core';
import { createGrid, type GridMessages } from '../../src/index.js';
import { pinnedRows } from '../../src/pinned-rows.js';
import { totalsRow } from '../../src/totals-row.js';
import { verticalHeaders } from '../../src/vertical-headers.js';
import { FR } from '../../src/locales/fr.js';
import { AR } from '../../src/locales/ar.js';
import { FR_PINNED } from '../../src/locales/fr-pinned.js';
import { AR_PINNED } from '../../src/locales/ar-pinned.js';
import { FR_TOTALS } from '../../src/locales/fr-totals.js';
import { AR_TOTALS } from '../../src/locales/ar-totals.js';

const q = new URLSearchParams(location.search);
const ar = q.get('lang') === 'ar';
const mode = q.get('mode') ?? 'vertical';
type P = { id: string; seed: string; grams: number; jan: number; feb: number; mar: number };
const words = ar ? ['بذور الريحان', 'بذور الطماطم', 'بذور الجزر'] : ['Basilic', 'Tomate cerise', 'Carotte'];
const rows: P[] = Array.from({ length: 200 }, (_, i) => ({ id: `p${i}`, seed: `${words[i % 3]} ${i}`, grams: (i % 9) + 0.5, jan: i % 4, feb: (i * 3) % 5, mar: (i * 7) % 6 }));
const month = ar ? ['يناير — المزروعات', 'فبراير', 'مارس'] : ['Janvier — semis', 'Février', 'Mars'];
const columns: ColumnDef<P>[] = [
  { id: 'seed', header: ar ? 'البذرة' : 'Graine', width: 220 },
  { id: 'grams', header: ar ? 'غرام' : 'Grammes', type: 'number', width: 110, total: 'sum', numberFormat: { maximumFractionDigits: 1 } },
  { id: 'jan', header: month[0], type: 'number', width: 60, headerVertical: true, total: 'max' },
  { id: 'feb', header: month[1], type: 'number', width: 60, headerVertical: true, total: 'count' },
  { id: 'mar', header: month[2], type: 'number', width: 60, headerVertical: true, total: 'avg', numberFormat: { maximumFractionDigits: 2 } },
];
const base = ar ? AR : FR;
const messages: GridMessages = { ...base, text: { ...base.text, ...(ar ? AR_PINNED : FR_PINNED).text, ...(ar ? AR_TOTALS : FR_TOTALS).text } };
const told: Problem[] = [];
document.documentElement.lang = ar ? 'ar' : 'fr';
document.documentElement.dir = ar ? 'rtl' : 'ltr';
const grid = createGrid<P>(document.getElementById('host')!, {
  rows, getRowId: (p) => p.id, columns, messages, locale: ar ? 'ar-DZ' : 'fr-FR', timeZone: 'UTC',
  ...(mode === 'hidden' && { headers: 'hidden' as const }),
  features: [verticalHeaders(), ...(mode === 'totals' ? [pinnedRows<P>(), totalsRow()] : [])],
  onEvent: (e: GridEvent<P>) => { if (e.type === 'problems') told.push(...e.problems); },
});
Object.assign(window, { grid, told, ready: true });
