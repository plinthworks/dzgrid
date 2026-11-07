// Phase 10 (docs/behaviors/pivot.md, aggregation.md 16–18; docs/phase-10-steps/decisions.md): `@dzgrid/core/pivot`.
// The conformance suite `pivot` holds what a user sees; this file the API, the work done, a seeded walk against a
// hand-written oracle, and health data. Expectations by hand.
import { describe, it, expect } from 'vitest';
import { clientRows, createColumnModel, createKernel, groupKey, localeCtx, makeQuery, type ColumnDef, type ColumnOrGroup, type DisplayIndex, type RowNode } from '@dzgrid/core';
import type { GroupedRows } from '@dzgrid/core/grouping';
import { checkPivot, pivotShape, type PivotOptions } from '@dzgrid/core/pivot';

type Row = { id: string; g: string | null; h: number | null; y: string | null; m: string | null; v: number | null; name?: string };
const DEFS: ColumnDef<Row>[] = [{ id: 'g' }, { id: 'h', type: 'number' }, { id: 'y' }, { id: 'm' }, { id: 'v', type: 'number', aggFunc: 'sum' }, { id: 'name' }];
const ROWS: Row[] = [
  { id: 'r1', g: 'Nord', h: 1, y: '2025', m: 'Jan', v: 10 },
  { id: 'r2', g: 'Nord', h: 2, y: '2025', m: 'Feb', v: 5 },
  { id: 'r3', g: 'Sud', h: 1, y: '2026', m: 'Jan', v: 2 },
];
const ctx = localeCtx({ locale: 'en-US', timeZone: 'UTC' });

/** A grid with the pivot, the created columns put beside the host's whenever their list changes (as the DOM will). */
function setup(o: PivotOptions = { by: ['g'], columns: ['y'] }, rows: Row[] = ROWS) {
  const columns = createColumnModel<Row>(DEFS);
  const shape = pivotShape<Row>(o);
  const model = clientRows<Row>({ rows, getRowId: (r) => r.id, columns, ctx, shape });
  const kernel = createKernel<Row>({ rows: model, columns });
  let key = '';
  const sync = () => {
    const g = shape.generated();
    if (g.key !== key) (key = g.key), kernel.dispatch({ type: 'columns.set', defs: [...DEFS, ...g.columns] }, 'host');
  };
  sync();
  const d = () => model.displayed as GroupedRows<Row>;
  const nodes = () => Array.from({ length: d().count }, (_, i) => d().nodeAt(d().index(i)!));
  return { columns, shape, model, kernel, sync, d, nodes };
}
/** A group's or a totals row's totals and cells (any other row: none). */
const aggsOf = (n: RowNode<Row>): Readonly<Record<string, unknown>> => (n.kind === 'group' || n.kind === 'footer' ? n.aggs ?? {} : {});
const ids = (tree: readonly ColumnOrGroup<Row>[]): string[] => tree.flatMap((n) => ('children' in n ? [n.id, ...ids(n.children)] : [n.id]));

