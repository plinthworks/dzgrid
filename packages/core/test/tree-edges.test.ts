import { describe, it, expect } from 'vitest';
import { clientRows, createColumnModel, createKernel, dataKey, localeCtx, makeQuery, type GridEvent, type Query } from '@dzgrid/core';
import { treeShape, type TreeOptions, type TreeRows } from '@dzgrid/core/tree';

/**
 * Edges the random walk does not reach (tree-view.md, tree-filter.md, tree-keys.md,
 * tree-selection.md): scale (deep chains, wide levels) through the kernel, expandAll under a
 * filter, select-all under a filter, focus fallbacks. The last block held `it.fails` repros of
 * what the sheets promised and the code did not do; each failed, then was fixed.
 */
type R = { id: string; p?: string | null; n: number; t?: string };
const k = (id: string) => dataKey(id)!;
const ROWS: R[] = [
  { id: 'a', n: 3, t: 'ward' },
  { id: 'a1', p: 'a', n: 2, t: 'bed' },
  { id: 'a2', p: 'a', n: 1, t: 'bed' },
  { id: 'a21', p: 'a2', n: 9, t: 'chart' },
  { id: 'b', n: 1, t: 'ward' },
  { id: 'b1', p: 'b', n: 5, t: 'bed' },
];

function setup(rows: R[] = ROWS, tree: Partial<TreeOptions<R>> = {}) {
  const columns = createColumnModel<R>([{ id: 'n', type: 'number' }, { id: 't' }]);
  const model = clientRows<R>({ rows, getRowId: (r) => r.id, columns, ctx: localeCtx({ locale: 'en-US' }), shape: treeShape<R>({ parentId: (r) => r.p, ...tree }) });
  const kernel = createKernel<R>({ rows: model, columns });
  const events: GridEvent<R>[] = [];
  kernel.subscribe((e) => events.push(e));
  return { model, kernel, events };
}
const ids = (m: { displayed: unknown }) => {
  const d = m.displayed as TreeRows<R>;
  return Array.from({ length: d.count }, (_, i) => String((d.nodeAt(d.index(i)!) as { id: unknown }).id));
};
const filterT = (text: string): Query => makeQuery({ filter: { t: { type: 'text', op: 'equals', value: text } } });
const expandedEvents = (events: GridEvent<R>[]) => events.filter((e) => e.type === 'rowExpanded');

