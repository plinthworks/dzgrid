import { describe, expect, it } from 'vitest';
import { createColumnModel, localeCtx, makeQuery, type AggFuncName, type ColumnDef, type ColumnOrGroup, type DisplayIndex, type ModelChange, type Problem } from '@dzgrid/core';
import { serverSideRows, type ServerSideModel, type GroupValue } from '@dzgrid/core/server-side';
import { pivotShape, pivotState, type PivotOptions, type PivotShape } from '@dzgrid/core/pivot';
import { serverPivot } from '@dzgrid/core/server-pivot';
import { fakePivotServer, type PivotRow } from '../../../perf/fake-pivot-server.js';

/**
 * `@dzgrid/core/server-pivot` against `perf/fake-pivot-server.ts`'s cube (server-pivot.md; plan step 3): a seeded walk of
 * random queries where every cell shown must be the cube's at the id the sheet's rule gives; planted values; and a
 * permutation walk of the pivot's gestures with the answers released out of order — one request per gesture, no stale
 * answer applied. The ids are made here by hand from the sheet (`~p` / `~t`, each pivot column and the value's own tag,
 * then the value column, each length-prefixed), never read back from the code under test.
 */
const COLS: ColumnDef<PivotRow, any>[] = [ // any: the column's value type is not under test
  { id: 'region' },
  { id: 'city' },
  { id: 'year', type: 'number' },
  { id: 'month', type: 'number' },
  { id: 'amount', type: 'number' },
  { id: 'visits', type: 'number' },
];
const lp = (s: string): string => `${s.length}:${s}`;
const tagOf = (v: GroupValue): string => (v === null ? '' : (typeof v)[0] + String(v));
const idOf = (pre: '~p' | '~t', pc: readonly string[], x: readonly GroupValue[], col: string): string => pre + x.map((v, l) => lp(pc[l]!) + lp(tagOf(v))).join('') + lp(col);
// any: a tree of any row type (the created columns of the shape under test)
const leaves = (t: readonly ColumnOrGroup<any>[]): string[] => t.flatMap((n) => ('children' in n ? leaves(n.children) : [n.id]));

/** A seeded generator (mulberry32): the walk replays. */
const rng = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

function setup(po: PivotOptions, server: ReturnType<typeof fakePivotServer>, blockSize = 50) {
  const shape = pivotShape<PivotRow>(po) as PivotShape<PivotRow>;
  const model = serverSideRows<PivotRow>(server.source, { blockSize, maxBlocks: 50, pivot: serverPivot() }).create({
    getRowId: (r) => r.id,
    columns: createColumnModel<PivotRow>(COLS),
    ctx: localeCtx({ locale: 'en-US' }),
    shape,
  }) as ServerSideModel<PivotRow>;
  const told: Problem[] = [];
  model.subscribe((c: ModelChange<PivotRow>) => told.push(...(c.told ?? [])));
  return { shape, model, told };
}

/** Every group and the grand total shown: their typed path from the top (the grand total: null). */
function shownGroups(model: ServerSideModel<PivotRow>) {
  const d = model.displayed;
  const out: { path: GroupValue[] | null; aggs: Readonly<Record<string, unknown>> }[] = [];
  const stack: GroupValue[] = [];
  for (let i = 0; i < d.count; i++) {
    const n = d.nodeAt(i as DisplayIndex);
    if (n.kind === 'group') (stack.length = n.level), stack.push(n.value as GroupValue), out.push({ path: [...stack], aggs: n.aggs ?? {} });
    else if (n.kind === 'footer' && n.group === null) out.push({ path: null, aggs: n.aggs });
  }
  return out;
}

