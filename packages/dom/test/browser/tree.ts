// The tree on the browser page (Phase 4 step 4, scripts/browser.mjs `treeChecks`): a tree given by parent
// ids — services, their patients, one patient in ten with three stays — with the tree feature, the floating
// filter row and a selection box column. Query: locale, dir, theme, rows (≈ 10 000 by default; 100000 for ≈ 100 000).
// Only « Service 0 » is open at first. `shape=path` (step 5): the services have no row, the rows give paths
// (`Service s / patient / stay`): the services are filler rows. `lazy=1` (step 7): the services only, their
// children loaded when one opens, by a loader the checks answer (`t.loads`: `ok()`, `no()`).
import { createGrid } from '/packages/dom/src/index.ts';
import { tree } from '/packages/dom/src/tree.ts';
import { lazyChildren } from '/packages/dom/src/tree-lazy.ts';
import { filters } from '/packages/dom/src/filters.ts';
import { FR } from '/packages/dom/src/locales/fr.ts';
import { AR } from '/packages/dom/src/locales/ar.ts';
import { FR_TREE } from '/packages/dom/src/locales/fr-tree.ts';
import { AR_TREE } from '/packages/dom/src/locales/ar-tree.ts';
import { FR_FILTERS } from '/packages/dom/src/locales/fr-filters.ts';
import { AR_FILTERS } from '/packages/dom/src/locales/ar-filters.ts';
import { dataKey, groupKey } from '@dzgrid/core';

const q = new URLSearchParams(location.search);
const locale = q.get('locale') ?? 'fr-FR';
const ar = locale.startsWith('ar');
const total = Number(q.get('rows') ?? 10_000);
document.documentElement.lang = locale;
document.documentElement.dir = q.get('dir') ?? (ar ? 'rtl' : 'ltr');
if (q.get('theme')) document.documentElement.dataset['theme'] = q.get('theme')!;

type Row = { id: string; parent: string | null; name: string; city: string; age: number | null; path?: string[] };
const paths = q.get('shape') === 'path';
const cities = ar ? ['الجزائر', 'وهران', 'قسنطينة'] : ['Alger', 'Oran', 'Constantine'];
const rows: Row[] = [];
const per = Math.round(total / 100 / 1.3);
for (let s = 0; s < 100; s++) {
  rows.push({ id: `s${s}`, parent: null, name: `Service ${s}`, city: cities[s % 3]!, age: null });
  for (let p = 1; p <= per; p++) {
    const id = `s${s}p${p}`;
    rows.push({ id, parent: `s${s}`, name: `Patient ${p}`, city: cities[(s + p) % 3]!, age: ((s * 7 + p * 13) % 90) + 1 });
    if (p % 10 === 3) for (let v = 1; v <= 3; v++) rows.push({ id: `${id}v${v}`, parent: id, name: `${ar ? 'إقامة' : 'Séjour'} ${v}`, city: cities[(s + p) % 3]!, age: null });
  }
}
const byId = new Map(rows.map((r) => [r.id, r]));
const pathOf = (r: Row): string[] => (r.parent ? [...pathOf(byId.get(r.parent)!), r.id] : [r.name]);
const given = paths ? rows.filter((r) => r.parent).map((r) => ({ ...r, path: pathOf(r) })) : rows;
const key = (id: string) => (paths && /^s\d+$/.test(id) ? groupKey([`Service ${id.slice(1)}`]) : dataKey(id)!);
const base = ar ? AR : FR;
const messages = { ...base, text: { ...base.text, ...(ar ? AR_FILTERS : FR_FILTERS).text, ...(ar ? AR_TREE : FR_TREE).text } };
const lazy = q.get('lazy') === '1';
const loads: { id: string; ok(): void; no(): void; signal: AbortSignal }[] = [];
const loader = lazyChildren<Row>({
  has: (r) => !r.parent,
  load: (r, { signal }) => new Promise((ok, no) => loads.push({ id: r.id, ok: () => ok(rows.filter((x) => x.parent === r.id)), no: () => no(new Error('503')), signal: signal as AbortSignal })),
});
const grid = createGrid<Row>(document.getElementById('host')!, {
  rows: lazy ? rows.filter((r) => !r.parent) : given, getRowId: (r) => r.id, messages, locale,
  columns: [
    { id: 'name', header: ar ? 'الاسم' : 'Nom', width: 220, filter: { kind: 'text', floating: true } },
    { id: 'city', header: ar ? 'المدينة' : 'Ville', width: 160, filter: { kind: 'text', floating: true } },
    { id: 'age', header: ar ? 'العمر' : 'Âge', type: 'number', width: 110, filter: { kind: 'number', floating: true } },
    ...Array.from({ length: 6 }, (_, k) => ({ id: `x${k}`, header: `C${k}`, width: 110, value: (r: Row) => (r.name.length * (k + 3)) % 97 })),
  ],
  features: [tree<Row>(paths ? { path: (r) => r.path! } : { parentId: (r) => r.parent, ...(lazy && { lazy: loader }) }), filters({ floating: true })],
  selection: { mode: 'multi', checkbox: true, click: true },
});
if (!lazy) grid.kernel.dispatch({ type: 'rows.expand', rows: [key('s0')], expanded: true }, 'host');
(window as any).t = { grid, rows, key, loads, scrollTo: (l: number) => (grid as any).scroll.scrollTo(l), logicalTop: () => (grid as any).scroll.logicalTop };
(window as any).ready = true;
