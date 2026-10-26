// Phase 6 step 5 (docs/phase-6-steps/step05-plan.md §3, grid-state.md 7, 15; owner E5-1): a restore costs at most ONE
// server request — query, page size and page sent together — whatever the order the state's parts are applied in. Counted
// through a fake server on the real server model (`sourceRows`), as the plan's first test: red at 3–4 before the hold seam.
import { describe, it, expect } from 'vitest';
import { clientRows, createColumnModel, createKernel, localeCtx, makeQuery, type ColumnDef } from '@dzgrid/core';
import { sourceRows, type DataSource } from '@dzgrid/core/server';
import { captureState, restoreState, stateText } from '@dzgrid/core/state';
import { fakeSource, rowsOf } from './support/fake-source.js';

type R = { id: string; name: string; age: number; city: string };
const DEFS: ColumnDef<R>[] = [{ id: 'name', field: 'name' }, { id: 'age', field: 'age', type: 'number' }, { id: 'city', field: 'city' }];

function grid() {
  const fake = fakeSource();
  const columns = createColumnModel<R>(DEFS);
  const rows = sourceRows<R>(fake.source as DataSource<R>).create({ getRowId: (r) => r.id, columns, ctx: localeCtx({ locale: 'fr-FR' }), abort: fake.abort, page: { pageSize: 50 } });
  const kernel = createKernel<R>({ rows, columns });
  // The first page, answered: the grid as a user finds it.
  fake.calls[0]!.resolve({ rows: rowsOf(['a', 'b']), total: 1000 });
  return { ...fake, kernel, fetches: () => fake.calls.length };
}

const STATE = {
  v: 1,
  columns: [
    { id: 'city', pinned: 'start', order: 0 },
    { id: 'name', width: 220, pinned: null, order: 1 },
    { id: 'age', hidden: true, pinned: null, order: 2 },
  ],
  sort: [{ column: 'name', dir: 'desc' }],
  filter: { city: { type: 'text', op: 'contains', value: 'Or' } },
  quick: 'x',
  page: 3,
  pageSize: 25,
};

describe('a restore asks the server once (E5-1)', () => {
  it('columns + sort + filter + search + page + size: exactly one request, carrying all of them', () => {
    const g = grid();
    const before = g.fetches();
    expect(restoreState(g.kernel, STATE)).toEqual([]);
    expect(g.fetches() - before).toBe(1);
    const req = g.last().req;
    expect(req.sort).toEqual([{ column: 'name', dir: 'desc' }]);
    expect(req.quick).toBe('x');
    expect(Object.keys(req.filter ?? {})).toEqual(['city']);
    expect(req.page).toEqual({ index: 3, size: 25, offset: 75, cursor: null });
  });

  it('the state the grid already shows: no request', () => {
    const g = grid();
    expect(restoreState(g.kernel, STATE)).toEqual([]);
    g.last().resolve({ rows: rowsOf(['c']), total: 1000 });
    const text = stateText(captureState(g.kernel));
    const before = g.fetches();
    expect(restoreState(g.kernel, JSON.parse(text))).toEqual([]);
    expect(g.fetches() - before).toBe(0);
    expect(stateText(captureState(g.kernel))).toBe(text);
  });

  it('only the page changes: one request', () => {
    const g = grid();
    const st = { ...JSON.parse(stateText(captureState(g.kernel))), page: 4 };
    const before = g.fetches();
    restoreState(g.kernel, st);
    expect(g.fetches() - before).toBe(1);
    expect(g.last().req.page?.index).toBe(4);
  });

  it('only a column that a filter reads is hidden (its wire form changes): one request', () => {
    const g = grid();
    g.kernel.dispatch({ type: 'query.set', query: makeQuery({ filter: { age: { type: 'number', op: 'gt', value: 3 } } }) }, 'user');
    g.last().resolve({ rows: rowsOf(['a']), total: 1 });
    const st = JSON.parse(stateText(captureState(g.kernel)));
    st.columns = st.columns.map((c: { id: string }) => (c.id === 'age' ? { ...c, hidden: true } : c));
    const before = g.fetches();
    restoreState(g.kernel, st);
    expect(g.fetches() - before).toBeLessThanOrEqual(1);
  });

  it('a restore while a request runs: one new request; the old answer, arriving last, is dropped (G 15)', () => {
    const g = grid();
    g.kernel.dispatch({ type: 'quick.set', text: 'old' }, 'user');
    const old = g.last();
    const before = g.fetches();
    restoreState(g.kernel, STATE);
    expect(g.fetches() - before).toBe(1);
    const mine = g.last();
    mine.resolve({ rows: rowsOf(['restored']), total: 1000 });
    old.resolve({ rows: rowsOf(['stale']), total: 1000 });
    const d = g.kernel.rows.displayed;
    expect(Array.from({ length: d.count }, (_, i) => String((d.nodeAt(d.index(i)!) as { id: unknown }).id))).toEqual(['restored']);
    expect(g.kernel.query.quick).toBe('x');
  });
});

