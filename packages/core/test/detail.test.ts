import { describe, it, expect } from 'vitest';
import { clientRows, createColumnModel, createKernel, dataKey, detailKey, headerSelection, localeCtx, makeQuery, type DisplayIndex, type GridEvent, type RowKey, type RowNode } from '@dzgrid/core';
import { csvRows, toCsv } from '@dzgrid/core/csv';
import { detailConflicts, detailShape, sparseRowLayout, type DetailOptions, type DetailRows } from '@dzgrid/core/detail';
import { treeConflicts } from '@dzgrid/core/tree';

/**
 * `@dzgrid/core/detail` (Phase 4 step 8; docs/behaviors/master-detail.md, plan D2, D7, D8, D9,
 * owner Q4, Q5; docs/phase-4-steps/step08-plan.md). Expectations written from the sheet, by hand.
 */
type P = { id: string; n: number; t: string };
const ROWS: P[] = [
  { id: 'a', n: 3, t: 'ward' },
  { id: 'b', n: 1, t: 'bed' },
  { id: 'c', n: 2, t: 'ward' },
  { id: 'd', n: 5, t: 'bed' },
  { id: 'e', n: 4, t: 'ward' },
];
const k = (id: string) => dataKey(id)!;
const x = (id: string) => detailKey(k(id));

function setup(o: { rows?: P[]; detail?: DetailOptions<P>; page?: number } = {}) {
  const columns = createColumnModel<P>([{ id: 'n', header: 'N', type: 'number' }, { id: 't', header: 'T' }]);
  const shape = detailShape<P>(o.detail);
  const ctx = localeCtx({ locale: 'en-US' });
  const model = clientRows<P>({ rows: o.rows ?? ROWS, getRowId: (r) => r.id, columns, ctx, shape, ...(o.page && { page: { pageSize: o.page } }) });
  const kernel = createKernel<P>({ rows: model, columns });
  const events: GridEvent<P>[] = [];
  kernel.subscribe((e) => events.push(e));
  const open = (ids: string[], expanded = true) => kernel.dispatch({ type: 'rows.expand', rows: ids.map(k), expanded }, 'user');
  const file = (scope: 'displayed' | 'all' | 'selected') => {
    const held = csvRows(model, scope, kernel.selection)!;
    return { count: held.count, lines: toCsv({ rows: held.rows, at: held.at, columns, ctx }, { bom: false }).split('\r\n').slice(0, -1) };
  };
  return { model, kernel, events, shape, open, file };
}
const rows = (m: { displayed: unknown }) => m.displayed as DetailRows<P>;
/** The rows shown: an id, or `> id` for its detail. */
const view = (m: { displayed: unknown }) => {
  const d = rows(m);
  return Array.from({ length: d.count }, (_, i) => {
    const n = d.nodeAt(d.index(i)!) as RowNode<P>;
    return n.kind === 'detail' ? `> ${(n.data as P).id}` : n.kind === 'data' ? String(n.id) : '?';
  });
};