/** The checks of one query against the cube: row totals, every crossing's cell (absent: empty), the created columns' order. */
function againstCube(server: ReturnType<typeof fakePivotServer>, model: ServerSideModel<PivotRow>, shape: PivotShape<PivotRow>, max: number) {
  // The current query's first level (every block of it carries the same group part).
  const req = server.requests.findLast((r) => r.group?.path.length === 0)!;
  const g = req.group!;
  const pc = g.pivot!.columns;
  const cube = server.cube(req);
  const V = g.aggs.length;
  const sub = !!g.pivot!.subtotals;
  const deepest = cube.crossings.filter((x) => x.length === pc.length);
  const columns = (sub ? cube.crossings.length : deepest.length) * V;
  const over = !pc.length || !V ? false : columns > max;
  // The created columns: the deepest in the server's order, by the sheet's ids.
  expect(leaves(shape.generated().columns).filter((id) => id.startsWith('~p'))).toEqual(over || !pc.length ? [] : deepest.flatMap((x) => g.aggs.map((a) => idOf('~p', pc, x, a.column))));
  for (const row of shownGroups(model)) {
    let n = cube.root;
    for (const v of row.path ?? []) n = n.kids.get(server.key([v]))!;
    g.aggs.forEach((a, j) => expect(row.aggs[a.column]).toEqual(server.out(n.totals[j]!, a.fn)));
    for (const x of over ? [] : cube.crossings) {
      const cell = n.cells.get(server.key(x));
      g.aggs.forEach((a, j) => {
        const id = idOf(x.length === pc.length ? '~p' : '~t', pc, x, a.column);
        // An absent crossing is an empty cell, never « 0 ».
        expect(row.aggs[id]).toEqual(cell ? server.out(cell[j]!, a.fn) : undefined);
      });
    }
    // Above the limit, no created id at all.
    if (over) expect(Object.keys(row.aggs).filter((k) => k.startsWith('~'))).toEqual([]);
  }
  return { over, columns };
}

describe('server pivot: a seeded walk against the fake server\'s cube', () => {
  it('500 random queries: every cell shown is the cube\'s at the sheet\'s id; above the limit none; told only the limit', () => {
    const r = rng(20261107);
    const pick = <X,>(xs: readonly X[]): X => xs[Math.floor(r() * xs.length)]!;
    // Held: the first answer comes after the test listens (a synchronous one would be told before).
    const server = fakePivotServer({ rows: 3000, mode: 'hold' });
    const flush = (): void => void server.release(true);
    let overs = 0;
    let subs = 0;
    for (let q = 0; q < 500; q++) {
      const by = pick([[], ['region'], ['city'], ['region', 'city'], ['city', 'region']]);
      const columns = pick([[], ['year'], ['month'], ['year', 'month'], ['month', 'year']]);
      const values: Record<string, AggFuncName> = { amount: pick(['sum', 'avg', 'min', 'max', 'count'] as const) };
      if (r() < 0.5) values.visits = pick(['sum', 'count'] as const);
      const desc = columns.filter(() => r() < 0.4);
      const subtotals = columns.length > 1 && r() < 0.4;
      const maxColumns = pick([200, 200, 30, 8]);
      if (!by.length && !columns.length) continue;
      const { shape, model, told } = setup({ by, columns, values, desc, subtotals, maxColumns }, server);
      flush();
      // A group of the first level opened (its children asked, with their cells).
      if (by.length > 1) {
        const d = model.displayed;
        const i = Math.floor(r() * Math.min(d.count, 5));
        const n = d.count ? d.nodeAt(i as DisplayIndex) : null;
        if (n?.kind === 'group') model.expand([n.key], true, 'user');
      }
      model.want(0, 400);
      while (server.waiting) flush();
      const { over } = againstCube(server, model, shape, maxColumns);
      overs += +over;
      subs += +subtotals;
      expect(told.map((p) => p.code)).toEqual(over ? ['pivot-too-many'] : []);
      // Standing while the list lasts, as the browser pivot's.
      expect(model.problems.map((p) => p.code)).toEqual(over ? ['pivot-too-many'] : []);
      model.destroy();
    }
    // The walk reached the limit and the sub-totals (otherwise it proves less than it says).
    expect(overs).toBeGreaterThan(10);
    expect(subs).toBeGreaterThan(30);
  });
});

