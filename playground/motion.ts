// The « Animations » page (step 26, docs/behaviors/motion.md): `@dzgrid/dom/motion-gsap` over a small
// market-like table — sort, filters (row and popup), pages, a live ticker whose changes flash, a
// `ui.cellClass` rule ("Variation") and an application `onCell` hook ("Cours"). `?lang=ar` right to left.
// « Arbre » (Phase 4 step 6): a small tree on the same `motion()`: rows glide as a parent opens or closes.
import { createGrid } from '@dzgrid/dom';
import { filters } from '@dzgrid/dom/filters';
import { pagination } from '@dzgrid/dom/pagination';
import { tree } from '@dzgrid/dom/tree';
import { FR_TREE } from '@dzgrid/dom/locales/fr-tree';
import { AR_TREE } from '@dzgrid/dom/locales/ar-tree';
import { motion } from '@dzgrid/dom/motion-gsap';
import { FR } from '@dzgrid/dom/locales/fr';
import { AR } from '@dzgrid/dom/locales/ar';
import { FR_FILTERS } from '@dzgrid/dom/locales/fr-filters';
import { AR_FILTERS } from '@dzgrid/dom/locales/ar-filters';
import { FR_PAGINATION } from '@dzgrid/dom/locales/fr-pagination';
import { AR_PAGINATION } from '@dzgrid/dom/locales/ar-pagination';
import type { ClientModel, ColumnDef } from '@dzgrid/core';
import { gsap } from 'gsap';
import '../packages/theme/dzgrid.css';

const form = document.getElementById('controls') as HTMLFormElement;
const status = document.getElementById('status')!;
const button = document.getElementById('ticker') as HTMLButtonElement;
const params = new URLSearchParams(location.search);
const lang = params.get('lang') === 'ar' ? 'ar' : 'fr';
(form.elements.namedItem('lang') as HTMLSelectElement).value = lang;
(form.elements.namedItem('theme') as HTMLSelectElement).value = params.get('theme') ?? '';
if (params.get('theme')) document.documentElement.dataset['theme'] = params.get('theme')!;
document.documentElement.lang = lang;
document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
form.addEventListener('change', (e) => {
  const name = (e.target as HTMLInputElement).name;
  if (name === 'motion') return [grid, sectors].forEach((g) => g.update({ motion: (e.target as HTMLInputElement).checked }));
  const q = new URLSearchParams({ lang: (form.elements.namedItem('lang') as HTMLSelectElement).value, theme: (form.elements.namedItem('theme') as HTMLSelectElement).value });
  location.search = q.toString();
});

const W = lang === 'ar'
  ? { name: 'الشركة', sector: 'القطاع', price: 'السعر', change: 'التغير', volume: 'الحجم', sectors: ['الصحة', 'الطاقة', 'النقل', 'الغذاء', 'البنوك'], co: 'شركة', start: 'تشغيل البث', stop: 'إيقاف البث', ticks: (n: number) => `${n} تغيير` }
  : { name: 'Société', sector: 'Secteur', price: 'Cours', change: 'Variation', volume: 'Volume', sectors: ['Santé', 'Énergie', 'Transport', 'Alimentation', 'Banque'], co: 'Société', start: 'Démarrer le flux', stop: 'Arrêter le flux', ticks: (n: number) => `${n} changements` };
button.textContent = W.start;

