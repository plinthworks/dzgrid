// The playground: dataset A (100 000 × 30) or a million generated rows, every Phase 2 setting live;
// `?filters=1&floating=1` adds the floating filter row (step 12); `&popup=1` the header's filter buttons and popup (step 13);
// `&dates=1` the date filters' controls (step 14): the grid's zone and a clock to move (midnight, a clock change);
// `&dates=fail` a date kit that never loads (the failure and Retry). With `filters=1` a "Commune" column (about 2 000 values)
// asks for the value list (`filter: { kind: 'set' }`, step 15) and "Statut" is an enum that does not (no button, owner Q2);
// `&sets=1` names that demo (the browser checks), `&setfail=1` makes its chunk fail (the failure and Retry).
// `search=1` puts a labelled search field above the grid, bound with `quickSearch()` (step 16).
// `paging=client` pages the rows in the browser with the footer (`pagination()`, step 17); `paging=offset` and
// `paging=cursor` serve them from a slow server in memory (400 ms), by cursor without a total.
// `export=1` puts an export button above the grid (`csvExport()`, step 19): every row the query matches,
// with the page's own label in its language (rtl.html opens it in Arabic, for the owner's Excel check at step 23).
// `parts=1` draws "Statut" as badges and every yes/no column as "✓ Oui" / "✗ Non" (`@dzgrid/dom/parts`, step 20).
// `rules=1` (step 21): a selection rule ("if row 4 is ticked, row 8 cannot be", and the reverse; at most N rows, N
// from the "Au plus" menu, handed through `settings.context`), and two headers that drive their column's filter: "Nom"
// with the page's own search box (a header part written here, as an application would), "Montant" with `header.filterBox`.
// `pills=1` (the feedback pass, 2026-10-27): "Commune"'s value list drawn as pills by a `filterOption` part of the page
// (its tones in `ui.data`), and "Rendez-vous" offering one operator (between days): no « Condition », the period form
// (FROM, TO, one month of calendar) in the popup itself.
import { createGrid, type GridInstance, type GridSettings } from '@dzgrid/dom';
import { EN } from '@dzgrid/dom/locales/en';
import { FR } from '@dzgrid/dom/locales/fr';
import { AR } from '@dzgrid/dom/locales/ar';
import { filters } from '@dzgrid/dom/filters';
import { quickSearch } from '@dzgrid/dom/search';
import { pagination } from '@dzgrid/dom/pagination';
import { csvExport } from '@dzgrid/dom/export';
import { badge, cellBoolean } from '@dzgrid/dom/parts';
import { rules } from '@dzgrid/dom/rules';
import { slots } from '@dzgrid/dom/slots';
import { definePart, type SlotContext, type SlotPart } from '@dzgrid/dom';
import { EN_RULES } from '@dzgrid/dom/locales/en-rules';
import { FR_RULES } from '@dzgrid/dom/locales/fr-rules';
import { AR_RULES } from '@dzgrid/dom/locales/ar-rules';
import { EN_PARTS } from '@dzgrid/dom/locales/en-parts';
import { FR_PARTS } from '@dzgrid/dom/locales/fr-parts';
import { AR_PARTS } from '@dzgrid/dom/locales/ar-parts';
import { EN_EXPORT } from '@dzgrid/dom/locales/en-export';
import { FR_EXPORT } from '@dzgrid/dom/locales/fr-export';
import { AR_EXPORT } from '@dzgrid/dom/locales/ar-export';
import { sourceRows, type DataRequest, type DataResponse } from '@dzgrid/core/server';
import { EN_PAGINATION } from '@dzgrid/dom/locales/en-pagination';
import { FR_PAGINATION } from '@dzgrid/dom/locales/fr-pagination';
import { AR_PAGINATION } from '@dzgrid/dom/locales/ar-pagination';
import { EN_FILTERS } from '@dzgrid/dom/locales/en-filters';
import { FR_FILTERS } from '@dzgrid/dom/locales/fr-filters';
import { AR_FILTERS } from '@dzgrid/dom/locales/ar-filters';
import type { ColumnDef } from '@dzgrid/core';
import { datasetA, type RowA } from '../perf/dataset.js';
// The theme, through Vite (a <link> to a file outside the playground folder is not served).
import '../packages/theme/dzgrid.css';
import '../packages/theme/contrast.css';
// The showcase themes (`?skin=midnight|clinic`), as text: one at a time in the page's own <style> (each
// file themes the whole page once loaded, so they are not both imported).
import MIDNIGHT from '../packages/theme/midnight.css?inline';
import CLINIC from '../packages/theme/clinic.css?inline';

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
// `filters=1` adds the filters feature (its texts spread into each bundle); `floating=1` starts with its floating row
// shown (the "Ligne de filtres" button above the grid shows or hides it live, Phase 4 step 12).
const withFilters = params.get('filters') === '1';
const floating = params.get('floating') === '1';
const popup = params.get('popup') === '1';
const dates = params.get('dates');
const withSearch = params.get('search') === '1';
const paging = params.get('paging') as 'client' | 'offset' | 'cursor' | null;
const withExport = params.get('export') === '1';
const withParts = params.get('parts') === '1';
const withRules = params.get('rules') === '1';
const withPills = params.get('pills') === '1';
if (withRules) {
  form.querySelector('output')!.insertAdjacentHTML('beforebegin', '<label>Au plus <select name="max"><option>5</option><option>3</option><option>10</option></select></label>');
  if (params.get('max')) (form.elements.namedItem('max') as HTMLSelectElement).value = params.get('max')!;
}
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
const join = <B extends { text: object }>(b: B, f: { text: object }, p: { text: object }, x: { text: object }, c: { text: object }, r: { text: object }): B => ({ ...b, text: { ...b.text, ...((withFilters || withRules) && f.text), ...(paging && p.text), ...(withExport && x.text), ...(withParts && c.text), ...(withRules && r.text) } });
const bundles = { 'fr-FR': join(FR, FR_FILTERS, FR_PAGINATION, FR_EXPORT, FR_PARTS, FR_RULES), 'en-US': join(EN, EN_FILTERS, EN_PAGINATION, EN_EXPORT, EN_PARTS, EN_RULES), 'ar-DZ': join(AR, AR_FILTERS, AR_PAGINATION, AR_EXPORT, AR_PARTS, AR_RULES) } as const;

