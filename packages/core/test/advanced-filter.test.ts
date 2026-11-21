// The advanced filter's model (docs/behaviors/advanced-filter.md 1–8): one expression of AND / OR groups across
// columns, under the filter model's key '', evaluated by the core, sent to a server in its wire form, kept by the
// kernel as plain data, saved and restored. Expectations written by hand.
import { describe, it, expect } from 'vitest';
import { advancedOf, clientRows, setAdvanced, createColumnModel, createKernel, localeCtx, makeQuery, NO_OVERLAY, withAdvanced, type FilterExpression, type FilterModel } from '@dzgrid/core';
import { createRowStore, compileFilter, filterIndices, ColumnCache } from '@dzgrid/core/internal';
import { sourceRows, toWire, type DataSource } from '@dzgrid/core/server';
import { infiniteRows } from '@dzgrid/core/infinite';
import { serverSideRows } from '@dzgrid/core/server-side';
import { fakeSource } from './support/fake-source.js';
import { captureState, restoreState } from '@dzgrid/core/state';

type Row = { id: string; status: string | null; n: number | null; d: string | null; ok: boolean | null };
const ROWS: Row[] = [
  { id: '1', status: 'Erreur', n: 5, d: '2026-11-03', ok: true },
  { id: '2', status: 'Alerte', n: 1, d: '2026-10-20', ok: false },
  { id: '3', status: 'OK', n: 9, d: '2026-11-10', ok: true },
  { id: '4', status: 'Alerte', n: 7, d: '2026-11-02', ok: null },
  { id: '5', status: null, n: null, d: null, ok: false },
];
const COLS = [{ id: 'status' }, { id: 'n', type: 'number' as const }, { id: 'd', type: 'day' as const }, { id: 'ok', type: 'boolean' as const }, { id: 'x', filter: false as const }];

function setup(rows: Row[] = ROWS) {
  const store = createRowStore<Row>((r) => r.id);
  store.replaceAll(rows);
  const columns = createColumnModel<Row>(COLS);
  const cache = new ColumnCache<Row>();
  const ctx = localeCtx({ locale: 'fr-FR', timeZone: 'Europe/Paris' });
  const env = () => ({ source: store.snapshot, columns, ctx, reader: NO_OVERLAY, cache });
  const run = (m: FilterModel) => {
    const f = compileFilter(m, env());
    const o = filterIndices(store.snapshot.count, [f]);
    return { ids: o ? [...o].map((i) => store.snapshot.ids[i]!) : [...store.snapshot.ids], problems: f.problems.map((p) => [p.code, p.path]), applied: f.applied };
  };
  return { columns, ctx, run };
}

const eq = (column: string, value: string): FilterExpression => ({ column, filter: { type: 'text', op: 'equals', value } });
/** `(status = Erreur OR status = Alerte) AND d >= 2026-11-01`, the owner's example. */
const EXAMPLE: FilterExpression = {
  join: 'and',
  items: [
    { join: 'or', items: [eq('status', 'Erreur'), eq('status', 'Alerte')] },
    { column: 'd', filter: { type: 'day', op: 'gte', value: '2026-11-01' } },
  ],
};
const adv = (expression: FilterExpression): FilterModel => ({ '': { type: 'advanced', expression } });