type Row = { id: number; name: string; sector: string; price: number; change: number; volume: number };
const rows: Row[] = Array.from({ length: 400 }, (_, i) => ({
  id: i, name: `${W.co} ${String.fromCharCode(65 + (i % 26))}${Math.floor(i / 26) + 1}`, sector: W.sectors[i % 5]!,
  price: Math.round((20 + ((i * 7919) % 18000) / 100) * 100) / 100, change: 0, volume: (i * 131) % 5000,
}));
const columns: ColumnDef<Row, any>[] = [
  { id: 'name', header: W.name, width: 160 },
  { id: 'sector', header: W.sector, width: 140, type: 'text' },
  { id: 'price', header: W.price, type: 'number', width: 120, numberFormat: { minimumFractionDigits: 2, maximumFractionDigits: 2 } },
  // The application's classes from the data (`ui.cellClass`): a fall, a rise.
  { id: 'change', header: W.change, type: 'number', width: 120, numberFormat: { minimumFractionDigits: 2, maximumFractionDigits: 2, signDisplay: 'exceptZero' } as never, ui: { cellClass: (c) => ((c.value as number) < 0 ? 'baisse' : (c.value as number) > 0 ? 'hausse' : null) } },
  { id: 'volume', header: W.volume, type: 'number', width: 110 },
];
const base = lang === 'ar' ? AR : FR;
const messages = { ...base, text: { ...base.text, ...(lang === 'ar' ? AR_FILTERS : FR_FILTERS).text, ...(lang === 'ar' ? AR_PAGINATION : FR_PAGINATION).text } };
const moving = motion({
  gsap,
  // The application's own touch, after the grid's guards: a changed price lifts a little; the built-in flash stays.
  onCell: (el, c) => {
    if (c.column === 'price' && !c.reduced) gsap.fromTo(el, { scale: 1.05 }, { scale: 1, duration: 0.35, ease: 'power2.out', clearProps: 'transform' });
  },
});
const grid = createGrid<Row>(document.getElementById('host')!, {
  rows, getRowId: (r) => r.id, columns, messages, locale: lang === 'ar' ? 'ar-DZ' : 'fr-FR',
  features: [moving, filters({ floating: true, popup: true }), pagination()],
  pagination: { pageSize: 25, pageSizes: [25, 50, 100] },
  selection: { mode: 'multi', checkbox: true },
});

// The live ticker: every 700 ms a few prices of the page move (a transaction: what the flash follows).
let timer = 0;
let ticks = 0;
const model = grid.kernel.rows as ClientModel<Row>;
const tick = (): void => {
  const d = model.displayed;
  const update: Row[] = [];
  for (let n = 0; n < 3 && d.count; n++) {
    const r = model.row(d.keyAt(d.index(Math.floor(Math.random() * Math.min(d.count, 25)))!))?.data;
    if (!r) continue;
    const change = Math.round((Math.random() - 0.5) * 400) / 100;
    update.push({ ...r, price: Math.max(1, Math.round((r.price + change) * 100) / 100), change, volume: r.volume + Math.floor(Math.random() * 40) });
  }
  model.applyTransaction({ update });
  ticks += update.length;
  status.textContent = W.ticks(ticks);
};
button.addEventListener('click', () => {
  if (timer) (clearInterval(timer), (timer = 0));
  else timer = window.setInterval(tick, 700);
  button.textContent = timer ? W.stop : W.start;
});

// « Arbre »: the sectors, their companies, a few desks under some companies; the same motion() serves both grids.
type Node = { id: string; parent: string | null; name: string; volume: number };
const nodes: Node[] = [];
W.sectors.forEach((sector, s) => {
  nodes.push({ id: `s${s}`, parent: null, name: sector, volume: 0 });
  rows.filter((r) => r.id % 5 === s).slice(0, 8).forEach((r, k) => {
    nodes.push({ id: `c${r.id}`, parent: `s${s}`, name: r.name, volume: r.volume });
    if (k % 3 === 0) for (let d = 1; d <= 3; d++) nodes.push({ id: `c${r.id}d${d}`, parent: `c${r.id}`, name: `${lang === 'ar' ? 'مكتب' : 'Bureau'} ${d}`, volume: (r.volume * d) % 997 });
  });
});
if (lang === 'ar') (document.getElementById('tree-title')!.textContent = 'شجرة'), (document.getElementById('tree-note')!.textContent = 'افتح صفا (السهم أو ← في عمود الاسم): تنزلق الصفوف تحته وتظهر الفروع تدريجيا؛ أغلقه (→): تصعد الصفوف تحته.');
const sectors = createGrid<Node>(document.getElementById('tree')!, {
  rows: nodes, getRowId: (r) => r.id, locale: lang === 'ar' ? 'ar-DZ' : 'fr-FR',
  messages: { ...base, text: { ...base.text, ...(lang === 'ar' ? AR_TREE : FR_TREE).text } },
  columns: [{ id: 'name', header: W.name, width: 240 }, { id: 'volume', header: W.volume, type: 'number', width: 120 }],
  features: [moving, tree<Node>({ parentId: (r) => r.parent })],
});
