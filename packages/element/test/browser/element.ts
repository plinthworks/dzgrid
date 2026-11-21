// `<dz-grid>` in a plain page (Phase 11 L7, scripts/browser-element.mjs): a tree, a pivot and a form (batch editing,
// a cell part, 1.15.0), each a Web Component given its settings as properties and attributes. Query: locale (fr-FR, ar-DZ), theme. `window.t` holds the elements
// and the dzg-* events heard.
import { defineDzGrid, type DzGridElement } from '/packages/element/src/index.ts';
import { tree } from '/packages/dom/src/tree.ts';
import { grouping } from '/packages/dom/src/grouping.ts';
import { pivot } from '/packages/dom/src/pivot.ts';
import { groups } from '/packages/dom/src/groups.ts';
import { spans } from '/packages/dom/src/spans.ts';
import { FR } from '/packages/dom/src/locales/fr.ts';
import { AR } from '/packages/dom/src/locales/ar.ts';
import { FR_TREE } from '/packages/dom/src/locales/fr-tree.ts';
import { AR_TREE } from '/packages/dom/src/locales/ar-tree.ts';
import { FR_GROUP } from '/packages/dom/src/locales/fr-group.ts';
import { AR_GROUP } from '/packages/dom/src/locales/ar-group.ts';
import { FR_PIVOT } from '/packages/dom/src/locales/fr-pivot.ts';
import { AR_PIVOT } from '/packages/dom/src/locales/ar-pivot.ts';
import { FR_EDIT } from '/packages/dom/src/locales/fr-edit.ts';
import { AR_EDIT } from '/packages/dom/src/locales/ar-edit.ts';
import { FR_EDITORS } from '/packages/dom/src/locales/fr-editors.ts';
import { AR_EDITORS } from '/packages/dom/src/locales/ar-editors.ts';
import { FR_FORMS } from '/packages/dom/src/locales/fr-forms.ts';
import { AR_FORMS } from '/packages/dom/src/locales/ar-forms.ts';
import { edit } from '/packages/dom/src/edit.ts';
import { editors } from '/packages/dom/src/editors-base.ts';
import { editBatch } from '/packages/dom/src/edit-batch.ts';
import { definePart } from '/packages/dom/src/index.ts';

defineDzGrid();
const q = new URLSearchParams(location.search);
const locale = q.get('locale') ?? 'fr-FR';
const ar = locale.startsWith('ar');
document.documentElement.lang = locale;
document.documentElement.dir = ar ? 'rtl' : 'ltr';
if (q.get('theme')) document.documentElement.dataset['theme'] = q.get('theme')!;
const heard: string[] = [];
for (const type of ['dzg-ready', 'dzg-sort-changed', 'dzg-row-expanded', 'dzg-problems', 'dzg-pending-change']) document.addEventListener(type, (e) => heard.push(`${(e.target as Element).id}:${type}`));

const base = ar ? AR : FR;
const pick = <T extends { text: object }>(fr: T, a: T) => (ar ? a : fr).text;
document.getElementById('tree-title')!.textContent = ar ? 'المصالح' : 'Services';
document.getElementById('pivot-title')!.textContent = ar ? 'المبيعات' : 'Ventes';
document.getElementById('form-title')!.textContent = ar ? 'المخزون' : 'Stock';

