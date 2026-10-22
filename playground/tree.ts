// The « Arbre » page (Phase 4 step 4, docs/behaviors/tree-view.md, docs/a11y-protocol.md §16): a tree given
// by parent ids — 100 services, their patients, some patients' stays (≈ 10 000 rows, `?rows=100000` for
// ≈ 100 000) — with the floating filter row, the filter popup, sorting by a header, and the buttons the
// listening protocol uses. `?locale=ar-DZ&direction=auto`: Arabic, right to left. Only « Service 0 » is open at first.
// `?shape=nested|path` (Phase 4 step 5): the same tree as nested lists, or as paths where the services have
// no row of their own (filler rows: a label, no values, never selected).
// `?rows=1000000` (Phase 4 step 6): the million-row tree of perf/profiles/tree.ts (parent ids, ten levels,
// mixed widths), parent ids only; « Tout déplier » opens the million.
// `?lazy=client|server` (Phase 4 step 7, docs/behaviors/tree-lazy.md): the services only at first, their
// patients asked when a service opens — of the host's loader (`load`) or of a fake server (`sourceRows`
// with `children`) — after 300 to 1 500 ms; « Le serveur échoue » makes every load fail (the error row, Retry).
// `?sticky=0|1|3` (Phase 4, docs/behaviors/tree-sticky.md): how many parents stay pinned under the header (3 by default).
import { createGrid } from '@dzgrid/dom';
import { lazyChildren } from '@dzgrid/dom/tree-lazy';
import { sourceRows } from '@dzgrid/core/server';
import { filters } from '@dzgrid/dom/filters';
import { tree } from '@dzgrid/dom/tree';
import { FR } from '@dzgrid/dom/locales/fr';
import { AR } from '@dzgrid/dom/locales/ar';
import { FR_FILTERS } from '@dzgrid/dom/locales/fr-filters';
import { AR_FILTERS } from '@dzgrid/dom/locales/ar-filters';
import { FR_TREE } from '@dzgrid/dom/locales/fr-tree';
import { AR_TREE } from '@dzgrid/dom/locales/ar-tree';
import { dataKey, groupKey, type ColumnDef, type GridEvent } from '@dzgrid/core';
import '../packages/theme/dzgrid.css';
import { treeProfile } from '../perf/profiles/tree.js';

const form = document.getElementById('controls') as HTMLFormElement;
const status = document.getElementById('status')!;
const q = new URLSearchParams(location.search);
const locale = q.get('locale') === 'ar-DZ' ? 'ar-DZ' : 'fr-FR';
const ar = locale === 'ar-DZ';
const asked = Number(q.get('rows') ?? 10_000);
const million = asked >= 1_000_000;
const total = million ? 1_000_000 : asked >= 100_000 ? 100_000 : 10_000;
const field = (name: string) => form.elements.namedItem(name) as HTMLSelectElement;
field('locale').value = locale;
field('theme').value = q.get('theme') ?? '';
field('rows').value = String(total);
const lazyMode = million ? '' : q.get('lazy') === 'client' ? 'client' : q.get('lazy') === 'server' ? 'server' : '';
const shape = million || lazyMode ? 'parent' : q.get('shape') === 'nested' ? 'nested' : q.get('shape') === 'path' ? 'path' : 'parent';
field('shape').value = shape;
field('lazy').value = lazyMode;
const sticky = ['0', '1'].includes(q.get('sticky') ?? '') ? Number(q.get('sticky')) : 3;
field('sticky').value = String(sticky);
document.getElementById('failbox')!.hidden = !lazyMode;
if (q.get('theme')) document.documentElement.dataset['theme'] = q.get('theme')!;
document.documentElement.lang = locale;
// The grid follows the page's direction (`direction: 'auto'`).
document.documentElement.dir = ar ? 'rtl' : 'ltr';
form.addEventListener('change', (e) => {
  if ((e.target as Element).id === 'fail') return;
  const next = new URLSearchParams({ locale: field('locale').value, theme: field('theme').value, rows: field('rows').value, shape: field('shape').value, lazy: field('lazy').value, sticky: field('sticky').value });
  if (field('locale').value === 'ar-DZ') next.set('direction', 'auto');
  location.search = next.toString();
});

