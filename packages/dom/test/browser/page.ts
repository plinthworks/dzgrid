// The real grid, from the sources, for scripts/browser.mjs. Query: rows, locale, dir, theme, select, box.
import { createGrid } from '/packages/dom/src/index.ts';
import { EN } from '/packages/dom/src/locales/en.ts';
import { FR } from '/packages/dom/src/locales/fr.ts';
import { AR } from '/packages/dom/src/locales/ar.ts';
import { dataKey } from '@dzgrid/core';

const q = new URLSearchParams(location.search);
const N = Number(q.get('rows') ?? 100_000);
const locale = q.get('locale') ?? 'fr-FR';
const messages = locale.startsWith('ar') ? AR : locale.startsWith('fr') ? FR : EN;
document.documentElement.lang = locale;
document.documentElement.dir = q.get('dir') ?? (locale.startsWith('ar') ? 'rtl' : 'ltr');
if (q.get('theme')) document.documentElement.dataset['theme'] = q.get('theme')!;

type Row = { id: number; name: string; city: string; amount: number; day: string };
const CITIES_FR = ['Alger', 'Oran', 'Constantine', 'Annaba', 'Blida', 'Sétif'];
const CITIES_AR = ['الجزائر', 'وهران', 'قسنطينة', 'عنابة', 'البليدة', 'سطيف'];
const cities = locale.startsWith('ar') ? CITIES_AR : CITIES_FR;
// Rows are made from their index, small: a million of them must fit.
const rows: Row[] = Array.from({ length: N }, (_, i) => ({
  id: i,
  name: locale.startsWith('ar') ? `مريض ${i}` : `Patient ${i}`,
  city: cities[i % cities.length]!,
  amount: ((i * 7919) % 100000) / 100,
  day: `2026-${String((i % 12) + 1).padStart(2, '0')}-${String((i % 28) + 1).padStart(2, '0')}`,
}));

const columns = [
  { id: 'name', header: messages === AR ? 'الاسم' : 'Nom', pinned: 'start' as const, width: 140 },
  { id: 'city', header: messages === AR ? 'المدينة' : 'Ville', width: 130, headerTooltip: messages === AR ? 'مدينة الإقامة' : 'Ville de résidence' },
  { id: 'amount', header: messages === AR ? 'المبلغ' : 'Montant', type: 'number' as const, width: 120 },
  { id: 'day', header: messages === AR ? 'اليوم' : 'Jour', type: 'day' as const, width: 120 },
  ...Array.from({ length: 16 }, (_, k) => ({ id: `x${k}`, header: `C${k}`, width: 110, value: (r: Row) => (r.id * (k + 3)) % 997 })),
  { id: 'ref', header: 'Réf', pinned: 'end' as const, width: 90, value: (r: Row) => `R-${r.id}` },
];

const mode = (q.get('select') ?? 'multi') as 'none' | 'single' | 'multi';
const events: string[] = [];
for (const type of ['blur', 'focusout', 'focusin']) document.addEventListener(type, (e) => events.push(`${type} ${(e.target as HTMLElement).dataset?.['col'] ?? (e.target as HTMLElement).id ?? ''}`), true);

const host = document.getElementById('host')!;
const grid = createGrid<Row>(host, {
  rows, getRowId: (r) => r.id, columns, messages, locale,
  selection: { mode, checkbox: q.get('box') === '1', click: true },
});

(window as any).t = {
  grid, N, events, dataKey,
  key: (id: number) => dataKey(id)!,
  indexOf: (el: Element) => {
    const row = el.closest('.dzg-row');
    if (!row) return -1;
    return Number(row.getAttribute('aria-rowindex')) - 2;
  },
  scrollTo: (logical: number) => (grid as any).scroll.scrollTo(logical),
  logicalTop: () => (grid as any).scroll.logicalTop,
  mapper: () => (grid as any).scroll.mapper,
};
(window as any).ready = true;
