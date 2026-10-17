import { describe, it, expect, afterEach } from 'vitest';
import type { ColumnDef, GridEvent } from '@dzgrid/core';
import { createGrid, type GridInstance } from '../src/grid.js';
import type { Geometry, ViewportBox } from '../src/render/measure.js';
import type { GridFeature } from '../src/features.js';
import { ownerOf } from '../src/keys/owner.js';
import { EN } from '../src/locales/en.js';

type R = { id: string; a: string; n: number };
let grids: GridInstance<R>[] = [];
afterEach(() => { for (const g of grids) g.destroy(); grids = []; document.body.innerHTML = ''; });

/** A filter-like row: an input in each cell, marked as a filter input; and a button in each column header. */
const inputs: GridFeature = {
  id: 'test.inputs',
  setup: () => ({
    headerRows: [{ id: 'inputs', mount: (cell) => { const i = document.createElement('input'); i.dataset['dzgOwner'] = 'filter-input'; cell.append(i); } }],
    destroy() {},
  }),
};

function make() {
  const box: { -readonly [K in keyof ViewportBox]: ViewportBox[K] } = { block: 320, inline: 600, scrollTop: 0, scrollInline: 0 };
  const geometry: Geometry = { read: () => ({ ...box }), writeScrollTop: (px) => { box.scrollTop = px; }, writeScrollInline: (px) => { box.scrollInline = px; } };
  const host = document.createElement('div');
  document.body.append(host);
  const events: GridEvent<R>[] = [];
  const columns: ColumnDef<R, any>[] = [{ id: 'a', header: 'A' }, { id: 'n', header: 'N', type: 'number' }];
  const g = createGrid<R>(host, { rows: Array.from({ length: 20 }, (_, i) => ({ id: `r${i}`, a: `a${i}`, n: i })), getRowId: (r) => r.id, columns, messages: EN, selection: { mode: 'multi' }, features: [inputs], onEvent: (e) => events.push(e) }, { geometry, sync: true });
  grids.push(g);
  return { g, host, events, vp: host.querySelector<HTMLElement>('.dzg-viewport')! };
}

describe('key owners', () => {
  it('leaves every key to a filter input inside the grid: no sort, no move, no selection, nothing prevented', () => {
    const { g, host, events } = make();
    const input = host.querySelector<HTMLInputElement>('.dzg-hextra[data-col="n"] input')!;
    input.focus();
    events.length = 0;
    for (const [key, mods] of [['ArrowLeft', {}], ['ArrowDown', {}], ['Enter', {}], [' ', {}], ['a', { ctrlKey: true }], ['Home', {}], ['End', {}], ['PageDown', {}]] as const) {
      const e = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...mods });
      input.dispatchEvent(e);
      expect(e.defaultPrevented, key).toBe(false);
    }
    expect(document.activeElement).toBe(input);
    expect(g.kernel.query.sort).toEqual([]);
    expect(g.kernel.selection.keys.size).toBe(0);
    expect(events.filter((e) => e.type !== 'focusChanged')).toEqual([]);
  });

  it('does not sort when a button inside a column header is clicked or pressed', () => {
    const { g, host } = make();
    const head = host.querySelector<HTMLElement>('.dzg-hrow[aria-rowindex="1"] [data-col="n"]')!;
    const button = document.createElement('button');
    head.append(button);
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    button.focus();
    button.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    expect(g.kernel.query.sort).toEqual([]);
  });

  it('names the owner from the marker first, then from what the element is', () => {
    const { vp, host } = make();
    const cell = host.querySelector<HTMLElement>('.dzg-layer [data-col="a"]')!;
    const widget = document.createElement('button');
    cell.append(widget);
    const popup = document.createElement('div');
    popup.dataset['dzgOwner'] = 'popup';
    const inside = document.createElement('span');
    popup.append(inside);
    vp.append(popup);
    expect(ownerOf(widget, vp)).toBe('cell-widget');
    expect(ownerOf(cell, vp)).toBe('cell');
    expect(ownerOf(inside, vp)).toBe('popup');
    expect(ownerOf(host.querySelector('.dzg-hextra input'), vp)).toBe('filter-input');
  });
});
