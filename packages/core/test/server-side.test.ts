import { describe, expect, it } from 'vitest';
import { createColumnModel, dataKey, groupKey, localeCtx, makeQuery, type ColumnDef, type DisplayIndex, type ModelChange, type ModelEnv, type RowKey } from '@dzgrid/core';
import { serverSideRows, type ServerSideModel, type ServerSideOptions } from '@dzgrid/core/server-side';
import { fakeSource, type Call } from './support/fake-source.js';

/**
 * `@dzgrid/core/server-side` (Phase 8 step 6, docs/behaviors/server-side-groups.md). Expectations written by hand from the
 * sheet: the request of each level (typed paths, the totals asked), the groups' keys and nodes, the treegrid's answers,
 * the totals as sent, the open groups kept across a new query, `setBy`, `expandAll` over the groups held, the cache
 * across levels, a level of unknown size, and no value in any problem.
 */
type Row = { id: string; region: string; day: string; qty: number };
const COLS: ColumnDef<Row, any>[] = [ // any: the column's value type is not under test
  { id: 'region' },
  { id: 'day', type: 'day' },
  { id: 'qty', type: 'number', aggFunc: 'sum' },
];

function setup(o: ServerSideOptions = {}, env: Partial<ModelEnv<Row>> = {}) {
  const fake = fakeSource();
  const timers: (() => void)[] = [];
  const model = serverSideRows<Row>(fake.source, { blockSize: 10, maxBlocks: 6, ...o }).create({
    getRowId: (r) => r.id,
    columns: createColumnModel<Row>(COLS),
    ctx: localeCtx({ locale: 'en-US' }),
    abort: fake.abort,
    timer: (fn) => (timers.push(fn), () => {}),
    ...env,
  }) as ServerSideModel<Row>;
  const changes: ModelChange<Row>[] = [];
  model.subscribe((c) => changes.push(c));
  const d = () => model.displayed as unknown as Required<typeof model.displayed> & { posAt(i: DisplayIndex): number; sizeAt(i: DisplayIndex): number; childrenAt(i: DisplayIndex): number; expandedAt(i: DisplayIndex): boolean };
  /** The rows shown, one word each: a group's label (open: +), a row's id, `…` loading, `!` failed, `Σ` a totals row. */
  const shown = () => {
    const v = d();
    return Array.from({ length: v.count }, (_, i) => {
      const n = v.nodeAt(i as DisplayIndex);
      if (n.kind === 'group') return `${n.label}${v.expandedAt(i as DisplayIndex) ? '+' : ''}`;
      if (n.kind === 'data') return (n.data as Row).id;
      if (n.kind === 'footer') return `Σ${n.label}`;
      return n.kind === 'loading' && n.failed ? '!' : '…';
    }).join(' ');
  };
  const groups = (c: Call, values: unknown[], extra: object = {}) => c.resolve({ groups: values.map((value, i) => ({ value, count: 5 + i, aggs: { qty: 100 + i } })), total: values.length, ...extra });
  const rows = (c: Call, n: number, extra: object = {}) => {
    const p = c.req.page!;
    const path = c.req.group?.path ?? [];
    c.resolve({ rows: Array.from({ length: n }, (_, j) => ({ id: `${path.join('/')}#${p.offset + j}`, region: String(path[0] ?? ''), day: '2026-03-04', qty: 1 })), total: n, ...extra });
  };
  const keyOf = (label: string) => {
    const v = d();
    for (let i = 0; i < v.count; i++) {
      const n = v.nodeAt(i as DisplayIndex);
      if (n.kind === 'group' && n.label === label) return n.key;
    }
    throw new Error(`no group ${label}`);
  };
  const told = () => changes.flatMap((c) => (c.told ?? []).map((p) => `${p.code} ${p.path}${p.detail ? ` ${p.detail}` : ''}`));
  return { fake, model, changes, d, shown, groups, rows, keyOf, told, timers };
}