describe('scale, through the kernel', () => {
  it('a chain of 10 000 levels: expandAll, a focus at the bottom, a collapse at the top, a filter on the leaf', () => {
    const N = 10_000;
    const rows: R[] = Array.from({ length: N }, (_, i) => ({ id: `c${i}`, ...(i && { p: `c${i - 1}` }), n: i, t: i === N - 1 ? 'leaf' : 'mid' }));
    const { model, kernel, events } = setup(rows);
    const t0 = performance.now();
    kernel.dispatch({ type: 'rows.expandAll', expanded: true }, 'user');
    expect(model.displayed.count).toBe(N);
    const d = model.displayed as TreeRows<R>;
    expect(d.levelAt(d.index(N - 1)!)).toBe(N - 1);
    expect(expandedEvents(events)[0]).toMatchObject({ rows: { length: N - 1 } });
    kernel.dispatch({ type: 'focus.set', focus: { kind: 'cell', row: k(`c${N - 1}`), column: 'n' } }, 'user');
    // Closing the middle: the focus climbs 5 000 levels to the nearest shown ancestor.
    kernel.dispatch({ type: 'rows.expand', rows: [k('c4999')], expanded: false }, 'user');
    expect(model.displayed.count).toBe(5000);
    expect(kernel.focus).toEqual({ kind: 'cell', row: k('c4999'), column: 'n' });
    kernel.dispatch({ type: 'rows.expandAll', expanded: false }, 'user');
    expect(ids(model)).toEqual(['c0']);
    expect(kernel.focus).toEqual({ kind: 'cell', row: k('c0'), column: 'n' });
    // A filter on the leaf opens its 9 999 ancestors without touching the user's set.
    kernel.dispatch({ type: 'query.set', query: filterT('leaf') }, 'user');
    expect(model.displayed.count).toBe(N);
    expect(kernel.expansion.size).toBe(0);
    kernel.dispatch({ type: 'selection.all' }, 'user');
    kernel.dispatch({ type: 'query.set', query: makeQuery() }, 'user');
    expect(ids(model)).toEqual(['c0']);
    // Re-parenting the root under the leaf: a cycle of 10 000, broken at c0, no hang.
    model.applyTransaction({ update: [{ id: 'c0', p: `c${N - 1}`, n: 0, t: 'mid' }] });
    expect(model.problems.filter((p) => p.code === 'tree-cycle')).toHaveLength(1);
    expect(ids(model)).toEqual(['c0']);
    expect(performance.now() - t0).toBeLessThan(5000);
  });

  it('100 000 siblings under one parent: expand, posinset/setsize, focus fallback, select-all, range', () => {
    const N = 100_000;
    const rows: R[] = [{ id: 'root', n: 0 }, ...Array.from({ length: N }, (_, i) => ({ id: `s${i}`, p: 'root', n: (i * 7919) % 1000 }))];
    const { model, kernel } = setup(rows);
    const t0 = performance.now();
    kernel.dispatch({ type: 'query.set', query: makeQuery({ sort: [{ column: 'n', dir: 'desc' }] }) }, 'user');
    kernel.dispatch({ type: 'rows.expand', rows: [k('root')], expanded: true }, 'user');
    const d = model.displayed as TreeRows<R>;
    expect(d.count).toBe(N + 1);
    expect([d.posAt(d.index(1)!), d.sizeAt(d.index(1)!), d.posAt(d.index(N)!), d.sizeAt(d.index(N)!)]).toEqual([1, N, N, N]);
    // Sorted per level, stable.
    for (let i = 2; i <= N; i++) expect((d.nodeAt(d.index(i - 1)!) as { data: R }).data.n >= (d.nodeAt(d.index(i)!) as { data: R }).data.n).toBe(true);
    const last = d.keyAt(d.index(N)!);
    kernel.dispatch({ type: 'focus.set', focus: { kind: 'cell', row: last, column: 'n' } }, 'user');
    kernel.dispatch({ type: 'selection.only', row: d.keyAt(d.index(1)!) }, 'user');
    kernel.dispatch({ type: 'selection.range', target: last, additive: false }, 'user');
    expect(kernel.selection.keys.size).toBe(N);
    kernel.dispatch({ type: 'selection.all' }, 'user');
    expect(kernel.selection.keys.size).toBe(N + 1);
    kernel.dispatch({ type: 'rows.expand', rows: [k('root')], expanded: false }, 'user');
    expect(kernel.focus).toEqual({ kind: 'cell', row: k('root'), column: 'n' });
    // Selection of hidden rows is kept (tree-selection.md).
    expect(kernel.selection.keys.size).toBe(N + 1);
    // Removing half of them while closed prunes nothing open, keeps the parent open state.
    model.applyTransaction({ remove: Array.from({ length: N / 2 }, (_, i) => `s${i * 2}`) });
    kernel.dispatch({ type: 'rows.expand', rows: [k('root')], expanded: true }, 'user');
    expect(model.displayed.count).toBe(N / 2 + 1);
    expect(performance.now() - t0).toBeLessThan(10_000);
  });
});

describe('transactions against the expansion and the focus', () => {
  it('a row moved under a closed parent takes the focus to that parent', () => {
    const { model, kernel } = setup();
    kernel.dispatch({ type: 'rows.expandAll', expanded: true }, 'user');
    kernel.dispatch({ type: 'rows.expand', rows: [k('b')], expanded: false }, 'user');
    kernel.dispatch({ type: 'focus.set', focus: { kind: 'cell', row: k('a21'), column: 'n' } }, 'user');
    model.applyTransaction({ update: [{ id: 'a21', p: 'b1', n: 9, t: 'chart' }] });
    expect(kernel.focus).toEqual({ kind: 'cell', row: k('b'), column: 'n' });
  });

  it('a parent removed: its children become roots (orphans) and keep their own open state', () => {
    const { model, kernel } = setup();
    kernel.dispatch({ type: 'rows.expandAll', expanded: true }, 'user');
    model.applyTransaction({ remove: ['a'] });
    expect(ids(model)).toEqual(['a1', 'a2', 'a21', 'b', 'b1']);
    expect(model.problems.filter((p) => p.code === 'tree-orphan')).toHaveLength(2);
    expect(kernel.expansion.has(k('a'))).toBe(false);
    expect(kernel.expansion.has(k('a2'))).toBe(true);
  });

  it('a toggle made under a filter, on a row then removed, is forgotten: re-added, it follows the filter again', () => {
    const { model, kernel } = setup();
    kernel.dispatch({ type: 'query.set', query: filterT('chart') }, 'user');
    kernel.dispatch({ type: 'rows.expand', rows: [k('a2')], expanded: false }, 'user');
    model.applyTransaction({ remove: ['a2'] });
    model.applyTransaction({ add: [{ id: 'a2', p: 'a', n: 1, t: 'bed' }], update: [{ id: 'a21', p: 'a2', n: 9, t: 'chart' }] });
    expect(ids(model)).toEqual(['a', 'a2', 'a21']);
  });
});

