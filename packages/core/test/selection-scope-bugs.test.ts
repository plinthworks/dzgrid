import { describe, it, expect } from 'vitest';
import { clientRows, createColumnModel, createKernel, dataKey, localeCtx, type GridEvent } from '@dzgrid/core';
import { sourceRows, type DataSource } from '@dzgrid/core/server';
import { fakeSource } from './support/fake-source.js';

/** Probes written against the sheets (server-selection.md, selection.md): each asserts the documented behaviour. */
type R = { id: string; n: number; t: string };
const k = (id: string) => dataKey(id)!;
const UTC = localeCtx({ locale: 'en-US' });
const odd = { type: 'text', op: 'equals', value: 'odd' } as const;
const rows = (n: number) => Array.from({ length: n }, (_, i): R => ({ id: `r${i}`, n: i, t: i % 2 ? 'odd' : 'even' }));
type Sel = Extract<GridEvent<R>, { type: 'selectionChanged' }>;

function client(n = 12, page = 5) {
  const columns = createColumnModel<R>([{ id: 'n', type: 'number' }, { id: 't' }]);
  const model = clientRows<R>({ rows: rows(n), getRowId: (r) => r.id, columns, ctx: UTC, page: { pageSize: page } });
  const kernel = createKernel<R>({ rows: model, columns });
  const events: GridEvent<R>[] = [];
  kernel.subscribe((e) => events.push(e));
  return { model, kernel, sel: () => events.filter((e): e is Sel => e.type === 'selectionChanged') };
}

describe('B1: a half-typed filter in the browser', () => {
  it('leaves "all" as it was, as on a server (the empty box is no filter at all)', () => {
    const c = client();
    c.kernel.dispatch({ type: 'selection.allFiltered' }, 'user');
    c.kernel.dispatch({ type: 'filter.column', column: 't', filter: { type: 'text', op: 'contains', value: '' } }, 'user');
    // The rows shown did not change: the filtered count is still 12.
    expect(c.model.counts.filtered).toBe(12);
    expect(c.kernel.selection.mode).toBe('exclude');
  });

  it('on a fetched set filtered in the browser, likewise', () => {
    const fake = fakeSource();
    const columns = createColumnModel<R>([{ id: 'n', type: 'number' }, { id: 't' }]);
    const model = sourceRows<R>(fake.source as DataSource<R>).create({ getRowId: (r) => r.id, columns, ctx: UTC, abort: fake.abort, operations: 'client', page: { pageSize: 2 } });
    const kernel = createKernel<R>({ rows: model, columns });
    fake.last().resolve({ rows: rows(5) });
    kernel.dispatch({ type: 'selection.allFiltered' }, 'user');
    kernel.dispatch({ type: 'filter.column', column: 't', filter: { type: 'text', op: 'contains', value: '' } }, 'user');
    expect(kernel.selection.mode).toBe('exclude');
  });
});

describe('B2: the count of an everything-except selection in the browser is exact', () => {
  it('an unticked row that stops matching (a host update) no longer lowers the count', () => {
    const c = client();
    c.kernel.dispatch({ type: 'filter.column', column: 't', filter: odd }, 'user');
    c.kernel.dispatch({ type: 'selection.allFiltered' }, 'user');
    c.kernel.dispatch({ type: 'selection.toggle', row: k('r1') }, 'user');
    expect(c.sel().at(-1)!.count).toBe(5);
    // r1 becomes even: 5 rows match, every one of them selected.
    c.model.applyTransaction({ update: [{ id: 'r1', n: 1, t: 'even' }] });
    expect(c.model.counts.filtered).toBe(5);
    expect(c.sel().at(-1)!.count).toBe(5);
  });

  it('a host untick of a row the filters hide does not lower it', () => {
    const c = client();
    c.kernel.dispatch({ type: 'filter.column', column: 't', filter: odd }, 'user');
    c.kernel.dispatch({ type: 'selection.allFiltered' }, 'user');
    c.kernel.dispatch({ type: 'selection.toggle', row: k('r0') }, 'api');
    expect(c.sel().at(-1)!.count).toBe(6);
  });
});

describe('B3: the header box on server pages, include keys of another filter', () => {
  it('is not ticked when as many keys are held as the query matches, but none of them are its rows', () => {
    const fake = fakeSource();
    const columns = createColumnModel<R>([{ id: 'n', type: 'number' }, { id: 't' }]);
    const model = sourceRows<R>(fake.source as DataSource<R>).create({ getRowId: (r) => r.id, columns, ctx: UTC, abort: fake.abort, operations: 'server', page: { pageSize: 50 } });
    const kernel = createKernel<R>({ rows: model, columns });
    fake.last().resolve({ rows: rows(3), total: 3 });
    for (const id of ['r0', 'r1', 'r2']) kernel.dispatch({ type: 'selection.toggle', row: k(id) }, 'user');
    expect(kernel.headerState).toBe('all');
    kernel.dispatch({ type: 'quick.set', text: 'other' }, 'user');
    fake.last().resolve({ rows: [{ id: 'x0', n: 0, t: 'x' }, { id: 'x1', n: 1, t: 'x' }, { id: 'x2', n: 2, t: 'x' }], total: 3 });
    // Not one row shown is ticked; a click on a "ticked" box would clear the kept keys instead of selecting.
    expect(kernel.headerState).not.toBe('all');
  });
});

