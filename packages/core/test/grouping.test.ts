// Phase 7 steps 3–4: `@dzgrid/core/grouping` (row-grouping.md, aggregation.md; docs/phase-7-steps/decisions.md). The
// conformance suite `group-agg` holds what a user sees; this file the API, the seams, the work done, and health data.
import { describe, it, expect } from 'vitest';
import {
  clientRows, createColumnModel, createKernel, dataKey, groupKey, localeCtx, makeQuery,
  type ColumnDef, type GridEvent, type RowKey, type ValueReader,
} from '@dzgrid/core';
import { groupShape, type GroupedRows, type GroupShape } from '@dzgrid/core/grouping';

type Row = { id: string; g: string | null; h: number; v: number | null };
const ROWS: Row[] = [
  { id: 'r1', g: 'Nord', h: 1, v: 10 },
  { id: 'r2', g: 'Sud', h: 2, v: 5 },
  { id: 'r3', g: 'Nord', h: 2, v: 2.5 },
  { id: 'r4', g: 'Nord', h: 1, v: null },
];
const DEFS: ColumnDef<Row>[] = [{ id: 'g' }, { id: 'h', type: 'number' }, { id: 'v', type: 'number', aggFunc: 'sum' }];
const ctx = localeCtx({ locale: 'en-US', timeZone: 'UTC' });

function setup(o: Parameters<typeof groupShape<Row>>[0] = { by: ['g'] }, rows: Row[] = ROWS) {
  const columns = createColumnModel<Row>(DEFS);
  const shape = groupShape<Row>(o);
  const model = clientRows<Row>({ rows, getRowId: (r) => r.id, columns, ctx, shape });
  const kernel = createKernel<Row>({ rows: model, columns });
  const events: GridEvent<Row>[] = [];
  kernel.subscribe((e) => events.push(e));
  const shown = () => {
    const d = model.displayed as GroupedRows<Row>;
    return Array.from({ length: d.count }, (_, i) => {
      const n = d.nodeAt(d.index(i)!);
      return n.kind === 'data' ? n.id : n.kind === 'group' ? `[${n.label}]` : n.kind === 'footer' ? 'Σ' : n.kind;
    });
  };
  return { columns, shape, model, kernel, events, shown, d: () => model.displayed as GroupedRows<Row> };
}

function overlay() {
  const cells = new Map<string, Record<string, unknown>>();
  let version = 0;
  const reader: ValueReader<Row> = {
    get version() { return version; },
    overlay: true,
    value: (col, row, id) => (cells.get(id) && col.id in cells.get(id)! ? cells.get(id)![col.id] : col.read(row)),
  };
  return { reader, edit: (id: string, col: string, v: unknown) => (cells.set(id, { ...cells.get(id), [col]: v }), version++) };
}

const nord = groupKey(['g', 'tNord']);