// The selection rule (`rules=1`): r4 and r8 exclude each other; at most `context.max` rows. Its sentences are the page's.
const REASONS = {
  'fr-FR': { pair: (a: string) => `Non sélectionnable : la ligne ${a} est cochée`, max: (n: number) => `Non sélectionnable : ${n} lignes au plus` },
  'en-US': { pair: (a: string) => `Not selectable: row ${a} is ticked`, max: (n: number) => `Not selectable: ${n} rows at most` },
  'ar-DZ': { pair: (a: string) => `غير قابل للتحديد: الصف ${a} محدد`, max: (n: number) => `غير قابل للتحديد: ${n} صفوف على الأكثر` },
};
const PAIRS: Record<string, string> = { r4: 'r8', r8: 'r4' };
const rule: NonNullable<NonNullable<GridSettings<RowA>['selection']>['canSelect']> = (row, s, c) => {
  const words = REASONS[val('locale') as 'fr-FR'];
  const other = PAIRS[row.data.id];
  if (other && [...s.keys].some((k) => String(k).endsWith(`:${other}`))) return words.pair(other.slice(1));
  const max = (c as { max: number }).max;
  return s.keys.size < max || words.max(max);
};
// "Nom"'s header (`rules=1`): its title and the page's own search box, driving the column's filter. Its
// accessible name is the page's; the header keeps its own. Echo the filter only while the box is not focused.
const NAME_SEARCH = definePart('header', {
  mount(host, first) {
    let c: SlotContext['header'] = first;
    const title = document.createElement('span');
    const input = document.createElement('input');
    input.type = 'search';
    input.style.cssText = 'flex:1;min-inline-size:0;margin-inline-start:.25rem';
    host.style.cssText = 'display:flex;flex:1;align-items:center';
    const word = { 'fr-FR': 'Chercher dans', 'en-US': 'Search', 'ar-DZ': 'البحث في' }[val('locale') as 'fr-FR'];
    const draw = () => {
      title.textContent = c.label;
      input.setAttribute('aria-label', `${word} ${c.label}`);
      if (document.activeElement !== input) input.value = (c.filter?.state as { value?: string } | null)?.value ?? '';
    };
    input.addEventListener('input', () => c.filter?.set(input.value ? { type: 'text', op: 'contains', value: input.value } : null));
    host.append(title, input);
    draw();
    return { update: (n) => void ((c = n), draw()), focus: () => (input.focus(), true) };
  },
});

