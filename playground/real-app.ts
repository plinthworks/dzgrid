// The Phase 6 close's light « real app » page (docs/phase-6-steps/decisions.md « Back to Phase 6 »; checked by
// scripts/browser-real-app.mjs, `npm run test:real-app`, at phase closes only). As an application ships DzGrid: its own
// unlayered reset first (Tailwind 3's preflight, its theme() values written out), then the UNLAYERED DzGrid sheets
// (theme, comfort, columns, chooser, print), its brand on the documented tokens (real-app.html). Deterministic data:
// the screenshots are compared. `?theme=dark|light`.
import { createGrid, definePart, type SlotContext } from '@dzgrid/dom';
import { filters } from '@dzgrid/dom/filters';
import { pagination } from '@dzgrid/dom/pagination';
import { slots } from '@dzgrid/dom/slots';
import { columns as moveColumns } from '@dzgrid/dom/columns';
import { columnMenu } from '@dzgrid/dom/column-menu';
import { columnsChooser } from '@dzgrid/dom/columns-panel';
// By path, as print.ts: no alias added to vite.config.ts while the playground server runs.
import { print } from '../packages/dom/src/print.js';
import { FR } from '@dzgrid/dom/locales/fr';
import { FR_FILTERS } from '@dzgrid/dom/locales/fr-filters';
import { FR_PAGINATION } from '@dzgrid/dom/locales/fr-pagination';
import { FR_COLUMNS } from '@dzgrid/dom/locales/fr-columns';
import { FR_COLUMN_MENU } from '@dzgrid/dom/locales/fr-column-menu';
import { FR_PRINT } from '@dzgrid/dom/locales/fr-print';
import type { ColumnDef } from '@dzgrid/core';
import PREFLIGHT from '../node_modules/tailwindcss3/src/css/preflight.css?raw';
import THEME from '../packages/theme/dzgrid.unlayered.css?inline';
import COMFORT from '../packages/theme/dzgrid.comfort.unlayered.css?inline';
import COLS from '../packages/theme/columns.unlayered.css?inline';
import PANEL from '../packages/theme/columns-panel.unlayered.css?inline';
import PRINT from '../packages/theme/print.unlayered.css?inline';

const q = new URLSearchParams(location.search);
// Tailwind 3's preflight as a built app ships it: every theme('key', fallback) is its fallback (no Tailwind config here).
const reset = PREFLIGHT.replace(/theme\('[^']*',\s*([^)]*)\)/g, '$1');
// The app's reset first, then DzGrid's sheets, then the page's own <style> (the brand), all unlayered.
const brand = document.head.querySelector('style')!;
for (const css of [reset, THEME, COMFORT, COLS, PANEL, PRINT]) brand.before(Object.assign(document.createElement('style'), { textContent: css }));
if (q.get('theme')) document.documentElement.dataset['theme'] = q.get('theme')!;

type P = { id: string; barcode: string; name: string; brand: string; source: string; updatedAt: string };
const SOURCES = ['OFF', 'MANUAL', 'IMPORT'];
const COLOURS: Record<string, string> = { OFF: 'teal', MANUAL: 'pink', IMPORT: 'gray' };
const BRANDS = ['Danone', 'Nestlé', 'Lactalis', 'Bonduelle', 'Cevital', 'Soummam', 'Ifri', 'Hamoud'];
const rows: P[] = Array.from({ length: 1604 }, (_, i) => ({
  id: `p${i}`, barcode: String(3017620422003 + i * 7919), name: `Produit ${i}`, brand: BRANDS[i % BRANDS.length]!,
  source: SOURCES[i % 3]!, updatedAt: new Date(Date.UTC(2026, 9, 1 + (i % 27), 8 + (i % 10))).toISOString(),
}));

/** The set filter's rows as the app draws them: a pill per value (the label alone; the box is the grid's). */
const pill = definePart('filterOption', {
  mount(host, c) {
    const s = document.createElement('span');
    host.append(s);
    const draw = (n: SlotContext['filterOption']): void => {
      s.className = `pill pill-${n.blank ? 'gray' : COLOURS[n.value!] ?? 'gray'}`;
      s.textContent = n.label;
    };
    draw(c);
    return { update: draw };
  },
});

const columns: ColumnDef<P, any>[] = [
  { id: 'barcode', header: 'Code-barres', width: 176, pinned: 'start', filter: { kind: 'text', ops: ['contains'] }, ui: { header: 'header.filterBox' } },
  { id: 'name', header: 'Nom du produit', width: 220, flex: 2, minWidth: 220, filter: { kind: 'text', ops: ['contains'] }, ui: { header: 'header.filterBox' } },
  { id: 'brand', header: 'Marque', width: 150, flex: 1, minWidth: 140, filter: { kind: 'set' } },
  { id: 'source', header: 'Source', width: 140, type: 'enum', enumOptions: SOURCES.map((v) => ({ value: v })), filter: { kind: 'set', optionPart: 'pill' } },
  { id: 'updatedAt', header: 'Mis à jour', width: 156, type: 'instant', instantFormat: { date: true, time: false }, filter: { kind: 'instant', ops: ['betweenDays'] } },
];

const cols = moveColumns();
const chooser = columnsChooser();
const grid = createGrid(document.getElementById('host')!, {
  rows, getRowId: (r: P) => r.id, columns, rowHeight: 48,
  locale: 'fr-FR', timeZone: 'Europe/Paris', label: 'Produits',
  messages: { locale: 'fr', text: { ...FR.text, ...FR_FILTERS.text, ...FR_PAGINATION.text, ...FR_COLUMNS.text, ...FR_COLUMN_MENU.text, ...FR_PRINT.text } },
  parts: { pill },
  pagination: { pageSize: 20 },
  selection: { mode: 'multi', checkbox: true },
  features: [cols, chooser, columnMenu({ use: { columns: cols, chooser } }), filters({ apply: 'button', dateZone: false, dateCalendar: { months: 1, presets: [] } }), pagination(), slots()],
} as never);

const open = document.getElementById('cols') as HTMLButtonElement;
open.addEventListener('click', () => chooser.api(grid as never)?.open(open));
document.getElementById('print')!.addEventListener('click', () => void print(grid as never, { title: 'Produits' }));
(window as unknown as { app: unknown }).app = { grid, chooser };