describe('groupShape: the API', () => {
  it('is a row shape of kind `group` that reads its grouping columns', () => {
    const s = groupShape<Row>({ by: ['g', 'h'] });
    expect(s.kind).toBe('group');
    expect(s.by).toEqual(['g', 'h']);
    expect(s.reads?.()).toEqual(['g', 'h']);
  });

  it('setBy regroups at once, told as a `rows` change from the source given; the same list again does nothing', () => {
    const t = setup();
    const kinds: string[] = [];
    t.model.subscribe((c) => kinds.push(`${c.kind}:${c.source}`));
    t.shape.setBy(['h'], 'user');
    expect(t.shown()).toEqual(['[1]', '[2]']);
    expect(t.shape.reads?.()).toEqual(['h']);
    t.shape.setBy(['h']);
    expect(kinds).toEqual(['rows:user']);
    t.shape.setBy([]);
    expect(t.shown()).toEqual(['r1', 'r2', 'r3', 'r4']);
    expect(kinds).toEqual(['rows:user', 'rows:api']);
  });

  it('setBy keeps the list it was given apart from the caller\'s array', () => {
    const t = setup();
    const by = ['h'];
    t.shape.setBy(by);
    by.push('g');
    expect(t.shape.by).toEqual(['h']);
  });

  it('a group row is never selected: select-all takes the data rows shown; a closed group\'s rows are not taken (Q-SEL A)', () => {
    const t = setup();
    t.kernel.dispatch({ type: 'rows.expand', rows: [nord], expanded: true }, 'user');
    t.kernel.dispatch({ type: 'selection.all' }, 'user');
    expect([...t.kernel.selection.keys].sort()).toEqual([dataKey('r1'), dataKey('r3'), dataKey('r4')].sort());
    expect(t.kernel.dispatch({ type: 'selection.toggle', row: nord }, 'user').ok).toBe(false);
  });

  it('places: indexOf and parentOf for a row, a group, a footer and the grand total', () => {
    const t = setup({ by: ['g', 'h'], footers: 'both' });
    t.kernel.dispatch({ type: 'rows.expandAll', expanded: true }, 'user');
    const d = t.d();
    const n1 = groupKey(['g', 'tNord', 'h', 'n1']);
    expect(d.parentOf(dataKey('r4')!)).toBe(n1);
    expect(d.parentOf(n1)).toBe(nord);
    expect(d.parentOf(nord)).toBeNull();
    const foot = `f:${n1}` as RowKey;
    expect(d.parentOf(foot)).toBe(n1);
    expect(d.parentOf('t:bottom' as RowKey)).toBeNull();
    for (const k of [dataKey('r4')!, n1, nord, foot, 't:bottom' as RowKey]) {
      const i = d.indexOf(k);
      expect(i, k).toBeGreaterThanOrEqual(0);
      expect(d.keyAt(i as never)).toBe(k); // `as never`: indexOf's -1 | DisplayIndex, checked above
    }
    expect(d.indexOf(groupKey(['g', 'tOuest']))).toBe(-1);
    expect(d.indexOf(dataKey('zz')!)).toBe(-1);
  });

  it('what the tree painter reads: levels, children, open, matched; data rows a level below the last group', () => {
    const t = setup({ by: ['g', 'h'] });
    t.kernel.dispatch({ type: 'rows.expandAll', expanded: true }, 'user');
    const d = t.d();
    const at = (k: RowKey) => d.indexOf(k) as never; // `as never`: each key is shown here; -1 would throw in the reads
    expect(d.levelAt(at(nord))).toBe(0);
    expect(d.childrenAt(at(nord))).toBe(2);
    expect(d.kidsOf(nord)).toBe(2);
    expect(d.expandedAt(at(nord))).toBe(true);
    expect(d.levelAt(at(dataKey('r1')!))).toBe(2);
    expect(d.childrenAt(at(dataKey('r1')!))).toBe(0);
    expect(d.matchedAt(at(dataKey('r1')!))).toBe(true);
    expect(d.dataCount).toBe(4);
    expect(d.nodeAt(at(dataKey('r1')!))).toMatchObject({ kind: 'data', level: 2, id: 'r1' });
    expect(d.nodeAt(at(nord))).toMatchObject({ kind: 'group', column: 'g', value: 'Nord', count: 3, label: 'Nord', path: ['Nord'], aggs: { v: 12.5 } });
  });

  it('opening a row that is not a group does nothing; the kernel refuses no group key', () => {
    const t = setup();
    expect(t.model.expand([dataKey('r1')!], true)).toEqual([]);
    expect(t.kernel.dispatch({ type: 'rows.expand', rows: [nord], expanded: true }, 'user').ok).toBe(true);
    expect(t.model.isExpanded(nord)).toBe(true);
  });

  it('expandable lists the groups above a depth; collapse-all closes everything', () => {
    const t = setup({ by: ['g', 'h'] });
    expect(t.model.expandable(1).length).toBe(2);
    expect(t.model.expandable().length).toBe(5);
    t.kernel.dispatch({ type: 'rows.expandAll', expanded: true }, 'user');
    t.kernel.dispatch({ type: 'rows.expandAll', expanded: false }, 'user');
    expect(t.shown()).toEqual(['[Nord]', '[Sud]']);
  });

  it('`expanded: \'all\'` opens every level at the first load', () => {
    const t = setup({ by: ['g', 'h'], expanded: 'all' });
    expect(t.shown()).toEqual(['[Nord]', '[1]', 'r1', 'r4', '[2]', 'r3', '[Sud]', '[2]', 'r2']);
  });

  it('bad options never throw: each is told and bent', () => {
    // `as never`: the wrong types are the point (bad options from untyped code).
    const t = setup({ by: 'g' as never, footers: 'all' as never, grandTotal: 'middle' as never, aggFuncs: 3 as never });
    expect(t.shown()).toEqual(['r1', 'r2', 'r3', 'r4']);
    expect(t.model.problems.map((p) => `${p.code} ${p.path}`)).toEqual(['invalid-setting grouping.by', 'invalid-setting grouping.footers', 'invalid-setting grouping.grandTotal', 'invalid-setting grouping.aggFuncs']);
  });

  it('a duplicate grouping column is dropped, told', () => {
    const t = setup({ by: ['g', 'g'] });
    expect(t.shape.reads?.()).toEqual(['g']);
    expect(t.model.problems).toContainEqual({ code: 'invalid-setting', severity: 'warning', path: 'grouping.by', detail: 'g' });
  });
});