describe('evaluation (advanced-filter.md 1, 4)', () => {
  it('nested AND / OR groups across columns', () => {
    expect(setup().run(adv(EXAMPLE)).ids).toEqual(['1', '4']);
  });

  it('a single condition at the root, every column type', () => {
    const h = setup();
    expect(h.run(adv({ column: 'n', filter: { type: 'number', op: 'gt', value: 5 } })).ids).toEqual(['3', '4']);
    expect(h.run(adv({ column: 'ok', filter: { type: 'boolean', value: false } })).ids).toEqual(['2', '5']);
    expect(h.run(adv({ column: 'status', filter: { type: 'set', include: ['OK'], blanks: 'include' } })).ids).toEqual(['3', '5']);
    expect(h.run(adv({ column: 'status', filter: { type: 'combined', join: 'or', conditions: [{ type: 'text', op: 'startsWith', value: 'al' }, { type: 'text', op: 'blank' }] } })).ids).toEqual(['2', '4', '5']);
  });

  it('an OR group with nothing live, a half-typed condition: left out, no problem', () => {
    const h = setup();
    const r = h.run(adv({ join: 'and', items: [{ join: 'or', items: [{ column: 'status', filter: { type: 'text', op: 'contains', value: '' } }] }, eq('status', 'OK')] }));
    expect(r.ids).toEqual(['3']);
    expect(r.problems).toEqual([]);
    expect(r.applied).toEqual({ '': { type: 'advanced', expression: { join: 'and', items: [eq('status', 'OK')] } } });
  });

  it('nothing live at all: no filter, nothing applied', () => {
    const r = setup().run(adv({ join: 'or', items: [] }));
    expect(r.ids).toHaveLength(5);
    expect(r.applied).toEqual({});
  });

  it('AND with the column filters (3)', () => {
    expect(setup().run({ ...adv(EXAMPLE), n: { type: 'number', op: 'lt', value: 6 } }).ids).toEqual(['1']);
  });
});

describe('bad input never throws (advanced-filter.md 5)', () => {
  const cases: [string, FilterExpression | unknown, [string, string][]][] = [
    ['unknown column', { join: 'and', items: [eq('status', 'OK'), eq('nope', 'a')] }, [['unknown-column', 'advancedFilter.items[1].column']]],
    ['a column that does not filter', eq('x', 'a'), [['invalid-filter', 'advancedFilter']]],
    ['a filter the type cannot take', { column: 'n', filter: { type: 'day', op: 'equals', value: '2026-01-01' } }, [['invalid-filter', 'advancedFilter.filter']]],
    ['a bad value', { join: 'or', items: [{ column: 'n', filter: { type: 'number', op: 'gt', value: 'x' } }] }, [['invalid-filter', 'advancedFilter.items[0].filter.value']]],
    ['a bad day', { column: 'd', filter: { type: 'day', op: 'gt', value: '2026-13-01' } }, [['invalid-day', 'advancedFilter.filter.value']]],
    ['a bad join', { join: 'xor', items: [eq('status', 'OK')] }, [['invalid-filter', 'advancedFilter']]],
    ['neither group nor condition', { join: 'and', items: [42] }, [['invalid-filter', 'advancedFilter.items[0]']]],
    ['not an object', null, [['invalid-filter', 'advancedFilter']]],
  ];
  for (const [what, e, problems] of cases) {
    it(`${what}: the whole expression does not apply, told with its path; column filters still apply`, () => {
      const r = setup().run({ ...adv(e as FilterExpression), n: { type: 'number', op: 'gte', value: 5 } });
      expect(r.ids).toEqual(['1', '3', '4']);
      expect(r.problems).toEqual(problems);
    });
  }

  it('groups nest 5 deep at most', () => {
    const nest = (d: number): FilterExpression => (d === 1 ? eq('status', 'OK') : { join: 'and', items: [nest(d - 1)] });
    expect(setup().run(adv(nest(6))).ids).toEqual(['3']); // 5 groups, then the condition
    const r = setup().run(adv(nest(7)));
    expect(r.ids).toHaveLength(5);
    expect(r.problems).toEqual([['invalid-filter', 'advancedFilter.items[0].items[0].items[0].items[0].items[0]']]);
  });

  it("an 'advanced' filter under a column id is refused; under '' only 'advanced' is taken", () => {
    const r = setup().run({ status: { type: 'advanced', expression: eq('status', 'OK') }, '': { type: 'text', op: 'equals', value: 'OK' } } as FilterModel);
    expect(r.ids).toHaveLength(5);
    expect(r.problems).toEqual([['invalid-filter', 'filter.status'], ['invalid-filter', 'advancedFilter']]);
  });
});

describe('helpers (advanced-filter.md 2)', () => {
  it('advancedOf reads it, withAdvanced writes or removes it, the column filters kept', () => {
    const m: FilterModel = { n: { type: 'number', op: 'gt', value: 1 } };
    const w = withAdvanced(m, EXAMPLE);
    expect(w).toEqual({ n: m['n'], '': { type: 'advanced', expression: EXAMPLE } });
    expect(advancedOf(w)).toBe(EXAMPLE);
    expect(advancedOf(m)).toBeNull();
    expect(advancedOf({ '': { type: 'text', op: 'equals', value: 'a' } })).toBeNull();
    expect(withAdvanced(w, null)).toEqual(m);
    expect(m).toEqual({ n: { type: 'number', op: 'gt', value: 1 } });
  });
});