describe('detail rows under open masters', () => {
  it('shows the data rows alone while nothing is open', () => {
    const { model } = setup();
    expect(view(model)).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(rows(model).dataCount).toBe(5);
    expect([...rows(model).details]).toEqual([]);
  });

  it('opens a detail right after its master through rows.expand, told by rowExpanded', () => {
    const { model, open, events } = setup();
    open(['b', 'd']);
    expect(view(model)).toEqual(['a', 'b', '> b', 'c', 'd', '> d', 'e']);
    expect(rows(model).count).toBe(7);
    expect(rows(model).dataCount).toBe(5);
    expect([...rows(model).details]).toEqual([2, 5]);
    expect(events.filter((e) => e.type === 'rowExpanded')).toEqual([{ type: 'rowExpanded', source: 'user', rows: [k('b'), k('d')], expanded: true }]);
    expect(model.isExpanded!(k('b'))).toBe(true);
    open(['b'], false);
    expect(view(model)).toEqual(['a', 'b', 'c', 'd', '> d', 'e']);
  });

  it('gives a detail node its key, kind, level, master and the master’s data', () => {
    const { model, open } = setup();
    open(['c']);
    const d = rows(model);
    const n = d.nodeAt(d.index(3)!);
    expect(n).toEqual({ key: x('c'), kind: 'detail', level: 0, master: k('c'), data: ROWS[2] });
    expect((n as { data: P }).data).toBe(ROWS[2]);
    expect(d.keyAt(d.index(3)!)).toBe(x('c'));
    expect(d.keyAt(d.index(4)!)).toBe(k('d'));
    expect(d.nodeAt(d.index(4)!)).toMatchObject({ key: k('d'), kind: 'data', level: 0, id: 'd' });
  });

  it('finds every row by its key, a detail by its own; a closed detail or an unknown key: -1', () => {
    const { model, open } = setup();
    open(['a', 'c']);
    const d = rows(model);
    expect(['a', 'b', 'c', 'd', 'e'].map((id) => d.indexOf(k(id)))).toEqual([0, 2, 3, 5, 6]);
    expect(d.indexOf(x('a'))).toBe(1);
    expect(d.indexOf(x('c'))).toBe(4);
    expect(d.indexOf(x('b'))).toBe(-1);
    expect(d.indexOf(k('zz'))).toBe(-1);
    expect(d.indexOf(detailKey(k('zz')))).toBe(-1);
    expect(d.indexOf('g:1:a' as RowKey)).toBe(-1);
    for (let i = 0; i < d.count; i++) expect(d.indexOf(d.keyAt(d.index(i)!))).toBe(i);
  });

  it('checks its bounds as the flat rows do', () => {
    const { model, open } = setup();
    open(['e']);
    const d = rows(model);
    expect(d.index(6)).toBe(null);
    expect(d.index(5)).toBe(5);
    expect(d.index(-1)).toBe(null);
    expect(d.index(1.5)).toBe(null);
    expect(() => d.nodeAt(6 as DisplayIndex)).toThrow(RangeError);
    expect(() => d.keyAt(-1 as DisplayIndex)).toThrow(RangeError);
    expect(() => d.nodeAt(1.5 as DisplayIndex)).toThrow(RangeError);
    expect(() => d.nodeAt(-3 as DisplayIndex)).toThrow(RangeError);
    expect(d.nextData(-1 as DisplayIndex, -1)).toBe(null);
    expect(d.nodeAt(d.index(5)!)).toMatchObject({ kind: 'detail', master: k('e') });
  });

  it('nextData steps over a detail; parentOf names a detail’s master', () => {
    const { model, open } = setup();
    open(['b']);
    const d = rows(model);
    expect(d.nextData(d.index(1)!, 1)).toMatchObject({ key: k('c') });
    expect(d.nextData(d.index(3)!, -1)).toMatchObject({ key: k('b') });
    expect(d.nextData(d.index(2)!, 1)).toMatchObject({ key: k('c') });
    expect(d.nextData(d.index(5)!, 1)).toBe(null);
    expect(d.nextData(d.index(0)!, -1)).toBe(null);
    expect(d.parentOf(x('b'))).toBe(k('b'));
    expect(d.parentOf(k('b'))).toBe(null);
  });

  it('a detail open at the end has nothing after it: nextData from it is null', () => {
    const { model, open } = setup();
    open(['e']);
    const d = rows(model);
    expect(d.nextData(d.index(4)!, 1)).toBe(null);
    expect(d.nextData(d.index(5)!, -1)).toMatchObject({ key: k('e') });
  });

  it('moves the focus from a closing detail to its master, same column', () => {
    const { kernel, open } = setup();
    open(['b']);
    kernel.dispatch({ type: 'focus.set', focus: { kind: 'cell', row: x('b'), column: 't' } }, 'user');
    open(['b'], false);
    expect(kernel.focus).toEqual({ kind: 'cell', row: k('b'), column: 't' });
  });

  it('a detail key, a filler key or a key the rows do not know opens nothing; an unknown data row is refused', () => {
    const { kernel, model, events } = setup();
    kernel.dispatch({ type: 'rows.expand', rows: [x('a'), 'g:1:a' as RowKey], expanded: true }, 'user');
    expect(view(model)).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(events.some((e) => e.type === 'rowExpanded')).toBe(false);
    expect(kernel.dispatch({ type: 'rows.expand', rows: [k('zz')], expanded: true }, 'user').ok).toBe(false);
    expect([...kernel.expansion]).toEqual([]);
  });

  it('follows the sort: each detail stays under its master', () => {
    const { model, kernel, open } = setup();
    open(['a', 'd']);
    kernel.dispatch({ type: 'query.set', query: makeQuery({ sort: [{ column: 'n', dir: 'asc' }] }) }, 'user');
    expect(view(model)).toEqual(['b', 'c', 'a', '> a', 'e', 'd', '> d']);
  });

  it('a filter hides a master and its detail; the master stays open, shown open again when the filter goes', () => {
    const { model, kernel, open } = setup();
    open(['a', 'b']);
    kernel.dispatch({ type: 'query.set', query: makeQuery({ filter: { t: { type: 'text', op: 'equals', value: 'bed' } } }) }, 'user');
    expect(view(model)).toEqual(['b', '> b', 'd']);
    expect([...kernel.expansion].sort()).toEqual([k('a'), k('b')]);
    kernel.dispatch({ type: 'query.set', query: makeQuery({}) }, 'user');
    expect(view(model)).toEqual(['a', '> a', 'b', '> b', 'c', 'd', 'e']);
  });

  it('a detail opened under a filter stays open when the filter changes or goes (D1: apart from the query)', () => {
    const { model, kernel, open } = setup();
    kernel.dispatch({ type: 'query.set', query: makeQuery({ filter: { t: { type: 'text', op: 'equals', value: 'bed' } } }) }, 'user');
    open(['d']);
    expect(view(model)).toEqual(['b', 'd', '> d']);
    expect([...kernel.expansion]).toEqual([k('d')]);
    kernel.dispatch({ type: 'query.set', query: makeQuery({ quick: 'b' }) }, 'user');
    kernel.dispatch({ type: 'query.set', query: makeQuery({}) }, 'user');
    expect(view(model)).toEqual(['a', 'b', 'c', 'd', '> d', 'e']);
    expect(model.isExpanded!(k('d'))).toBe(true);
  });

  it('collapse-all closes every detail, under a filter too (the hidden ones as well)', () => {
    const { model, kernel, open } = setup();
    open(['a', 'b']);
    kernel.dispatch({ type: 'query.set', query: makeQuery({ filter: { t: { type: 'text', op: 'equals', value: 'bed' } } }) }, 'user');
    kernel.dispatch({ type: 'rows.expandAll', expanded: false }, 'user');
    expect([...kernel.expansion]).toEqual([]);
    kernel.dispatch({ type: 'query.set', query: makeQuery({}) }, 'user');
    expect(view(model)).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('expand-all opens the rows shown (the filter’s, the page’s)', () => {
    const { model, kernel } = setup();
    kernel.dispatch({ type: 'query.set', query: makeQuery({ filter: { t: { type: 'text', op: 'equals', value: 'bed' } } }) }, 'user');
    kernel.dispatch({ type: 'rows.expandAll', expanded: true }, 'user');
    expect(view(model)).toEqual(['b', '> b', 'd', '> d']);
    expect([...kernel.expansion].sort()).toEqual([k('b'), k('d')]);
    expect(model.expandable!()).toHaveLength(5);
  });

  it("initial 'all' opens every row at the first non-empty load; 'none' (the default) nothing", () => {
    expect(view(setup({ detail: { initial: 'all' } }).model)).toEqual(['a', '> a', 'b', '> b', 'c', '> c', 'd', '> d', 'e', '> e']);
    const empty = setup({ rows: [], detail: { initial: 'all' } });
    expect(view(empty.model)).toEqual([]);
    empty.model.setRows(ROWS.slice(0, 2));
    expect(view(empty.model)).toEqual(['a', '> a', 'b', '> b']);
    expect(view(setup({ detail: { initial: 'none' } }).model)).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('a removed master leaves the expansion; an updated one shows its new data in its detail', () => {
    const { model, kernel, open } = setup();
    open(['a', 'c']);
    model.applyTransaction({ remove: ['a'], update: [{ id: 'c', n: 2, t: 'icu' }] });
    expect(view(model)).toEqual(['b', 'c', '> c', 'd', 'e']);
    expect([...kernel.expansion]).toEqual([k('c')]);
    expect((rows(model).nodeAt(rows(model).index(2)!) as { data: P }).data.t).toBe('icu');
  });
});

describe('pages with details (D2)', () => {
  it('a detail follows its master on the same page and is not a page row', () => {
    const { model, kernel, open } = setup({ page: 2 });
    open(['b', 'c']);
    expect(view(model)).toEqual(['a', 'b', '> b']);
    expect(model.page).toMatchObject({ index: 0, size: 2, total: 5, pageCount: 3 });
    kernel.dispatch({ type: 'page.go', index: 1 }, 'user');
    expect(view(model)).toEqual(['c', '> c', 'd']);
    kernel.dispatch({ type: 'page.go', index: 2 }, 'user');
    expect(view(model)).toEqual(['e']);
    expect(model.problems).toEqual([]);
  });

  it('a master opened on another page shows its detail there only', () => {
    const { model, kernel, open } = setup({ page: 2 });
    open(['e']);
    expect(view(model)).toEqual(['a', 'b']);
    kernel.dispatch({ type: 'page.go', index: 2 }, 'user');
    expect(view(model)).toEqual(['e', '> e']);
  });

  it('expand-all on a page opens the page’s rows only', () => {
    const { model, kernel } = setup({ page: 2 });
    kernel.dispatch({ type: 'rows.expandAll', expanded: true }, 'user');
    expect(view(model)).toEqual(['a', '> a', 'b', '> b']);
    expect([...kernel.expansion].sort()).toEqual([k('a'), k('b')]);
  });

  it('the page follows the sort and the filter, details under their masters', () => {
    const { model, kernel, open } = setup({ page: 2 });
    open(['d']);
    kernel.dispatch({ type: 'query.set', query: makeQuery({ sort: [{ column: 'n', dir: 'desc' }] }) }, 'user');
    expect(view(model)).toEqual(['d', '> d', 'e']);
  });
});

describe('details are never data', () => {
  it('select-all takes the data rows, the header box says all; a detail is never ticked', () => {
    const { model, kernel, open } = setup();
    open(['a', 'c']);
    kernel.dispatch({ type: 'selection.all' }, 'user');
    expect([...kernel.selection.keys].sort()).toEqual(['a', 'b', 'c', 'd', 'e'].map(k));
    expect(headerSelection(kernel.selection, rows(model))).toBe('all');
    expect(kernel.dispatch({ type: 'selection.toggle', row: x('a') }, 'user').ok).toBe(false);
  });

  it('a range across a detail takes the data rows only', () => {
    const { kernel, open } = setup();
    open(['b']);
    kernel.dispatch({ type: 'selection.toggle', row: k('a') }, 'user');
    kernel.dispatch({ type: 'selection.range', target: k('c'), additive: false }, 'user');
    expect([...kernel.selection.keys].sort()).toEqual(['a', 'b', 'c'].map(k));
  });

  it('the header box counts data rows: four of five ticked is some, five is all', () => {
    const { model, kernel, open } = setup();
    open(['a', 'b', 'c', 'd', 'e']);
    for (const id of ['a', 'b', 'c', 'd']) kernel.dispatch({ type: 'selection.toggle', row: k(id) }, 'user');
    expect(headerSelection(kernel.selection, rows(model))).toBe('some');
    kernel.dispatch({ type: 'selection.toggle', row: k('e') }, 'user');
    expect(headerSelection(kernel.selection, rows(model))).toBe('all');
  });

  it('CSV displayed: the rows shown, never a detail, and its count says so', () => {
    const { file, open } = setup();
    open(['a', 'e']);
    expect(file('displayed')).toEqual({ count: 5, lines: ['N,T', '3,ward', '1,bed', '2,ward', '5,bed', '4,ward'] });
  });

  it('CSV all: every row the query matches across pages, no detail; selected: the ticked rows', () => {
    const { file, open, kernel } = setup({ page: 2 });
    open(['a', 'b', 'e']);
    expect(file('all')).toEqual({ count: 5, lines: ['N,T', '3,ward', '1,bed', '2,ward', '5,bed', '4,ward'] });
    kernel.dispatch({ type: 'selection.toggle', row: k('e') }, 'user');
    kernel.dispatch({ type: 'selection.toggle', row: k('a') }, 'user');
    expect(file('selected')).toEqual({ count: 2, lines: ['N,T', '3,ward', '4,ward'] });
  });

  it('CSV all unpaged: no detail either', () => {
    const { file, open, model } = setup();
    open(['b']);
    expect(file('all')).toEqual({ count: 5, lines: ['N,T', '3,ward', '1,bed', '2,ward', '5,bed', '4,ward'] });
    expect(model.allRows!.count).toBe(5);
  });

  it('counts: the page and the filter count data rows; displayed counts the rows shown', () => {
    const { model, open } = setup();
    open(['a']);
    expect(model.counts).toEqual({ total: 5, filtered: 5, displayed: 6 });
  });
});

describe('heights', () => {
  /** The heights of the open details, in display order. */
  const hs = (o: DetailOptions<P>, ids: string[] = ['a', 'd']) => {
    const g = setup({ detail: o });
    g.open(ids);
    return rows(g.model).heights;
  };

  it('240 px by default (owner Q4); a number; a function of the master', () => {
    expect(hs({})).toEqual([240, 240]);
    expect(hs({ height: 100 })).toEqual([100, 100]);
    expect(hs({ height: (r) => r.n * 10 })).toEqual([30, 50]);
    expect(hs({ height: 'auto' })).toEqual([240, 240]);
  });

  it('a height that is not a finite number ≥ 0, or a function that throws, gives 240', () => {
    for (const height of [-1, NaN, Infinity, '12' as never]) expect(hs({ height }), String(height)).toEqual([240, 240]);
    expect(hs({ height: 0 })).toEqual([0, 0]);
    expect(hs({ height: () => { throw new Error('no'); } })).toEqual([240, 240]);
    expect(hs({ height: (r) => (r.id === 'a' ? NaN : 7) })).toEqual([240, 7]);
  });

  it('lays the rows out: 32 px rows, each open detail its height', () => {
    const { model, open } = setup({ detail: { height: (r) => r.n * 10 } });
    open(['b', 'd']);
    const d = rows(model);
    const L = sparseRowLayout(d, 32, { at: d.details, heights: d.heights });
    expect(L.count).toBe(7);
    expect(L.uniform).toBe(false);
    expect(L.total).toBe(5 * 32 + 10 + 50);
    expect([0, 1, 2, 3, 4, 5, 6].map((i) => L.offsetOf(i as DisplayIndex))).toEqual([0, 32, 64, 74, 106, 138, 188]);
    expect(L.heightOf(2 as DisplayIndex)).toBe(10);
    expect(L.indexAt(70)).toBe(2);
    expect(L.indexAt(74)).toBe(3);
  });

  it("'auto': the host's measures by master key, read at each build, win over the height; a bad one gives 240", () => {
    const sizes = new Map<RowKey, number>([[k('a'), 100]]);
    const { model, open } = setup({ detail: { height: 'auto', sizes } });
    open(['a', 'c']);
    expect(rows(model).heights).toEqual([100, 240]);
    // A frame's measures: kept in the map, set on the current layout in one batch.
    const d = rows(model);
    const L = sparseRowLayout(d, 32, { at: d.details, heights: d.heights });
    sizes.set(k('c'), 60);
    expect(L.setHeights([[d.indexOf(x('c')) as DisplayIndex, 60]])).toBe(true);
    expect(L.total).toBe(5 * 32 + 160);
    // Closed and reopened: its last measure.
    open(['a'], false);
    open(['a']);
    expect(rows(model).heights).toEqual([100, 60]);
    sizes.set(k('a'), -5);
    open(['b']);
    expect(rows(model).heights).toEqual([240, 240, 60]);
  });

  it('a toggle builds the heights of the details shown only (a closed master is not asked)', () => {
    const asked: string[] = [];
    const { open } = setup({ detail: { height: (r) => (asked.push(r.id), 50) } });
    open(['c']);
    open(['e']);
    expect(asked).toEqual(['c', 'c', 'e']);
  });
});

describe('refused beside, and the nesting cap', () => {
  it('spans and a tree are refused beside details (D9, Q5), as the tree refuses details', () => {
    expect(detailConflicts({ spans: true, tree: true })).toEqual([
      { code: 'unsupported-combination', severity: 'warning', path: 'spans', detail: 'detail' },
      { code: 'unsupported-combination', severity: 'warning', path: 'tree', detail: 'detail' },
    ]);
    expect(detailConflicts({})).toEqual([]);
    expect(detailConflicts({ spans: false, tree: false })).toEqual([]);
    expect(treeConflicts({ detail: true })).toEqual([{ code: 'unsupported-combination', severity: 'warning', path: 'detail', detail: 'tree' }]);
  });

  it('a nested grid declares its depth: 3 is fine, past 3 a problem, told by that grid, which still works (owner Q5)', () => {
    for (const depth of [undefined, 1, 2, 3]) expect(detailConflicts(depth === undefined ? {} : { depth }), String(depth)).toEqual([]);
    expect(detailConflicts({ depth: 4 })).toEqual([{ code: 'unsupported-combination', severity: 'warning', path: 'detail.depth', detail: '4' }]);
    expect(detailConflicts({ spans: true, depth: 7 })).toEqual([
      { code: 'unsupported-combination', severity: 'warning', path: 'spans', detail: 'detail' },
      { code: 'unsupported-combination', severity: 'warning', path: 'detail.depth', detail: '7' },
    ]);
  });
});
