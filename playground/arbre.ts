// The « Bilan » page (1.1.0 step 15, docs/behaviors/spans.md « In a tree », row-gaps.md, a11y-protocol §22): the owner's
// « arbre » screen described from what it shows — three tables in one tree, each led by a row always open
// (`tree({ fixedOpen })`), sections under them (chevrons), lines under the sections; a « Rubrique » column merging
// consecutive sibling lines of one value; a gap before each table but the first (`rowGaps({ before: roots })`).
// `?locale=ar-DZ`: Arabic, right to left; `?rows=10000`: ≈ 10 000 rows (virtual scroll), `?rows=1000000` a million once
// « Tout déplier » (scaled scrolling); `?gaps=0`: no gap; `?theme=dark`.
import { createGrid } from '@dzgrid/dom';
import { tree } from '@dzgrid/dom/tree';
import { spans } from '@dzgrid/dom/spans';
import { rowGaps, roots } from '@dzgrid/dom/row-gaps';
import { FR } from '@dzgrid/dom/locales/fr';
import { AR } from '@dzgrid/dom/locales/ar';
import { FR_TREE } from '@dzgrid/dom/locales/fr-tree';
import { AR_TREE } from '@dzgrid/dom/locales/ar-tree';
import { dataKey, type ColumnDef, type GridEvent } from '@dzgrid/core';
import '../packages/theme/dzgrid.css';

const form = document.getElementById('controls') as HTMLFormElement;
const status = document.getElementById('status')!;
const q = new URLSearchParams(location.search);
const ar = q.get('locale') === 'ar-DZ';
const locale = ar ? 'ar-DZ' : 'fr-FR';
const asked = Number(q.get('rows') ?? 300);
const size = asked >= 1_000_000 ? 1_000_000 : asked >= 10_000 ? 10_000 : 300;
const big = size > 300;
const gaps = q.get('gaps') !== '0';
const field = (name: string) => form.elements.namedItem(name) as HTMLSelectElement;
field('locale').value = locale;
field('theme').value = q.get('theme') ?? '';
field('rows').value = String(size);
field('gaps').value = gaps ? '1' : '0';
if (q.get('theme')) document.documentElement.dataset['theme'] = q.get('theme')!;
document.documentElement.lang = locale;
document.documentElement.dir = ar ? 'rtl' : 'ltr';
form.addEventListener('change', () => {
  location.search = new URLSearchParams({ locale: field('locale').value, theme: field('theme').value, rows: field('rows').value, gaps: field('gaps').value }).toString();
});

const W = ar
  ? { title: 'الميزانية', label: 'البيان', group: 'الباب', amount: 'المبلغ', tables: ['الأصول', 'الخصوم', 'النتيجة'], section: 'قسم', line: 'سطر', groups: ['أ', 'ب', 'ج', 'د'], all: 'توسيع الكل', none: 'طي الكل', shown: (n: number) => `${n} صف معروض` }
  : { title: 'Bilan', label: 'Libellé', group: 'Rubrique', amount: 'Montant', tables: ['Actif', 'Passif', 'Résultat'], section: 'Section', line: 'Ligne', groups: ['A', 'B', 'C', 'D'], all: 'Tout déplier', none: 'Tout replier', shown: (n: number) => `${n} lignes affichées` };
document.getElementById('title')!.textContent = W.title;
document.getElementById('all')!.textContent = W.all;
document.getElementById('none')!.textContent = W.none;

type Row = { id: string; parent: string | null; label: string; group: string; amount: number | null; table?: boolean };
const rows: Row[] = [];
const sections = size === 1_000_000 ? 333 : big ? 33 : 4;
const lines = size === 1_000_000 ? 1000 : big ? 100 : 22;
W.tables.forEach((name, t) => {
  rows.push({ id: `t${t}`, parent: null, label: name, group: name, amount: null, table: true });
  for (let s = 0; s < sections; s++) {
    const sid = `t${t}s${s}`;
    // Sections in pairs of one « Rubrique »: opening one inside a pair splits the merge, closing it joins it again.
    rows.push({ id: sid, parent: `t${t}`, label: `${W.section} ${t + 1}.${s + 1}`, group: `${W.group} ${W.groups[Math.floor(s / 2) % 4]}`, amount: null });
    // Lines in runs of one « Rubrique »: 6, then 4, then the rest (the first run long enough to travel under the copies).
    for (let l = 0; l < lines; l++) rows.push({ id: `${sid}l${l}`, parent: sid, label: `${W.line} ${l + 1}`, group: `${W.group} ${W.groups[l < 6 ? 0 : l < 10 ? 1 : 2 + (Math.floor(l / 12) % 2)]}`, amount: ((t + 1) * 1000 + s * 37 + l * 11) % 9000 });
  }
});

const columns: ColumnDef<Row, any>[] = [
  { id: 'label', header: W.label, width: 240 },
  { id: 'group', header: W.group, width: 160, merge: true },
  { id: 'amount', header: W.amount, type: 'number', width: 140 },
];
const base = ar ? AR : FR;
const messages = { ...base, text: { ...base.text, ...(ar ? AR_TREE : FR_TREE).text } };
const events: GridEvent<Row>[] = [];
const isTable = (r: Row) => !!r.table;
const grid = createGrid<Row>(document.getElementById('host')!, {
  rows, getRowId: (r) => r.id, columns, messages, locale, direction: 'auto',
  rowClass: ({ row }) => (isTable(row) ? 'is-table' : null),
  features: [tree<Row>({ parentId: (r) => r.parent, fixedOpen: isTable }), spans(), ...(gaps ? [rowGaps<Row>({ before: roots })] : [])],
  selection: { mode: 'multi', click: true },
  onEvent: (e) => {
    if (e.type === 'problems') console.warn(e.problems);
    if (e.type === 'modelUpdated') status.textContent = W.shown(grid.kernel.rows.displayed.count);
    events.push(e);
  },
});
// The first section of each table open at first.
grid.kernel.dispatch({ type: 'rows.expand', rows: [0, 1, 2].map((t) => dataKey(`t${t}s0`)!), expanded: true }, 'host');
status.textContent = W.shown(grid.kernel.rows.displayed.count);
document.getElementById('all')!.addEventListener('click', () => grid.kernel.dispatch({ type: 'rows.expandAll', expanded: true }, 'user'));
document.getElementById('none')!.addEventListener('click', () => grid.kernel.dispatch({ type: 'rows.expandAll', expanded: false }, 'user'));
(window as unknown as { t: unknown }).t = { grid, events, key: (id: string) => dataKey(id)! };
