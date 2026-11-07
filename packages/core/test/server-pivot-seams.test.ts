import { describe, expect, it } from 'vitest';
import { createColumnModel, localeCtx, makeQuery, type ColumnDef, type ColumnOrGroup, type DisplayIndex, type ModelChange, type RowKey } from '@dzgrid/core';
import { serverSideRows, type ServerSideModel, type ServerSideOptions } from '@dzgrid/core/server-side';
import { pivotShape, type PivotOptions } from '@dzgrid/core/pivot';
import { serverPivot } from '@dzgrid/core/server-pivot';
import { fakeSource, type Call } from './support/fake-source.js';

/**
 * The server pivot's seams (docs/behaviors/server-pivot.md; plan S3, S12, step 2): the model's hooks and the pivot shape's
 * `serve`. Written before the code; expectations by hand. The two dangers of the plan (§7): the created columns set
 * after an answer must ask nothing (the refetch loop), and the pivot shape's changes must reach the model (one epoch).
 */
type Row = { id: string; region: string; city: string; year: number; month: number; amount: number; visits: number };
const COLS: ColumnDef<Row, any>[] = [ // any: the column's value type is not under test
  { id: 'region' },
  { id: 'city' },
  { id: 'year', type: 'number' },
  { id: 'month', type: 'number' },
  { id: 'amount', type: 'number' },
  // A data column with a total of its own that is not a value: it must never reach the request in pivot mode.
  { id: 'visits', type: 'number', aggFunc: 'count' },
];
/** The created column of year 2025 (a number: tag `n`), value `amount`, as the sheet writes ids. */
const Y25 = '~p4:year5:n20256:amount';
const Y26 = '~p4:year5:n20266:amount';

function setup(po: PivotOptions = {}, o: ServerSideOptions = {}, plug = true) {
  const fake = fakeSource();
  const shape = pivotShape<Row>({ by: ['region'], columns: ['year'], values: { amount: 'sum' }, ...po });
  const columns = createColumnModel<Row>(COLS);
  const model = serverSideRows<Row>(fake.source, { blockSize: 10, ...(plug && { pivot: serverPivot() }), ...o }).create({
    getRowId: (r) => r.id,
    columns,
    ctx: localeCtx({ locale: 'en-US' }),
    abort: fake.abort,
    shape,
  }) as ServerSideModel<Row>;
  const changes: ModelChange<Row>[] = [];
  model.subscribe((c) => changes.push(c));
  const d = () => model.displayed as unknown as Required<typeof model.displayed> & { childrenAt(i: DisplayIndex): number; expandedAt(i: DisplayIndex): boolean };
  const shown = () => {
    const v = d();
    return Array.from({ length: v.count }, (_, i) => {
      const n = v.nodeAt(i as DisplayIndex);
      if (n.kind === 'group') return `${n.label}${v.expandedAt(i as DisplayIndex) ? '+' : ''}`;
      if (n.kind === 'footer') return `Σ${n.label}`;
      return n.kind === 'data' ? (n.data as Row).id : '…';
    }).join(' ');
  };
  const node = (label: string) => {
    const v = d();
    for (let i = 0; i < v.count; i++) {
      const n = v.nodeAt(i as DisplayIndex);
      if ((n.kind === 'group' || n.kind === 'footer') && (n.kind === 'footer' && n.group === null ? 'Σ' : n.label) === label) return { n, i: i as DisplayIndex };
    }
    throw new Error(`no row ${label}`);
  };
  /** The root answer: two regions, two years, cells sparse (Sud has nothing in 2026). */
  const root = (c: Call, extra: object = {}) =>
    c.resolve({
      groups: [
        { value: 'Nord', count: 3, aggs: { amount: 30 }, cells: { '0': { amount: 10 }, '1': { amount: 20 } } },
        { value: 'Sud', count: 1, aggs: { amount: 5 }, cells: { '0': { amount: 5 } } },
      ],
      total: 2,
      totals: { amount: 35 },
      pivot: { crossings: [[2025], [2026]], totals: { '0': { amount: 15 }, '1': { amount: 20 } } },
      ...extra,
    });
  const told = () => changes.flatMap((c) => (c.told ?? []).map((p) => `${p.code} ${p.path}${p.detail ? ` ${p.detail}` : ''}`));
  return { fake, shape, columns, model, changes, d, shown, node, root, told };
}