describe('the wire form (advanced-filter.md 6)', () => {
  it('each condition in its wire form, half-typed and empty groups dropped', () => {
    const h = setup();
    const e: FilterExpression = {
      join: 'and',
      items: [
        { join: 'or', items: [eq('status', 'Erreur'), { column: 'status', filter: { type: 'text', op: 'contains', value: '' } }] },
        { join: 'or', items: [] },
        { column: 'd', filter: { type: 'day', op: 'between', value: '2026-11-30', valueTo: '2026-11-01' } },
      ],
    };
    const w = toWire({ ...adv(e), n: { type: 'number', op: 'gt', value: 1 } }, { ctx: h.ctx, columns: h.columns });
    expect(w.problems).toEqual([]);
    expect(w.filter).toEqual({
      n: { type: 'number', op: 'gt', value: 1 },
      '': { type: 'advanced', expression: { join: 'and', items: [{ join: 'or', items: [eq('status', 'Erreur')] }, { column: 'd', filter: { type: 'day', op: 'between', value: '2026-11-01', valueTo: '2026-11-30' } }] } },
    });
  });

  it('a bad condition drops the expression with the same codes and paths as the browser', () => {
    const h = setup();
    const w = toWire(adv({ join: 'and', items: [eq('status', 'OK'), eq('nope', 'a')] }), { ctx: h.ctx, columns: h.columns });
    expect(w.filter).toEqual({});
    expect(w.problems.map((p) => [p.code, p.path])).toEqual([['unknown-column', 'advancedFilter.items[1].column']]);
  });

  it('nothing live: not sent', () => {
    const h = setup();
    expect(toWire(adv({ join: 'and', items: [] }), { ctx: h.ctx, columns: h.columns }).filter).toEqual({});
  });
});

describe('the three server sources (advanced-filter.md 6, 7)', () => {
  for (const [name, make] of [['sourceRows', sourceRows], ['infiniteRows', infiniteRows], ['serverSideRows', serverSideRows]] as const) {
    it(`${name}: the rows request carries it in its wire form, a value-list request leaves it out`, () => {
      const fake = fakeSource({ values: true });
      const columns = createColumnModel<Row>(COLS);
      const model = (make as typeof sourceRows)<Row>(fake.source as DataSource<Row>).create({ getRowId: (r) => r.id, columns, ctx: localeCtx({ locale: 'en-US' }), abort: fake.abort });
      model.setQuery(makeQuery({ filter: { ...adv(EXAMPLE), n: { type: 'number', op: 'gt', value: 1 } } }));
      const last = fake.calls[fake.calls.length - 1]!.req as { filter?: unknown };
      expect(last.filter).toEqual({ n: { type: 'number', op: 'gt', value: 1 }, '': { type: 'advanced', expression: EXAMPLE } });
      model.setValues!('status');
      expect((fake.valueCalls[0]!.req as { filter?: unknown }).filter).toEqual({ n: { type: 'number', op: 'gt', value: 1 } });
    });
  }
});

