// `api.reload()` (docs/behaviors/reload.md 1–3, 6; 1.12.0): asks the data again, where `refresh()` only paints.
// Made-up cities; expectations written by hand, before the code.
import { describe, it, expect, afterEach } from 'vitest';
import { dataKey, NO_SELECTION, type ColumnDef } from '@dzgrid/core';
import { sourceRows, type DataRequest, type DataSource } from '@dzgrid/core/server';
import { createGrid, type GridInstance } from '../src/grid.js';
import type { Geometry } from '../src/render/measure.js';
import { EN } from '../src/locales/en.js';

type R = { id: string; name: string };
const columns: ColumnDef<R, any>[] = [{ id: 'name' }]; // any: the column's value type is not under test
const geometry: Geometry = { read: () => ({ block: 400, inline: 600, scrollTop: 0, scrollInline: 0 }), writeScrollTop: () => {}, writeScrollInline: () => {} };
let grids: GridInstance<R, any>[] = [];
afterEach(() => { for (const g of grids) g.destroy(); grids = []; document.body.innerHTML = ''; });

function make(more: object): GridInstance<R, any> {
  const host = document.createElement('div');
  document.body.append(host);
  const g = createGrid<R>(host, { getRowId: (r: R) => r.id, columns, messages: EN, ...more } as never, { geometry, sync: true }) as GridInstance<R, any>; // never: a server's settings without its query type
  grids.push(g);
  return g;
}

const names = (g: GridInstance<R, any>) => [...document.querySelectorAll('.dzg-layer > .dzg-row .dzg-cell[data-col="name"]')].map((c) => c.textContent);

describe('api.reload()', () => {
  it('server pages: the page shown asked again, its query and page kept, the answer painted; refresh() fetches nothing', () => {
    const reqs: DataRequest[] = [];
    let town = 'Oran';
    const data: DataSource<R> = { fetch: (req) => (reqs.push(req), { rows: [{ id: `r${req.page!.index}`, name: `${town} ${req.page!.index}` }], total: 3 }) };
    const g = make({ source: sourceRows(data), operations: 'server', pagination: { pageSize: 1 } });
    g.kernel.dispatch({ type: 'sort.set', sort: [{ column: 'name', dir: 'desc' }] }, 'user');
    g.kernel.dispatch({ type: 'page.go', index: 1 }, 'user');
    g.kernel.dispatch({ type: 'selection.toggle', row: dataKey('r1')! }, 'user');
    const sel = g.kernel.selection;
    expect(sel).not.toEqual(NO_SELECTION);
    const n = reqs.length;
    g.api.refresh();
    expect(reqs).toHaveLength(n);
    town = 'Blida';
    g.api.reload!();
    expect(reqs).toHaveLength(n + 1);
    expect(reqs[n]!.page!.index).toBe(1);
    expect(reqs[n]!.sort).toEqual([{ column: 'name', dir: 'desc' }]);
    expect(g.kernel.rows.page!.index).toBe(1);
    expect(names(g)).toEqual(['Blida 1']);
    expect(g.kernel.selection).toEqual(sel);
  });

  it('rows given by the application: nothing to fetch, nothing thrown nor told; the rows painted again, as they were', () => {
    const g = make({ rows: [{ id: 'a', name: 'Alger' }, { id: 'b', name: 'Oran' }] });
    const told: unknown[] = [];
    g.kernel.subscribe((e) => void (e.type === 'problems' && told.push(e)));
    const paints = (g as unknown as { paints: number }).paints; // unknown: the test's handle on the paint count, not in GridInstance
    expect(() => g.api.reload!()).not.toThrow();
    expect((g as unknown as { paints: number }).paints).toBeGreaterThan(paints); // unknown: as above
    expect(names(g)).toEqual(['Alger', 'Oran']);
    expect(told).toEqual([]);
  });

  it('is set on every grid\'s api', () => {
    expect(typeof make({ rows: [] }).api.reload).toBe('function');
  });
});