describe('server pivot: planted values', () => {
  it('a planted wrong cell is shown as sent (never recomputed)', () => {
    const server = fakePivotServer({ rows: 600, plant: { cell: true } });
    const { model } = setup({ by: ['region'], columns: ['year'], values: { amount: 'sum' } }, server);
    const first = shownGroups(model)[0]!;
    expect(first.aggs[idOf('~p', ['year'], [2024], 'amount')]).toBe(999_999);
  });

  it('a crossing of the wrong type is refused by place, no column for it, the value never told', () => {
    const server = fakePivotServer({ rows: 600, plant: { type: true }, mode: 'hold' });
    const { shape, told } = setup({ by: ['region'], columns: ['year'], values: { amount: 'sum' } }, server);
    server.release(true);
    expect(told.map((p) => `${p.code} ${p.path} ${p.detail ?? ''}`)).toEqual(['invalid-page-response response.pivot.crossings[0] ']);
    expect(leaves(shape.generated().columns)).toEqual([idOf('~p', ['year'], [2025], 'amount'), idOf('~p', ['year'], [2026], 'amount')]);
    expect(JSON.stringify(told)).not.toContain('2024');
  });

  it('a list that changes in a later block is told, the first kept', () => {
    const server = fakePivotServer({ rows: 3000, plant: { list: true }, mode: 'hold' });
    const { shape, model, told } = setup({ by: ['city'], columns: ['month'], values: { amount: 'sum' } }, server, 5);
    server.release(true);
    const was = shape.generated();
    model.want(0, 30);
    server.release(true);
    expect(told.map((p) => `${p.code} ${p.path}`)).toContain('invalid-page-response response.pivot.crossings');
    expect(shape.generated()).toBe(was);
  });

  it('no row value in a problem, the saved state or the request outside the pivot part (a sort on a created column)', () => {
    const server = fakePivotServer({ rows: 600 });
    const { shape, model, told } = setup({ by: ['region'], columns: ['year'], values: { amount: 'sum' } }, server);
    model.setQuery(makeQuery({ sort: [{ column: idOf('~p', ['year'], [2025], 'amount'), dir: 'desc' }] }), 'user');
    const last = server.requests.at(-1)!;
    expect(last.group!.pivot!.sort).toEqual({ crossing: [2025], column: 'amount', dir: 'desc' });
    const { pivot: _p, ...rest } = last.group!;
    // The key is the request itself, canonical (it holds the pivot part by construction): left out here.
    const outside = JSON.stringify({ ...last, group: rest, signal: undefined, key: undefined });
    expect(outside).not.toMatch(/~p|2025|Nord/);
    const state = JSON.stringify(pivotState(shape, createColumnModel<PivotRow>(COLS)).get());
    expect(state).not.toMatch(/~p|2025|Nord/);
    expect(JSON.stringify([...told, ...model.problems])).not.toMatch(/2025|Nord/);
  });
});

describe('server pivot: gestures with answers out of order (permutations)', () => {
  const RUNS = Number(process.env.PERMS ?? 100);
  it(`${RUNS} walks: each gesture one new first-level request; the last query's cells are the cube's; no stale answer applied`, () => {
    for (let run = 0; run < RUNS; run++) {
      const r = rng(1000 + run);
      const pick = <X,>(xs: readonly X[]): X => xs[Math.floor(r() * xs.length)]!;
      const server = fakePivotServer({ rows: 900, mode: 'hold' });
      const { shape, model } = setup({ by: ['region'], columns: ['year'], values: { amount: 'sum' } }, server, 20);
      for (let step = 0; step < 12; step++) {
        const roots = () => server.requests.filter((q) => q.group?.path.length === 0 && q.page?.offset === 0).length;
        const before = roots();
        const keyBefore = server.requests.at(-1)!.key;
        const g = pick(['by', 'columns', 'values', 'desc', 'sort', 'on', 'release', 'release', 'want'] as const);
        if (g === 'by') model.setBy(pick([['region'], ['city'], ['region', 'city']]), 'user');
        else if (g === 'columns') shape.setPivotBy(pick([['year'], ['month'], ['year', 'month']]), 'user');
        else if (g === 'values') shape.setValueFns(pick<Record<string, AggFuncName>>([{ amount: 'sum' }, { amount: 'max' }, { amount: 'avg', visits: 'count' }]), 'user');
        else if (g === 'desc') shape.set({ desc: pick([[], ['year'], ['month']]) }, 'user');
        else if (g === 'sort') model.setQuery(makeQuery({ sort: [{ column: pick(['amount', '~p:rows', 'region']), dir: pick(['asc', 'desc'] as const) }] }), 'user');
        else if (g === 'on') (shape.setOn(false, 'user'), shape.setOn(true, 'user'));
        else if (g === 'want') model.want(0, 60);
        else for (let k = Math.floor(r() * 3); k >= 0 && server.waiting; k--) server.releaseAt(Math.floor(r() * server.waiting));
        // A gesture that moved the request: exactly one new first block asked (two for « off then on »).
        if (g !== 'release' && g !== 'want' && server.requests.at(-1)!.key !== keyBefore) expect(roots() - before).toBe(g === 'on' ? 2 : 1);
      }
      // Everything answered, in a random order, then the window: what is shown is the last query's cube.
      while (server.waiting) server.releaseAt(Math.floor(r() * server.waiting));
      model.want(0, 200);
      while (server.waiting) server.releaseAt(Math.floor(r() * server.waiting));
      againstCube(server, model, shape, 200);
      model.destroy();
    }
  });
});
