// The dock on the browser page (Phase 9, scripts/browser-dock.mjs, dock.md): made-up stock rows, the columns panel and
// the filters panel in the dock, the grid's state. Query: locale (fr-FR, ar-DZ), theme, open (`columns:end,filters:end`).
// `window.t` gives the grid, the features' apis, the layouts told.
import { createGrid } from '/packages/dom/src/index.ts';
import { FR } from '/packages/dom/src/locales/fr.ts';
import { AR } from '/packages/dom/src/locales/ar.ts';
import { FR_DOCK } from '/packages/dom/src/locales/fr-dock.ts';
import { AR_DOCK } from '/packages/dom/src/locales/ar-dock.ts';
import { FR_COLUMNS } from '/packages/dom/src/locales/fr-columns.ts';
import { AR_COLUMNS } from '/packages/dom/src/locales/ar-columns.ts';
import { FR_FILTERS } from '/packages/dom/src/locales/fr-filters.ts';
import { AR_FILTERS } from '/packages/dom/src/locales/ar-filters.ts';
import { FR_FILTERS_PANEL } from '/packages/dom/src/locales/fr-filters-panel.ts';
import { AR_FILTERS_PANEL } from '/packages/dom/src/locales/ar-filters-panel.ts';
import { dock } from '/packages/dom/src/dock.ts';
import { columnsChooser } from '/packages/dom/src/columns-panel.ts';
import { filters } from '/packages/dom/src/filters-base.ts';
import { filtersPanel } from '/packages/dom/src/filters-panel.ts';
import { gridState } from '/packages/dom/src/state.ts';
import type { DockArea, DockState } from '@dzgrid/core/dock';

const q = new URLSearchParams(location.search);
const locale = q.get('locale') ?? 'fr-FR';
const ar = locale.startsWith('ar');
document.documentElement.lang = locale;
document.documentElement.dir = ar ? 'rtl' : 'ltr';
if (q.get('theme')) document.documentElement.dataset['theme'] = q.get('theme')!;

type Row = { id: string; item: string; shelf: string; qty: number; price: number };
const ITEM = ar ? ['تفاح', 'برتقال', 'خبز', 'جبن', 'شاي'] : ['Pommes', 'Oranges', 'Pain', 'Fromage', 'Thé'];
const SHELF = ar ? ['أ', 'ب', 'ج'] : ['A', 'B', 'C'];
const rows: Row[] = Array.from({ length: 200 }, (_, i) => ({ id: `r${i}`, item: `${ITEM[i % 5]} ${i + 1}`, shelf: SHELF[i % 3]!, qty: (i * 7) % 50, price: ((i * 13) % 900) / 10 }));
const open = Object.fromEntries((q.get('open') ?? 'columns:end').split(',').filter(Boolean).map((p) => p.split(':'))) as Record<string, DockArea>;
const layouts: DockState[] = [];
const chooser = columnsChooser();
const panel = filtersPanel();
const d = dock({ open, onChange: (l) => void layouts.push(l) });
const st = gridState();
const msg = ar ? AR : FR;
const grid = createGrid<Row>(document.getElementById('host')!, {
  rows,
  getRowId: (r) => r.id,
  label: ar ? 'المخزون' : 'Stock',
  columns: [
    { id: 'item', header: ar ? 'الصنف' : 'Article', width: 200 },
    { id: 'shelf', header: ar ? 'الرف' : 'Rayon', width: 120 },
    { id: 'qty', header: ar ? 'الكمية' : 'Quantité', type: 'number', width: 120 },
    { id: 'price', header: ar ? 'السعر' : 'Prix', type: 'number', width: 120 },
  ],
  messages: { locale: msg.locale, text: { ...msg.text, ...(ar ? AR_DOCK : FR_DOCK).text, ...(ar ? AR_COLUMNS : FR_COLUMNS).text, ...(ar ? AR_FILTERS : FR_FILTERS).text, ...(ar ? AR_FILTERS_PANEL : FR_FILTERS_PANEL).text } },
  locale,
  features: [filters(), chooser, panel, d, st],
});
document.getElementById('app')!.addEventListener('click', (e) => void chooser.api(grid)!.open(e.currentTarget as HTMLElement));
(window as unknown as { t: unknown }).t = { grid, dock: d.api(grid), chooser: chooser.api(grid), panel: panel.api(grid), state: st.api(grid), layouts };
(window as unknown as { ready: boolean }).ready = true;