describe('serverSideRows: the request of each level (Q-WIRE A)', () => {
  it('the first level: a block by offset with the group part — the columns, an empty path, the totals asked by name', () => {
    const { fake } = setup({ by: ['region', 'day'] });
    expect(fake.calls).toHaveLength(1);
    const r = fake.calls[0]!.req;
    expect(r.page).toEqual({ index: 0, size: 10, offset: 0, cursor: null });
    expect(r.blocks).toBe(true);
    expect(r.group).toEqual({ by: ['region', 'day'], path: [], aggs: [{ column: 'qty', fn: 'sum' }] });
  });

  it('not grouped: the rows as one list, no group part', () => {
    const { fake, model, shown } = setup();
    expect(fake.calls[0]!.req.group).toBeUndefined();
    fake.calls[0]!.resolve({ rows: [{ id: 'a', region: 'N', day: '2026-01-01', qty: 1 }], total: 1 });
    expect(shown()).toBe('a');
    expect(model.counts).toMatchObject({ filtered: 1 });
  });

  it('an open group asks its level with the typed values of the path; the last level asks the rows', () => {
    const { fake, model, groups, shown, keyOf } = setup({ by: ['region', 'day'] });
    groups(fake.calls[0]!, ['Nord', 'Sud']);
    expect(shown()).toBe('Nord Sud');
    model.expand([keyOf('Nord')], true);
    // One loading row under the group being opened (tree-lazy's), asked once shown.
    expect(shown()).toBe('Nord+ … Sud');
    expect(fake.calls).toHaveLength(1);
    model.want(0, 2);
    const c = fake.calls.at(-1)!;
    expect(c.req.group).toEqual({ by: ['region', 'day'], path: ['Nord'], aggs: [{ column: 'qty', fn: 'sum' }] });
    groups(c, ['2026-03-04', '2026-03-05']);
    expect(shown()).toBe('Nord+ 03/04/2026 03/05/2026 Sud');
    model.expand([keyOf('03/04/2026')], true);
    model.want(0, 5);
    const leaf = fake.calls.at(-1)!;
    expect(leaf.req.group).toEqual({ by: ['region', 'day'], path: ['Nord', '2026-03-04'], aggs: [{ column: 'qty', fn: 'sum' }] });
    leaf.resolve({ rows: [{ id: 'r1', region: 'Nord', day: '2026-03-04', qty: 2 }, { id: 'r2', region: 'Nord', day: '2026-03-04', qty: 3 }], total: 2 });
    expect(shown()).toBe('Nord+ 03/04/2026+ r1 r2 03/05/2026 Sud');
    const v = model.displayed;
    expect(v.nodeAt(v.indexOf(dataKey('r1')!) as DisplayIndex)).toMatchObject({ kind: 'data', level: 2 });
  });
});

