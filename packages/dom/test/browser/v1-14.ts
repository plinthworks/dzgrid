// 1.14.0, dragging a header out of the grid hides it (opt-in `columns({ dragOutHides: true })`, column-move.md 22–28;
// owner 2026-11-18), in real browsers (scripts/browser-1-12.mjs (15)): a grid centred with room on every side, one column
// pinned to the start, one `hideable: false`, `gridState()` to read what is kept. `?lang=ar`, `?dark=1`, `?css=unlayered`,
// `?preflight=1`. Made-up rows: a bakery's ovens.
import type { ColumnDef, Problem } from '@dzgrid/core';
import { createGrid, type GridMessages } from '/packages/dom/src/index.ts';
import { columns } from '/packages/dom/src/columns.ts';
import { gridState } from '/packages/dom/src/state.ts';
import { FR } from '/packages/dom/src/locales/fr.ts';
import { AR } from '/packages/dom/src/locales/ar.ts';
import { FR_COLUMNS } from '/packages/dom/src/locales/fr-columns.ts';
import { AR_COLUMNS } from '/packages/dom/src/locales/ar-columns.ts';

const q = new URLSearchParams(location.search);
const ar = q.get('lang') === 'ar';
if (q.get('dark')) document.documentElement.dataset['theme'] = 'dark';
document.documentElement.lang = ar ? 'ar' : 'fr';
document.documentElement.dir = ar ? 'rtl' : 'ltr';

type O = { id: string; oven: string; temp: number; batch: string; note: string };
const t = ar ? { oven: 'الفرن', temp: 'الحرارة', batch: 'الدفعة', note: 'ملاحظة' } : { oven: 'Four', temp: 'Température', batch: 'Fournée', note: 'Note' };
const rows: O[] = Array.from({ length: 30 }, (_, i) => ({ id: `o${i}`, oven: ar ? `فرن ${i + 1}` : `Four ${i + 1}`, temp: 180 + i, batch: ar ? `دفعة ${i}` : `Fournée ${i}`, note: ar ? 'جاهز' : 'Prêt' }));
const cols: ColumnDef<O, any>[] = [
  { id: 'oven', header: t.oven, width: 140, pinned: 'start' },
  { id: 'temp', header: t.temp, type: 'number', width: 90 },
  { id: 'batch', header: t.batch, width: 180, hideable: false },
  { id: 'note', header: t.note, width: 160 },
];
const base = ar ? AR : FR;
const messages: GridMessages = { ...base, text: { ...base.text, ...(ar ? AR_COLUMNS : FR_COLUMNS).text } };
const told: Problem[] = [];
const state = gridState();
const grid = createGrid<O>(document.getElementById('host')!, {
  rows, getRowId: (r) => r.id, columns: cols, messages, locale: ar ? 'ar-DZ' : 'fr-FR', timeZone: 'UTC', label: ar ? 'الأفران' : 'Fours',
  onEvent: (e: { readonly type: string; readonly problems?: readonly Problem[] }) => { if (e.problems) told.push(...e.problems); },
  features: [state, columns({ dragOutHides: true })],
});
const hidden = () => (state.api(grid)!.state().columns ?? []).filter((c) => c.hidden).map((c) => c.id);
Object.assign(window, { grid, told, hidden, ready: true });
