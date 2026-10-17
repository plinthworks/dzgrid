import { describe, it, expect } from 'vitest';
import { createColumnModel, localeCtx, makeQuery, type ColumnDef, type FilterModel } from '@dzgrid/core';
import { sourceRows, type DataSource, type WireKind } from '@dzgrid/core/server';
import { fakeSource, rowsOf } from './support/fake-source.js';

/** Spec: docs/behaviors/server-filter.md, "The request key". */
type R = { id: string; name: string; t?: string; n?: number };

function setup(defs: ColumnDef<R>[], o: { kinds?: Record<string, WireKind>; zone?: string; operations?: 'server' | { page: 'off'; filter: 'server' } } = {}) {
  const fake = fakeSource();
  const columns = createColumnModel<R>(defs);
  const model = sourceRows<R>(fake.source as DataSource<R>).create({
    getRowId: (r) => r.id,
    columns,
    ctx: localeCtx({ locale: 'en-US', timeZone: o.zone ?? 'Africa/Algiers' }),
    abort: fake.abort,
    operations: o.operations ?? 'server',
    page: { pageSize: 2 },
    ...(o.kinds && { filterKinds: (name: string) => o.kinds![name] }),
  });
  return { ...fake, model, columns };
}
const q = (filter: Record<string, unknown>) => makeQuery({ filter: filter as FilterModel });