describe('serverSideRows: the groups as nodes, and what a treegrid reads', () => {
  it('a group node: its typed key, label, value, count and totals as sent; level, place, size, children, open', () => {
    const { fake, model, groups, d, keyOf } = setup({ by: ['region'] });
    groups(fake.calls[0]!, ['Nord', 'Sud', null]);
    const v = d();
    expect(v.nodeAt(0 as DisplayIndex)).toEqual({ key: groupKey(['region', 'sNord']), kind: 'group', level: 0, label: 'Nord', path: ['Nord'], column: 'region', value: 'Nord', count: 5, aggs: { qty: 100 } });
    expect(v.nodeAt(2 as DisplayIndex)).toMatchObject({ label: '', value: null, key: groupKey(['region', '']) });
    expect([v.levelAt(1 as DisplayIndex), v.posAt(1 as DisplayIndex), v.sizeAt(1 as DisplayIndex), v.childrenAt(1 as DisplayIndex), v.expandedAt(1 as DisplayIndex)]).toEqual([0, 2, 3, 6, false]);
    model.expand([keyOf('Sud')], true);
    model.want(0, 5);
    fake.calls.at(-1)!.resolve({ rows: Array.from({ length: 10 }, (_, j) => ({ id: j ? `x${j}` : 'x', region: 'Sud', day: '2026-01-01', qty: 1 })), hasNext: true });
    const w = d();
    const i = w.indexOf(dataKey('x')!) as DisplayIndex;
    expect(w.parentOf!(dataKey('x')!)).toBe(keyOf('Sud'));
    // A level of unknown size: aria-setsize -1.
    expect([w.levelAt(i), w.posAt(i), w.sizeAt(i)]).toEqual([1, 1, -1]);
    // Its rows so far and one block more while more follow.
    expect(w.childrenAt(w.indexOf(keyOf('Sud')) as DisplayIndex)).toBe(10 + 10);
  });

  it('typed keys: 1 and « 1 », a day and an instant of that day, are two groups with two paths', () => {
    const { fake, model, d } = setup({ by: ['region'] });
    fake.calls[0]!.resolve({ groups: [{ value: 1 }, { value: '1' }, { value: '2026-03-04' }, { value: 1772582400000 }], total: 4 });
    const v = d();
    const keys = Array.from({ length: 4 }, (_, i) => v.keyAt(i as DisplayIndex));
    expect(new Set(keys).size).toBe(4);
    expect(keys[0]).toBe(groupKey(['region', 'n1']));
    expect(keys[1]).toBe(groupKey(['region', 's1']));
    model.expand(keys, true);
    // Two at once: each answered, the next asked.
    model.want(0, 7);
    for (let k = 1; k < fake.calls.length; k++) fake.calls[k]!.resolve({ rows: [], total: 0 });
    const paths = fake.calls.slice(1).map((c) => c.req.group!.path);
    expect(paths).toEqual(expect.arrayContaining([[1], ['1'], ['2026-03-04'], [1772582400000]]));
  });

  it('a value of no group type, a bad count or totals: told by place, never with the value', () => {
    const { fake, d, told } = setup({ by: ['region'] });
    fake.calls[0]!.resolve({ groups: [{ value: { secret: 'Ana' } }, { value: 'ok', count: -1, aggs: 'x' }], total: 2 });
    expect(told()).toEqual(['invalid-page-response response.groups[0].value', 'invalid-page-response response.groups[1].count', 'invalid-page-response response.groups[1].aggs']);
    expect(JSON.stringify(told())).not.toContain('Ana');
    expect(d().nodeAt(0 as DisplayIndex)).toMatchObject({ kind: 'loading', failed: true });
    expect(d().nodeAt(1 as DisplayIndex)).toMatchObject({ kind: 'group', aggs: {} });
  });
});

describe('serverSideRows: the totals are the server\'s (Q-TOT A)', () => {
  it('a planted wrong total shows as sent, also after the rows are loaded; footers and the grand total from the server', () => {
    const { fake, model, keyOf, shown, d } = setup({ by: ['region'], footers: 'both' });
    fake.calls[0]!.resolve({ groups: [{ value: 'Nord', count: 2, aggs: { qty: 999 } }], total: 1, totals: { qty: 12345 } });
    expect(shown()).toBe('Nord Σ');
    expect(model.totals()).toEqual({ qty: 12345 });
    model.expand([keyOf('Nord')], true);
    model.want(0, 3);
    fake.calls.at(-1)!.resolve({ rows: [{ id: 'a', region: 'Nord', day: '2026-01-01', qty: 1 }, { id: 'b', region: 'Nord', day: '2026-01-01', qty: 1 }], total: 2 });
    expect(shown()).toBe('Nord+ a b ΣNord Σ');
    const v = d();
    expect(v.nodeAt(0 as DisplayIndex)).toMatchObject({ aggs: { qty: 999 } });
    expect(v.nodeAt(3 as DisplayIndex)).toMatchObject({ kind: 'footer', key: `f:${keyOf('Nord')}`, group: keyOf('Nord'), aggs: { qty: 999 } });
    expect(v.nodeAt(4 as DisplayIndex)).toMatchObject({ kind: 'footer', key: 't:bottom', group: null, aggs: { qty: 12345 } });
    expect([v.posAt(3 as DisplayIndex), v.sizeAt(3 as DisplayIndex), v.posAt(4 as DisplayIndex), v.sizeAt(4 as DisplayIndex)]).toEqual([3, 3, 2, 2]);
  });

  it('a function of the application is refused (agg-type, detail server) and not asked; an unknown name told', () => {
    const { fake, told, model } = setup({ by: ['region'], aggFuncs: { qty: ((v: number[]) => v.length) as never, day: 'median' as never } }); // never: a function and a name the type refuses, as untyped code gives
    expect(fake.calls[0]!.req.group!.aggs).toEqual([]);
    expect(model.problems.map((p) => `${p.code} ${p.path} ${p.detail}`)).toEqual(['invalid-setting columns.day.aggFunc median', 'agg-type columns.qty.aggFunc server']);
    expect(told()).toEqual([]);
  });
});

