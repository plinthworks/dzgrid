import { describe, it, expect, afterEach } from 'vitest';
import { dataKey, type ColumnDef, type GridEvent } from '@dzgrid/core';
import { createGrid, type GridInstance } from '../src/grid.js';
import type { Geometry, ViewportBox } from '../src/render/measure.js';
import type { GridSettings } from '../src/settings.js';
import { EN } from '../src/locales/en.js';

type R = { id: string; n: number };
let grids: GridInstance<R>[] = [];
afterEach(() => { for (const g of grids) g.destroy(); grids = []; document.body.innerHTML = ''; });

function make(settings: Partial<GridSettings<R>> = {}, n = 10) {
  const box: { -readonly [K in keyof ViewportBox]: ViewportBox[K] } = { block: 320, inline: 600, scrollTop: 0, scrollInline: 0 };
  const geometry: Geometry = { read: () => ({ ...box }), writeScrollTop: (px) => { box.scrollTop = px; }, writeScrollInline: (px) => { box.scrollInline = px; } };
  const host = document.createElement('div');
  document.body.append(host);
  const events: GridEvent<R>[] = [];
  const columns: ColumnDef<R, any>[] = [{ id: 'n', type: 'number' }, { id: 'm', value: (r: R) => r.n * 2 }];
  const g = createGrid<R>(host, { rows: Array.from({ length: n }, (_, i) => ({ id: `r${i}`, n: i })), getRowId: (r) => r.id, columns, messages: EN, onEvent: (e) => events.push(e), ...settings }, { geometry, sync: true });
  grids.push(g);
  return { g, host, events };
}

describe('DOM events', () => {
  it('tells which row and cell were clicked, by identity, after a sort', () => {
    const { g, host, events } = make();
    g.kernel.dispatch({ type: 'sort.set', sort: [{ column: 'n', dir: 'desc' }] }, 'user');
    host.querySelector<HTMLElement>('.dzg-row[aria-rowindex="4"] [data-col="m"]')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    const cell = events.find((e) => e.type === 'cellClicked');
    const row = events.find((e) => e.type === 'rowClicked');
    expect(cell).toMatchObject({ source: 'user', column: 'm', row: { key: dataKey('r7') } });
    expect(row).toMatchObject({ source: 'user', row: { key: dataKey('r7') } });
  });

  it('says once that the first data was rendered, not again on updates', () => {
    const { g, events } = make();
    g.update({ rows: Array.from({ length: 5 }, (_, i) => ({ id: `q${i}`, n: i })) });
    g.kernel.dispatch({ type: 'sort.set', sort: [{ column: 'n', dir: 'asc' }] }, 'user');
    g.api.refresh();
    expect(events.filter((e) => e.type === 'firstDataRendered').length).toBe(1);
  });

  it('waits for rows before saying the first data was rendered', () => {
    const { g, events } = make({}, 0);
    expect(events.filter((e) => e.type === 'firstDataRendered')).toEqual([]);
    g.update({ rows: [{ id: 'a', n: 1 }] });
    expect(events.filter((e) => e.type === 'firstDataRendered').length).toBe(1);
  });

  it('does not report clicks on the header or outside rows as cell clicks', () => {
    const { host, events } = make();
    host.querySelector<HTMLElement>('.dzg-hcell[data-col="n"]')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(events.filter((e) => e.type === 'cellClicked' || e.type === 'rowClicked')).toEqual([]);
  });
});