const W = ar
  ? { title: 'شجرة', name: 'الاسم', kind: 'النوع', city: 'المدينة', age: 'العمر', service: 'Service', patient: 'Patient', stay: 'إقامة', kinds: ['مصلحة', 'مريض', 'إقامة'], cities: ['الجزائر', 'وهران', 'قسنطينة', 'عنابة', 'البليدة', 'سطيف'], all: 'توسيع الكل', none: 'طي الكل', later: 'بعد 5 ث: طي Service 2', shown: (n: number) => `${n} صف معروض` }
  : { title: 'Arbre', name: 'Nom', kind: 'Type', city: 'Ville', age: 'Âge', service: 'Service', patient: 'Patient', stay: 'Séjour', kinds: ['Service', 'Patient', 'Séjour'], cities: ['Alger', 'Oran', 'Constantine', 'Annaba', 'Blida', 'Sétif'], all: 'Tout déplier', none: 'Tout replier', later: 'Dans 5 s : replier Service 2', shown: (n: number) => `${n} lignes affichées` };
document.getElementById('title')!.textContent = W.title;
document.getElementById('all')!.textContent = W.all;
document.getElementById('none')!.textContent = W.none;
document.getElementById('later')!.textContent = W.later;

// The names stay Latin in both languages (the listening protocol's sentences name « Service 0 », « Patient 3 »).
type Row = { id: string; parent: string | null; name: string; kind: number; city: string; age: number | null; kids?: Row[]; path?: string[] };
const rows: Row[] = [];
const per = million ? 0 : Math.round(total / 100 / 1.1);
// The million: the bench's own rows, their level as the type (0 root, 1, then 2 for every level below).
if (million) for (const r of treeProfile()) rows.push({ id: r.id, parent: r.parent, name: r.name, kind: Math.min(r.level, 2), city: W.cities[r.n % 6]!, age: (r.n % 90) + 1 });
for (let s = 0; s < (million ? 0 : 100); s++) {
  rows.push({ id: `s${s}`, parent: null, name: `${W.service} ${s}`, kind: 0, city: W.cities[s % 6]!, age: null });
  for (let p = 1; p <= per; p++) {
    const id = `s${s}p${p}`;
    rows.push({ id, parent: `s${s}`, name: `${W.patient} ${p}`, kind: 1, city: W.cities[(s + p) % 6]!, age: (s * 7 + p * 13) % 90 + 1 });
    // One patient in ten has stays (3 of them).
    if (p % 10 === 3) for (let v = 1; v <= 3; v++) rows.push({ id: `${id}v${v}`, parent: id, name: `${W.stay} ${v}`, kind: 2, city: W.cities[(s + p) % 6]!, age: null });
  }
}

// The same rows in the shape asked: nested lists (each row its children), or paths without the services.
const byId = new Map(shape === 'path' ? rows.map((r) => [r.id, r]) : []);
const pathOf = (r: Row): string[] => (r.parent ? [...pathOf(byId.get(r.parent)!), r.id] : [r.name]);
const given: Row[] =
  shape === 'nested' ? rows.map((r) => ({ ...r, kids: [] as Row[] })) : shape === 'path' ? rows.filter((r) => r.parent).map((r) => ({ ...r, path: pathOf(r) })) : rows;
if (shape === 'nested') {
  const node = new Map(given.map((r) => [r.id, r]));
  for (const r of given) if (r.parent) node.get(r.parent)!.kids!.push(r);
}
const top = shape === 'nested' ? given.filter((r) => !r.parent) : given;
const serviceKey = (s: number) => (shape === 'path' ? groupKey([`${W.service} ${s}`]) : dataKey(million ? `t${s}` : `s${s}`)!);
const treeOptions = shape === 'nested' ? { children: (r: Row) => r.kids } : shape === 'path' ? { path: (r: Row) => r.path! } : { parentId: (r: Row) => r.parent };

