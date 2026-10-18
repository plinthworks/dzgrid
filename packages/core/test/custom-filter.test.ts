import { describe, it, expect } from 'vitest';
import {
  clientRows, createColumnModel, createKernel, localeCtx, makeQuery, NO_OVERLAY,
  type AnyFilterKind, type ColumnDef, type ColumnFilter, type FilterKind, type FilterModel, type GridEvent, type ValueReader,
} from '@dzgrid/core';
import { ColumnCache, compileFilter, createRowStore, filterIndices, filterKindLookup } from '@dzgrid/core/internal';
import { sourceRows, type DataSource } from '@dzgrid/core/server';
import { mulberry32 } from './support/rng.js';

/** docs/behaviors/filter-custom.md */
type Row = { id: string; n?: unknown; d?: unknown; s?: unknown };
const DEFS: ColumnDef<Row>[] = [{ id: 'n', type: 'number' }, { id: 'd', type: 'day' }, { id: 's' }];
const EN = localeCtx({ locale: 'en-US', timeZone: 'UTC' });
const custom = (kind: string, state: unknown): ColumnFilter => ({ type: 'custom', kind, state } as unknown as ColumnFilter);

type Range = { lo: number | null; hi: number | null };
const between: FilterKind<Range, number> = {
  name: 'between',
  types: ['number'],
  read: (s) => {
    const o = s as Range | null;
    return o !== null && typeof o === 'object' && (o.lo === null || typeof o.lo === 'number') && (o.hi === null || typeof o.hi === 'number') ? o : 'invalid';
  },
  active: (s) => s.lo !== null && s.hi !== null,
  test: (s) => (v) => v !== null && v >= s.lo! && v <= s.hi!,
};
const serverOnly: AnyFilterKind = { name: 'server-only', read: (s) => s, active: (s) => s !== null };

function setup(rows: Row[], kinds: readonly AnyFilterKind[] = [between, serverOnly], reader: ValueReader<Row> = NO_OVERLAY) {
  const store = createRowStore<Row>((r) => r.id);
  store.replaceAll(rows);
  const columns = createColumnModel<Row>(DEFS);
  const cache = new ColumnCache<Row>();
  const lookup = filterKindLookup(kinds);
  const env = (ctx = EN) => ({ source: store.snapshot, columns, ctx, reader, cache });
  const run = (model: FilterModel, ctx = EN) => {
    const f = compileFilter(model, env(ctx), lookup.get);
    const order = filterIndices(store.snapshot.count, [f]);
    return { ids: order ? [...order].map((i) => store.snapshot.ids[i]) : [...store.snapshot.ids], problems: f.problems.map((p) => [p.code, p.path, p.detail]) };
  };
  return { store, columns, cache, env, run, lookup };
}

const ROWS: Row[] = [{ id: 'a', n: 1 }, { id: 'b', n: 3 }, { id: 'c', n: 5 }, { id: 'd', n: null }, { id: 'e', n: '7' }];

describe('the filter kind registry', () => {
  it('finds a kind by name; the first of a name wins', () => {
    const other = { ...between };
    const r = filterKindLookup([between, other]);
    expect(r.get('between')).toBe(between);
    expect(r.get('nope')).toBeUndefined();
    expect(r.problems).toEqual([{ code: 'invalid-filter', severity: 'error', path: 'filterKinds[1]', detail: 'duplicate' }]);
  });

  it('refuses an empty name, a dotted one, a built-in one, one that is not a string', () => {
    const named = (name: unknown) => ({ ...serverOnly, name }) as AnyFilterKind;
    const bad = ['', 'a.b', 'text', 'number', 'day', 'instant', 'boolean', 'set', 'custom', 'combined', 5, undefined];
    const r = filterKindLookup([...bad.map(named), serverOnly]);
    expect(r.problems).toEqual(bad.map((_, i) => ({ code: 'invalid-filter', severity: 'error', path: `filterKinds[${i}]`, detail: 'name' })));
    for (const n of ['', 'a.b', 'text', 'combined']) expect(r.get(n)).toBeUndefined();
    expect(r.get('server-only')).toBe(serverOnly);
  });

  it('is empty, with no problem, when no kinds are given', () => {
    expect(filterKindLookup(undefined).problems).toEqual([]);
    expect(filterKindLookup(undefined).get('between')).toBeUndefined();
    expect(filterKindLookup([]).get('between')).toBeUndefined();
  });
});