describe('expandAll under a filter', () => {
  it('expandAll(true) opens every parent, the rows closed by a toggle under the filter too', () => {
    const { kernel, model } = setup();
    kernel.dispatch({ type: 'query.set', query: filterT('chart') }, 'user');
    kernel.dispatch({ type: 'rows.expand', rows: [k('a2')], expanded: false }, 'user');
    expect(ids(model)).toEqual(['a', 'a2']);
    kernel.dispatch({ type: 'rows.expandAll', expanded: true }, 'user');
    expect(ids(model)).toEqual(['a', 'a2', 'a21']);
    expect(model.isExpanded(k('a2'))).toBe(true);
  });
});

describe('expand on rows with no children', () => {
  // Lead decision (tree-view.md): leaves carry no aria-expanded and opening one is a no-op, without
  // event; a child added later shows the leaf closed. (A shape may declare children before they
  // load, step 7.)
  it('opening a leaf changes nothing and tells nothing', () => {
    const { kernel, events, model } = setup();
    kernel.dispatch({ type: 'rows.expand', rows: [k('a')], expanded: true }, 'user');
    events.length = 0;
    kernel.dispatch({ type: 'rows.expand', rows: [k('a1')], expanded: true }, 'user');
    expect(events).toEqual([]);
    expect(kernel.expansion.has(k('a1'))).toBe(false);
    model.applyTransaction({ add: [{ id: 'a11', p: 'a1', n: 0 }] });
    expect(ids(model)).toEqual(['a', 'a1', 'a2', 'b']);
  });

  it('under a filter, a row whose children are all hidden is a leaf too', () => {
    const { kernel, events } = setup();
    kernel.dispatch({ type: 'query.set', query: filterT('ward') }, 'user');
    events.length = 0;
    kernel.dispatch({ type: 'rows.expand', rows: [k('a'), k('b')], expanded: true }, 'user');
    kernel.dispatch({ type: 'rows.expandAll', expanded: true }, 'user');
    expect(events).toEqual([]);
  });
});

describe('fixed: what the sheets say and the code did not do (each failed first)', () => {
  // tree-filter.md, Selection: "select-all takes the matching rows shown (not the muted ancestors
  // unless they match)".
  it('select-all under a filter skips the muted ancestors', () => {
    const { kernel } = setup();
    kernel.dispatch({ type: 'query.set', query: filterT('chart') }, 'user');
    kernel.dispatch({ type: 'selection.all' }, 'user');
    expect([...kernel.selection.keys]).toEqual([k('a21')]);
  });

  // tree-filter.md: "clearing the filter brings back the tree exactly as the user had opened it
  // before filtering"; toggles meanwhile are "a separate, temporary layer".
  it('expandAll under a filter leaves the user’s own tree as it was once the filter clears', () => {
    const { kernel, model } = setup();
    kernel.dispatch({ type: 'rows.expand', rows: [k('b')], expanded: true }, 'user');
    const before = ids(model);
    kernel.dispatch({ type: 'query.set', query: filterT('bed') }, 'user');
    kernel.dispatch({ type: 'rows.expandAll', expanded: false }, 'user');
    kernel.dispatch({ type: 'query.set', query: makeQuery() }, 'user');
    expect(ids(model)).toEqual(before);
  });

  // "Collapse all" while filtered: the rows the filter opened stay open, and nothing is told.
  it('expandAll(false) under a filter closes the rows shown open', () => {
    const { kernel, model, events } = setup();
    kernel.dispatch({ type: 'query.set', query: filterT('chart') }, 'user');
    expect(ids(model)).toEqual(['a', 'a2', 'a21']);
    kernel.dispatch({ type: 'rows.expandAll', expanded: false }, 'user');
    expect(ids(model)).toEqual(['a']);
    expect(expandedEvents(events)).toHaveLength(1);
  });

  // tree-view.md: one rowExpanded per action, for the rows whose state changed (kernel docs:
  // "nothing when unchanged"). Under a filter the ancestors are already shown open.
  it('expandAll(true) under a filter does not tell rows that were already shown open', () => {
    const { kernel, events } = setup();
    kernel.dispatch({ type: 'query.set', query: filterT('chart') }, 'user');
    events.length = 0;
    kernel.dispatch({ type: 'rows.expandAll', expanded: true }, 'user');
    const told = expandedEvents(events).flatMap((e) => (e as { rows: readonly string[] }).rows);
    expect(told).not.toContain(k('a'));
    expect(told).not.toContain(k('a2'));
  });

  // tree-filter.md (lead decision): the focus stays on its row if it is still shown, else goes to
  // the nearest ancestor shown, else follows the flat rule: the row now at its old place.
  it('a focus a filter hides, with no ancestor shown, goes to the row now at its old place', () => {
    const rows: R[] = [{ id: 'w', n: 1, t: 'x' }, { id: 'x', n: 1, t: 'x' }, { id: 'y', n: 1, t: 'y' }, { id: 'z', n: 1, t: 'x' }];
    const { kernel } = setup(rows);
    kernel.dispatch({ type: 'focus.set', focus: { kind: 'cell', row: k('y'), column: 'n' } }, 'user');
    kernel.dispatch({ type: 'query.set', query: filterT('x') }, 'user');
    expect(kernel.focus).toEqual({ kind: 'cell', row: k('z'), column: 'n' });
  });
});