// About 2 000 place names (20 × 20 × 5 syllables), every seventh one in Arabic letters; 1 row in 40 blank.
const SYL = ['Ain', 'Bou', 'Sidi', 'Ouled', 'Beni', 'El', 'Ta', 'Ma', 'Ka', 'Ze', 'Ro', 'Ha', 'Mé', 'Ké', 'Lo', 'Da', 'Sa', 'Fé', 'Ni', 'Ra'];
const ENDS = ['ra', 'lia', 'mène', 'zir', 'ghar'];
const AR_SYL = ['عين', 'بو', 'سيدي', 'أولاد', 'بني', 'ال', 'تا', 'ما', 'كا', 'زي', 'رو', 'حا', 'مي', 'كي', 'لو', 'دا', 'سا', 'في', 'ني', 'را'];
const commune = (i: number): string => (i % 7 ? `${SYL[i % 20]} ${SYL[Math.floor(i / 20) % 20]!.toLowerCase()}${ENDS[Math.floor(i / 400) % 5]}` : `${AR_SYL[i % 20]} ${AR_SYL[Math.floor(i / 20) % 20]}${'ةيرنل'[Math.floor(i / 400) % 5]}`);
// "Statut": an enum with the filters (no list button, owner Q2) or the cell parts (a badge per value).
const STATUS: ColumnDef<RowA, any> = { id: 'e0', header: 'Statut', type: 'enum', width: 130, enumOptions: [{ value: 'pending', label: 'En attente' }, { value: 'active', label: 'Actif' }, { value: 'suspended', label: 'Suspendu' }, { value: 'closed', label: 'Clos' }], ...(withParts && { ui: { cell: 'statusBadge' } }) };
// `pills=1`: each value a pill, tinted by its first letter (the tones handed through `ui.data`, plain data); the
// grid keeps the row (option, ticks, keys, window, its name « label, count »). Global CSS (index.html): the popup
// is in the top layer, out of any scoped style.
const TONES = { tones: ['accent', 'warm', 'cool'] };
const PILL = definePart('filterOption', {
  mount(host, c) {
    // The label area only (owner's look, app-feedback 11 and 17): the grid keeps its box and its count.
    const pill = document.createElement('span');
    host.append(pill);
    const draw = (n: SlotContext['filterOption']): void => {
      const tones = (n.column.def.ui?.data as typeof TONES | undefined)?.tones ?? ['accent'];
      pill.className = `pg-pill pg-pill--${n.blank ? 'blank' : tones[(n.label.codePointAt(0) ?? 0) % tones.length]}`;
      pill.dataset['on'] = String(n.selected);
      pill.textContent = n.label;
    };
    draw(c);
    return { update: draw };
  },
});
const SET_COLUMNS: ColumnDef<RowA, any>[] = [
  ...(withFilters ? [{ id: 'commune', header: 'Commune', width: 160, value: (r: RowA) => (r.n2 % 40 === 0 ? null : commune(r.n0 % 2000)), filter: { kind: 'set', ...(withPills && { optionPart: 'pill' }) }, ...(withPills && { ui: { data: TONES } }) } as ColumnDef<RowA, any>] : []),
  ...(withFilters || withParts ? [STATUS] : []),
];
// The cell parts (`parts=1`): each status its tone (closed: neutral, no shape), yes/no on every boolean column.
const PARTS: Readonly<Record<string, SlotPart>> | undefined = withParts ? { statusBadge: badge({ tones: { pending: 'warning', active: 'success', suspended: 'danger' } }), 'cell.boolean': cellBoolean } : withRules ? { nameSearch: NAME_SEARCH } : withPills ? { pill: PILL } : undefined;