describe('pivotShape: the API', () => {
  it('is a grouping shape with the pivot options it was given', () => {
    const s = pivotShape<Row>({ by: ['g'], columns: ['y', 'm'], values: { v: 'avg' } });
    expect([s.kind, s.on, s.by, s.pivotBy, s.valueFns()]).toEqual(['group', true, ['g'], ['y', 'm'], { v: 'avg' }]);
    expect(s.generated()).toEqual({ columns: [], key: '', count: 0 });
  });

  it('one grouping build and one crossing pass per load, the created columns set beside the host\'s included', () => {
    const t = setup();
    expect(t.columns.get('~p1:y5:t20251:v')).toBeDefined();
    expect([t.shape.diagnostics.builds, t.shape.passes]).toEqual([1, 1]);
  });

  it('the created columns: no filter, not groupable, the value column\'s type and format, the width asked, no reading', () => {
    const t = setup({ by: ['g'], columns: ['y'], width: 90, values: { v: 'sum', g: 'count' } });
    const [band] = t.shape.generated().columns as [ColumnOrGroup<Row>];
    expect(band).toMatchObject({ id: '~b1:y5:t2025', header: '2025' });
    const [sum, count] = (band as { children: readonly ColumnDef<Row>[] }).children;
    expect(sum).toMatchObject({ id: '~p1:y5:t20251:v', header: 'v', type: 'number', width: 90, filter: false, groupable: false });
    expect(count).toMatchObject({ id: '~p1:y5:t20251:g', header: 'g', type: 'number' });
    expect(sum!.value!(ROWS[0]!)).toBeNull();
  });

  it('the deepest groups are last rows: no children, never open, not among the parents to open', () => {
    const t = setup({ by: ['g', 'h'], columns: ['y'], expanded: 'all' });
    const d = t.d();
    const nord = d.indexOf(groupKey(['g', 'tNord'])) as DisplayIndex;
    const leaf = d.indexOf(groupKey(['g', 'tNord', 'h', 'n1'])) as DisplayIndex;
    expect([d.childrenAt(nord), d.expandedAt(nord)]).toEqual([2, true]);
    expect([d.childrenAt(leaf), d.expandedAt(leaf)]).toEqual([0, false]);
    expect(t.shape.opens!(groupKey(['g', 'tNord', 'h', 'n1']))).toBe(false);
    t.kernel.dispatch({ type: 'rows.expand', rows: [groupKey(['g', 'tNord', 'h', 'n1'])], expanded: true }, 'user');
    expect(t.nodes().map((n) => n.kind)).not.toContain('data');
    expect(t.model.expandable()).toEqual([groupKey(['g', 'tNord']), groupKey(['g', 'tSud'])]);
  });

  it('no pivot column: the deepest groups are still last rows, never open (HEAD\'s `flat()` call fixed)', () => {
    const t = setup({ by: ['g'], columns: [] });
    expect(t.shape.opens!(groupKey(['g', 'tNord']))).toBe(false);
    expect(t.d().childrenAt(t.d().indexOf(groupKey(['g', 'tNord'])) as DisplayIndex)).toBe(0);
  });

  it('created columns keep their ids when a crossing appears; the key changes, the old columns are the same ids', () => {
    const t = setup();
    const before = ids(t.shape.generated().columns);
    t.model.applyTransaction({ add: [{ id: 'r4', g: 'Sud', h: 1, y: '2024', m: 'Jan', v: 1 }] });
    t.sync();
    const after = ids(t.shape.generated().columns);
    expect(after).toEqual(['~p1:y5:t20241:v', ...before]);
  });

  it('the same list of columns is the same object: nothing to set again', () => {
    const t = setup();
    const g = t.shape.generated();
    t.model.applyTransaction({ patch: [{ id: 'r1', set: { v: 99 } }] });
    expect(t.shape.generated()).toBe(g);
    expect(aggsOf(t.nodes()[0]!)['~p1:y5:t20251:v']).toBe(104);
  });

  it('setValueFns changes the function of every created column of a value', () => {
    const t = setup();
    t.shape.setValueFns({ v: 'max' }, 'user');
    t.sync();
    const nord = aggsOf(t.nodes()[0]!);
    expect([nord['~p1:y5:t20251:v'], nord.v]).toEqual([10, 10]);
  });

  it('setPivotBy and setOn tell a `rows` change and build no group again', () => {
    const t = setup();
    const kinds: string[] = [];
    t.model.subscribe((c) => void kinds.push(`${c.kind}/${c.source}`));
    t.shape.setPivotBy(['m'], 'user');
    t.shape.setPivotBy(['m'], 'user');
    t.shape.setOn(false, 'api');
    t.shape.setOn(false, 'api');
    expect(kinds).toEqual(['rows/user', 'rows/api']);
    expect(t.shape.diagnostics.builds).toBe(1);
    expect(t.shape.generated().columns).toEqual([]);
    // Off: the rows are under their groups again.
    t.kernel.dispatch({ type: 'rows.expandAll', expanded: true }, 'user');
    expect(t.nodes().filter((n) => n.kind === 'data').length).toBe(3);
  });

  it('bad options are told and bent, never thrown', () => {
    const s = pivotShape<Row>({ on: 'yes' as never, columns: 'y' as never, values: 3 as never, maxColumns: 0, width: -1 }); // untyped code
    const m = clientRows<Row>({ rows: ROWS, getRowId: (r) => r.id, columns: createColumnModel<Row>(DEFS), ctx, shape: s });
    expect(m.problems.map((p) => `${p.path} ${p.detail}`)).toEqual(['pivot.on string', 'pivot.columns string', 'pivot.values number', 'pivot.maxColumns 0', 'pivot.width -1']);
    s.setPivotBy('y' as never); // untyped code
    expect(s.pivotBy).toEqual([]);
  });

  it('desc (pivot.md 33): set, told once as a `rows` change, the crossings regrouped, no group built again; bad ones told', () => {
    const t = setup();
    const kinds: string[] = [];
    t.model.subscribe((c) => void kinds.push(`${c.kind}/${c.source}`));
    t.shape.set({ desc: ['y'] }, 'user');
    t.shape.set({ desc: ['y'] }, 'user');
    expect(kinds).toEqual(['rows/user']);
    t.sync();
    expect([t.shape.pivotDesc, ids(t.shape.generated().columns)]).toEqual([['y'], ['~p1:y5:t20261:v', '~p1:y5:t20251:v']]);
    expect(t.shape.diagnostics.builds).toBe(1);
    t.shape.set({ desc: 'y' as never }); // untyped code
    expect(t.shape.pivotDesc).toEqual(['y']);
    const s = pivotShape<Row>({ desc: 3 as never }); // untyped code
    const m = clientRows<Row>({ rows: ROWS, getRowId: (r) => r.id, columns: createColumnModel<Row>(DEFS), ctx, shape: s });
    expect(m.problems.map((p) => `${p.path} ${p.detail}`)).toEqual(['pivot.desc number']);
  });

  it('series(): another value, another level', () => {
    const t = setup({ by: ['g', 'h'], columns: ['y'], values: { v: 'sum', h: 'count' } });
    expect(t.shape.series({ value: 'h', level: 2 })).toEqual({
      categories: ['Nord › 1', 'Nord › 2', 'Sud › 1'],
      series: [
        { id: '~p1:y5:t20251:h', name: '2025', values: [1, 1, null] },
        { id: '~p1:y5:t20261:h', name: '2026', values: [null, null, 1] },
      ],
    });
    t.shape.setOn(false);
    expect(t.shape.series()).toEqual({ categories: [], series: [] });
  });
});

