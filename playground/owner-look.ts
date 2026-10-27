// The owner's look (docs/phase-6-steps/app-feedback.md 17–22): a products screen set up as the allergen-detector admin
// sets its own (set filters with pills, one month between two days, the header search boxes, French, Paris), with
// `filters({ apply: 'button', dateZone: false })` and the app's brand on the documented tokens. `?theme=dark|light`;
// the second look (app-feedback 23–28): the selection boxes, the app's 15 px cell padding, `?preflight=1`, `?loading=1`;
// the third (app-feedback 30–36): the app's columns (pinned barcode, the actions pinned at the end), the comfort sheet,
// `filters({ busyFlash: 300 })`, the count in the app's words; `?wide=1` the grid as wide as the window.
import { createGrid, definePart, type SlotContext } from '@dzgrid/dom';
import { filters } from '@dzgrid/dom/filters';
import { pagination } from '@dzgrid/dom/pagination';
import { slots } from '@dzgrid/dom/slots';
import { FR } from '@dzgrid/dom/locales/fr';
import { FR_FILTERS } from '@dzgrid/dom/locales/fr-filters';
import { FR_PAGINATION } from '@dzgrid/dom/locales/fr-pagination';
import type { ColumnDef } from '@dzgrid/core';
import layered from '../packages/theme/dzgrid.css?inline';
import unlayered from '../packages/theme/dzgrid.unlayered.css?inline';
import comfort from '../packages/theme/dzgrid.comfort.css?inline';
import comfortUnlayered from '../packages/theme/dzgrid.comfort.unlayered.css?inline';

const q = new URLSearchParams(location.search);
// `?preflight=1`: the app's way, Tailwind 3's reset (its parts that touch the grid) with the theme unlayered under it.
const reset = '*,::before,::after{box-sizing:border-box;border-width:0;border-style:solid}p,h1{margin:0}button,input,select{font:inherit;color:inherit;margin:0;padding:0;background:transparent}';
for (const css of q.get('preflight') ? [reset, unlayered, comfortUnlayered] : [layered, comfort]) document.head.append(Object.assign(document.createElement('style'), { textContent: css }));
if (q.get('theme')) document.documentElement.dataset['theme'] = q.get('theme')!;
if (q.get('wide')) document.body.classList.add('wide');

type P = { id: string; barcode: string; name: string; brand: string; source: string; updatedAt: string };
const SOURCES = ['OFF', 'MANUAL', 'IMPORT'];
const COLOURS: Record<string, string> = { OFF: 'teal', MANUAL: 'pink', IMPORT: 'gray' };
const BRANDS = ['Danone', 'Nestlé', 'Lactalis', 'Bonduelle', 'Cevital', 'Soummam', 'Ifri', 'Hamoud'];
const rows: P[] = Array.from({ length: 1604 }, (_, i) => ({
  id: `p${i}`, barcode: String(3017620422003 + i * 7919), name: `Produit ${i}`, brand: BRANDS[i % BRANDS.length]!,
  source: SOURCES[i % 3]!, updatedAt: new Date(Date.UTC(2026, 9, 1 + (i % 27), 8 + (i % 10))).toISOString(),
}));

const pill = definePart('filterOption', {
  mount(host, c) {
    const s = document.createElement('span');
    host.append(s);
    const draw = (n: SlotContext['filterOption']): void => {
      s.className = `pill pill-${n.blank ? 'gray' : COLOURS[n.value!] ?? 'gray'}`;
      s.textContent = n.label;
    };
    draw(c);
    return { update: draw };
  },
});

/** The app's four actions: see, edit, fetch, delete (buttons that do nothing here). */
const ICON = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="8"/></svg>';
const actions = definePart('cell', {
  mount(host) {
    const s = document.createElement('span');
    s.className = 'acts';
    for (const t of ['Prévisualiser', 'Modifier', 'Enrichir', 'Supprimer']) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'act';
      b.title = t;
      b.setAttribute('aria-label', t);
      b.insertAdjacentHTML('beforeend', ICON);
      s.append(b);
    }
    host.append(s);
    return {};
  },
});

// The app's enriched columns, widths as it sets them (products-list-dz).
const columns: ColumnDef<P, any>[] = [
  { id: 'barcode', header: 'Code-barres', width: 152, pinned: 'start', filter: { kind: 'text', ops: ['contains'] }, ui: { header: 'header.filterBox' } },
  { id: 'name', header: 'Nom du produit', width: 210, flex: 2, minWidth: 220, filter: { kind: 'text', ops: ['contains'] }, ui: { header: 'header.filterBox' } },
  { id: 'brand', header: 'Marque', width: 150, flex: 1, minWidth: 140, filter: { kind: 'set' } },
  { id: 'type', header: 'Type', width: 118, value: () => 'Alimentaire' },
  { id: 'statut', header: 'Statut', width: 100, value: () => 'Complet' },
  { id: 'source', header: 'Source', width: 125, type: 'enum', enumOptions: SOURCES.map((v) => ({ value: v })), filter: { kind: 'set', optionPart: 'pill' } },
  { id: 'ingredients', header: 'Ingrédients', width: 115, value: () => 'Présents' },
  { id: 'validated', header: 'Validé', width: 104, value: () => 'Oui' },
  { id: 'updatedAt', header: 'Mis à jour', width: 140, type: 'instant', instantFormat: { date: true, time: false }, filter: { kind: 'instant', ops: ['betweenDays'] } },
  { id: 'actions', header: '', width: 148, pinned: 'end', sortable: false, filter: false, resizable: false, movable: false, ui: { cell: 'actions' } },
];

// `?old=1`: the app's widths before the third look (actions 118, « Marque » fixed), to see what overflowed.
if (q.get('old')) {
  Object.assign(columns[1]!, { flex: 1, minWidth: 170 });
  Object.assign(columns[2]!, { flex: undefined, minWidth: undefined });
  Object.assign(columns[9]!, { width: 118 });
}

createGrid(document.getElementById('host')!, {
  rows, getRowId: (r: P) => r.id, columns, rowHeight: 52,
  // `?loading=1`: the grid's own loading state, as the app binds it while it loads (app-feedback 25).
  overlay: q.get('loading') ? 'loading' : null,
  locale: 'fr-FR', timeZone: 'Europe/Paris', label: 'Produits',
  messages: { locale: 'fr', text: { ...FR.text, ...FR_FILTERS.text, ...FR_PAGINATION.text, 'count.filtered': '{filtered} produits sur {total}' } },
  parts: { pill, actions },
  pagination: { pageSize: 20 },
  // As the app: rows ticked by a box, with the select-all box in the header.
  selection: { mode: 'multi', checkbox: true },
  features: [filters({ apply: 'button', dateZone: false, dateCalendar: { months: 1, presets: [] }, busyFlash: 300 }), pagination(), slots()],
} as never);