describe('work done (Q-T A, K.14)', () => {
  it('opening a group flattens again and neither regroups nor totals again', () => {
    const t = setup();
    const before = t.shape.diagnostics;
    t.kernel.dispatch({ type: 'rows.expand', rows: [nord], expanded: true }, 'user');
    const after = t.shape.diagnostics;
    expect(after.builds).toBe(before.builds);
    expect(after.aggs).toBe(before.aggs);
    expect(after.flattens).toBe(before.flattens + 1);
  });

  it('a live update that moves no grouping value totals again without regrouping', () => {
    const t = setup();
    const before = t.shape.diagnostics;
    t.model.applyTransaction({ patch: [{ id: 'r2', set: { v: 6 } }] });
    expect(t.shape.diagnostics.builds).toBe(before.builds);
    expect(t.shape.diagnostics.aggs).toBe(before.aggs + 1);
    expect(t.shape.totals()).toEqual({ v: 18.5 });
  });

  it('a live update that moves a grouping value regroups', () => {
    const t = setup();
    const before = t.shape.diagnostics.builds;
    t.model.applyTransaction({ patch: [{ id: 'r2', set: { g: 'Nord' } }] });
    expect(t.shape.diagnostics.builds).toBe(before + 1);
    expect(t.shown()).toEqual(['[Nord]']);
  });

  it('an edit of an aggregated column totals again at once, without regrouping, told as a redraw', () => {
    const t = setup();
    const o = overlay();
    const kinds: string[] = [];
    t.model.subscribe((c) => kinds.push(c.kind));
    const before = t.shape.diagnostics.builds;
    o.edit('r2', 'v', 50);
    t.kernel.dispatch({ type: 'edits.reader', reader: o.reader, columns: ['v'] }, 'user');
    expect(t.shape.totals()).toEqual({ v: 62.5 });
    expect(t.shape.diagnostics.builds).toBe(before);
    expect(kinds).toEqual(['expand']);
    expect(t.model.orderStale).toBe(false);
  });

  it('an edit of a column nobody totals or groups by asks for no redraw', () => {
    const t = setup();
    const o = overlay();
    const kinds: string[] = [];
    t.model.subscribe((c) => kinds.push(c.kind));
    o.edit('r2', 'h', 9);
    t.kernel.dispatch({ type: 'edits.reader', reader: o.reader, columns: ['h'] }, 'user');
    expect(kinds).toEqual([]);
  });

  it('an edited grouping value waits for « Réappliquer », even through a toggle and a live update of another row', () => {
    const t = setup();
    const o = overlay();
    o.edit('r2', 'g', 'Nord');
    t.kernel.dispatch({ type: 'edits.reader', reader: o.reader, columns: ['g'] }, 'user');
    t.kernel.dispatch({ type: 'rows.expand', rows: [nord], expanded: true }, 'user');
    t.model.applyTransaction({ patch: [{ id: 'r1', set: { v: 11 } }] });
    expect(t.shown()).toEqual(['[Nord]', 'r1', 'r3', 'r4', '[Sud]']);
    t.kernel.dispatch({ type: 'rows.reapply' }, 'user');
    expect(t.shown()).toEqual(['[Nord]', 'r1', 'r2', 'r3', 'r4']);
  });
});