describe('pivotShape: what the DOM half reads (pivot.md 17, 20, 25)', () => {
  const labels = (t: ReturnType<typeof setup>) => t.nodes().filter((n) => n.kind === 'group').map((n) => (n as { label: string }).label);
  it('a sort on the label column (~p:rows) orders the groups by value: as they are, then reversed, the blank group last both ways', () => {
    const rows: Row[] = [...ROWS, { id: 'r4', g: null, h: 3, y: '2025', m: 'Jan', v: 1 }, { id: 'r5', g: 'Est', h: 3, y: '2026', m: 'Feb', v: 4 }];
    const t = setup({ by: ['g'], columns: ['y'] }, rows);
    expect(labels(t)).toEqual(['Est', 'Nord', 'Sud', '']);
    // The DOM's label column, which reads nothing.
    t.kernel.dispatch({ type: 'columns.set', defs: [{ id: '~p:rows', value: () => null }, ...DEFS, ...t.shape.generated().columns] }, 'host');
    t.kernel.dispatch({ type: 'sort.set', sort: [{ column: '~p:rows', dir: 'asc' }] }, 'user');
    expect(labels(t)).toEqual(['Est', 'Nord', 'Sud', '']);
    t.kernel.dispatch({ type: 'sort.set', sort: [{ column: '~p:rows', dir: 'desc' }] }, 'user');
    expect(labels(t)).toEqual(['Sud', 'Nord', 'Est', '']);
  });

  it('valueColumn(id): the value column of a created column or of a sub-total; anything else undefined', () => {
    const t = setup({ by: ['g'], columns: ['y'], values: { v: 'sum', g: 'count' }, subtotals: false });
    expect(t.shape.valueColumn('~p1:y5:t20251:v')).toBe('v');
    expect(t.shape.valueColumn('~p1:y5:t20251:g')).toBe('g');
    expect(t.shape.valueColumn('~b1:y5:t2025')).toBeUndefined();
    expect(t.shape.valueColumn('v')).toBeUndefined();
  });

  it('rows(key): the data rows of a group in the last build, in order; an unknown key or a pivot off: none', () => {
    const t = setup({ by: ['g'], columns: ['y'] });
    expect(t.shape.rows(groupKey(['g', 'tNord'])).map((r) => r.id)).toEqual(['r1', 'r2']);
    expect(t.shape.rows(groupKey(['g', 'tOuest']))).toEqual([]);
    t.shape.setOn(false);
    expect(t.shape.rows(groupKey(['g', 'tNord']))).toEqual([]);
  });
});