describe('a custom filter in the browser', () => {
  it('keeps the rows the rule keeps, from the coerced value (blank and unreadable are null)', () => {
    const { run } = setup(ROWS);
    expect(run({ n: custom('between', { lo: 2, hi: 7 }) })).toEqual({ ids: ['b', 'c', 'e'], problems: [] });
  });

  it('tests the state as read: a kind that tidies its state tests the tidy one', () => {
    const ordered: AnyFilterKind = { ...between, name: 'ordered', read: (s) => { const [lo, hi] = s as number[]; return lo! <= hi! ? { lo, hi } : { lo: hi, hi: lo }; } };
    const { run } = setup(ROWS, [ordered]);
    expect(run({ n: custom('ordered', [5, 2]) })).toEqual({ ids: ['b', 'c'], problems: [] });
  });

  it('is inactive, with no problem, for a half-typed state', () => {
    const { run } = setup(ROWS);
    expect(run({ n: custom('between', { lo: 2, hi: null }) })).toEqual({ ids: ['a', 'b', 'c', 'd', 'e'], problems: [] });
  });

  it('refuses with invalid-filter and the wire details: unknown kind, column type, invalid state, threw', () => {
    const boom = () => { throw new Error('no'); };
    const kinds: AnyFilterKind[] = [
      between,
      { name: 'read-boom', read: boom, active: () => true, test: () => () => true },
      { name: 'active-boom', read: (s) => s, active: boom, test: () => () => true },
      { name: 'test-boom', read: (s) => s, active: () => true, test: boom },
    ];
    const { run } = setup(ROWS, kinds);
    const all = ['a', 'b', 'c', 'd', 'e'];
    expect(run({ n: custom('nope', 1) })).toEqual({ ids: all, problems: [['invalid-filter', 'filter.n', 'unknown kind']] });
    expect(run({ n: { type: 'custom', kind: 5, state: 1 } as unknown as ColumnFilter })).toEqual({ ids: all, problems: [['invalid-filter', 'filter.n', 'unknown kind']] });
    expect(run({ s: custom('between', { lo: 1, hi: 2 }) })).toEqual({ ids: all, problems: [['invalid-filter', 'filter.s', 'column type']] });
    expect(run({ n: custom('between', { lo: '1', hi: 2 }) })).toEqual({ ids: all, problems: [['invalid-filter', 'filter.n', 'invalid state']] });
    for (const k of ['read-boom', 'active-boom', 'test-boom']) expect(run({ n: custom(k, 1) }), k).toEqual({ ids: all, problems: [['invalid-filter', 'filter.n', 'threw']] });
  });

  it('a kind that is not a string is unknown, whatever the lookup answers', () => {
    const { env } = setup(ROWS);
    const f = compileFilter({ n: { type: 'custom', kind: 5, state: 1 } as unknown as ColumnFilter }, env(), () => serverOnly);
    expect(f.problems.map((p) => [p.code, p.detail])).toEqual([['invalid-filter', 'unknown kind']]);
  });

  it('is unknown without a registry', () => {
    const { store, env } = setup(ROWS);
    const f = compileFilter({ n: custom('between', { lo: 1, hi: 2 }) }, env());
    expect(f.active).toBe(false);
    expect(f.problems).toEqual([{ code: 'invalid-filter', severity: 'error', path: 'filter.n', detail: 'unknown kind' }]);
    void store;
  });

  it('a kind with no test: filter-needs-server with the kind as detail; never for an inactive state', () => {
    const { run } = setup(ROWS);
    expect(run({ n: custom('server-only', 1) })).toEqual({ ids: ['a', 'b', 'c', 'd', 'e'], problems: [['filter-needs-server', 'filter.n', 'server-only']] });
    expect(run({ n: custom('server-only', null) })).toEqual({ ids: ['a', 'b', 'c', 'd', 'e'], problems: [] });
  });

  it('a rule that throws on rows: those rows are not kept, the problem said once', () => {
    let calls = 0;
    const flaky: AnyFilterKind = { name: 'flaky', read: (s) => s, active: () => true, test: () => (v) => { calls++; if (v === 3 || v === null) throw new Error('row'); return true; } };
    const { run } = setup([...ROWS, { id: 'f', n: 3 }], [flaky]);
    expect(run({ n: custom('flaky', 0) })).toEqual({ ids: ['a', 'c', 'e'], problems: [['invalid-filter', 'filter.n', 'threw']] });
    expect(calls).toBe(6);
  });

  it('passes the context to test, the value as the codec reads it and the host row', () => {
    const seen: unknown[] = [];
    const rows: Row[] = [{ id: 'a', d: '2026-03-05' }, { id: 'b', d: '' }];
    const spy: AnyFilterKind = { name: 'spy', types: ['day'], read: (s) => s, active: () => true, test: (s, ctx) => { seen.push(s, ctx.locale); return (v, row) => (seen.push(v, row), true); } };
    const { run } = setup(rows, [spy]);
    run({ d: custom('spy', { at: 1 }) });
    expect(seen).toEqual([{ at: 1 }, 'en-US', '2026-03-05', rows[0], null, rows[1]]);
  });

  it('reads the values through the edit overlay; the row given is the base row', () => {
    const rows: Row[] = [{ id: 'a', n: 1 }, { id: 'b', n: 9 }];
    const reader: ValueReader<Row> = { version: 1, overlay: true, value: (col, row, id) => (id === 'a' ? 4 : col.read(row)) };
    const got: unknown[] = [];
    const spy: AnyFilterKind = { name: 'spy', read: (s) => s, active: () => true, test: () => (v, row) => (got.push(v, row), v === 4) };
    const { run } = setup(rows, [spy], reader);
    expect(run({ n: custom('spy', 1) }).ids).toEqual(['a']);
    expect(got).toEqual([4, rows[0], 9, rows[1]]);
  });

  it('works inside a combined filter, and a server-only kind there drops the whole filter', () => {
    const { run } = setup(ROWS);
    const or = { type: 'combined', join: 'or', conditions: [custom('between', { lo: 1, hi: 1 }), { type: 'number', op: 'equals', value: 5 }] } as ColumnFilter;
    expect(run({ n: or })).toEqual({ ids: ['a', 'c'], problems: [] });
    const and = { type: 'combined', join: 'and', conditions: [{ type: 'number', op: 'gt', value: 2 }, custom('server-only', 1)] } as ColumnFilter;
    expect(run({ n: and })).toEqual({ ids: ['a', 'b', 'c', 'd', 'e'], problems: [['filter-needs-server', 'filter.n.conditions[1]', 'server-only']] });
  });
});