// The tree: services, their patients.
type Row = { id: string; parent: string | null; name: string; age: number | null };
const rows: Row[] = [];
for (let s = 0; s < 20; s++) {
  rows.push({ id: `s${s}`, parent: null, name: `${ar ? 'مصلحة' : 'Service'} ${s}`, age: null });
  for (let p = 1; p <= 30; p++) rows.push({ id: `s${s}p${p}`, parent: `s${s}`, name: `${ar ? 'مريض' : 'Patient'} ${p}`, age: ((s * 7 + p * 13) % 90) + 1 });
}
const t = document.getElementById('tree') as DzGridElement<Row>;
t.setAttribute('label', ar ? 'المصالح' : 'Services');
t.features = [tree<Row>({ parentId: (r) => r.parent })];
t.columns = [{ id: 'name', header: ar ? 'الاسم' : 'Nom', width: 240 }, { id: 'age', header: ar ? 'العمر' : 'Âge', type: 'number', width: 120 }];
t.getRowId = (r) => r.id;
t.rows = rows;
t.setAttribute('locale', locale);
t.messages = { ...base, text: { ...base.text, ...pick(FR_TREE, AR_TREE) } };

// The pivot: rows by region, columns by month, a sum.
type Sale = { id: string; region: string; month: string; amount: number };
const regions = ar ? ['الشمال', 'الجنوب', 'الشرق'] : ['Nord', 'Sud', 'Est'];
const sales: Sale[] = Array.from({ length: 300 }, (_, i) => ({ id: `v${i}`, region: regions[i % 3]!, month: String(1 + ((i * 7) % 4)).padStart(2, '0'), amount: 100 + ((i * 37) % 900) }));
const pv = pivot({ columns: ['month'], values: { amount: 'sum' } });
const g = grouping({ by: ['region'], pivot: pv });
const p = document.getElementById('pivot') as DzGridElement<Sale>;
p.setAttribute('locale', locale);
p.setAttribute('label', ar ? 'المبيعات' : 'Ventes');
p.features = [spans(), groups(), g];
p.columns = [
  { id: 'region', header: ar ? 'المنطقة' : 'Région', width: 140 },
  { id: 'month', header: ar ? 'الشهر' : 'Mois', width: 100 },
  { id: 'amount', header: ar ? 'المبلغ' : 'Montant', type: 'number', width: 130 },
];
p.getRowId = (s) => s.id;
p.rows = sales;
p.messages = { ...base, text: { ...base.text, ...pick(FR_GROUP, AR_GROUP), ...pick(FR_PIVOT, AR_PIVOT) } };

// The form: batch editing (its pending count told as `dzg-pending-change`), a cell drawn by a part (a function, no
// template), the header's height and the focus ring's rule from attributes.
type Item = { id: string; name: string; qty: number };
const items: Item[] = Array.from({ length: 12 }, (_, i) => ({ id: `i${i}`, name: `${ar ? 'عنصر' : 'Article'} ${i}`, qty: i * 3 }));
const batch = editBatch<Item>();
const saves: unknown[] = [];
const f = document.getElementById('form') as DzGridElement<Item>;
f.setAttribute('locale', locale);
f.setAttribute('label', ar ? 'المخزون' : 'Stock');
f.features = [edit<Item>({ save: (req) => void saves.push(req) }), editors(), batch];
f.parts = { badge: definePart('cell', { mount: (host, c) => { const b = document.createElement('b'); b.className = 'badge'; b.textContent = `#${String(c.value)}`; host.append(b); return { update: (n) => (b.textContent = `#${String(n.value)}`) }; } }) };
f.columns = [
  { id: 'id', header: 'ID', width: 90, ui: { cell: 'badge' } },
  { id: 'name', header: ar ? 'الاسم' : 'Nom', width: 200, editable: true },
  { id: 'qty', header: ar ? 'الكمية' : 'Quantité', type: 'number', width: 120, editable: true },
];
f.getRowId = (r) => r.id;
f.rows = items;
f.messages = { ...base, text: { ...base.text, ...pick(FR_EDIT, AR_EDIT), ...pick(FR_EDITORS, AR_EDITORS), ...pick(FR_FORMS, AR_FORMS) } };

(window as unknown as { t: unknown }).t = { tree: t, pivot: p, form: f, heard, saves, batch: () => batch.api(f.grid!) };
Promise.all([t.ready, p.ready, f.ready]).then(() => ((window as unknown as { ready: boolean }).ready = true));