describe('pivot: the cells\' rules (aggregation.md 6, 16)', () => {
  it('a crossing\'s sum is compensated: 0.1 ten times is 1, in every group and the grand total', () => {
    const rows = Array.from({ length: 10 }, (_, i) => ({ id: `r${i}`, g: 'a', h: 1, y: 'x', m: 'p', v: 0.1 }));
    const t = setup({ by: ['g'], columns: ['y'] }, rows);
    expect(t.nodes().map((n) => aggsOf(n)['~p1:y2:tx1:v'])).toEqual([1, 1]);
  });

  it('exactly `maxColumns` created columns are made; one more and none is', () => {
    expect(setup({ by: ['g'], columns: ['y'], maxColumns: 2 }).shape.generated().columns.length).toBe(2);
    expect(setup({ by: ['g'], columns: ['y'], maxColumns: 1 }).shape.generated()).toMatchObject({ columns: [], count: 2 });
  });

  it('first and last follow the grid\'s sort; min and max of a text follow the language\'s order', () => {
    const rows: Row[] = [
      { id: 'a', g: 'n', h: 5, y: 'x', m: 'éclair', v: 3 },
      { id: 'b', g: 'n', h: 7, y: 'x', m: 'fig', v: 1 },
      { id: 'c', g: 'n', h: 9, y: 'x', m: 'date', v: 2 },
    ];
    const t = setup({ by: ['g'], columns: ['y'], values: { m: 'max', h: 'first', v: 'last' } }, rows);
    t.kernel.dispatch({ type: 'query.set', query: makeQuery({ sort: [{ column: 'v', dir: 'asc' }] }) }, 'user');
    t.sync();
    const n = aggsOf(t.nodes()[0]!);
    // « fig » after « éclair » (é beside e); by v ascending the rows are b, c, a: first h is b's, last v is a's.
    expect([n['~p1:y2:tx1:m'], n['~p1:y2:tx1:h'], n['~p1:y2:tx1:v']]).toEqual(['fig', 7, 3]);
  });
});

describe('pivot and health data', () => {
  const secret = (rows: Row[]) => rows.map((r, i) => ({ ...r, name: `SECRET-${i}` }));
  it('a pivot on names: problems tell counts and ids, never a name; made() knows the created ids only', () => {
    const t = setup({ by: ['g'], columns: ['name', 'nope'], maxColumns: 2, values: { v: 'sum' } }, secret(ROWS));
    const text = JSON.stringify(t.model.problems);
    expect(text).not.toContain('SECRET');
    expect(t.model.problems.map((p) => `${p.code} ${p.detail}`)).toEqual(['unknown-column nope', 'pivot-too-many 3']);
    // Above the limit no column and no cell is made.
    expect(t.shape.generated().columns).toEqual([]);
    expect(Object.keys(Object.getPrototypeOf(aggsOf(t.nodes()[0]!)))).toEqual([]);
    expect([t.shape.made('~p1:x'), t.shape.made('~b1:x'), t.shape.made('~t1:x'), t.shape.made('name'), t.shape.made('p~')]).toEqual([true, true, true, false, false]);
  });
});

describe('checkPivot (grid-state.md « Pivot » 3)', () => {
  const cols = createColumnModel<Row>([...DEFS, { id: 'z', groupable: false }]);
  it('keeps the known, groupable columns once each and the built-in names; tells the rest by path', () => {
    const r = checkPivot({ on: 'yes', columns: ['y', 'nope', 'y', 3, 'z', 'm'], values: { v: 'sum', h: 'median', gone: 'sum' } }, cols);
    expect(r.pivot).toEqual({ columns: ['y', 'm'], values: { v: 'sum' } });
    expect(r.problems.map((p) => `${p.code} ${p.path} ${p.detail ?? ''}`)).toEqual([
      'state-field pivot.on ', 'state-column pivot.columns.1 nope', 'state-field pivot.columns.2 ', 'state-field pivot.columns.3 ',
      'state-field pivot.columns.4 ', 'state-field pivot.values.h ', 'state-column pivot.values gone',
    ]);
  });
  it('desc: the known groupable columns once each, the rest told by path; not a list told', () => {
    const r = checkPivot({ desc: ['y', 'nope', 'z', 'y'] }, cols);
    expect(r.pivot).toEqual({ desc: ['y'] });
    expect(r.problems.map((p) => `${p.code} ${p.path} ${p.detail ?? ''}`)).toEqual(['state-column pivot.desc.1 nope', 'state-field pivot.desc.2 ', 'state-field pivot.desc.3 ']);
    expect(checkPivot({ desc: 'y' }, cols).problems.map((p) => p.path)).toEqual(['pivot.desc']);
  });
  it('not an object: nothing applied; lists that are not lists: told', () => {
    expect(checkPivot([1], cols)).toEqual({ pivot: null, problems: [{ code: 'state-field', severity: 'warning', path: 'pivot' }] });
    expect(checkPivot({ on: true, columns: 'y', values: [] }, cols).problems.map((p) => p.path)).toEqual(['pivot.columns', 'pivot.values']);
  });
});

