import { describe, it, expect } from 'vitest';
import { clientRows, createColumnModel, createKernel, dataKey, localeCtx, makeQuery, type GridEvent, type Query, type RowKey } from '@dzgrid/core';
import { treeConflicts, treeShape, type TreeOptions, type TreeRows } from '@dzgrid/core/tree';
import type { TR } from './support/tree-oracle.js';

/**
 * `@dzgrid/core/tree`, parent mode (Phase 4 step 3; docs/behaviors/tree-view.md, tree-filter.md,
 * tree-keys.md). Expectations written from the sheets, by hand.
 */
const k = (id: string) => dataKey(id)!;
type R = TR & { t?: string };
const ROWS: R[] = [
  { id: 'a', n: 3, t: 'ward' },
  { id: 'a1', p: 'a', n: 2, t: 'bed' },
  { id: 'a2', p: 'a', n: 1, t: 'bed' },
  { id: 'a21', p: 'a2', n: 9, t: 'chart' },
  { id: 'b', n: 1, t: 'ward' },
  { id: 'b1', p: 'b', n: 5, t: 'bed' },
];

function setup(o: { rows?: R[]; tree?: Partial<TreeOptions<R>>; page?: boolean } = {}) {
  const columns = createColumnModel<R>([{ id: 'n', type: 'number' }, { id: 't' }]);
  const shape = treeShape<R>({ parentId: (r) => r.p, ...o.tree });
  const model = clientRows<R>({ rows: o.rows ?? ROWS, getRowId: (r) => r.id, columns, ctx: localeCtx({ locale: 'en-US' }), shape, ...(o.page && { page: { pageSize: 2 } }) });
  const kernel = createKernel<R>({ rows: model, columns });
  const events: GridEvent<R>[] = [];
  kernel.subscribe((e) => events.push(e));
  return { model, kernel, events, shape };
}
const tree = (m: { displayed: unknown }) => m.displayed as TreeRows<R>;
/** The rows shown as `". . id pos/size"`: one dot per level, hand-readable. */
const view = (m: { displayed: unknown }) => {
  const d = tree(m);
  return Array.from({ length: d.count }, (_, i) => {
    const at = d.index(i)!;
    return `${'. '.repeat(d.levelAt(at))}${String((d.nodeAt(at) as { id: unknown }).id)} ${d.posAt(at)}/${d.sizeAt(at)}`;
  });
};
const sortN = (dir: 'asc' | 'desc'): Query => makeQuery({ sort: [{ column: 'n', dir }] });

