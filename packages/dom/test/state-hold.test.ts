// `gridState()` and a server model held by someone else (Phase 6 step 12, step12-plan §1.1 and §6 C1): the feature releases
// the hold at its setup only when it holds it itself (`persist`); without `persist` the holder (the Angular wrapper's
// `[state]`, here a test feature `held: true`) stays in charge, so its restore is the first and only request. With
// `persist`: one request after the storage restore, as before. Written before the change.
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
afterEach(() => {
  for (const g of grids) g.destroy();
  grids = [];
  document.body.innerHTML = '';
  localStorage.clear();
});

function make(features: GridFeature[]) {
  const box: ViewportBox = { block: 400, inline: 600, scrollTop: 0, scrollInline: 0 };
  const geometry: Geometry = { read: () => ({ ...box }), writeScrollTop: () => {}, writeScrollInline: () => {} };
  const host = document.createElement('div');
  document.body.append(host);
  const reqs: DataRequest[] = [];
  const source = sourceRows<R>({ fetch: (req) => (reqs.push(req), { rows: [{ id: 'a', name: 'x' }], total: 1 }) });
  const g = createGrid<R>(host, { source, getRowId: (r: R) => r.id, columns: COLS, messages: EN, features } as never, { geometry, sync: true }) as GridInstance<R, any>;
  grids.push(g);
  return { g, reqs };
}
const holder: GridFeature = { id: 'holder', held: true, setup: () => ({ destroy() {} }) };

describe('gridState() and a hold it did not make', () => {
  it('without persist: the model stays held after its setup; the holder\'s restore is the one request', () => {
    const st = gridState();
    const t = make([holder, st]);
    expect(t.reqs.length).toBe(0);
    st.api(t.g)!.setState({ v: 1, sort: [{ column: 'name', dir: 'desc' }] });
    expect(t.reqs.length).toBe(1);
    expect(t.reqs[0]!.sort).toEqual([{ column: 'name', dir: 'desc' }]);
    t.g.kernel.rows.hold!(() => {});
    expect(t.reqs.length).toBe(1);
  });

  it('with persist: released at its setup, one request with the stored state (unchanged)', () => {
    localStorage.setItem('k', JSON.stringify({ v: 1, sort: [{ column: 'name', dir: 'asc' }] }));
    const t = make([gridState({ persist: { key: 'k' } })]);
    expect(t.reqs.length).toBe(1);
    expect(t.reqs[0]!.sort).toEqual([{ column: 'name', dir: 'asc' }]);
  });

  it('nothing held: gridState() without persist asks once at creation (unchanged)', () => {
    const t = make([gridState()]);
    expect(t.reqs.length).toBe(1);
  });

  // Phase 6 close review (LOW): `persist` AND another holder (the Angular wrapper's `[state]`) made two requests: the
  // storage's restore ended the hold, then the holder's restore asked again. Now the hold stays the holder's.
  it('with persist AND another holder: the storage restored without a request; the holder\'s restore is the one request, over it', () => {
    localStorage.setItem('k', JSON.stringify({ v: 1, sort: [{ column: 'name', dir: 'asc' }] }));
    const st = gridState({ persist: { key: 'k' } });
    const t = make([holder, st]);
    expect(t.reqs.length).toBe(0);
    expect(t.g.kernel.query.sort).toEqual([{ column: 'name', dir: 'asc' }]);
    st.api(t.g)!.setState({ v: 1, sort: [{ column: 'name', dir: 'desc' }] });
    expect(t.reqs.length).toBe(1);
    expect(t.reqs[0]!.sort).toEqual([{ column: 'name', dir: 'desc' }]);
    t.g.kernel.rows.hold!(() => {});
    expect(t.reqs.length).toBe(1);
  });

  it('with persist, another holder, and storage that cannot be read: the hold still comes back (no request until the holder ends it)', () => {
    localStorage.setItem('k', '{not json');
    const t = make([holder, gridState({ persist: { key: 'k' } })]);
    expect(t.reqs.length).toBe(0);
    t.g.kernel.rows.hold!(() => {});
    expect(t.reqs.length).toBe(1);
  });
});