describe('B1b: a blank search in the browser', () => {
  it('is no search: "all" stays (a server trims it the same way)', () => {
    const c = client();
    c.kernel.dispatch({ type: 'selection.allFiltered' }, 'user');
    c.kernel.dispatch({ type: 'quick.set', text: '  ' }, 'user');
    expect(c.model.counts.filtered).toBe(12);
    expect(c.kernel.selection.mode).toBe('exclude');
  });
});

describe('B1c: what applies, not what was typed', () => {
  it('a combined filter gaining a half-typed condition leaves "all" as it was', () => {
    const c = client();
    c.kernel.dispatch({ type: 'filter.column', column: 't', filter: { type: 'combined', join: 'or', conditions: [odd] } }, 'user');
    c.kernel.dispatch({ type: 'selection.allFiltered' }, 'user');
    c.kernel.dispatch({ type: 'filter.column', column: 't', filter: { type: 'combined', join: 'or', conditions: [odd, { type: 'text', op: 'contains', value: '' }] } }, 'user');
    expect(c.kernel.selection.mode).toBe('exclude');
  });

  it('a filter typed on (a value in the box) clears it', () => {
    const c = client();
    c.kernel.dispatch({ type: 'selection.allFiltered' }, 'user');
    c.kernel.dispatch({ type: 'filter.column', column: 't', filter: { type: 'text', op: 'contains', value: '' } }, 'user');
    c.kernel.dispatch({ type: 'filter.column', column: 't', filter: { type: 'text', op: 'contains', value: 'o' } }, 'user');
    expect(c.kernel.selection.mode).toBe('include');
    expect(c.sel().at(-1)!.reason).toBe('scope-changed');
  });

  it('a refused filter (a number box on a text column) is no filter either', () => {
    const c = client();
    c.kernel.dispatch({ type: 'selection.allFiltered' }, 'user');
    c.kernel.dispatch({ type: 'filter.column', column: 't', filter: { type: 'number', op: 'equals', value: 1 } }, 'user');
    expect(c.model.counts.filtered).toBe(12);
    expect(c.kernel.selection.mode).toBe('exclude');
  });
});

describe('B2b: the browser count after a host update', () => {
  it('an unticked row that starts matching lowers it', () => {
    const c = client();
    c.kernel.dispatch({ type: 'filter.column', column: 't', filter: odd }, 'user');
    c.kernel.dispatch({ type: 'selection.allFiltered' }, 'user');
    c.kernel.dispatch({ type: 'selection.toggle', row: k('r0') }, 'api');
    expect(c.sel().at(-1)!.count).toBe(6);
    // r0 turns odd: 7 rows match, r0 among them unticked.
    c.model.applyTransaction({ update: [{ id: 'r0', n: 0, t: 'odd' }] });
    expect(c.sel().at(-1)!.count).toBe(6);
    c.model.applyTransaction({ update: [{ id: 'r2', n: 2, t: 'odd' }] });
    expect(c.sel().at(-1)!.count).toBe(7);
  });

  it('server pages keep the documented count: filtered less every unticked key', () => {
    const fake = fakeSource();
    const columns = createColumnModel<R>([{ id: 'n', type: 'number' }, { id: 't' }]);
    const model = sourceRows<R>(fake.source as DataSource<R>).create({ getRowId: (r) => r.id, columns, ctx: UTC, abort: fake.abort, operations: 'server', page: { pageSize: 50 } });
    const kernel = createKernel<R>({ rows: model, columns });
    const events: GridEvent<R>[] = [];
    kernel.subscribe((e) => events.push(e));
    fake.last().resolve({ rows: rows(3), total: 3 });
    kernel.dispatch({ type: 'selection.all' }, 'user');
    kernel.dispatch({ type: 'selection.toggle', row: k('elsewhere') }, 'api');
    expect(events.filter((e): e is Sel => e.type === 'selectionChanged').at(-1)!.count).toBe(2);
  });
});