// Lazy mode: the services alone are given; a fake server answers a service's patients after a random delay,
// or fails while « Le serveur échoue » is ticked. Its children declared by the row (`has`); « Patient 2 » of
// each service is declared too and answers no child (a11y-protocol §16, step 95c: « Patient 2, aucune ligne »).
const failing = document.getElementById('fail') as HTMLInputElement;
const byParent = new Map<string, Row[]>();
if (lazyMode) for (const r of rows) if (r.parent) byParent.set(r.parent, [...(byParent.get(r.parent) ?? []), r]);
const later = <X>(make: () => X, signal?: { aborted: boolean }): Promise<X> =>
  new Promise((ok, no) => setTimeout(() => (signal?.aborted ? no(new Error('aborted')) : failing.checked ? no(new Error('503')) : ok(make())), 300 + Math.random() * 1200));
const lazy = lazyMode
  ? lazyChildren<Row>({ has: (r) => byParent.has(r.id) || /^s\d+p2$/.test(r.id), ...(lazyMode === 'client' && { load: (r: Row, { signal }: { signal: { aborted: boolean } }) => later(() => byParent.get(r.id) ?? [], signal) }) })
  : undefined;
const source = lazyMode === 'server'
  ? sourceRows<Row>({ fetch: () => later(() => ({ rows: rows.filter((r) => !r.parent) })), children: (req) => later(() => byParent.get(req.id) ?? [], req.signal) })
  : undefined;

const columns: ColumnDef<Row, any>[] = [
  { id: 'name', header: W.name, width: 220, filter: { kind: 'text', floating: true } },
  { id: 'kind', header: W.kind, width: 120, value: (r: Row) => W.kinds[r.kind], filter: { kind: 'text', floating: true } },
  { id: 'city', header: W.city, width: 140, filter: { kind: 'text', floating: true } },
  { id: 'age', header: W.age, type: 'number', width: 100, filter: { kind: 'number', floating: true } },
];
const base = ar ? AR : FR;
const messages = { ...base, text: { ...base.text, ...(ar ? AR_FILTERS : FR_FILTERS).text, ...(ar ? AR_TREE : FR_TREE).text } };
const events: GridEvent<Row>[] = [];
// The page's "Filter row" button (Phase 4 step 12): the floating row shown or hidden live, the pinned parents under it.
const filtering = filters({ floating: true, popup: true });
document.getElementById('later')!.insertAdjacentHTML('afterend', ` <button type="button" id="floating">${ar ? 'صف المرشحات' : 'Ligne de filtres'}</button>`);
filtering.floating.bind(document.getElementById('floating')!);
const grid = createGrid<Row>(document.getElementById('host')!, {
  ...(source ? { source, operations: { filter: 'client', quick: 'client', sort: 'client', page: 'off' } } : { rows: lazyMode ? rows.filter((r) => !r.parent) : top }),
  getRowId: (r) => r.id, columns, messages, locale, direction: 'auto',
  features: [tree<Row>({ ...treeOptions, sticky, ...(lazy && { lazy }) }), filtering],
  selection: { mode: 'multi', checkbox: true },
  onEvent: (e) => {
    if (e.type === 'problems') console.warn(e.problems);
    if (e.type === 'modelUpdated') status.textContent = W.shown(grid.kernel.rows.displayed.count);
    events.push(e);
  },
});
if (lazyMode !== 'server') grid.kernel.dispatch({ type: 'rows.expand', rows: [serviceKey(0)], expanded: true }, 'host');
status.textContent = W.shown(grid.kernel.rows.displayed.count);
document.getElementById('all')!.addEventListener('click', () => grid.kernel.dispatch({ type: 'rows.expandAll', expanded: true }, 'user'));
document.getElementById('none')!.addEventListener('click', () => grid.kernel.dispatch({ type: 'rows.expandAll', expanded: false }, 'user'));
// §16 item 92: a collapse by the application while the focus is in a child row.
document.getElementById('later')!.addEventListener('click', () => setTimeout(() => grid.kernel.dispatch({ type: 'rows.expand', rows: [serviceKey(2)], expanded: false }, 'api'), 5000));
(window as unknown as { t: unknown }).t = { grid, events };
