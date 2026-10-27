// The owner's fourth look (docs/phase-6-steps/app-feedback.md 39): « a horizontal scroll bar still shows » at full width,
// 100 rows a page, the vertical bar present, the actions pinned at the end. The app's columns, the selection boxes, and
// the view narrowed by a vertical bar (the comfort sheet's thin 11 px, the system's 15 px) after the rows arrive: the
// flexible columns fill what is left to the pixel, never more (a scroll width above the client width is a scroll bar).
import { describe, it, expect, afterEach } from 'vitest';
import { pagination } from '../src/pagination.js';
import { FR } from '../src/locales/fr.js';
import { FR_FILTERS } from '../src/locales/fr-filters.js';
import { FR_PAGINATION } from '../src/locales/fr-pagination.js';
import { cleanup, make, type R } from './support-filters.js';

const messages = { locale: 'fr', text: { ...FR.text, ...FR_FILTERS.text, ...FR_PAGINATION.text } };

afterEach(cleanup);

const APP = [
  { id: 'barcode', header: 'Code-barres', width: 152, pinned: 'start' },
  { id: 'name', header: 'Nom du produit', width: 210, flex: 2, minWidth: 220 },
  { id: 'brand', header: 'Marque', width: 150, flex: 1, minWidth: 140 },
  { id: 't', header: 'Type', width: 118, value: () => 'x' },
  { id: 's', header: 'Statut', width: 100, value: () => 'x' },
  { id: 'src', header: 'Source', width: 125, value: () => 'x' },
  { id: 'i', header: 'Ingrédients', width: 115, value: () => 'x' },
  { id: 'v', header: 'Validé', width: 104, value: () => 'x' },
  { id: 'u', header: 'Mis à jour', width: 140, value: () => 'x' },
  { id: 'actions', header: '', width: 148, pinned: 'end' },
];
const rows: R[] = Array.from({ length: 300 }, (_, i) => ({ id: `r${i}`, name: `P ${i}`, n: i }) as R);

describe('no horizontal scroll once a vertical bar takes its gutter (app-feedback 39)', () => {
  for (const [label, bar] of [['the thin bar (11 px)', 11], ['the system bar (15 px)', 15], ['an odd width (17 px)', 17]] as const) {
    it(`${label}: the rows' width follows the narrower view, the columns and the boxes add up to it`, () => {
      const t = make({ inline: 1886, columns: APP as never, rows, features: [pagination()], settings: { messages, selection: { mode: 'multi', checkbox: true }, pagination: { pageSize: 20 } } as never });
      const width = () => t.host.querySelector<HTMLElement>('.dzg-body')!.style.getPropertyValue('inline-size');
      expect(width()).toBe('1886px');
      // 100 a page: the bar appears, the view loses its gutter.
      t.box.inline = 1886 - bar;
      t.g.update({ pagination: { pageSize: 100 } } as never);
      expect(width()).toBe(`${1886 - bar}px`);
      const sum = t.g.kernel.columns.layout.totalWidth + 40;
      expect(sum).toBe(1886 - bar);
      // The bar goes again (20 a page): the columns grow back.
      t.box.inline = 1886;
      t.g.update({ pagination: { pageSize: 20 } } as never);
      expect(width()).toBe('1886px');
    });
  }
});
