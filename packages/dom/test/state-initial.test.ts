// `gridState({ initial })` (sort.md « An initial sort », grid-state.md; owner demo, step 16): the plain-DOM way to
// start a server grid on a sort (or any part of a state) with ONE request, as Angular's `[state]` does.
import { describe, it, expect, afterEach } from 'vitest';
import type { ColumnDef } from '@dzgrid/core';
import { sourceRows, type DataRequest } from '@dzgrid/core/server';
import { createGrid, type GridInstance } from '../src/grid.js';
import type { GridFeature } from '../src/features.js';
import type { Geometry, ViewportBox } from '../src/render/measure.js';
import { gridState } from '../src/state.js';
import { EN } from '../src/locales/en.js';

type R = { id: string; name: string };
const COLS: ColumnDef<R, any>[] = [{ id: 'name' }];
let grids: GridInstance<R, any>[] = [];
afterEach(() => { for (const g of grids) g.destroy(); grids = []; document.body.innerHTML = ''; localStorage.clear(); });

function make(features: GridFeature[]) {
  const box: ViewportBox = { block: 400, inline: 600, scrollTop: 0, scrollInline: 0 };
  const geometry: Geometry = { read: () => ({ ...box }), writeScrollTop: () => {}, writeScrollInline: () => {} };
  const host = document.createElement('div');
  document.body.append(host);
  const reqs: DataRequest[] = [];
  const source = sourceRows<R>({ fetch: (req) => (reqs.push(req), { rows: [{ id: 'a', name: 'x' }], total: 1 }) });
  // `source` without `rows`: the fixture builds settings the exact optional types cannot name in one literal.
  const g = createGrid<R>(host, { source, getRowId: (r: R) => r.id, columns: COLS, messages: EN, features } as never, { geometry, sync: true }) as GridInstance<R, any>;
  grids.push(g);
  return { g, reqs };
}

describe('gridState({ initial })', () => {
  it('one request at creation, carrying the initial sort', () => {
    const t = make([gridState({ initial: { v: 1, sort: [{ column: 'name', dir: 'desc' }] } })]);
    expect(t.reqs.length).toBe(1);
    expect(t.reqs[0]!.sort).toEqual([{ column: 'name', dir: 'desc' }]);
    expect(t.g.kernel.query.sort).toEqual([{ column: 'name', dir: 'desc' }]);
  });

  it('a stored state (persist) wins over initial; still one request', () => {
    localStorage.setItem('k', JSON.stringify({ v: 1, sort: [{ column: 'name', dir: 'asc' }] }));
    const t = make([gridState({ initial: { v: 1, sort: [{ column: 'name', dir: 'desc' }] }, persist: { key: 'k' } })]);
    expect(t.reqs.length).toBe(1);
    expect(t.reqs[0]!.sort).toEqual([{ column: 'name', dir: 'asc' }]);
  });

  it('with another holder (as the Angular wrapper): still held, one request when it releases, with the sort', () => {
    const holder: GridFeature = { id: 'holder', held: true, setup: () => ({ destroy() {} }) };
    const t = make([holder, gridState({ initial: { v: 1, sort: [{ column: 'name', dir: 'desc' }] } })]);
    expect(t.reqs.length).toBe(0);
    t.g.kernel.rows.hold!(() => {});
    expect(t.reqs.length).toBe(1);
    expect(t.reqs[0]!.sort).toEqual([{ column: 'name', dir: 'desc' }]);
  });

  it('reset() goes back to the grid as defined, not to initial (unchanged)', () => {
    const st = gridState({ initial: { v: 1, sort: [{ column: 'name', dir: 'desc' }] } });
    const t = make([st]);
    st.api(t.g)!.reset();
    expect(t.g.kernel.query.sort).toEqual([]);
  });
});
