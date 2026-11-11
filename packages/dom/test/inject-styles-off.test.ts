// `injectStyles: false` (settings/inject-styles): no feature writes a <style>, and every feature with layout of its own
// exports it, so a page under a strict CSP can load it. Expectations by hand.
import { describe, it, expect, afterEach } from 'vitest';
import { createGrid, type GridInstance } from '../src/grid.js';
import type { GridFeature } from '../src/features.js';
import { tree } from '../src/tree.js';
import { grouping } from '../src/grouping.js';
import { detail } from '../src/detail.js';
import { edit } from '../src/edit.js';
import { editors } from '../src/editors.js';
import { autoHeight } from '../src/auto-height.js';
import { groupZone } from '../src/group-zone.js';
import { pivotBar } from '../src/pivot-bar.js';
import { pivot } from '../src/pivot.js';
import { definePart } from '../src/part.js';
import { EN } from '../src/locales/en.js';
import { EN_TREE } from '../src/locales/en-tree.js';
import { EN_DETAIL } from '../src/locales/en-detail.js';
import { EN_EDIT } from '../src/locales/en-edit.js';
import { EN_EDITORS } from '../src/locales/en-editors.js';
import { EN_GROUP } from '../src/locales/en-group.js';
import { EN_PIVOT } from '../src/locales/en-pivot.js';
import { EN_PIVOT_BAR } from '../src/locales/en-pivot-bar.js';
import { EN_COLUMN_MENU } from '../src/locales/en-column-menu.js';

type R = { id: string; parent: string | null; region: string; month: string; amount: number };
const ROWS: R[] = [{ id: 'a', parent: null, region: 'Nord', month: 'Jan', amount: 3 }, { id: 'b', parent: 'a', region: 'Sud', month: 'Feb', amount: 4 }];
const TEXT = { ...EN.text, ...EN_TREE.text, ...EN_DETAIL.text, ...EN_EDIT.text, ...EN_EDITORS.text, ...EN_GROUP.text, ...EN_PIVOT.text, ...EN_PIVOT_BAR.text, ...EN_COLUMN_MENU.text };
const grids: GridInstance<R>[] = [];
afterEach(() => { for (const g of grids.splice(0)) g.destroy(); document.head.innerHTML = ''; document.body.innerHTML = ''; });

const make = (features: GridFeature[], injectStyles?: boolean): void => {
  const host = document.body.appendChild(document.createElement('div'));
  grids.push(createGrid<R>(host, {
    rows: ROWS, getRowId: (r) => r.id, messages: { ...EN, text: TEXT }, features, ...(injectStyles === false && { injectStyles }),
    columns: [{ id: 'region', header: 'Region', wrap: true }, { id: 'month', header: 'Month' }, { id: 'amount', header: 'Amount', type: 'number' }],
  }, { sync: true }));
};
const part = definePart('detail', { mount: (h) => ((h.textContent = 'x'), {}) });
const CASES: [string, () => GridFeature[], string][] = [
  ['tree', () => [tree<R>({ parentId: (r) => r.parent })], 'tree'],
  ['grouping', () => [grouping({ by: ['region'] })], 'tree'],
  ['detail', () => [detail<R>({ part })], 'detail'],
  ['editors', () => [edit(), editors()], 'editors'],
  ['autoHeight', () => [autoHeight()], 'wrap'],
  ['groupZone', () => { const gr = grouping({ by: [] }); return [gr, groupZone({ use: { grouping: gr } })]; }, 'zone'],
  ['pivotBar', () => { const pv = pivot({ columns: ['month'], values: { amount: 'sum' } }); const gr = grouping({ by: ['region'], pivot: pv }); return [gr, pivotBar({ use: { grouping: gr, pivot: pv } })]; }, 'pbar'],
];

describe('injectStyles: false — no feature writes a <style>', () => {
  for (const [name, features, attr] of CASES) {
    it(`${name}: its sheet written by default, none with false`, () => {
      make(features());
      expect(document.querySelectorAll(`style[data-dzgrid-${attr}]`).length).toBe(1);
      for (const g of grids.splice(0)) g.destroy();
      document.head.innerHTML = '';
      make(features(), false);
      expect(document.querySelectorAll('style').length).toBe(0);
    });
  }
});

describe('every feature with layout of its own exports it', () => {
  const ENTRIES: [string, string][] = [
    ['filters', 'FILTERS_CSS'], ['pagination', 'PAGINATION_CSS'], ['statusbar', 'STATUS_CSS'], ['tree', 'TREE_CSS'], ['grouping', 'TREE_CSS'],
    ['detail', 'DETAIL_CSS'], ['editors', 'EDITORS_CSS'], ['spans', 'SPANS_CSS'], ['groups', 'GROUPS_CSS'], ['filters-panel', 'FILTERS_PANEL_CSS'],
    ['find', 'FIND_CSS'], ['dock', 'DOCK_CSS'], ['auto-height', 'WRAP_CSS'], ['responsive', 'RESPONSIVE_CSS'], ['row-drag', 'ROW_DRAG_CSS'],
    ['row-numbers', 'ROW_NUMBERS_CSS'], ['import', 'IMPORT_CSS'], ['group-zone', 'ZONE_CSS'], ['pivot-bar', 'PIVOT_BAR_CSS'],
  ];
  for (const [entry, name] of ENTRIES)
    it(`@dzgrid/dom/${entry} exports ${name}`, async () => {
      const m = (await import(`../src/${entry}.ts`)) as Record<string, unknown>;
      expect(typeof m[name]).toBe('string');
      expect((m[name] as string).length).toBeGreaterThan(20);
    });
});