describe('sourceRows sends the wire form', () => {
  it('computes the wire form once per epoch, not per page', () => {
    let wires = 0;
    const kinds: Record<string, WireKind> = { count: { read: (s) => s, active: () => true, wire: (s) => (wires++, s) } };
    const s = setup([{ id: 'name' }], { kinds });
    s.model.setQuery(q({ name: { type: 'custom', kind: 'count', state: 'x' } }));
    expect(wires).toBe(1);
    expect(s.last().req.filter).toEqual({ name: { type: 'custom', kind: 'count', value: 'x' } });
    s.last().resolve({ rows: rowsOf(['a', 'b']), total: 6 });
    s.model.setPage({ index: 1 });
    s.last().resolve({ rows: rowsOf(['c', 'd']), total: 6 });
    s.model.setPage({ index: 2 });
    s.model.invalidate();
    expect(s.calls.length).toBe(5);
    expect(s.calls.slice(2).map((c) => c.req.filter)).toEqual([0, 0, 0].map(() => ({ name: { type: 'custom', kind: 'count', value: 'x' } })));
    expect(wires).toBe(1);
  });

  it('passes the model’s filter kinds to the wire form; without them a custom filter is refused', () => {
    const kinds: Record<string, WireKind> = { up: { read: (s) => s, active: () => true, wire: (s, ctx, zone) => `${String(s).toUpperCase()}@${zone}` } };
    const s = setup([{ id: 'name' }], { kinds });
    s.model.setQuery(q({ name: { type: 'custom', kind: 'up', state: 'x' } }));
    expect(s.last().req.filter).toEqual({ name: { type: 'custom', kind: 'up', value: 'X@Africa/Algiers' } });
    const bare = setup([{ id: 'name' }]);
    bare.model.setQuery(q({ name: { type: 'custom', kind: 'up', state: 'x' } }));
    expect(bare.calls.length).toBe(1);
    expect(bare.model.problems.map((p) => [p.code, p.path])).toEqual([['invalid-filter', 'filter.name']]);
  });

  it('reads the columns again when they change what can be filtered: asks again only if the wire form moved', () => {
    const s = setup([{ id: 'name' }, { id: 'n', type: 'number' }]);
    s.model.setQuery(q({ name: { type: 'text', op: 'contains', value: 'a' }, n: { type: 'number', op: 'gt', value: 1 } }));
    expect(s.calls.length).toBe(2);
    // A width change: nothing to ask.
    s.columns.apply([{ id: 'name', width: 300 }], 'user');
    s.model.setColumns(s.columns);
    expect(s.calls.length).toBe(2);
    // Hidden: a hidden column still filters, so the wire form is the same.
    s.columns.apply([{ id: 'n', hidden: true }], 'user');
    s.model.setColumns(s.columns);
    expect(s.calls.length).toBe(2);
    // No longer filterable: dropped, reported, asked again without it.
    s.columns.setDefs([{ id: 'name' }, { id: 'n', type: 'number', filter: false }]);
    s.model.setColumns(s.columns);
    expect(s.calls.length).toBe(3);
    expect(s.last().req.filter).toEqual({ name: { type: 'text', op: 'contains', value: 'a' } });
    expect(s.model.problems.map((p) => [p.code, p.path])).toEqual([['invalid-filter', 'filter.n']]);
    // Another column lookup with the same columns: the same wire form, nothing asked.
    s.model.setColumns(createColumnModel<R>([{ id: 'name' }, { id: 'n', type: 'number', filter: false }]));
    expect(s.calls.length).toBe(3);
    // The column gone: unknown-column.
    s.columns.setDefs([{ id: 'n', type: 'number' }]);
    s.model.setColumns(s.columns);
    expect(s.calls.length).toBe(4);
    expect(s.last().req.filter).toEqual({ n: { type: 'number', op: 'gt', value: 1 } });
    expect(s.model.problems.map((p) => [p.code, p.path])).toEqual([['unknown-column', 'filter.name']]);
  });

  it('a column lookup swapped for another that filters differently asks again', () => {
    const s = setup([{ id: 'name' }]);
    s.model.setQuery(q({ name: { type: 'text', op: 'contains', value: 'a' } }));
    expect(s.calls.length).toBe(2);
    // A fresh lookup can start at the same dataVersion: compared by identity too.
    s.model.setColumns(createColumnModel<R>([{ id: 'name', filter: false }]));
    expect(s.calls.length).toBe(3);
    expect(s.last().req.filter).toEqual({});
  });

  it('a language change asks nothing; a zone change asks again even with no instant filter', () => {
    const s = setup([{ id: 'name' }]);
    s.model.setQuery(q({ name: { type: 'text', op: 'contains', value: 'a' } }));
    s.model.setContext(localeCtx({ locale: 'fr-FR', timeZone: 'Africa/Algiers' }));
    expect(s.calls.length).toBe(2);
    s.model.setContext(localeCtx({ locale: 'fr-FR', timeZone: 'Asia/Kolkata' }));
    expect(s.calls.length).toBe(3);
    expect(s.last().req.zone).toBe('Asia/Kolkata');
  });

  it('a refused edit asks nothing, but its problem is reported; fixing it asks', () => {
    const s = setup([{ id: 'name' }, { id: 't', type: 'instant' }]);
    s.model.setQuery(q({ t: { type: 'instant', op: 'before', at: '2026-03-05T10:00' } }));
    expect(s.calls.length).toBe(1);
    expect(s.model.problems.map((p) => [p.code, p.path])).toEqual([['ambiguous-instant', 'filter.t.at']]);
    s.model.setQuery(q({ t: { type: 'instant', op: 'before', at: '2026-03-05T10:00Z' } }));
    expect(s.calls.length).toBe(2);
    expect(s.model.problems).toEqual([]);
    expect(s.last().req.filter).toEqual({ t: { type: 'instant', op: 'before', at: '2026-03-05T10:00Z', resolved: { from: null, to: '2026-03-05T10:00:00.000Z' }, zone: 'Africa/Algiers' } });
    expect(s.last().req.key).toContain('"resolved":{"from":null,"to":"2026-03-05T10:00:00.000Z"}');
  });

  it('counts the total when every filter sent was dropped: the server did not filter', () => {
    const s = setup([{ id: 'name' }]);
    s.model.setQuery(q({ name: { type: 'text', op: 'contains', value: '' } }));
    s.last().resolve({ rows: rowsOf(['a', 'b']), total: 5 });
    expect(s.model.counts).toEqual({ total: 5, filtered: 5, displayed: 2 });
    const f = setup([{ id: 'name' }], { operations: { page: 'off', filter: 'server' } });
    f.model.setQuery(q({ name: { type: 'set', blanks: 'include' } }));
    f.last().resolve({ rows: rowsOf(['a', 'b']) });
    expect(f.model.counts).toMatchObject({ total: 2, filtered: 2 });
  });
});