describe('review of steps 2-3', () => {
  it('a row removed and added again in one transaction keeps its open state', () => {
    const { model, kernel } = setup();
    kernel.dispatch({ type: 'rows.expand', rows: [k('a')], expanded: true }, 'user');
    model.applyTransaction({ remove: ['a'], add: [{ id: 'a', n: 4, t: 'ward' }] });
    expect(kernel.expansion.has(k('a'))).toBe(true);
    expect(ids(model)).toEqual(['b', 'a', 'a1', 'a2']);
  });

  it('tree.initial does not overwrite an expansion the host set before the first rows', () => {
    const { model } = setup([], { initial: 'all' });
    model.setExpansion(new Set([k('b')]));
    model.setRows(ROWS);
    expect(ids(model)).toEqual(['a', 'b', 'b1']);
    expect([...model.expansion!]).toEqual([k('b')]);
  });

  it('tree.initial applies when nothing was set before the first rows', () => {
    const { model } = setup([], { initial: 1 });
    model.setRows(ROWS);
    expect(ids(model)).toEqual(['a', 'a1', 'a2', 'b', 'b1']);
  });

  it('toggles patch the open flags: many toggles agree with a fresh build of the same state', () => {
    const { model, kernel } = setup();
    for (const [id, on] of [['a', true], ['a2', true], ['b', true], ['a', false], ['a', true], ['a2', false]] as const) {
      kernel.dispatch({ type: 'rows.expand', rows: [k(id)], expanded: on }, 'user');
    }
    expect(ids(model)).toEqual(['a', 'a1', 'a2', 'b', 'b1']);
    kernel.dispatch({ type: 'query.set', query: filterT('chart') }, 'user');
    kernel.dispatch({ type: 'rows.expand', rows: [k('a2')], expanded: false }, 'user');
    kernel.dispatch({ type: 'rows.expand', rows: [k('a')], expanded: false }, 'user');
    kernel.dispatch({ type: 'rows.expand', rows: [k('a')], expanded: true }, 'user');
    expect(ids(model)).toEqual(['a', 'a2']);
    kernel.dispatch({ type: 'query.set', query: makeQuery() }, 'user');
    expect(ids(model)).toEqual(['a', 'a1', 'a2', 'b', 'b1']);
  });

  it('the header box under a filter counts the matches only', () => {
    const { kernel } = setup();
    kernel.dispatch({ type: 'query.set', query: filterT('chart') }, 'user');
    kernel.dispatch({ type: 'selection.only', row: k('a21') }, 'user');
    expect(kernel.headerState).toBe('all');
    kernel.dispatch({ type: 'selection.toggle', row: k('a') }, 'user');
    expect(kernel.headerState).toBe('all');
    kernel.dispatch({ type: 'selection.clear' }, 'user');
    kernel.dispatch({ type: 'selection.only', row: k('a') }, 'user');
    expect(kernel.headerState).toBe('none');
  });
});
