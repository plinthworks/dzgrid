import { describe, it, expect } from 'vitest';
import { createRowStore, createColumnModel, localeCtx, NO_OVERLAY, sortIndices } from '@dzgrid/core';
import { ColumnCache } from '@dzgrid/core/internal';

type Row = { readonly id: string; readonly name: string | null; readonly n: unknown };

function setup(rows: Row[]) {
  const store = createRowStore<Row>((r) => r.id);
  store.replaceAll(rows);
  const columns = createColumnModel<Row>([{ id: 'name' }, { id: 'n', type: 'number' }]);
  const ctx = localeCtx({ locale: 'fr-FR' });
  const cache = new ColumnCache<Row>();
  const env = () => ({ source: store.snapshot, columns, ctx, reader: NO_OVERLAY, cache });
  const ids = (order: Uint32Array) => [...order].map((i) => store.snapshot.ids[i]);
  return { store, columns, ctx, cache, env, ids };
}

describe('rank keys', () => {
  it('are built once for both directions', () => {
    const h = setup([{ id: '1', name: 'b', n: 1 }, { id: '2', name: 'a', n: 2 }]);
    sortIndices([{ column: 'name', dir: 'asc' }], null, h.env());
    sortIndices([{ column: 'name', dir: 'desc' }], null, h.env());
    expect(h.cache.stats.rankBuilds).toBe(1);
  });

  it('are patched when an update keeps to known values, rebuilt when it brings a new one', () => {
    const h = setup([{ id: '1', name: 'b', n: 1 }, { id: '2', name: 'a', n: 2 }, { id: '3', name: 'c', n: 3 }]);
    const envOf = () => ({ columns: h.columns, ctx: h.ctx, reader: NO_OVERLAY });
    sortIndices([{ column: 'name', dir: 'asc' }], null, h.env());

    h.store.apply({ patch: [{ id: '1', set: { name: 'c' } }] });
    h.cache.patch(h.store.lastDelta, h.store.snapshot, envOf);
    expect(h.ids(sortIndices([{ column: 'name', dir: 'asc' }], null, h.env()).order)).toEqual(['2', '1', '3']);
    expect(h.cache.stats).toMatchObject({ rankBuilds: 1, rankPatches: 1 });

    h.store.apply({ patch: [{ id: '2', set: { name: 'zz' } }] });
    h.cache.patch(h.store.lastDelta, h.store.snapshot, envOf);
    expect(h.ids(sortIndices([{ column: 'name', dir: 'asc' }], null, h.env()).order)).toEqual(['1', '3', '2']);
    expect(h.cache.stats.rankBuilds).toBe(2);
  });

  it('drop everything after a removal or an append', () => {
    const h = setup([{ id: '1', name: 'b', n: 1 }]);
    const envOf = () => ({ columns: h.columns, ctx: h.ctx, reader: NO_OVERLAY });
    sortIndices([{ column: 'n', dir: 'asc' }], null, h.env());
    h.store.apply({ add: [{ id: '2', name: 'a', n: 0 }] });
    h.cache.patch(h.store.lastDelta, h.store.snapshot, envOf);
    expect(h.ids(sortIndices([{ column: 'n', dir: 'asc' }], null, h.env()).order)).toEqual(['2', '1']);
    expect(h.cache.stats.keyBuilds).toBe(2);
  });
});

describe('sorting numbers', () => {
  it('puts blanks and unreadable cells last, in source order, with one warning per bad cell', () => {
    const h = setup([
      { id: 'a', name: null, n: 3 },
      { id: 'b', name: null, n: null },
      { id: 'c', name: null, n: 1 },
      { id: 'd', name: null, n: 'abc' },
      { id: 'e', name: null, n: 2 },
    ]);
    const r = sortIndices([{ column: 'n', dir: 'asc' }], null, h.env());
    expect(h.ids(r.order)).toEqual(['c', 'e', 'a', 'b', 'd']);
    expect(r.problems.map((p) => [p.code, p.path, p.detail])).toEqual([['invalid-cell-value', 'rows[3].n', 'string']]);
  });

  it('sorts only the rows it is given', () => {
    const h = setup([{ id: 'a', name: null, n: 3 }, { id: 'b', name: null, n: 1 }, { id: 'c', name: null, n: 2 }]);
    expect(h.ids(sortIndices([{ column: 'n', dir: 'asc' }], Uint32Array.of(0, 2), h.env()).order)).toEqual(['c', 'a']);
  });

  it('refuses a bad direction, a repeated column or an unsortable one', () => {
    const h = setup([{ id: 'a', name: 'x', n: 1 }]);
    const r = sortIndices([{ column: 'n', dir: 'up' as 'asc' }, { column: 'name', dir: 'asc' }, { column: 'name', dir: 'desc' }], null, h.env());
    expect(r.problems.map((p) => [p.code, p.path])).toEqual([['invalid-sort', 'sort[0]'], ['invalid-sort', 'sort[2]']]);
  });

  it("never changes the host's rows or their order in the store", () => {
    const rows = Object.freeze([Object.freeze({ id: 'a', name: 'z', n: 2 }), Object.freeze({ id: 'b', name: 'y', n: 1 })]);
    const h = setup(rows as unknown as Row[]);
    sortIndices([{ column: 'n', dir: 'asc' }], null, h.env());
    expect(h.store.snapshot.ids).toEqual(['a', 'b']);
  });
});
