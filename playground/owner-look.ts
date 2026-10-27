// The owner's look (docs/phase-6-steps/app-feedback.md 17–22): a products screen set up as the allergen-detector admin
// sets its own (set filters with pills, one month between two days, the header search boxes, French, Paris), with
// `filters({ apply: 'button', dateZone: false })` and the app's brand on the documented tokens. `?theme=dark|light`.
import { createGrid, definePart, type SlotContext } from '@dzgrid/dom';
import { filters } from '@dzgrid/dom/filters';
import { pagination } from '@dzgrid/dom/pagination';
import { slots } from '@dzgrid/dom/slots';
import { FR } from '@dzgrid/dom/locales/fr';
import { FR_FILTERS } from '@dzgrid/dom/locales/fr-filters';
import { FR_PAGINATION } from '@dzgrid/dom/locales/fr-pagination';
import type { ColumnDef } from '@dzgrid/core';
import '../packages/theme/dzgrid.css';

const q = new URLSearchParams(location.search);
if (q.get('theme')) document.documentElement.dataset['theme'] = q.get('theme')!;

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

const columns: ColumnDef<P, any>[] = [
  { id: 'barcode', header: 'Code-barres', width: 170, filter: { kind: 'text', ops: ['contains'] }, ui: { header: 'header.filterBox' } },
  { id: 'name', header: 'Nom du produit', width: 230, flex: 1, filter: { kind: 'text', ops: ['contains'] }, ui: { header: 'header.filterBox' } },
  { id: 'brand', header: 'Marque', width: 150, filter: { kind: 'set' } },
  { id: 'source', header: 'Source', width: 140, type: 'enum', enumOptions: SOURCES.map((v) => ({ value: v })), filter: { kind: 'set', optionPart: 'pill' } },
  { id: 'updatedAt', header: 'Mis à jour', width: 170, type: 'instant', filter: { kind: 'instant', ops: ['betweenDays'] } },
];

createGrid(document.getElementById('host')!, {
  rows, getRowId: (r: P) => r.id, columns, rowHeight: 52, locale: 'fr-FR', timeZone: 'Europe/Paris', label: 'Produits',
  messages: { locale: 'fr', text: { ...FR.text, ...FR_FILTERS.text, ...FR_PAGINATION.text } },
  parts: { pill },
  pagination: { pageSize: 20 },
  features: [filters({ apply: 'button', dateZone: false, dateCalendar: { months: 1, presets: [] } }), pagination(), slots()],
} as never);