describe('ColumnCache.values', () => {
  it('one coerced value per row, built once per generation, reader and language', () => {
    const { cache, env, columns } = setup(ROWS);
    const n = columns.get('n')!;
    const v = cache.values(n, env());
    expect(v).toEqual([1, 3, 5, null, 7]);
    expect(cache.values(n, env())).toBe(v);
    expect(cache.stats.valueBuilds).toBe(1);
    // A filter compiled again reads the same array.
    compileFilter({ n: custom('between', { lo: 1, hi: 2 }) }, env(), filterKindLookup([between]).get);
    expect(cache.stats.valueBuilds).toBe(1);
    cache.values(n, env(localeCtx({ locale: 'fr-FR', timeZone: 'UTC' })));
    expect(cache.stats.valueBuilds).toBe(2);
    cache.invalidateAll();
    cache.values(n, env());
    expect(cache.stats.valueBuilds).toBe(3);
  });

  it('kept apart from the export texts of the same column', () => {
    const { cache, env, columns } = setup(ROWS);
    const n = columns.get('n')!;
    expect(cache.exports(n, env())).toEqual(['1', '3', '5', null, '7']);
    expect(cache.values(n, env())).toEqual([1, 3, 5, null, 7]);
    expect(cache.exports(n, env())).toEqual(['1', '3', '5', null, '7']);
  });

  it('an update of some rows patches the values (as values, not texts), equal to a rebuild', () => {
    const { store, cache, env, columns } = setup(ROWS);
    const n = columns.get('n')!;
    cache.values(n, env());
    cache.exports(n, env());
    store.apply({ update: [{ id: 'b', n: 8 }, { id: 'd', n: 2 }] });
    cache.patch(store.lastDelta, store.snapshot, () => ({ columns, ctx: EN, reader: NO_OVERLAY }));
    expect(cache.values(n, env())).toEqual([1, 8, 5, 2, 7]);
    expect(cache.exports(n, env())).toEqual(['1', '8', '5', '2', '7']);
    // Patched, not rebuilt.
    expect(cache.stats.valueBuilds).toBe(1);
    expect(cache.stats.exportBuilds).toBe(1);
    expect(cache.values(n, env())).toEqual(new ColumnCache<Row>().values(n, env()));
  });

  it('random update transactions: values after the patches equal a cold build (seeded)', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const r = mulberry32(seed);
      const pick = () => [1, 2.5, null, '', '4', 'x', -3][Math.floor(r() * 7)];
      const rows: Row[] = Array.from({ length: 30 }, (_, i) => ({ id: String(i), n: pick(), d: r() < 0.5 ? '2026-03-05' : null }));
      const { store, cache, env, columns } = setup(rows);
      const cols = [columns.get('n')!, columns.get('d')!];
      for (const c of cols) cache.values(c, env());
      for (let step = 0; step < 8; step++) {
        const update = Array.from({ length: 1 + Math.floor(r() * 4) }, () => ({ id: String(Math.floor(r() * 30)), n: pick(), d: r() < 0.5 ? '2026-12-31' : '' }));
        store.apply({ update: [...new Map(update.map((u) => [u.id, u])).values()] });
        cache.patch(store.lastDelta, store.snapshot, () => ({ columns, ctx: EN, reader: NO_OVERLAY }));
        for (const c of cols) expect(cache.values(c, env()), `seed ${seed} step ${step} ${c.id}`).toEqual(new ColumnCache<Row>().values(c, env()));
      }
      expect(cache.stats.valueBuilds, `seed ${seed}`).toBe(2);
    }
  });
});

