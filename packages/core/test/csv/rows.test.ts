import { describe, it, expect } from 'vitest';
import { createColumnModel, dataKey, localeCtx, makeQuery, selectAll, selectOnly, NO_SELECTION, type RowKey } from '@dzgrid/core';
import { sourceRows, type DataSource } from '@dzgrid/core/server';
import { csvRows, toCsv } from '@dzgrid/core/csv';
import { fakeSource, rowsOf } from '../support/fake-source.js';
import { EN, grid } from './support.js';

/** docs/behaviors/csv-export.md, scopes: which rows the file holds, and `ClientModel.allRows`. */

const k = (id: string): RowKey => dataKey(id)!;
const names = (rows: { count: number; nodeAt(i: never): { data: unknown } }, at: Uint32Array | null) =>
  (at ? Array.from(at) : Array.from({ length: rows.count }, (_, i) => i)).map((i) => (rows.nodeAt(i as never).data as { n: string }).n);

/** Seven rows, n = a..g, v = 1..7; paged by 3, sorted by v descending, filtered to v != 4. */
function paged() {
  const g = grid([{ id: 'n', header: 'N' }, { id: 'v', header: 'V', type: 'number' }], ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((n, i) => ({ id: n, n, v: i + 1 })), EN, { pageSize: 3 });
  g.model.setQuery(makeQuery({ sort: [{ column: 'v', dir: 'desc' }], filter: { v: { type: 'number', op: 'notEqual', value: 4 } } }));
  return g;
}

describe('ClientModel.allRows', () => {
  it('without paging, is the displayed rows', () => {
    const g = grid([{ id: 'n' }], [{ n: 'a' }, { n: 'b' }]);
    expect(g.model.allRows).toBe(g.model.displayed);
  });

  it('paged, holds every row the query matches, across pages, in screen order', () => {
    const g = paged();
    expect(g.model.displayed.count).toBe(3);
    expect(names(g.model.allRows as never, null)).toEqual(['g', 'f', 'e', 'c', 'b', 'a']);
    g.model.setPage({ index: 1 });
    expect(names(g.model.allRows as never, null)).toEqual(['g', 'f', 'e', 'c', 'b', 'a']);
    expect(names(g.model.displayed as never, null)).toEqual(['c', 'b', 'a']);
  });

  it('is the same object until the rows or the query change, then follows them', () => {
    const g = paged();
    const a = g.model.allRows;
    expect(g.model.allRows).toBe(a);
    g.model.setQuery(makeQuery({ sort: [{ column: 'v', dir: 'asc' }] }));
    expect(g.model.allRows).not.toBe(a);
    expect(names(g.model.allRows as never, null)).toEqual(['a', 'b', 'c', 'd', 'e', 'f', 'g']);
    g.model.applyTransaction({ remove: ['a'] });
    expect(names(g.model.allRows as never, null)).toEqual(['b', 'c', 'd', 'e', 'f', 'g']);
  });

  it('paged without a sort or a filter, still holds every row', () => {
    const g = grid([{ id: 'n' }], ['a', 'b', 'c', 'd'].map((n) => ({ n })), EN, { pageSize: 3 });
    expect(names(g.model.allRows as never, null)).toEqual(['a', 'b', 'c', 'd']);
  });
});

describe('csvRows', () => {
  it('displayed: the page shown, at null', () => {
    const g = paged();
    const r = csvRows(g.model, 'displayed', NO_SELECTION)!;
    expect(r.rows).toBe(g.model.displayed);
    expect(r.at).toBeNull();
    expect(r.count).toBe(3);
  });

  it('all: every page, the filter applied', () => {
    const g = paged();
    const r = csvRows(g.model, 'all', NO_SELECTION)!;
    expect(r.at).toBeNull();
    expect(r.count).toBe(6);
    expect(toCsv({ rows: r.rows, at: r.at, columns: g.columns, ctx: EN }, { bom: false })).toBe('N,V\r\ng,7\r\nf,6\r\ne,5\r\nc,3\r\nb,2\r\na,1\r\n');
  });

  it('selected, include: the selected keys in screen order, on every page', () => {
    const g = paged();
    const r = csvRows(g.model, 'selected', selectOnly([k('a'), k('f'), k('c')]))!;
    expect(names(r.rows as never, r.at)).toEqual(['f', 'c', 'a']);
    expect(r.count).toBe(3);
  });

  it('selected, exclude: every matching row but the excluded ones', () => {
    const g = paged();
    const all = selectAll();
    const r = csvRows(g.model, 'selected', { mode: 'exclude', keys: new Set([k('e'), k('zz')]) })!;
    expect(names(r.rows as never, r.at)).toEqual(['g', 'f', 'c', 'b', 'a']);
    expect(csvRows(g.model, 'selected', all)!.count).toBe(6);
  });

  it('selected: a selected row the filter hides is not written (owner Q2)', () => {
    const g = paged();
    const r = csvRows(g.model, 'selected', selectOnly([k('d'), k('b')]))!;
    expect(names(r.rows as never, r.at)).toEqual(['b']);
    expect(r.count).toBe(1);
    expect(toCsv({ rows: r.rows, at: r.at, columns: g.columns, ctx: EN }, { bom: false })).toBe('N,V\r\nb,2\r\n');
  });

  it('selected, nothing selected: no row', () => {
    const r = csvRows(paged().model, 'selected', NO_SELECTION)!;
    expect(r.count).toBe(0);
    expect(Array.from(r.at!)).toEqual([]);
  });
});

describe('csvRows on a server', () => {
  type R = { id: string; name: string };
  const UTC = localeCtx({ locale: 'en-US' });
  const make = (page: 'client' | 'server') => {
    const fake = fakeSource();
    const columns = createColumnModel<R>([{ id: 'name' }]);
    const model = sourceRows<R>(fake.source as DataSource<R>).create({ getRowId: (r) => r.id, columns, ctx: UTC, abort: fake.abort, operations: { page, filter: 'server', quick: 'server' }, page: { pageSize: 2 } });
    fake.calls[0]!.resolve({ rows: rowsOf(page === 'server' ? ['a', 'b'] : ['a', 'b', 'c']), total: 3 });
    return model;
  };

  it('a fetched set holds every row: all crosses its pages', () => {
    const m = make('client');
    expect(m.displayed.count).toBe(2);
    const r = csvRows(m, 'all', NO_SELECTION)!;
    expect(r.count).toBe(3);
    expect(csvRows(m, 'selected', selectOnly([k('c')]))!.count).toBe(1);
  });

  it('server pages: all and selected are exportAll\'s (null), displayed is the page', () => {
    const m = make('server');
    expect(m.allRows).toBeUndefined();
    expect(csvRows(m, 'all', NO_SELECTION)).toBeNull();
    expect(csvRows(m, 'selected', selectAll())).toBeNull();
    expect(csvRows(m, 'displayed', NO_SELECTION)!.count).toBe(2);
  });
});