describe('E1 (documented): server pages after a failed request', () => {
  it('a row of the query before can be unticked under the new "all": the count is one too low once answered', () => {
    const fake = fakeSource();
    const columns = createColumnModel<R>([{ id: 'n', type: 'number' }, { id: 't' }]);
    const model = sourceRows<R>(fake.source as DataSource<R>).create({ getRowId: (r) => r.id, columns, ctx: UTC, abort: fake.abort, operations: 'server', page: { pageSize: 50 } });
    const kernel = createKernel<R>({ rows: model, columns });
    const events: GridEvent<R>[] = [];
    kernel.subscribe((e) => events.push(e));
    fake.last().resolve({ rows: rows(12), total: 12 });
    kernel.dispatch({ type: 'filter.column', column: 't', filter: odd }, 'user');
    fake.last().reject(new Error('503'));
    kernel.dispatch({ type: 'selection.all' }, 'user');
    // r0 (even) is still shown, from the answer before.
    expect(kernel.dispatch({ type: 'selection.toggle', row: k('r0') }, 'user').ok).toBe(true);
    const last = () => events.filter((e): e is Sel => e.type === 'selectionChanged').at(-1)!;
    expect(last().count).toBeNull();
    kernel.dispatch({ type: 'rows.refresh' }, 'user');
    fake.last().resolve({ rows: rows(12).filter((r) => r.t === 'odd'), total: 6 });
    expect(kernel.selection.mode).toBe('exclude');
    expect(last().count).toBe(5);
  });
});

describe('mutation spot-check follow-ups', () => {
  it('a half-typed condition inside a nested combined filter leaves "all" as it was', () => {
    const c = client();
    const half = { type: 'text', op: 'contains', value: '' } as const;
    c.kernel.dispatch({ type: 'filter.column', column: 't', filter: { type: 'combined', join: 'or', conditions: [odd, { type: 'combined', join: 'and', conditions: [odd] }] } }, 'user');
    c.kernel.dispatch({ type: 'selection.allFiltered' }, 'user');
    c.kernel.dispatch({ type: 'filter.column', column: 't', filter: { type: 'combined', join: 'or', conditions: [odd, { type: 'combined', join: 'and', conditions: [odd, half] }] } }, 'user');
    expect(c.kernel.selection.mode).toBe('exclude');
  });

  it('a column that stops being filterable lifts its filter: "all" is cleared', () => {
    const columns = createColumnModel<R>([{ id: 'n', type: 'number' }, { id: 't' }]);
    const model = clientRows<R>({ rows: rows(12), getRowId: (r) => r.id, columns, ctx: UTC, page: { pageSize: 5 } });
    const kernel = createKernel<R>({ rows: model, columns });
    const events: GridEvent<R>[] = [];
    kernel.subscribe((e) => events.push(e));
    kernel.dispatch({ type: 'filter.column', column: 't', filter: odd }, 'user');
    kernel.dispatch({ type: 'selection.allFiltered' }, 'user');
    kernel.dispatch({ type: 'columns.set', defs: [{ id: 'n', type: 'number' }, { id: 't', filter: false }] }, 'host');
    expect(model.counts.filtered).toBe(12);
    expect(kernel.selection.mode).toBe('include');
    expect(events.filter((e): e is Sel => e.type === 'selectionChanged').at(-1)!.reason).toBe('scope-changed');
  });

  it('a fetched set counts exactly too: an unticked row its browser filter hides takes nothing away', () => {
    const fake = fakeSource();
    const columns = createColumnModel<R>([{ id: 'n', type: 'number' }, { id: 't' }]);
    const model = sourceRows<R>(fake.source as DataSource<R>).create({ getRowId: (r) => r.id, columns, ctx: UTC, abort: fake.abort, operations: 'client', page: { pageSize: 2 } });
    const kernel = createKernel<R>({ rows: model, columns });
    const events: GridEvent<R>[] = [];
    kernel.subscribe((e) => events.push(e));
    fake.last().resolve({ rows: rows(5) });
    kernel.dispatch({ type: 'filter.column', column: 't', filter: odd }, 'user');
    kernel.dispatch({ type: 'selection.allFiltered' }, 'user');
    kernel.dispatch({ type: 'selection.toggle', row: k('r0') }, 'api');
    // r1 and r3 match, both selected.
    expect(events.filter((e): e is Sel => e.type === 'selectionChanged').at(-1)!.count).toBe(2);
  });

  it('server pages, include: as many keys as matched, a row shown unticked: partly ticked', () => {
    const fake = fakeSource();
    const columns = createColumnModel<R>([{ id: 'n', type: 'number' }, { id: 't' }]);
    const model = sourceRows<R>(fake.source as DataSource<R>).create({ getRowId: (r) => r.id, columns, ctx: UTC, abort: fake.abort, operations: 'server', page: { pageSize: 2 } });
    const kernel = createKernel<R>({ rows: model, columns });
    fake.last().resolve({ rows: rows(2), total: 3 });
    kernel.dispatch({ type: 'selection.set', selection: { mode: 'include', keys: new Set([k('r0'), k('z1'), k('z2')]) } }, 'api');
    expect(kernel.headerState).toBe('some');
  });
});