describe('server pivot seams: the request (S2, S3 a)', () => {
  it('the group part carries the pivot part: the pivot columns, the limit; the totals asked are the values', () => {
    const { fake } = setup();
    expect(fake.calls).toHaveLength(1);
    expect(fake.calls[0]!.req.group).toEqual({ by: ['region'], path: [], aggs: [{ column: 'amount', fn: 'sum' }], pivot: { columns: ['year'], limit: 200 } });
  });

  it('two values: the limit is the most crossings the grid takes (200 / 2); a reversed pivot column and sub-totals said', () => {
    const { fake } = setup({ values: { amount: 'sum', visits: 'count' }, columns: ['year', 'month'], desc: ['month'], subtotals: true, maxColumns: 201 });
    expect(fake.calls[0]!.req.group).toEqual({
      by: ['region'], path: [], aggs: [{ column: 'amount', fn: 'sum' }, { column: 'visits', fn: 'count' }],
      pivot: { columns: ['year', 'month'], desc: ['month'], subtotals: true, limit: 100 },
    });
  });

  it('no row column: the part is sent all the same (by: []), and the table is the grand total row alone', () => {
    const { fake, shown, node } = setup({ by: [], footers: 'grand' });
    expect(fake.calls[0]!.req.group).toEqual({ by: [], path: [], aggs: [{ column: 'amount', fn: 'sum' }], pivot: { columns: ['year'], limit: 200 } });
    fake.calls[0]!.resolve({ groups: [], totals: { amount: 35 }, pivot: { crossings: [[2025], [2026]], totals: { '0': { amount: 15 }, '1': { amount: 20 } } } });
    expect(shown()).toBe('Σ');
    expect(node('Σ').n.aggs).toEqual({ amount: 35, [Y25]: 15, [Y26]: 20 });
  });

  it('an open group asks its level with the same pivot part', () => {
    const { fake, model, root, node } = setup({ by: ['region', 'city'] });
    root(fake.calls[0]!);
    model.expand([node('Nord').n.key], true, 'user');
    model.want(0, 20);
    const child = fake.calls.find((c) => c.req.group?.path.length === 1)!;
    expect(child.req.group).toEqual({ by: ['region', 'city'], path: ['Nord'], aggs: [{ column: 'amount', fn: 'sum' }], pivot: { columns: ['year'], limit: 200 } });
  });

  it('pivot off, or both bands empty: no pivot part (the grouping, or the flat rows, as without the plug)', () => {
    expect(setup({ on: false }).fake.calls[0]!.req.group).toEqual({ by: ['region'], path: [], aggs: [{ column: 'visits', fn: 'count' }] });
    expect(setup({ by: [], columns: [] }).fake.calls[0]!.req.group).toBeUndefined();
  });

  it('without the plug: a pivot shape is a grouping on the server, as before (no pivot part)', () => {
    const { fake } = setup({}, {}, false);
    expect(fake.calls[0]!.req.group).toEqual({ by: ['region'], path: [], aggs: [{ column: 'visits', fn: 'count' }] });
  });
});

describe('server pivot seams: the answer (S4, S7)', () => {
  it('the created columns come from the server list; each group carries its cells by created id, an absent one empty', () => {
    const { fake, shape, root, node, model } = setup({ footers: 'grand' });
    root(fake.calls[0]!);
    const ids = (t: readonly ColumnOrGroup<Row>[]): string[] => t.flatMap((n) => ('children' in n ? ids(n.children) : [n.id]));
    expect(ids(shape.generated().columns as ColumnOrGroup<Row>[])).toEqual([Y25, Y26]);
    expect(shape.generated().count).toBe(2);
    expect(node('Nord').n.aggs).toEqual({ amount: 30, [Y25]: 10, [Y26]: 20 });
    expect(node('Sud').n.aggs).toEqual({ amount: 5, [Y25]: 5 });
    expect(node('Σ').n.aggs).toEqual({ amount: 35, [Y25]: 15, [Y26]: 20 });
    expect(shape.valueColumn(Y26)).toBe('amount');
    expect(model.pivot).toBe(true);
  });

  it('the last level holds no rows: no children, never open, never asked (S3 c)', () => {
    const { fake, model, root, node, d } = setup();
    root(fake.calls[0]!);
    const { n, i } = node('Nord');
    expect(d().childrenAt(i)).toBe(0);
    model.expand([n.key], true, 'user');
    model.want(0, 20);
    expect(d().expandedAt(node('Nord').i)).toBe(false);
    expect(fake.calls).toHaveLength(1);
    expect(model.expandable()).toEqual([]);
  });
});