describe('the hold seam (rows.hold, ModelEnv.held)', () => {
  const made = (held?: boolean) => {
    const fake = fakeSource();
    const columns = createColumnModel<R>(DEFS);
    const rows = sourceRows<R>(fake.source as DataSource<R>).create({ getRowId: (r) => r.id, columns, ctx: localeCtx({ locale: 'fr-FR' }), abort: fake.abort, page: { pageSize: 50 }, ...(held !== undefined && { held }) });
    return { ...fake, rows, kernel: createKernel<R>({ rows, columns }) };
  };

  it('a model made held asks nothing until the end of the first hold; then once, with what the hold set (grid-state.md 17)', () => {
    const g = made(true);
    expect(g.calls.length).toBe(0);
    expect(g.rows.status.phase).toBe('loading');
    g.rows.hold!(() => {
      g.kernel.dispatch({ type: 'sort.set', sort: [{ column: 'city', dir: 'asc' }] }, 'host');
      g.kernel.dispatch({ type: 'page.go', index: 2 }, 'host');
    });
    expect(g.calls.length).toBe(1);
    expect(g.last().req.sort).toEqual([{ column: 'city', dir: 'asc' }]);
    expect(g.last().req.page?.index).toBe(2);
  });

  it('a model made held with nothing set: its one first request at the end of the hold', () => {
    const g = made(true);
    g.rows.hold!(() => {});
    expect(g.calls.length).toBe(1);
    expect(g.last().req.page?.index).toBe(0);
  });

  it('a hold whose function throws still sends what it held (try / finally), and the throw goes on', () => {
    const g = made();
    expect(() => g.rows.hold!(() => {
      g.kernel.dispatch({ type: 'quick.set', text: 'a' }, 'host');
      throw new Error('app');
    })).toThrow('app');
    expect(g.calls.length).toBe(2);
    expect(g.last().req.quick).toBe('a');
  });

  it('a hold that changes nothing asks nothing; a model destroyed inside a hold asks nothing', () => {
    const g = made();
    g.rows.hold!(() => void g.kernel.dispatch({ type: 'page.go', index: 0 }, 'host'));
    expect(g.calls.length).toBe(1);
    g.rows.hold!(() => {
      g.kernel.dispatch({ type: 'quick.set', text: 'b' }, 'host');
      g.rows.destroy();
    });
    expect(g.calls.length).toBe(1);
  });

  it('the browser\'s model has no hold: restoreState applies at once', () => {
    const columns = createColumnModel<R>(DEFS);
    const k = createKernel<R>({ rows: clientRows<R>({ rows: [], getRowId: (r) => r.id, columns, ctx: localeCtx({ locale: 'fr-FR' }) }), columns });
    expect(k.rows.hold).toBeUndefined();
    expect(restoreState(k, { v: 1, quick: 'z' })).toEqual([]);
    expect(k.query.quick).toBe('z');
  });
});