describe('building and showing a tree from parent ids', () => {
  it('shows the roots first, closed, at level 0', () => {
    const { model } = setup();
    expect(view(model)).toEqual(['a 1/2', 'b 2/2']);
    expect(model.counts).toEqual({ total: 6, filtered: 6, displayed: 2 });
  });

  it('opens a row under it, children in order, deeper rows indented', () => {
    const { kernel, model } = setup();
    kernel.dispatch({ type: 'rows.expand', rows: [k('a'), k('a2')], expanded: true }, 'user');
    expect(view(model)).toEqual(['a 1/2', '. a1 1/2', '. a2 2/2', '. . a21 1/1', 'b 2/2']);
    // A hidden row's open state is kept: closing a then opening it shows a2 still open.
    kernel.dispatch({ type: 'rows.expand', rows: [k('a')], expanded: false }, 'user');
    expect(view(model)).toEqual(['a 1/2', 'b 2/2']);
    kernel.dispatch({ type: 'rows.expand', rows: [k('a')], expanded: true }, 'user');
    expect(view(model)).toEqual(['a 1/2', '. a1 1/2', '. a2 2/2', '. . a21 1/1', 'b 2/2']);
  });

  it('gives each row its level, its parent, its key; a hidden row has no index', () => {
    const { kernel, model } = setup();
    kernel.dispatch({ type: 'rows.expand', rows: [k('a')], expanded: true }, 'user');
    const d = tree(model);
    expect(d.parentOf(k('a21'))).toBe(k('a2'));
    expect(d.parentOf(k('a'))).toBeNull();
    expect(d.parentOf(k('zz'))).toBeNull();
    expect(d.indexOf(k('a21'))).toBe(-1);
    expect(d.indexOf(k('a2'))).toBe(2);
    const node = d.nodeAt(d.index(2)!);
    expect(node).toEqual({ key: k('a2'), kind: 'data', level: 1, id: 'a2', data: ROWS[2] });
    expect(d.keyAt(d.index(1)!)).toBe(k('a1'));
    expect(d.nextData(d.index(0)!, 1)?.key).toBe(k('a1'));
    expect(d.nextData(d.index(0)!, -1)).toBeNull();
    expect(d.childrenAt(d.index(0)!)).toBe(2);
    expect(d.childrenAt(d.index(1)!)).toBe(0);
    expect(d.expandedAt(d.index(0)!)).toBe(true);
    expect(d.expandedAt(d.index(2)!)).toBe(false);
    expect(() => d.nodeAt(9 as never)).toThrow(RangeError);
    expect(d.index(5)).toBeNull();
  });

  it('sorts each level among itself; a child never leaves its parent', () => {
    const { kernel, model } = setup();
    kernel.dispatch({ type: 'rows.expandAll', expanded: true }, 'user');
    kernel.dispatch({ type: 'query.set', query: sortN('asc') }, 'user');
    // n: b 1 < a 3; under a: a2 1 < a1 2.
    expect(view(model)).toEqual(['b 1/2', '. b1 1/1', 'a 2/2', '. a2 1/2', '. . a21 1/1', '. a1 2/2']);
    kernel.dispatch({ type: 'query.set', query: sortN('desc') }, 'user');
    expect(view(model)).toEqual(['a 1/2', '. a1 1/2', '. a2 2/2', '. . a21 1/1', 'b 2/2', '. b1 1/1']);
  });

  it('opening re-flattens only: no structure, order or filter work again', () => {
    const { kernel, model, shape } = setup();
    kernel.dispatch({ type: 'query.set', query: sortN('asc') }, 'user');
    let before = { ...shape.diagnostics };
    let m = { ...model.diagnostics };
    kernel.dispatch({ type: 'rows.expand', rows: [k('a')], expanded: true }, 'user');
    expect(shape.diagnostics).toEqual({ ...before, flattens: before.flattens + 1 });
    expect([model.diagnostics.filterRuns, model.diagnostics.sortRuns]).toEqual([m.filterRuns, m.sortRuns]);
    // Under a filter too (a toggle of its layer).
    kernel.dispatch({ type: 'query.set', query: makeQuery({ sort: [{ column: 'n', dir: 'asc' }], filter: { n: { type: 'number', op: 'gt', value: 4 } } }) }, 'user');
    before = { ...shape.diagnostics };
    m = { ...model.diagnostics };
    kernel.dispatch({ type: 'rows.expand', rows: [k('a')], expanded: false }, 'user');
    expect(shape.diagnostics).toEqual({ ...before, flattens: before.flattens + 1 });
    expect([model.diagnostics.filterRuns, model.diagnostics.sortRuns]).toEqual([m.filterRuns, m.sortRuns]);
  });

  it('a sort orders again but builds the structure once', () => {
    const { kernel, shape } = setup();
    const before = { ...shape.diagnostics };
    kernel.dispatch({ type: 'query.set', query: sortN('asc') }, 'user');
    expect(shape.diagnostics.builds).toBe(before.builds);
    expect(shape.diagnostics.orders).toBe(before.orders + 1);
  });
});

