// The playground: dataset A (100 000 × 30) or a million generated rows, every Phase 2 setting live;
// `?filters=1&floating=1` adds the floating filter row (step 12); `&popup=1` the header's filter buttons and popup (step 13);
// `&dates=1` the date filters' controls (step 14): the grid's zone and a clock to move (midnight, a clock change);
// `&dates=fail` a date kit that never loads (the failure and Retry). With `filters=1` a "Commune" column (about 2 000 values)
// asks for the value list (`filter: { kind: 'set' }`, step 15) and "Statut" is an enum that does not (no button, owner Q2);
// `&sets=1` names that demo (the browser checks), `&setfail=1` makes its chunk fail (the failure and Retry).
import { createGrid, type GridInstance, type GridSettings } from '@dzgrid/dom';
import { EN } from '@dzgrid/dom/locales/en';
import { FR } from '@dzgrid/dom/locales/fr';
import { AR } from '@dzgrid/dom/locales/ar';
import { filters } from '@dzgrid/dom/filters';
import { EN_FILTERS } from '@dzgrid/dom/locales/en-filters';
import { FR_FILTERS } from '@dzgrid/dom/locales/fr-filters';
import { AR_FILTERS } from '@dzgrid/dom/locales/ar-filters';
import type { ColumnDef } from '@dzgrid/core';
import { datasetA, type RowA } from '../perf/dataset.js';
// The theme, through Vite (a <link> to a file outside the playground folder is not served).
import '../packages/theme/dzgrid.css';
import '../packages/theme/contrast.css';

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
// `filters=1` adds the filters feature (its texts spread into each bundle); `floating=1` its floating row. Fixed at creation.
const withFilters = params.get('filters') === '1';
const floating = params.get('floating') === '1';
const popup = params.get('popup') === '1';
const dates = params.get('dates');
// The clock the date shortcuts count from: the machine's, moved by the "Horloge" menu (dates=1).
let offset = 0;
if (dates) {
  const add = (html: string) => form.querySelector('output')!.insertAdjacentHTML('beforebegin', html);
  add('<label>Fuseau <select name="zone"><option>Europe/Paris</option><option>Africa/Algiers</option><option>America/Sao_Paulo</option><option>Pacific/Apia</option></select></label>');
  add('<label>Horloge <select name="clock"><option value="">maintenant</option><option value="2026-10-24T21:59:50Z">24/10/2026 23:59:50 Paris</option>' +
    '<option value="2026-03-29T00:59:30Z">29/03/2026 01:59:30 Paris</option><option value="2026-10-25T00:59:30Z">25/10/2026 02:59:30 Paris (été)</option></select></label>');
  for (const n of ['zone', 'clock']) if (params.get(n)) (form.elements.namedItem(n) as HTMLSelectElement).value = params.get(n)!;
  const move = () => void (offset = val('clock') ? Date.parse(val('clock')) - Date.now() : 0);
  move();
  form.addEventListener('change', move);
}
const join = <B extends { text: object }>(b: B, f: { text: object }): B => (withFilters ? { ...b, text: { ...b.text, ...f.text } } : b);
const bundles = { 'fr-FR': join(FR, FR_FILTERS), 'en-US': join(EN, EN_FILTERS), 'ar-DZ': join(AR, AR_FILTERS) } as const;

// About 2 000 place names (20 × 20 × 5 syllables), every seventh one in Arabic letters; 1 row in 40 blank.
const SYL = ['Ain', 'Bou', 'Sidi', 'Ouled', 'Beni', 'El', 'Ta', 'Ma', 'Ka', 'Ze', 'Ro', 'Ha', 'Mé', 'Ké', 'Lo', 'Da', 'Sa', 'Fé', 'Ni', 'Ra'];
const ENDS = ['ra', 'lia', 'mène', 'zir', 'ghar'];
const AR_SYL = ['عين', 'بو', 'سيدي', 'أولاد', 'بني', 'ال', 'تا', 'ما', 'كا', 'زي', 'رو', 'حا', 'مي', 'كي', 'لو', 'دا', 'سا', 'في', 'ني', 'را'];
const commune = (i: number): string => (i % 7 ? `${SYL[i % 20]} ${SYL[Math.floor(i / 20) % 20]!.toLowerCase()}${ENDS[Math.floor(i / 400) % 5]}` : `${AR_SYL[i % 20]} ${AR_SYL[Math.floor(i / 20) % 20]}${'ةيرنل'[Math.floor(i / 400) % 5]}`);
const SET_COLUMNS: ColumnDef<RowA, any>[] = withFilters ? [
  { id: 'commune', header: 'Commune', width: 160, value: (r: RowA) => (r.n2 % 40 === 0 ? null : commune(r.n0 % 2000)), filter: { kind: 'set' } },
  { id: 'e0', header: 'Statut', type: 'enum', width: 120, enumOptions: [{ value: 'pending', label: 'En attente' }, { value: 'active', label: 'Actif' }, { value: 'suspended', label: 'Suspendu' }, { value: 'closed', label: 'Clos' }] },
] : [];

const COLUMNS: ColumnDef<RowA, any>[] = [
  { id: 'id', header: 'ID', pinned: 'start', width: 90 },
  { id: 't0', header: 'Nom', pinned: 'start', width: 160, headerTooltip: 'Texte libre, en français' },
  ...SET_COLUMNS,
  { id: 'a0', header: 'الاسم', width: 160 },
  { id: 'n0', header: 'Montant', type: 'number', width: 110 },
  { id: 'd0', header: 'Jour', type: 'day', width: 120 },
  { id: 'i1', header: dates ? 'Rendez-vous' : 'Instant', type: 'instant', width: 180 },
  { id: 'e1', header: 'Service', width: 130 },
  { id: 'b0', header: 'Actif', type: 'boolean', width: 90 },
  ...(['t1', 't2', 't3', 'a1', 'a2', 'n1', 'n2', 'n3', 'n4', 'd1', 'd2', ...(withFilters ? [] : ['e0'] as const), 'e2', 'b1'] as const).map((id) => ({ id, width: 120, ...(id.startsWith('n') ? { type: 'number' as const } : id.startsWith('d') ? { type: 'day' as const } : id.startsWith('b') ? { type: 'boolean' as const } : {}) })),
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
    timeZone: dates ? val('zone') : 'Africa/Algiers',
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
// The rows are made first: the time shown is the grid's, from rows in memory to the first frame.
const initial = settings();
const t0 = performance.now();
const fail = { ...(dates === 'fail' && { loadDates: () => Promise.reject(new Error('the date kit is unreachable (dates=fail)')) }), ...(params.get('setfail') === '1' && { loadSet: () => Promise.reject(new Error('the set chunk is unreachable (setfail=1)')) }) };
const grid: GridInstance<RowA> = createGrid<RowA>(host, {
  ...initial, ...(withFilters && { features: [filters({ floating, popup, ...fail })] }), ...(dates && { clock: () => Date.now() + offset }),
});
requestAnimationFrame(() => requestAnimationFrame(() => { status.textContent = `premier rendu ${Math.round(performance.now() - t0)} ms`; }));

form.addEventListener('change', () => {
  page();
  grid.update(settings());
});
form.addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-overlay]');
  if (b) grid.update({ overlay: (b.dataset['overlay'] || null) as 'loading' | 'error' | null });
});
(window as unknown as { grid: unknown }).grid = grid;