describe('the kernel, the client model and the state (advanced-filter.md 2, 5, 7, 8)', () => {
  const grid = () => {
    const columns = createColumnModel<Row>(COLS);
    const rows = clientRows<Row>({ rows: ROWS, getRowId: (r) => r.id, columns, ctx: localeCtx({ locale: 'fr-FR' }) });
    return createKernel<Row>({ rows, columns });
  };
  const shown = (k: ReturnType<typeof grid>) => Array.from({ length: k.rows.displayed.count }, (_, i) => String((k.rows.displayed.nodeAt(k.rows.displayed.index(i)!) as { id: unknown }).id));

  it('filter.set keeps it as a copy, filters with it, and says filterChanged', () => {
    const k = grid();
    const seen: unknown[] = [];
    k.subscribe((e) => void (e.type === 'filterChanged' && seen.push(e.filter)));
    const e: { join: 'and'; items: FilterExpression[] } = structuredClone(EXAMPLE) as { join: 'and'; items: FilterExpression[] };
    expect(k.dispatch({ type: 'filter.set', filter: adv(e) }, 'api').ok).toBe(true);
    e.items.length = 0;
    expect(shown(k)).toEqual(['1', '4']);
    expect(advancedOf(k.query.filter)).toEqual(EXAMPLE);
    expect(seen).toHaveLength(1);
  });

  it('setAdvanced writes it on a grid (null removes it), the column filters kept, and says what filter.set answers', () => {
    const k = grid();
    k.dispatch({ type: 'filter.column', column: 'n', filter: { type: 'number', op: 'gt', value: 1 } }, 'api');
    const sources: string[] = [];
    k.subscribe((e) => void (e.type === 'filterChanged' && sources.push(e.source)));
    expect(setAdvanced(k, eq('status', 'Alerte'), 'user')).toBe(true);
    expect(shown(k)).toEqual(['4']);
    expect(setAdvanced(k, null)).toBe(true);
    expect(k.query.filter).toEqual({ n: { type: 'number', op: 'gt', value: 1 } });
    expect(sources).toEqual(['user', 'api']);
  });

  it('a cycle or a BigInt is refused, the filter in force stays', () => {
    const k = grid();
    k.dispatch({ type: 'filter.set', filter: adv(EXAMPLE) }, 'api');
    const cyc: Record<string, unknown> = { join: 'and', items: [] };
    (cyc['items'] as unknown[]).push(cyc);
    for (const bad of [cyc, { column: 'n', filter: { type: 'number', op: 'gt', value: 1n } }]) {
      const r = k.dispatch({ type: 'filter.set', filter: adv(bad as never) }, 'api'); // a cycle and a BigInt are what is tested
      expect(r.ok).toBe(false);
      expect(!r.ok && r.problems.map((p) => [p.code, p.path, p.detail])).toEqual([['invalid-filter', 'filter.', 'not json']]);
      expect(shown(k)).toEqual(['1', '4']);
    }
  });

  it('a value list ignores it (7), but counts the column filters', () => {
    const k = grid();
    k.dispatch({ type: 'filter.set', filter: { ...adv(eq('status', 'Erreur')), n: { type: 'number', op: 'gte', value: 5 } } }, 'api');
    const h = k.values('status');
    expect(h.result!.values.map((v) => [v.value, v.count])).toEqual([['Erreur', 1], ['OK', 1], ['Alerte', 1]].sort((a, b) => String(a[0]).localeCompare(String(b[0]), 'fr')));
    h.close();
  });

  it('an edit of a column the expression reads filters again', () => {
    const k = grid();
    k.dispatch({ type: 'filter.set', filter: adv(eq('status', 'OK')) }, 'api');
    expect(shown(k)).toEqual(['3']);
    (k.rows as unknown as { applyTransaction(t: object): void }).applyTransaction({ update: [{ ...ROWS[1]!, status: 'OK' }] }); // the client model's live API, not on RowModel
    expect(shown(k)).toEqual(['2', '3']);
  });

  it('an edit kept in the overlay on a column only the expression reads makes the order stale (K.14)', () => {
    const columns = createColumnModel<Row>(COLS);
    const m = clientRows<Row>({ rows: ROWS, getRowId: (r) => r.id, columns, ctx: localeCtx({ locale: 'fr-FR' }) });
    m.setQuery(makeQuery({ filter: adv(eq('status', 'OK')) }));
    m.setReader({ version: 1, overlay: true, value: (col, row) => col.read(row) }, ['status']);
    expect(m.orderStale).toBe(true);
  });

  it('the state saves and restores it; a removed column is told when it filters', () => {
    const k = grid();
    k.dispatch({ type: 'filter.set', filter: adv(EXAMPLE) }, 'api');
    const s = captureState(k);
    expect(s.filter).toEqual(adv(EXAMPLE));
    const k2 = grid();
    expect(restoreState(k2, JSON.parse(JSON.stringify(s)))).toEqual([]);
    expect(shown(k2)).toEqual(['1', '4']);
  });
});