describe('serverSideRows: a new query, a regroup, expand all (Q-OPEN A, D13)', () => {
  it('after a sort the open groups stay open: their content asked again only when shown', () => {
    const { fake, model, groups, keyOf, shown } = setup({ by: ['region'] });
    groups(fake.calls[0]!, ['Nord', 'Sud']);
    model.expand([keyOf('Nord'), keyOf('Sud')], true);
    model.want(0, 3);
    for (const c of fake.calls.slice(1)) c.resolve({ rows: [{ id: `${c.req.group!.path[0]}1`, region: 'x', day: '2026-01-01', qty: 1 }], total: 1 });
    expect(shown()).toBe('Nord+ Nord1 Sud+ Sud1');
    model.setQuery(makeQuery({ sort: [{ column: 'qty', dir: 'desc' }] }), 'user');
    expect(fake.calls.at(-1)!.req.group!.path).toEqual([]);
    const n = fake.calls.length;
    groups(fake.calls.at(-1)!, ['Sud', 'Nord']);
    expect(shown()).toBe('Sud+ … Nord+ …');
    expect(fake.calls).toHaveLength(n);
    // Only the group shown asks its rows.
    model.want(0, 1);
    expect(fake.calls.slice(n).map((c) => c.req.group!.path)).toEqual([['Sud']]);
  });

  it('setBy: a new epoch with the new columns; the open groups kept', () => {
    const { fake, model, groups, keyOf, changes } = setup({ by: ['region'] });
    groups(fake.calls[0]!, ['Nord']);
    model.expand([keyOf('Nord')], true);
    changes.length = 0;
    model.setBy(['day', 'region']);
    expect(model.by).toEqual(['day', 'region']);
    expect(changes.map((c) => c.kind)).toEqual(['query']);
    expect(fake.calls.at(-1)!.req.group).toMatchObject({ by: ['day', 'region'], path: [] });
    expect(model.expansion.has(groupKey(['region', 'sNord']))).toBe(true);
    model.setBy(['nope', 'day']);
    expect(model.by).toEqual(['day']);
    expect(model.problems.some((p) => p.code === 'unknown-column' && p.detail === 'nope')).toBe(true);
  });

  it('expand all opens the groups held only (no request by itself), and tells the levels it cannot reach', () => {
    const { fake, model, groups, told } = setup({ by: ['region', 'day'] });
    groups(fake.calls[0]!, ['Nord', 'Sud', 'Est']);
    const n = fake.calls.length;
    expect(model.expandAll(true)).toHaveLength(3);
    expect(fake.calls).toHaveLength(n);
    expect(told()).toEqual(['unsupported-combination expandAll server']);
    expect(model.expandAll(false)).toHaveLength(3);
    expect(model.expansion.size).toBe(0);
  });
});