describe('the client model with filter kinds', () => {
  const model = (kinds: readonly AnyFilterKind[] = [between, serverOnly]) =>
    clientRows<Row>({ rows: ROWS, getRowId: (r) => r.id, columns: createColumnModel<Row>(DEFS), ctx: EN, filterKinds: filterKindLookup(kinds).get });

  it('filters with them, and still after an update transaction', () => {
    const m = model();
    m.setQuery(makeQuery({ filter: { n: custom('between', { lo: 2, hi: 5 }) } }));
    expect(m.counts.filtered).toBe(2);
    m.applyTransaction({ update: [{ id: 'a', n: 4 }] });
    expect(m.counts.filtered).toBe(3);
    m.applyTransaction({ update: [{ id: 'a', n: 4.5 }] });
    expect(m.counts.filtered).toBe(3);
    expect(m.problems).toEqual([]);
  });

  it('a sort change neither filters again nor rebuilds the values', () => {
    let built = 0;
    const counting: AnyFilterKind = { ...between, name: 'counting', test: (s, ctx) => (built++, between.test!(s, ctx)) };
    const m = model([counting]);
    m.setQuery(makeQuery({ filter: { n: custom('counting', { lo: 2, hi: 5 }) } }));
    const runs = m.diagnostics.filterRuns;
    m.setQuery(makeQuery({ filter: { n: custom('counting', { lo: 2, hi: 5 }) }, sort: [{ column: 'n', dir: 'desc' }] }));
    expect(m.diagnostics.filterRuns).toBe(runs);
    expect(built).toBe(1);
  });

  it('tells a new filter problem once, in the change', () => {
    const m = model();
    const told: unknown[] = [];
    m.subscribe((c) => told.push(c.told?.map((p) => p.code) ?? null));
    m.setQuery(makeQuery({ filter: { n: custom('server-only', 1) } }));
    m.setQuery(makeQuery({ filter: { n: custom('server-only', 2) } }));
    m.setQuery(makeQuery({ filter: {} }));
    m.setQuery(makeQuery({ filter: { n: custom('nope', 1) } }));
    // Same code and path, another reason: told again.
    m.setQuery(makeQuery({ filter: { n: custom('between', { lo: 'x', hi: 1 }) } }));
    // One change per query: only the first, and a new problem, are told.
    expect(told).toEqual([['filter-needs-server'], null, null, ['invalid-filter'], ['invalid-filter']]);
  });
});