describe('server pivot seams: the refetch loop (plan §7, fact 4)', () => {
  it('the created columns set after the answer, the data columns folded, a column with its own total among them: nothing asked', () => {
    const { fake, shape, columns, model, root } = setup();
    root(fake.calls[0]!);
    // What `dom/pivot` does: the label column, the data columns folded away, the created ones, the values under « Total ».
    const next = createColumnModel<Row>([{ id: '~p:rows', type: 'custom', codec: { kind: 'custom', keyKind: 'text', coerce: () => null, parse: () => null, format: String, sortKey: () => '', compare: () => 0, isEmpty: () => true, equals: () => true, toExport: String } } as never, ...COLS, ...(shape.generated().columns as ColumnOrGroup<Row>[])]); // never: a custom codec of any value
    next.fold(new Set(['region', 'city', 'year', 'month', 'visits']));
    model.setColumns(next);
    model.setColumns(columns);
    model.setColumns(next);
    expect(fake.calls).toHaveLength(1);
  });

  it('the same list in a new epoch: the created columns are the same object (no columns.set, no layout)', () => {
    const { fake, shape, model, root } = setup();
    root(fake.calls[0]!);
    const was = shape.generated();
    expect(was.count).toBe(2);
    model.setQuery(makeQuery({ quick: 'x' }), 'user');
    expect(fake.calls).toHaveLength(2);
    root(fake.calls[1]!);
    expect(shape.generated()).toBe(was);
  });
});

describe('server pivot seams: the shape linked to the model (plan §7, fact 5)', () => {
  const gestures: [string, (s: ReturnType<typeof setup>['shape']) => void, object][] = [
    ['setPivotBy', (s) => s.setPivotBy(['month']), { columns: ['month'], limit: 200 }],
    ['setValueFns', (s) => s.setValueFns({ amount: 'avg' }), { columns: ['year'], limit: 200 }],
    ['set desc', (s) => s.set({ desc: ['year'] }), { columns: ['year'], desc: ['year'], limit: 200 }],
  ];
  for (const [name, act, part] of gestures)
    it(`${name}: one new epoch (one request), the open groups kept, an old answer applied to nothing`, () => {
      const { fake, shape, model, root, node } = setup({ by: ['region', 'city'] });
      root(fake.calls[0]!);
      const nord = node('Nord').n.key;
      model.expand([nord], true, 'user');
      model.want(0, 20);
      const old = fake.calls.length;
      act(shape);
      expect(fake.calls).toHaveLength(old + 1);
      expect(fake.calls.at(-1)!.req.group!.pivot).toEqual(part);
      expect(model.isExpanded(nord)).toBe(true);
      // The child level asked before the change answers late: ignored.
      fake.calls[old - 1]!.resolve({ groups: [{ value: 'Lille', count: 1, aggs: { amount: 1 } }], total: 1 });
      expect(() => node('Lille')).toThrow();
    });

  it('setOn(false): one new epoch, the grouping as without the pivot; setOn(true): another', () => {
    const { fake, shape } = setup();
    shape.setOn(false);
    expect(fake.calls).toHaveLength(2);
    expect(fake.calls[1]!.req.group!.pivot).toBeUndefined();
    shape.setOn(true);
    expect(fake.calls).toHaveLength(3);
    expect(fake.calls[2]!.req.group!.pivot).toEqual({ columns: ['year'], limit: 200 });
  });

  it('several at once (a restored state, with the row grouping, inside hold): one request', () => {
    const { fake, shape, model } = setup();
    model.hold!(() => {
      model.setBy(['city'], 'host');
      shape.set({ columns: ['month'], values: { amount: 'max' }, desc: ['month'] }, 'host');
    });
    expect(fake.calls.length).toBe(2);
    expect(fake.calls[1]!.req.group).toEqual({ by: ['city'], path: [], aggs: [{ column: 'amount', fn: 'max' }], pivot: { columns: ['month'], desc: ['month'], limit: 200 } });
  });
});

describe('server pivot seams: the sort (S9) — no created id on the wire', () => {
  it('a sort on a created column becomes pivot.sort (the typed crossing, its value) and leaves sort; a new epoch', () => {
    const { fake, model, root } = setup();
    root(fake.calls[0]!);
    model.setQuery(makeQuery({ sort: [{ column: Y26, dir: 'desc' }] }), 'user');
    expect(fake.calls).toHaveLength(2);
    const r = fake.calls[1]!.req;
    // No sort left but the created column's: sent as « none » (`[]`), as without the pivot.
    expect(r.sort).toEqual([]);
    expect(r.group!.pivot).toEqual({ columns: ['year'], limit: 200, sort: { crossing: [2026], column: 'amount', dir: 'desc' } });
    expect(JSON.stringify(r)).not.toContain('~p');
  });

  it('a sort on the label column becomes the grouping columns; on a row total it stays as is', () => {
    const { fake, model } = setup({ by: ['region', 'city'] });
    model.setQuery(makeQuery({ sort: [{ column: '~p:rows', dir: 'desc' }] }), 'user');
    expect(fake.calls.at(-1)!.req.sort).toEqual([{ column: 'region', dir: 'desc' }, { column: 'city', dir: 'desc' }]);
    model.setQuery(makeQuery({ sort: [{ column: 'amount', dir: 'asc' }] }), 'user');
    expect(fake.calls.at(-1)!.req.sort).toEqual([{ column: 'amount', dir: 'asc' }]);
  });
});