describe('repairs: orphans, cycles, duplicates', () => {
  it('puts a row whose parent does not exist at the root, with tree-orphan', () => {
    const { model } = setup({ rows: [{ id: 'x', n: 1 }, { id: 'y', p: 'nobody', n: 2 }, { id: 'z', p: 'x', n: 3 }] });
    expect(view(model)).toEqual(['x 1/2', 'y 2/2']);
    expect(model.problems).toEqual([{ code: 'tree-orphan', severity: 'warning', path: 'parentId', detail: 'y' }]);
  });

  it('treats null, undefined and an empty id as a root, silently; a parentId that throws as an orphan', () => {
    const rows = [{ id: 'a', p: null, n: 1 }, { id: 'b', n: 2 }, { id: 'c', p: '', n: 3 }, { id: 'd', p: 'boom', n: 4 }] as R[];
    const { model } = setup({ rows, tree: { parentId: (r) => { if (r.p === 'boom') throw new Error('x'); return r.p; } } });
    expect(view(model)).toEqual(['a 1/4', 'b 2/4', 'c 3/4', 'd 4/4']);
    expect(model.problems.map((p) => [p.code, p.detail])).toEqual([['tree-orphan', 'd']]);
  });

  it('breaks a cycle at its first row, keeps the rows hanging from it, never hangs', () => {
    const rows: R[] = [{ id: 'r', n: 0 }, { id: 'c1', p: 'c2', n: 1 }, { id: 'c2', p: 'c3', n: 2 }, { id: 'c3', p: 'c1', n: 3 }, { id: 'h', p: 'c2', n: 4 }];
    const { kernel, model } = setup({ rows });
    kernel.dispatch({ type: 'rows.expandAll', expanded: true }, 'user');
    expect(view(model)).toEqual(['r 1/2', 'c1 2/2', '. c3 1/1', '. . c2 1/1', '. . . h 1/1']);
    expect(model.problems).toEqual([{ code: 'tree-cycle', severity: 'warning', path: 'parentId', detail: 'c1' }]);
  });

  it('a row that is its own parent is a cycle of one', () => {
    const { model } = setup({ rows: [{ id: 's', p: 's', n: 1 }, { id: 't', p: 's', n: 2 }] });
    expect(view(model)).toEqual(['s 1/1']);
    expect(model.problems).toEqual([{ code: 'tree-cycle', severity: 'warning', path: 'parentId', detail: 's' }]);
  });

  it('a long chain does not overflow anything (10 000 levels)', () => {
    const rows: R[] = Array.from({ length: 10_000 }, (_, i) => ({ id: `n${i}`, ...(i && { p: `n${i - 1}` }), n: i }));
    const { kernel, model } = setup({ rows });
    kernel.dispatch({ type: 'rows.expandAll', expanded: true }, 'user');
    const d = tree(model);
    expect(d.count).toBe(10_000);
    expect(d.levelAt(d.index(9_999)!)).toBe(9_999);
    expect(d.parentOf(k('n9999'))).toBe(k('n9998'));
  });

  it('a duplicate id is the store’s: the first row stays, duplicate-row-id', () => {
    const { model } = setup({ rows: [{ id: 'a', n: 1 }, { id: 'a', p: 'a', n: 2 }] });
    expect(view(model)).toEqual(['a 1/1']);
    expect(model.problems.map((p) => p.code)).toEqual(['duplicate-row-id']);
  });

  it('tells a tree problem once, and again only when it changes', () => {
    const { model, events } = setup();
    model.applyTransaction({ remove: ['a'] });
    const told = () => events.filter((e) => e.type === 'problems').map((e) => e.type === 'problems' && e.problems.map((p) => `${p.code} ${p.detail}`));
    expect(told()).toEqual([['tree-orphan a1', 'tree-orphan a2']]);
    model.applyTransaction({ patch: [{ id: 'b', set: { n: 7 } }] });
    expect(told()).toHaveLength(1);
  });

  it('a removal elsewhere does not tell the same orphans again (named by id, not by place)', () => {
    const { model, events } = setup({ rows: [{ id: 'w', n: 1 }, { id: 'y', p: 'nobody', n: 2 }] });
    model.applyTransaction({ remove: ['w'] });
    expect(events.filter((e) => e.type === 'problems')).toEqual([]);
    expect(model.problems).toEqual([{ code: 'tree-orphan', severity: 'warning', path: 'parentId', detail: 'y' }]);
  });
});

describe('transactions', () => {
  it('removing a parent makes its children roots, with tree-orphan; adding it back re-attaches them', () => {
    const { kernel, model } = setup();
    kernel.dispatch({ type: 'rows.expandAll', expanded: true }, 'user');
    model.applyTransaction({ remove: ['a'] });
    expect(view(model)).toEqual(['a1 1/3', 'a2 2/3', '. a21 1/1', 'b 3/3', '. b1 1/1']);
    expect(model.problems.map((p) => p.code)).toEqual(['tree-orphan', 'tree-orphan']);
    expect(kernel.expansion.has(k('a'))).toBe(false);
    model.applyTransaction({ add: [{ id: 'a', n: 3 }] });
    expect(view(model)).toEqual(['b 1/2', '. b1 1/1', 'a 2/2']);
    expect(model.problems).toEqual([]);
  });

  it('moves a row by a new parent id; keys never change', () => {
    const { kernel, model } = setup();
    kernel.dispatch({ type: 'rows.expandAll', expanded: true }, 'user');
    model.applyTransaction({ patch: [{ id: 'a2', set: { p: 'b' } }] });
    // Siblings in source order without a sort: a2 comes before b1.
    expect(view(model)).toEqual(['a 1/2', '. a1 1/1', 'b 2/2', '. a2 1/2', '. . a21 1/1', '. b1 2/2']);
    const d = tree(model);
    expect(d.keyAt(d.index(3)!)).toBe(k('a2'));
    expect(d.parentOf(k('a2'))).toBe(k('b'));
  });

  it('adds a child under an open parent, in sort order', () => {
    const { kernel, model } = setup();
    kernel.dispatch({ type: 'query.set', query: sortN('asc') }, 'user');
    kernel.dispatch({ type: 'rows.expand', rows: [k('b')], expanded: true }, 'user');
    model.applyTransaction({ add: [{ id: 'b0', p: 'b', n: 0 }] });
    expect(view(model)).toEqual(['b 1/2', '. b0 1/2', '. b1 2/2', 'a 2/2']);
  });
});