describe('the kernel', () => {
  const kernel = (kinds: readonly AnyFilterKind[] = [between, serverOnly]) => {
    const columns = createColumnModel<Row>(DEFS);
    const rows = clientRows<Row>({ rows: ROWS, getRowId: (r) => r.id, columns, ctx: EN, filterKinds: filterKindLookup(kinds).get });
    const k = createKernel<Row>({ rows, columns });
    const events: GridEvent<Row>[] = [];
    k.subscribe((e) => events.push(e));
    return { k, events };
  };

  it('tells exactly one problems event per filter command a server-only kind cannot run', () => {
    const { k, events } = kernel();
    expect(k.dispatch({ type: 'filter.column', column: 'n', filter: custom('server-only', 1) }, 'user')).toEqual({ ok: true });
    const told = events.filter((e) => e.type === 'problems');
    expect(told).toEqual([{ type: 'problems', source: 'user', problems: [{ code: 'filter-needs-server', severity: 'error', path: 'filter.n', detail: 'server-only' }] }]);
    expect(events.map((e) => e.type)).toEqual(['modelUpdated', 'problems', 'filterChanged']);
  });

  it('refuses a custom state that is not JSON, keeping the filter in force', () => {
    const { k, events } = kernel();
    k.dispatch({ type: 'filter.column', column: 'n', filter: custom('between', { lo: 2, hi: 5 }) }, 'user');
    const before = k.query;
    events.length = 0;
    const cyclic: Record<string, unknown> = { lo: 1 };
    cyclic.self = cyclic;
    const refused = { ok: false, reason: 'invalid-filter', problems: [{ code: 'invalid-filter', severity: 'error', path: 'filter.n', detail: 'not json' }] };
    expect(k.dispatch({ type: 'filter.column', column: 'n', filter: custom('between', cyclic) }, 'user')).toEqual(refused);
    expect(k.dispatch({ type: 'filter.column', column: 'n', filter: custom('between', 10n) }, 'user')).toEqual(refused);
    expect(k.dispatch({ type: 'filter.set', filter: { s: { type: 'text', op: 'contains', value: 'a' }, n: custom('between', { f: () => 1 }) } }, 'user')).toEqual(refused);
    const nested = { type: 'combined', join: 'or', conditions: [{ type: 'number', op: 'gt', value: 1 }, custom('between', cyclic)] } as ColumnFilter;
    expect(k.dispatch({ type: 'filter.column', column: 'n', filter: nested }, 'user')).toEqual({ ...refused, problems: [{ ...refused.problems[0], path: 'filter.n.conditions[1]' }] });
    expect(k.query).toBe(before);
    expect(events).toEqual([]);
    // Built-in filters with an undefined field are not custom states: accepted as before.
    expect(k.dispatch({ type: 'filter.set', filter: { n: { type: 'number', op: 'equals', value: undefined } as ColumnFilter } }, 'user')).toEqual({ ok: true });
    expect(k.dispatch({ type: 'filter.column', column: 'n', filter: custom('between', { lo: 1, hi: [2, null] }) }, 'user')).toEqual({ ok: true });
  });
});

describe('a fetched set filtered in the browser', () => {
  it('takes the grid kinds into its browser model', () => {
    const data: DataSource<Row> = { fetch: () => ({ rows: ROWS }) };
    const m = sourceRows(data).create({
      getRowId: (r) => r.id, columns: createColumnModel<Row>(DEFS), ctx: EN, operations: { page: 'off' }, filterKinds: filterKindLookup([between]).get,
    });
    m.setQuery(makeQuery({ filter: { n: custom('between', { lo: 2, hi: 5 }) } }));
    expect(m.counts.filtered).toBe(2);
    expect(m.problems).toEqual([]);
  });

  it('tells a filter its browser part refuses, with the call', () => {
    const data: DataSource<Row> = { fetch: () => ({ rows: ROWS }) };
    const m = sourceRows(data).create({ getRowId: (r) => r.id, columns: createColumnModel<Row>(DEFS), ctx: EN, operations: { page: 'off' }, filterKinds: filterKindLookup([serverOnly]).get });
    const told: unknown[] = [];
    m.subscribe((c) => told.push(c.told?.map((p) => [p.code, p.path])));
    m.setQuery(makeQuery({ filter: { n: custom('server-only', 1) } }));
    expect(told).toEqual([[['filter-needs-server', 'filter.n']]]);
  });
});