describe('server pivot seams: values (S7) and places only in problems', () => {
  it('an application function among the values is refused (agg-type, server); an unknown value told by id', () => {
    const { fake, told, model } = setup({ values: { amount: () => 1, nope: 'sum' } as never }); // never: an AggFn and an unknown id together
    expect(fake.calls[0]!.req.group!.aggs).toEqual([]);
    const ps = model.problems.map((p) => `${p.code} ${p.path}${p.detail ? ` ${p.detail}` : ''}`);
    expect(ps).toEqual(expect.arrayContaining(['agg-type columns.amount.aggFunc server', 'unknown-column pivot.values nope']));
    expect(told()).toEqual([]);
  });

  it('a group key and its node use the value own type: in a custom column 1 and "1" are two groups, two created columns', () => {
    const fake = fakeSource();
    const any = { kind: 'custom', keyKind: 'text', coerce: (v: unknown) => v, parse: () => null, format: String, sortKey: String, compare: () => 0, isEmpty: (v: unknown) => v == null, equals: Object.is, toExport: String };
    const shape = pivotShape<Row>({ by: ['region'], columns: ['code'], values: { amount: 'sum' } });
    const model = serverSideRows<Row>(fake.source, { pivot: serverPivot() }).create({
      getRowId: (r) => r.id,
      columns: createColumnModel<Row>([{ id: 'region', type: 'custom', codec: any }, { id: 'code', type: 'custom', codec: any }, { id: 'amount', type: 'number' }] as never), // never: a custom codec of any value
      ctx: localeCtx({ locale: 'en-US' }),
      shape,
    }) as ServerSideModel<Row>;
    fake.calls[0]!.resolve({ groups: [{ value: 1 }, { value: '1' }], pivot: { crossings: [[1], ['1']] } });
    const keys = Array.from({ length: model.displayed.count }, (_, i) => model.displayed.keyAt(i as DisplayIndex));
    expect(keys).toEqual(['g:6:region2:n1', 'g:6:region2:s1'] as RowKey[]);
    const t = shape.generated().columns.map((c) => c.id);
    expect(t).toEqual(['~p4:code2:n16:amount', '~p4:code2:s16:amount']);
  });
});

describe('server pivot seams: what the review found untested', () => {
  it('series() on a server: the groups held at the level, one series per created column of the first value', () => {
    const { fake, shape, root } = setup({ footers: 'grand' });
    root(fake.calls[0]!);
    expect(shape.series()).toEqual({
      categories: ['Nord', 'Sud'],
      series: [{ id: Y25, name: '2,025', values: [10, 5] }, { id: Y26, name: '2,026', values: [20, null] }],
    });
  });

  it('another language: the crossings labelled again, nothing asked', () => {
    const { fake, shape, model, root } = setup();
    root(fake.calls[0]!);
    expect(shape.generated().columns.map((c) => c.header)).toEqual(['2,025', '2,026']);
    model.setContext(localeCtx({ locale: 'de-DE' }));
    expect(shape.generated().columns.map((c) => c.header)).toEqual(['2.025', '2.026']);
    expect(fake.calls).toHaveLength(1);
  });

  it('a crossing given twice, cells that are no record, no pivot part, groups where none were asked: told by place, never a throw', () => {
    const a = setup();
    a.fake.calls[0]!.resolve({ groups: [{ value: 'Nord', cells: 7 }], total: 1, pivot: { crossings: [[2025], [2025]] } });
    expect(a.told()).toEqual(['invalid-page-response response.pivot.crossings[1]', 'invalid-page-response response.groups[0].cells']);
    expect(a.shape.generated().count).toBe(1);
    const b = setup();
    b.fake.calls[0]!.resolve({ groups: [{ value: 'Nord' }], total: 1 });
    expect(b.told()).toEqual(['invalid-page-response response.pivot']);
    expect(b.shape.generated().count).toBe(0);
    const c = setup({ by: [] });
    c.fake.calls[0]!.resolve({ groups: [{ value: 'Nord' }], total: 1, pivot: { crossings: [] } });
    expect(c.told()).toEqual(['invalid-page-response response.groups[0]']);
  });
});