// ---- A seeded walk against a hand-written oracle (nested maps: group path → crossing path → rows).
function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}
type Fn = 'sum' | 'count' | 'avg' | 'min' | 'max';
const FN: Fn[] = ['sum', 'count', 'avg', 'min', 'max'];
function oracle(rows: Row[], fn: Fn): unknown {
  if (fn === 'count') return rows.length || undefined;
  const xs = rows.map((r) => r.v).filter((v): v is number => v !== null);
  if (!xs.length) return undefined;
  if (fn === 'min') return Math.min(...xs);
  if (fn === 'max') return Math.max(...xs);
  // Integers only: an exact sum whatever the order.
  const sum = xs.reduce((a, b) => a + b, 0);
  return fn === 'sum' ? sum : sum / xs.length;
}
/** Text crossings in code-unit order (the values are ASCII lower case: the collation agrees), the empty one last. */
const order = (vals: (string | null)[]) => [...new Set(vals)].sort((a, b) => (a === null ? 1 : b === null ? -1 : a < b ? -1 : a > b ? 1 : 0));

describe('pivot against a hand-written oracle (500 seeded cases)', () => {
  it('every cell of every group and of the grand total, and the columns in order', () => {
    for (let n = 0; n < 500; n++) {
      const r = rng(n + 1);
      const pick = <X,>(xs: readonly X[]): X => xs[Math.floor(r() * xs.length)]!;
      const rows: Row[] = Array.from({ length: 1 + Math.floor(r() * 25) }, (_, i) => ({
        id: `r${i}`, g: pick(['a', 'b', null]), h: pick([1, 2, 3]), y: pick(['x', 'w', null]), m: pick(['p', 'q']), v: r() < 0.2 ? null : Math.floor(r() * 200) - 50,
      }));
      const by = pick([[], ['g'], ['g', 'h']]);
      const pv = pick([['y'], ['y', 'm']]);
      const fn = pick(FN);
      const sub = r() < 0.5;
      const t = setup({ by, columns: pv, values: { v: fn }, subtotals: sub, expanded: 'all' }, rows);
      const what = JSON.stringify({ n, by, pv, fn, sub });
      // The crossings and the columns they make, in order: [path, rows test].
      const want: [string, (x: Row) => boolean][] = [];
      for (const a of order(rows.map((x) => x.y))) {
        if (pv.length === 1) want.push([`${a ?? ''}`, (x) => x.y === a]);
        else {
          for (const b of order(rows.filter((x) => x.y === a).map((x) => x.m))) want.push([`${a ?? ''}/${b}`, (x) => x.y === a && x.m === b]);
          if (sub) want.push([`Σ ${a ?? ''}`, (x) => x.y === a]);
        }
      }
      const made: [string, string][] = [];
      const walk = (tree: readonly ColumnOrGroup<Row>[], up: string[]) =>
        tree.forEach((c) => ('children' in c ? walk(c.children, [...up, c.header!]) : made.push([[...up, c.header!].join('/'), c.id])));
      walk(t.shape.generated().columns, []);
      expect(made.map((m) => m[0]), what).toEqual(want.map((w) => w[0]));
      // Each group row (by its path) and the grand total: its cells against the oracle's.
      for (const node of t.nodes()) {
        if (node.kind === 'data') throw new Error(`${what}: a data row is shown`);
        const mine = node.kind === 'group'
          ? rows.filter((x) => node.path.every((l, i) => String((x as Record<string, unknown>)[by[i]!] ?? '') === l))
          : rows;
        if (node.kind === 'footer' && node.group !== null) continue;
        made.forEach(([chain, id], i) => expect(aggsOf(node)[id], `${what} ${node.kind} ${node.key} ${chain}`).toEqual(oracle(mine.filter(want[i]![1]), fn)));
      }
      expect(t.shape.diagnostics.builds, what).toBe(1);
    }
  });
});