const COLUMNS: ColumnDef<RowA, any>[] = [
  { id: 'id', header: 'ID', pinned: 'start', width: 90 },
  { id: 't0', header: 'Nom', pinned: 'start', width: withRules ? 220 : 160, headerTooltip: 'Texte libre, en français', ...(withRules && { ui: { header: 'nameSearch' } }) },
  ...SET_COLUMNS,
  { id: 'a0', header: 'الاسم', width: 160 },
  { id: 'n0', header: 'Montant', type: 'number', width: withRules ? 170 : 110, ...(withRules && { ui: { header: 'header.filterBox' } }) },
  { id: 'd0', header: 'Jour', type: 'day', width: 120 },
  { id: 'i1', header: dates ? 'Rendez-vous' : 'Instant', type: 'instant', width: 180, ...(withPills && { filter: { ops: ['betweenDays'] } }) },
  { id: 'e1', header: 'Service', width: 130 },
  { id: 'b0', header: 'Actif', type: 'boolean', width: 90 },
  ...(['t1', 't2', 't3', 'a1', 'a2', 'n1', 'n2', 'n3', 'n4', 'd1', 'd2', ...(withFilters || withParts ? [] : ['e0'] as const), 'e2', 'b1'] as const).map((id) => ({ id, width: 120, ...(id.startsWith('n') ? { type: 'number' as const } : id.startsWith('d') ? { type: 'day' as const } : id.startsWith('b') ? { type: 'boolean' as const } : {}) })),
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

/**
 * A slow server in memory (`paging=offset|cursor`): text filters `contains`, the search over the
 * text columns, the sort, then one page: by offset with its total, or by cursor with none.
 */
function server(by: 'offset' | 'cursor') {
  const fetch = (req: DataRequest): Promise<DataResponse<RowA>> => new Promise((done) => setTimeout(() => {
    let rows = rowsFor(Number(val('rows')));
    for (const [col, f] of Object.entries(req.filter ?? {})) {
      const v = 'value' in f && typeof f.value === 'string' ? f.value.toLowerCase() : null;
      if (f.type === 'text' && v) rows = rows.filter((r) => String(r[col as keyof RowA] ?? '').toLowerCase().includes(v));
    }
    const q = req.quick?.toLowerCase();
    if (q) rows = rows.filter((r) => r.t0.toLowerCase().includes(q) || r.a0.includes(q) || r.id.includes(q));
    for (const s of [...(req.sort ?? [])].reverse()) {
      const k = s.column as keyof RowA;
      const sign = s.dir === 'asc' ? 1 : -1;
      rows = [...rows].sort((a, b) => ((a[k] ?? '') < (b[k] ?? '') ? -sign : (a[k] ?? '') > (b[k] ?? '') ? sign : 0));
    }
    const p = req.page!;
    const at = by === 'cursor' && p.cursor ? Number(p.cursor) : p.offset;
    const page = rows.slice(at, at + p.size);
    const more = at + p.size < rows.length;
    done(by === 'cursor' ? { rows: page, hasNext: more, ...(more && { nextCursor: String(at + p.size) }) } : { rows: page, total: rows.length });
  }, 400));
  return sourceRows<RowA>({ fetch }, { paging: by });
}
const served = paging === 'offset' || paging === 'cursor';

function settings(): GridSettings<RowA> {
  const locale = val('locale') as keyof typeof bundles;
  return {
    ...(!served && { rows: rowsFor(Number(val('rows'))) }),
    getRowId: (r) => r.id,
    columns: COLUMNS,
    ...(PARTS && { parts: PARTS }),
    messages: bundles[locale],
    locale,
    timeZone: dates ? val('zone') : 'Africa/Algiers',
    direction: val('direction') as 'auto' | 'ltr' | 'rtl',
    density: val('density') as 'compact' | 'comfortable' | 'spacious',
    selection: { mode: val('selection') as 'none' | 'single' | 'multi', checkbox: on('box'), click: true, ...(withRules && { canSelect: rule }) },
    ...(withRules && { context: { max: Number(val('max')) } }),
    searchWarmup: on('warm') ? 'idle' : 'off',
    onEvent: (e) => {
      if (e.type === 'selectionChanged') status.textContent = `${e.count ?? '?'} sélectionnées`;
      if (e.type === 'exportFinished') status.textContent = `export : ${e.outcome}, ${e.rows ?? '?'} lignes, ${Math.round(e.durationMs)} ms`;
    },
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
  const skin = document.getElementById('skin') ?? document.head.appendChild(Object.assign(document.createElement('style'), { id: 'skin' }));
  const css = { midnight: MIDNIGHT, clinic: CLINIC }[val('skin')] ?? '';
  if (skin.textContent !== css) skin.textContent = css;
};
page();
// The rows are made first: the time shown is the grid's, from rows in memory to the first frame.
const initial = settings();
const t0 = performance.now();
const fail = { ...(dates === 'fail' && { loadDates: () => Promise.reject(new Error('the date kit is unreachable (dates=fail)')) }), ...(params.get('setfail') === '1' && { loadSet: () => Promise.reject(new Error('the set chunk is unreachable (setfail=1)')) }) };
// The page's own search field (the grid draws none): labelled by the page, in its language.
const search = withSearch ? quickSearch() : null;
if (search) {
  const label = { 'fr-FR': 'Rechercher dans la grille', 'en-US': 'Search the grid', 'ar-DZ': 'البحث في الجدول' }[val('locale') as 'fr-FR'];
  host.insertAdjacentHTML('beforebegin', `<p class="bar"><label>${label} <input type="search" id="q"></label></p>`);
  search.bind(document.getElementById('q') as HTMLInputElement);
}
// The page's own export button (the grid draws none): `canExport: true` here; a real app asks its rules.
const exporter = withExport ? csvExport({ canExport: true }) : null;
if (exporter) {
  const label = { 'fr-FR': 'Exporter en CSV', 'en-US': 'Export CSV', 'ar-DZ': 'تصدير CSV' }[val('locale') as 'fr-FR'];
  host.insertAdjacentHTML('beforebegin', `<p class="bar"><button type="button" id="export">${label}</button></p>`);
  exporter.bind(document.getElementById('export')!, { scope: 'all' });
}
// The page's own "Filter row" button (Phase 4 step 12): shows or hides the floating row live, pressed while shown.
const filtering = withFilters ? filters({ floating, popup, ...fail }) : null;
if (filtering) {
  const label = { 'fr-FR': 'Ligne de filtres', 'en-US': 'Filter row', 'ar-DZ': 'صف المرشحات' }[val('locale') as 'fr-FR'];
  host.insertAdjacentHTML('beforebegin', `<p class="bar"><button type="button" id="floating">${label}</button></p>`);
  filtering.floating.bind(document.getElementById('floating')!);
}
const grid: GridInstance<RowA> = createGrid<RowA>(host, {
  ...initial, features: [...(withRules ? [rules(), slots(), filters({ popup: true })] : []), ...(filtering ? [filtering] : []), ...(search ? [search] : []), ...(paging ? [pagination()] : []), ...(exporter ? [exporter] : [])], ...(dates && { clock: () => Date.now() + offset }),
  ...(paging && { pagination: { pageSize: 50 } }), ...(served && { source: server(paging), operations: 'server' as const }),
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
(window as unknown as { filtering: unknown }).filtering = filtering;
