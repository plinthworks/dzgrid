// Motion in a real browser (step 26, docs/behaviors/motion.md), for scripts/browser.mjs `-- --only motion`.
// Query: rows (2 000), locale (fr-FR), dir, theme; motion=0 the motion:false twin (same feature, `settings.motion:
// false`); paging=1 pages of 20 with the footer; tall=1 a 9 600 px host (about 300 rows mounted). The grid has the
// filter popup (header buttons), a cellClass rule on "Montant" (negative values) and an onCell hook on it.
import { createGrid } from '/packages/dom/src/index.ts';
import { FR } from '/packages/dom/src/locales/fr.ts';
import { AR } from '/packages/dom/src/locales/ar.ts';
import { filters } from '/packages/dom/src/filters.ts';
import { pagination } from '/packages/dom/src/pagination.ts';
import { motion } from '/packages/dom/src/motion-gsap.ts';
import { gsap } from 'gsap';
import { dataKey } from '@dzgrid/core';

const q = new URLSearchParams(location.search);
const N = Number(q.get('rows') ?? 2000);
const locale = q.get('locale') ?? 'fr-FR';
const ar = locale.startsWith('ar');
const lang = ar ? 'ar' : 'fr';
const texts = await Promise.all([import(`/packages/dom/src/locales/${lang}-filters.ts`), import(`/packages/dom/src/locales/${lang}-pagination.ts`)]);
const base = ar ? AR : FR;
const messages = { ...base, text: Object.assign({}, base.text, ...texts.map((m) => (Object.values(m)[0] as { text: object }).text)) };
document.documentElement.lang = locale;
document.documentElement.dir = q.get('dir') ?? (ar ? 'rtl' : 'ltr');
if (q.get('theme')) document.documentElement.dataset['theme'] = q.get('theme')!;
const host = document.getElementById('host')!;
if (q.get('tall')) host.classList.add('tall');

type Row = { id: number; name: string; amount: number; city: string };
const cities = ar ? ['الجزائر', 'وهران', 'قسنطينة', 'عنابة'] : ['Alger', 'Oran', 'Constantine', 'Annaba'];
const rows: Row[] = Array.from({ length: N }, (_, i) => ({ id: i, name: ar ? `مريض ${i}` : `Patient ${i}`, amount: (((i * 7919) % 20000) - 5000) / 100, city: cities[i % 4]! }));
const hooked: number[] = [];
const m = motion({
  gsap,
  // The application's own touch: a "Montant" that changed lifts a little (the built-in flash kept).
  onCell: (el, c) => {
    if (c.column !== 'amount' || c.reduced) return;
    hooked.push(Number(c.value));
    gsap.fromTo(el, { scale: 1.04 }, { scale: 1, duration: 0.3, clearProps: 'transform' });
  },
});
const grid = createGrid<Row>(host, {
  rows, getRowId: (r) => r.id, messages, locale, motion: q.get('motion') !== '0',
  columns: [
    { id: 'name', header: ar ? 'الاسم' : 'Nom', width: 160 },
    { id: 'amount', header: ar ? 'المبلغ' : 'Montant', type: 'number', width: 130, ui: { cellClass: (c) => ((c.value as number) < 0 ? 'neg' : null) } },
    { id: 'city', header: ar ? 'المدينة' : 'Ville', width: 140, filter: { kind: 'text' } },
  ],
  features: [m, filters({ popup: true }), ...(q.get('paging') ? [pagination()] : [])],
  ...(q.get('paging') && { pagination: { pageSize: 20 } }),
  selection: { mode: 'multi', click: true },
});
// Layout reads, counted (the runner zeroes them): what a tween must never do.
const reads = { rect: 0, offset: 0 };
const rect = Element.prototype.getBoundingClientRect;
Element.prototype.getBoundingClientRect = function (this: Element) {
  reads.rect++;
  return rect.call(this);
};
const offset = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight')!;
Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, get(this: HTMLElement) { reads.offset++; return offset.get!.call(this); } });
(window as any).t = {
  grid, m, gsap, rows, reads, hooked,
  key: (id: number) => dataKey(id)!,
  running: () => gsap.globalTimeline.getChildren(true, true, false).filter((x) => x.progress() < 1).length,
  scrollTo: (logical: number) => (grid as any).scroll.scrollTo(logical),
};
await m.load();
(window as any).ready = true;