describe('serverSideRows: one cache across levels (D5, D12)', () => {
  it('never more than maxBlocks blocks held over every level; the group rows above the window stay', () => {
    const { fake, model, groups, d } = setup({ by: ['region'], maxBlocks: 3, ahead: 0 });
    groups(fake.calls[0]!, Array.from({ length: 10 }, (_, i) => `G${i}`));
    const keys = Array.from({ length: 10 }, (_, i) => d().keyAt(i as DisplayIndex));
    model.expand(keys, true);
    const settle = () => {
      // Every request answered, the window told again after each change (as the DOM does after each paint).
      for (let c = fake.calls.find((x) => !(x as { done?: boolean }).done); c; c = fake.calls.find((x) => !(x as { done?: boolean }).done)) {
        (c as { done?: boolean }).done = true;
        const p = c.req.page!;
        c.resolve({ rows: Array.from({ length: 10 }, (_, j) => ({ id: `${c.req.group!.path[0]}-${p.offset + j}`, region: 'x', day: '2026-01-01', qty: 1 })), total: 30 });
      }
    };
    for (let k = 0; k < 10; k++) {
      // The window on group k's rows (30 rows: three blocks), the group row above it kept.
      let at = d().indexOf(keys[k]!);
      model.want(at + 1, at + 25);
      settle();
      at = d().indexOf(keys[k]!);
      model.want(at + 1, at + 25);
      settle();
      // The window's three blocks and the first level's block above them.
      expect(model.diagnostics.blocks.held).toBeLessThanOrEqual(3 + 1);
      expect(d().nodeAt((at + 25) as DisplayIndex).kind).toBe('data');
    }
    expect(model.diagnostics.levels).toBe(11);
    expect(model.diagnostics.blocks.evicted).toBeGreaterThan(0);
  });

  it('a group whose first block fails: its loading row fails, the model stays idle; refresh asks it again', () => {
    const { fake, model, groups, keyOf, shown } = setup({ by: ['region'] });
    groups(fake.calls[0]!, ['Nord']);
    model.expand([keyOf('Nord')], true);
    model.want(0, 1);
    fake.calls.at(-1)!.reject(new Error('down'));
    expect(shown()).toBe('Nord+ !');
    expect(model.status.phase).toBe('idle');
    model.invalidate();
    expect(fake.calls.at(-1)!.req.group!.path).toEqual(['Nord']);
  });
});

describe('serverSideRows: a grouping shape, refusals, purity of problems', () => {
  it('the DOM grouping\'s shape gives the columns and the options: the first request is grouped already', () => {
    const shape = { kind: 'group', by: ['day'], options: { footers: 'grand', aggFuncs: { qty: 'max' } } };
    const { fake } = setup({}, { shape: shape as never }); // never: a grouping shape stand-in, only what the model reads
    expect(fake.calls).toHaveLength(1);
    expect(fake.calls[0]!.req.group).toEqual({ by: ['day'], path: [], aggs: [{ column: 'qty', fn: 'max' }] });
  });

  it('a tree or details beside it are refused; a placement in the browser too', () => {
    const { model } = setup({}, { shape: { kind: 'tree' } as never, operations: 'client' }); // never: a shape stand-in
    expect(model.problems.map((p) => `${p.code} ${p.path}`)).toEqual(['invalid-operations operations', 'unsupported-combination shape']);
  });

  it('a filter is sent in its wire form at every level; a key never names a value of a row', () => {
    const { fake, model, groups, keyOf } = setup({ by: ['region'] });
    model.setQuery(makeQuery({ quick: 'abc' }), 'user');
    groups(fake.calls.at(-1)!, ['Nord']);
    model.expand([keyOf('Nord')], true);
    model.want(0, 1);
    expect(fake.calls.at(-1)!.req).toMatchObject({ quick: 'abc', group: { path: ['Nord'] } });
    expect(model.membershipOf(makeQuery({ quick: 'abc' }))).toBe(model.membershipOf(makeQuery({ quick: 'abc', sort: [{ column: 'qty', dir: 'asc' }] })));
  });

  it('the row of a key: leaves only (a group is never a data row)', () => {
    const { fake, model, groups, keyOf } = setup({ by: ['region'] });
    groups(fake.calls[0]!, ['Nord']);
    expect(model.row(keyOf('Nord') as RowKey)).toBeUndefined();
    model.expand([keyOf('Nord')], true);
    model.want(0, 1);
    fake.calls.at(-1)!.resolve({ rows: [{ id: 'a', region: 'Nord', day: '2026-01-01', qty: 1 }], total: 1 });
    expect(model.row(dataKey('a')!)?.data.id).toBe('a');
  });
});