describe('filtering a tree (tree-filter.md)', () => {
  const filterT = (text: string): Query => makeQuery({ filter: { t: { type: 'text', op: 'equals', value: text } } });

  it('keeps matches and their ancestors, opened while the filter is on; counts the matches', () => {
    const { kernel, model } = setup();
    kernel.dispatch({ type: 'query.set', query: filterT('chart') }, 'user');
    expect(view(model)).toEqual(['a 1/1', '. a2 1/1', '. . a21 1/1']);
    expect(model.counts).toEqual({ total: 6, filtered: 1, displayed: 3 });
    const d = tree(model);
    expect([0, 1, 2].map((i) => d.matchedAt(d.index(i)!))).toEqual([false, false, true]);
    // The user's own set is untouched.
    expect(kernel.expansion.size).toBe(0);
  });

  it('restores the user’s tree when the filter clears, without an event for the automatic opening', () => {
    const { kernel, model, events } = setup();
    kernel.dispatch({ type: 'rows.expand', rows: [k('b')], expanded: true }, 'user');
    kernel.dispatch({ type: 'query.set', query: filterT('chart') }, 'user');
    kernel.dispatch({ type: 'query.set', query: makeQuery() }, 'user');
    expect(view(model)).toEqual(['a 1/2', 'b 2/2', '. b1 1/1']);
    expect(events.filter((e) => e.type === 'rowExpanded')).toHaveLength(1);
  });

  it('toggles made while filtered are a layer of their own, dropped when the filter clears or changes', () => {
    const { kernel, model, events } = setup();
    kernel.dispatch({ type: 'query.set', query: filterT('chart') }, 'user');
    events.length = 0;
    kernel.dispatch({ type: 'rows.expand', rows: [k('a2')], expanded: false }, 'user');
    expect(view(model)).toEqual(['a 1/1', '. a2 1/1']);
    expect(events.filter((e) => e.type === 'rowExpanded')).toEqual([{ type: 'rowExpanded', source: 'user', rows: [k('a2')], expanded: false }]);
    expect(kernel.expansion.size).toBe(0);
    expect(model.isExpanded(k('a2'))).toBe(false);
    expect(model.isExpanded(k('a'))).toBe(true);
    kernel.dispatch({ type: 'query.set', query: makeQuery() }, 'user');
    expect(view(model)).toEqual(['a 1/2', 'b 2/2']);
    kernel.dispatch({ type: 'query.set', query: filterT('chart') }, 'user');
    expect(view(model)).toEqual(['a 1/1', '. a2 1/1', '. . a21 1/1']);
  });

  it('counts posinset and setsize among the siblings shown', () => {
    const { kernel, model } = setup();
    kernel.dispatch({ type: 'query.set', query: filterT('bed') }, 'user');
    expect(view(model)).toEqual(['a 1/2', '. a1 1/2', '. a2 2/2', 'b 2/2', '. b1 1/1']);
    expect(model.counts.filtered).toBe(3);
  });

  it("'subtree' also shows the descendants of a match, closed unless opened", () => {
    const { kernel, model } = setup({ tree: { filter: 'subtree' } });
    kernel.dispatch({ type: 'query.set', query: filterT('ward') }, 'user');
    expect(view(model)).toEqual(['a 1/2', 'b 2/2']);
    kernel.dispatch({ type: 'rows.expand', rows: [k('a')], expanded: true }, 'user');
    expect(view(model)).toEqual(['a 1/2', '. a1 1/2', '. a2 2/2', 'b 2/2']);
    const d = tree(model);
    expect(d.matchedAt(d.index(1)!)).toBe(false);
  });

  it('the quick search filters the same way', () => {
    const { kernel, model } = setup();
    kernel.dispatch({ type: 'quick.set', text: 'chart' }, 'user');
    expect(view(model)).toEqual(['a 1/1', '. a2 1/1', '. . a21 1/1']);
  });

  it('a filter change under the same sort sorts nothing again', () => {
    const { kernel, model } = setup();
    kernel.dispatch({ type: 'query.set', query: makeQuery({ sort: [{ column: 'n', dir: 'asc' }] }) }, 'user');
    const sorts = model.diagnostics.sortRuns;
    kernel.dispatch({ type: 'filter.column', column: 't', filter: { type: 'text', op: 'equals', value: 'bed' } }, 'user');
    kernel.dispatch({ type: 'filter.column', column: 't', filter: null }, 'user');
    expect(model.diagnostics.sortRuns).toBe(sorts);
  });

  it('a focus on a row the filter hides goes to its nearest shown ancestor', () => {
    const { kernel } = setup();
    kernel.dispatch({ type: 'rows.expandAll', expanded: true }, 'user');
    kernel.dispatch({ type: 'focus.set', focus: { kind: 'cell', row: k('a1'), column: 'n' } }, 'user');
    kernel.dispatch({ type: 'query.set', query: filterT('chart') }, 'user');
    expect(kernel.focus).toEqual({ kind: 'cell', row: k('a'), column: 'n' });
  });
});

