// The playground: dataset A (100 000 × 30) or a million generated rows, every Phase 2 setting live.
import { createGrid, type GridInstance, type GridSettings } from '@dzgrid/dom';
import { EN } from '@dzgrid/dom/locales/en';
import { FR } from '@dzgrid/dom/locales/fr';
import { AR } from '@dzgrid/dom/locales/ar';
import type { ColumnDef } from '@dzgrid/core';
import { datasetA, type RowA } from '../perf/dataset.js';

const form = document.getElementById('controls') as HTMLFormElement;
const host = document.getElementById('host')!;
const status = document.getElementById('status')!;
const params = new URLSearchParams(location.search);
for (const [k, v] of params) {
  const el = form.elements.namedItem(k) as HTMLSelectElement | null;
  if (el) el.value = v;
}
const val = (name: string) => (form.elements.namedItem(name) as HTMLSelectElement).value;
const on = (name: string) => (form.elements.namedItem(name) as HTMLInputElement).checked;
const bundles = { 'fr-FR': FR, 'en-US': EN, 'ar-DZ': AR } as const;

const COLUMNS: ColumnDef<RowA, any>[] = [
  { id: 'id', header: 'ID', pinned: 'start', width: 90 },
  { id: 't0', header: 'Nom', pinned: 'start', width: 160, headerTooltip: 'Texte libre, en français' },
  { id: 'a0', header: 'الاسم', width: 160 },
  { id: 'n0', header: 'Montant', type: 'number', width: 110 },
  { id: 'd0', header: 'Jour', type: 'day', width: 120 },
  { id: 'i1', header: 'Instant', type: 'instant', width: 180 },
  { id: 'e1', header: 'Service', width: 130 },
  ...(['t1', 't2', 't3', 'a1', 'a2', 'n1', 'n2', 'n3', 'n4', 'd1', 'd2', 'e0', 'e2', 'b0', 'b1'] as const).map((id) => ({ id, width: 120, ...(id.startsWith('n') ? { type: 'number' as const } : id.startsWith('d') ? { type: 'day' as const } : id.startsWith('b') ? { type: 'boolean' as const } : {}) })),
  { id: 'n7', header: 'Total', type: 'number', pinned: 'end', width: 100 },
];

let cache: { n: number; rows: RowA[] } | null = null;
function rowsFor(n: number): RowA[] {
  if (cache?.n === n) return cache.rows;
  const base = datasetA(100_000);
  const rows = n <= base.length ? base : Array.from({ length: n }, (_, i) => ({ ...base[i % base.length]!, id: `r${i}` }));
  cache = { n, rows };
  return rows;
}

function settings(): GridSettings<RowA> {
  const locale = val('locale') as keyof typeof bundles;
  return {
    rows: rowsFor(Number(val('rows'))),
    getRowId: (r) => r.id,
    columns: COLUMNS,
    messages: bundles[locale],
    locale,
    timeZone: 'Africa/Algiers',
    direction: val('direction') as 'auto' | 'ltr' | 'rtl',
    density: val('density') as 'compact' | 'comfortable' | 'spacious',
    selection: { mode: val('selection') as 'none' | 'single' | 'multi', checkbox: on('box'), click: true },
    searchWarmup: on('warm') ? 'idle' : 'off',
    onEvent: (e) => { if (e.type === 'selectionChanged') status.textContent = `${e.count ?? '?'} sélectionnées`; },
  };
}

const page = () => {
  const html = document.documentElement;
  html.lang = val('locale');
  html.dir = val('locale') === 'ar-DZ' && val('direction') === 'auto' ? 'rtl' : val('direction') === 'rtl' ? 'rtl' : 'ltr';
  if (val('theme')) html.dataset['theme'] = val('theme');
  else delete html.dataset['theme'];
  if (val('contrast')) html.dataset['contrast'] = val('contrast');
  else delete html.dataset['contrast'];
};
page();
const t0 = performance.now();
const grid: GridInstance<RowA> = createGrid<RowA>(host, settings());
requestAnimationFrame(() => { status.textContent = `premier rendu ${Math.round(performance.now() - t0)} ms`; });

form.addEventListener('change', () => {
  page();
  grid.update(settings());
});
form.addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-overlay]');
  if (b) grid.update({ overlay: (b.dataset['overlay'] || null) as 'loading' | 'error' | null });
});
(window as unknown as { grid: unknown }).grid = grid;
