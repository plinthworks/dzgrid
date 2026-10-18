import { describe, it, expect } from 'vitest';
import {
  clientRows, createColumnModel, createKernel, localeCtx, makeQuery,
  type AnyFilterKind, type ColumnFilter, type FilterKind, type GridEvent, type ModelChange,
} from '@dzgrid/core';
import { filterKindLookup } from '@dzgrid/core/internal';
import { sourceRows, type DataSource } from '@dzgrid/core/server';
import { fakeSource } from './support/fake-source.js';

/** The step 8 review (2026-10-18): problems told, the JSON guard, select-all again. */
type Row = { id: string; n: number };
const EN = localeCtx({ locale: 'en-US', timeZone: 'UTC' });
const custom = (kind: string, state: unknown): ColumnFilter => ({ type: 'custom', kind, state } as unknown as ColumnFilter);
type Range = { lo: number; hi: number };
const between: FilterKind<Range, number> = {
  name: 'between', types: ['number'],
  read: (s) => (s && typeof s === 'object' && typeof (s as Range).lo === 'number' && typeof (s as Range).hi === 'number' ? (s as Range) : 'invalid'),
  active: () => true,
  test: (s) => (v) => v !== null && v >= s.lo && v <= s.hi,
};
// Throws on the row whose value is 13.
const picky: FilterKind<Range, number> = { ...between, name: 'picky', test: (s) => (v) => { if (v === 13) throw new Error('13'); return v !== null && v >= s.lo && v <= s.hi; } };
const kinds = filterKindLookup([between, picky] as AnyFilterKind[]).get;
const rows = (n: number) => Array.from({ length: n }, (_, i): Row => ({ id: `r${i}`, n: i }));

describe('step 8 review', () => {
  it('a server tells a valid filter replaced by a refused one, though the request changes', () => {
    const fake = fakeSource();
    const columns = createColumnModel<Row>([{ id: 'n', type: 'number' }]);
    const model = sourceRows<Row>(fake.source as DataSource<Row>).create({ getRowId: (r) => r.id, columns, ctx: EN, abort: fake.abort, operations: 'server', filterKinds: kinds });
    const changes: ModelChange<Row>[] = [];
    model.subscribe((c) => changes.push(c));
    model.setQuery(makeQuery({ filter: { n: custom('between', { lo: 1, hi: 3 }) } }));
    model.setQuery(makeQuery({ filter: { n: custom('between', 'nonsense') } }));
    expect(changes.at(-1)!.told?.map((p) => [p.code, p.detail])).toEqual([['invalid-filter', 'invalid state']]);
  });

  it('a server tells a refusal whose reason changes on the same column', () => {
    const fake = fakeSource();
    const columns = createColumnModel<Row>([{ id: 'n', type: 'number' }]);
    const model = sourceRows<Row>(fake.source as DataSource<Row>).create({ getRowId: (r) => r.id, columns, ctx: EN, abort: fake.abort, operations: 'server', filterKinds: kinds });
    const changes: ModelChange<Row>[] = [];
    model.subscribe((c) => changes.push(c));
    model.setQuery(makeQuery({ filter: { n: custom('nope', 1) } }));
    const n = changes.length;
    model.setQuery(makeQuery({ filter: { n: custom('between', 'nonsense') } }));
    expect(changes.length).toBe(n + 1);
    expect(changes.at(-1)!.told?.map((p) => p.detail)).toEqual(['invalid state']);
  });

  it('a row whose test throws is told once, and not again after an update of other rows', () => {
    const columns = createColumnModel<Row>([{ id: 'n', type: 'number' }]);
    const model = clientRows<Row>({ rows: rows(20), getRowId: (r) => r.id, columns, ctx: EN, filterKinds: kinds });
    const kernel = createKernel<Row>({ rows: model, columns });
    const told: GridEvent<Row>[] = [];
    kernel.subscribe((e) => { if (e.type === 'problems') told.push(e); });
    kernel.dispatch({ type: 'filter.column', column: 'n', filter: custom('picky', { lo: 0, hi: 18 }) }, 'user');
    expect(told.length).toBe(1);
    model.applyTransaction({ patch: [{ id: 'r2', set: { n: 2 } }] });
    expect(model.problems.some((p) => p.detail === 'threw')).toBe(true);
    kernel.dispatch({ type: 'quick.set', text: '' }, 'user');
    kernel.dispatch({ type: 'filter.column', column: 'n', filter: custom('picky', { lo: 0, hi: 17 }) }, 'user');
    // The same refusal again is not news.
    expect(told.length).toBe(1);
  });

  it('refuses a state that is not JSON however deep it sits in combined filters', () => {
    const columns = createColumnModel<Row>([{ id: 'n', type: 'number' }]);
    const kernel = createKernel<Row>({ rows: clientRows<Row>({ rows: rows(3), getRowId: (r) => r.id, columns, ctx: EN, filterKinds: kinds }), columns });
    const cyclic: Record<string, unknown> = {};
    cyclic['me'] = cyclic;
    let f: ColumnFilter = custom('between', cyclic);
    for (let i = 0; i < 6; i++) f = { type: 'combined', join: 'and', conditions: [f] } as unknown as ColumnFilter;
    expect(() => kernel.dispatch({ type: 'filter.column', column: 'n', filter: f }, 'user')).not.toThrow();
    expect(kernel.dispatch({ type: 'filter.column', column: 'n', filter: f }, 'user')).toMatchObject({ ok: false, reason: 'invalid-filter' });
  });

  it('select-all again on an untouched all-pages selection changes nothing and tells nothing', () => {
    const columns = createColumnModel<Row>([{ id: 'n', type: 'number' }]);
    const model = clientRows<Row>({ rows: rows(12), getRowId: (r) => r.id, columns, ctx: EN, page: { pageSize: 5 } });
    const kernel = createKernel<Row>({ rows: model, columns });
    kernel.dispatch({ type: 'selection.allFiltered' }, 'user');
    const seen: GridEvent<Row>[] = [];
    kernel.subscribe((e) => seen.push(e));
    kernel.dispatch({ type: 'selection.all' }, 'user');
    expect(seen.filter((e) => e.type === 'selectionChanged')).toEqual([]);
  });
});