describe('review fixes (2026-11-04): one rule for a regroup while the order is stale', () => {
  it('a live update that moves another row\'s grouping value runs the whole order again: both rows move, nothing stays stale', () => {
    const t = setup({ by: ['g'], expanded: 'all' });
    const o = overlay();
    o.edit('r2', 'g', 'Nord');
    t.kernel.dispatch({ type: 'edits.reader', reader: o.reader, columns: ['g'] }, 'user');
    expect(t.model.orderStale).toBe(true);
    t.model.applyTransaction({ patch: [{ id: 'r1', set: { g: 'Sud' } }] });
    expect(t.shown()).toEqual(['[Nord]', 'r2', 'r3', 'r4', '[Sud]', 'r1']);
    expect(t.model.orderStale).toBe(false);
    expect(t.kernel.orderStale).toBe(false);
  });

  it('setBy while stale applies the edits through « Réappliquer »: the groups and the stale mark agree', () => {
    const t = setup({ by: ['g'], expanded: 'all' });
    const o = overlay();
    o.edit('r2', 'g', 'Nord');
    t.kernel.dispatch({ type: 'edits.reader', reader: o.reader, columns: ['g'] }, 'user');
    t.shape.setBy(['g', 'h']);
    t.kernel.dispatch({ type: 'rows.expandAll', expanded: true }, 'user');
    expect(t.shown()).toEqual(['[Nord]', '[1]', 'r1', 'r4', '[2]', 'r2', 'r3']);
    expect(t.model.orderStale).toBe(false);
    expect(t.kernel.orderStale).toBe(false);
  });

  it('a bad `expanded` is told and bent to closed', () => {
    for (const bad of ['bogus', -1, Number.NaN]) {
      const t = setup({ by: ['g'], expanded: bad as never }); // `as never`: bad options from untyped code
      expect(t.shown()).toEqual(['[Nord]', '[Sud]']);
      expect(t.model.problems.map((p) => p.path)).toEqual(['grouping.expanded']);
    }
  });

  it('an option no string can be made of is told by its type, never a throw', () => {
    const odd = Object.create(null);
    const t = setup({ by: [odd], footers: odd, grandTotal: odd, aggFuncs: { v: odd } });
    expect(t.model.problems.map((p) => `${p.path} ${p.detail}`)).toEqual(['grouping.footers object', 'grouping.grandTotal object', 'grouping.by object', 'columns.v.aggFunc object']);
  });
});

describe('health data: a group key holds values, a problem never does', () => {
  const SECRET = 'Zzsecret-name-4711';
  it('no problem of grouping carries a row value, whatever goes wrong', () => {
    const rows = [{ id: 'a', g: SECRET, h: 1, v: 1 }, { id: 'b', g: SECRET, h: 2, v: null }] as Row[];
    const columns = createColumnModel<Row>([{ id: 'g', aggFunc: 'sum' }, { id: 'h', type: 'number', aggFunc: () => { throw new Error(SECRET); } }, { id: 'v', type: 'number', aggFunc: 'median' as never }]); // `as never`: an unknown name from untyped code
    const shape = groupShape<Row>({ by: ['g', SECRET.length ? 'nope' : ''], footers: 'both' });
    const model = clientRows<Row>({ rows, getRowId: (r) => r.id, columns, ctx, shape });
    model.expandAll(true);
    expect(model.problems.length).toBeGreaterThan(2);
    expect(JSON.stringify(model.problems)).not.toContain(SECRET);
  });
});

describe('the shape before and beside the model', () => {
  it('totals() is empty before any build', () => {
    expect(groupShape<Row>({ by: ['g'] }).totals()).toEqual({});
  });

  it('a query sort on another column leaves the groups ascending', () => {
    const t = setup();
    t.kernel.dispatch({ type: 'query.set', query: makeQuery({ sort: [{ column: 'v', dir: 'desc' }] }) }, 'user');
    expect(t.shown()).toEqual(['[Nord]', '[Sud]']);
  });

  it('setBy with something that is not a list ungroups, told; never a throw', () => {
    const t = setup();
    t.shape.setBy(null as never); // `as never`: untyped code passing null
    expect(t.shown()).toEqual(['r1', 'r2', 'r3', 'r4']);
    expect(t.model.problems).toContainEqual({ code: 'invalid-setting', severity: 'warning', path: 'grouping.by', detail: 'object' });
  });
});