describe('serverSideRows: review of step 6', () => {
  it('review 1: an entry of groups that is no record is told by place and fails its place, never a throw', () => {
    const { fake, d, told } = setup({ by: ['region'] });
    expect(() => fake.calls[0]!.resolve({ groups: [null, 3, { value: 'ok' }], total: 3 })).not.toThrow();
    expect(told()).toEqual(['invalid-page-response response.groups[0]', 'invalid-page-response response.groups[1]']);
    expect(d().nodeAt(2 as DisplayIndex)).toMatchObject({ kind: 'group', label: 'ok' });
  });

  it('an answer of the grouping before setBy is never shown, nor its totals', () => {
    const { fake, model, shown } = setup({ by: ['region'] });
    const old = fake.calls[0]!;
    model.setBy(['day']);
    old.resolve({ groups: [{ value: 'Nord' }], total: 1, totals: { qty: 9 } });
    expect(shown()).toBe('');
    expect(model.totals()).toEqual({});
    fake.calls.at(-1)!.resolve({ groups: [{ value: '2026-03-04' }], total: 1 });
    expect(shown()).toBe('03/04/2026');
  });

  it('a level whose total shrinks: its blocks past the end go, the next group follows its last row', () => {
    const { fake, model, groups, keyOf, shown } = setup({ by: ['region'], ahead: 0, maxBlocks: 10 });
    groups(fake.calls[0]!, ['Nord', 'Sud']);
    model.expand([keyOf('Nord')], true);
    model.want(0, 1);
    fake.calls.at(-1)!.resolve({ rows: Array.from({ length: 10 }, (_, j) => ({ id: `a${j}`, region: 'Nord', day: '2026-01-01', qty: 1 })), total: 30 });
    model.want(11, 15);
    fake.calls.at(-1)!.resolve({ rows: Array.from({ length: 2 }, (_, j) => ({ id: `b${j}`, region: 'Nord', day: '2026-01-01', qty: 1 })), total: 12 });
    expect(shown()).toBe(`Nord+ ${Array.from({ length: 10 }, (_, j) => `a${j}`).join(' ')} b0 b1 Sud`);
  });

  it('duplicate ids across blocks of a level: the newer place wins, told without the id', () => {
    const { fake, model, groups, keyOf, told } = setup({ by: ['region'], ahead: 0, maxBlocks: 10 });
    groups(fake.calls[0]!, ['Nord']);
    model.expand([keyOf('Nord')], true);
    model.want(0, 1);
    fake.calls.at(-1)!.resolve({ rows: Array.from({ length: 10 }, (_, j) => ({ id: `secret${j}`, region: 'Nord', day: '2026-01-01', qty: 1 })), total: 20 });
    model.want(11, 20);
    fake.calls.at(-1)!.resolve({ rows: Array.from({ length: 10 }, (_, j) => ({ id: `secret${j === 0 ? 0 : 10 + j}`, region: 'Nord', day: '2026-01-01', qty: 1 })), total: 20 });
    expect(told()).toContain('duplicate-row-id response.rows[0]');
    expect(JSON.stringify(told())).not.toContain('secret');
    const v = model.displayed;
    expect(v.indexOf(dataKey('secret0')!)).toBe(11);
  });
});