describe('what is open at the start (tree.initial)', () => {
  it("'all' opens every parent at the first non-empty load", () => {
    const { model } = setup({ tree: { initial: 'all' } });
    expect(view(model)).toEqual(['a 1/2', '. a1 1/2', '. a2 2/2', '. . a21 1/1', 'b 2/2', '. b1 1/1']);
  });

  it('a number opens the levels above it', () => {
    const { model } = setup({ tree: { initial: 1 } });
    expect(view(model)).toEqual(['a 1/2', '. a1 1/2', '. a2 2/2', 'b 2/2', '. b1 1/1']);
  });

  it('applies once: an empty first load waits for rows; a later load keeps what the user did', () => {
    const { model, kernel } = setup({ rows: [], tree: { initial: 'all' } });
    expect(model.displayed.count).toBe(0);
    model.setRows(ROWS);
    expect(view(model)).toHaveLength(6);
    kernel.dispatch({ type: 'rows.expandAll', expanded: false }, 'user');
    model.setRows([...ROWS]);
    expect(view(model)).toEqual(['a 1/2', 'b 2/2']);
  });
});

describe('what a tree does not combine with', () => {
  it('browser pages: unsupported-combination, the tree shown whole', () => {
    const { model } = setup({ page: true });
    expect(model.page).toBeNull();
    expect(model.problems[0]).toEqual({ code: 'unsupported-combination', severity: 'warning', path: 'pagination', detail: 'tree' });
    expect(view(model)).toEqual(['a 1/2', 'b 2/2']);
  });

  it('cell spans and details: the problems the DOM layer tells', () => {
    expect(treeConflicts({ spans: true, detail: true })).toEqual([
      { code: 'unsupported-combination', severity: 'warning', path: 'spans', detail: 'tree' },
      { code: 'unsupported-combination', severity: 'warning', path: 'detail', detail: 'tree' },
    ]);
    expect(treeConflicts({})).toEqual([]);
  });
});

describe('every row, all open (allRows, for the CSV)', () => {
  it('lists every row the filter keeps in tree order, closed or not', () => {
    const { kernel, model } = setup();
    const all = model.allRows as TreeRows<R>;
    expect(Array.from({ length: all.count }, (_, i) => all.keyAt(all.index(i)!))).toEqual(['a', 'a1', 'a2', 'a21', 'b', 'b1'].map(k));
    kernel.dispatch({ type: 'query.set', query: makeQuery({ filter: { t: { type: 'text', op: 'equals', value: 'bed' } } }) }, 'user');
    const f = model.allRows as TreeRows<R>;
    expect(Array.from({ length: f.count }, (_, i) => f.keyAt(f.index(i)!) as RowKey)).toEqual(['a', 'a1', 'a2', 'b', 'b1'].map(k));
  });
});
