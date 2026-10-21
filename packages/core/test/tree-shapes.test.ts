import { describe, it, expect } from 'vitest';
import { clientRows, createColumnModel, createKernel, dataKey, groupKey, headerSelection, localeCtx, makeQuery, type Query, type RowKey } from '@dzgrid/core';
import { treeShape, type TreeOptions, type TreeRows } from '@dzgrid/core/tree';

/**
 * `@dzgrid/core/tree`, nested (`children`) and path shapes, filler rows (Phase 4 step 5;
 * docs/behaviors/tree-view.md, tree-selection.md, tree-filter.md; docs/phase-4-steps/step05-plan.md).
 * Expectations written from the sheets and the plan, by hand.
 */
const k = (id: string) => dataKey(id)!;
type N = { id: string; n: number; t?: string; kids?: N[] | undefined; path?: readonly string[] };

const NESTED: N[] = [
  { id: 'a', n: 3, kids: [{ id: 'a1', n: 2 }, { id: 'a2', n: 1, kids: [{ id: 'a21', n: 9 }] }] },
  { id: 'b', n: 1, kids: [{ id: 'b1', n: 5 }] },
];

/** `docs` is a row (it comes after its descendants); `docs/2024`, `docs/2025` and `img` are fillers. */
const PATHS: N[] = [
  { id: 'f1', n: 5, path: ['docs', '2024', 'f1'] },
  { id: 'f2', n: 1, path: ['docs', '2025', 'f2'] },
  { id: 'd', n: 7, path: ['docs'] },
  { id: 'g', n: 2, path: ['img', 'g'] },
];

function setup(tree: TreeOptions<N>, rows: N[]) {
  const columns = createColumnModel<N>([{ id: 'n', type: 'number' }, { id: 't' }]);
  const shape = treeShape<N>(tree);
  const model = clientRows<N>({ rows, getRowId: (r) => r.id, columns, ctx: localeCtx({ locale: 'en-US' }), shape });
  const kernel = createKernel<N>({ rows: model, columns });
  return { model, kernel, shape };
}
const nested = (rows: N[] = NESTED, o: Partial<TreeOptions<N>> = {}) => setup({ children: (r) => r.kids, ...o }, rows);
const paths = (rows: N[] = PATHS, o: Partial<TreeOptions<N>> = {}) => setup({ path: (r) => r.path!, ...o }, rows);

const tree = (m: { displayed: unknown }) => m.displayed as TreeRows<N>;
/** One string per row shown: a dot per level, the id (a filler: its label in brackets), place/size. */
const view = (m: { displayed: unknown }) => {
  const d = tree(m);
  return Array.from({ length: d.count }, (_, i) => {
    const at = d.index(i)!;
    const node = d.nodeAt(at);
    const name = node.kind === 'group' ? `[${node.label}]` : String((node as { id: unknown }).id);
    return `${'. '.repeat(d.levelAt(at))}${name} ${d.posAt(at)}/${d.sizeAt(at)}${d.matchedAt(at) ? '' : ' muted'}`;
  });
};
const sortN = (dir: 'asc' | 'desc'): Query => makeQuery({ sort: [{ column: 'n', dir }] });
const openAll = (kernel: ReturnType<typeof setup>['kernel']) => kernel.dispatch({ type: 'rows.expandAll', expanded: true }, 'user');

describe('exactly one shape', () => {
  it('none: every row a root, tree-shape told with "none"', () => {
    const { model } = setup({}, [{ id: 'x', n: 1 }, { id: 'y', n: 2 }]);
    expect(view(model)).toEqual(['x 1/2', 'y 2/2']);
    expect(model.problems).toContainEqual({ code: 'tree-shape', severity: 'error', path: 'tree', detail: 'none' });
  });

  it('two: tree-shape names them; the first of parentId, children, path is used', () => {
    const rows: N[] = [{ id: 'x', n: 1, path: ['q', 'x'] }, { id: 'y', n: 2, t: 'x', path: ['y'] }];
    const { model, kernel } = setup({ path: (r) => r.path!, parentId: (r) => r.t }, rows);
    expect(model.problems).toContainEqual({ code: 'tree-shape', severity: 'error', path: 'tree', detail: 'parentId,path' });
    openAll(kernel);
    expect(view(model)).toEqual(['x 1/1', '. y 1/1']);
  });

  it('one: no tree-shape problem', () => {
    expect(nested().model.problems).toEqual([]);
    expect(paths().model.problems).toEqual([]);
  });
});

describe('nested rows (children)', () => {
  it('flattens every level into the store, keyed by getRowId; the tree as parent ids would give it', () => {
    const { model, kernel } = nested();
    expect(model.counts).toEqual({ total: 6, filtered: 6, displayed: 2 });
    expect(view(model)).toEqual(['a 1/2', 'b 2/2']);
    kernel.dispatch({ type: 'rows.expand', rows: [k('a'), k('a2')], expanded: true }, 'user');
    expect(view(model)).toEqual(['a 1/2', '. a1 1/2', '. a2 2/2', '. . a21 1/1', 'b 2/2']);
    expect(model.row(k('a21'))?.data).toBe(NESTED[0]!.kids![1]!.kids![0]);
    expect(tree(model).parentOf(k('a21'))).toBe(k('a2'));
    // Reading order of the nested data: each row, then its children.
    const all = model.allRows;
    expect(Array.from({ length: all.count }, (_, i) => all.keyAt(all.index(i)!))).toEqual(['a', 'a1', 'a2', 'a21', 'b', 'b1'].map(k));
  });

  it('sorts each level; children never leave their parent', () => {
    const { model, kernel } = nested();
    openAll(kernel);
    kernel.dispatch({ type: 'query.set', query: sortN('desc') }, 'user');
    expect(view(model)).toEqual(['a 1/2', '. a1 1/2', '. a2 2/2', '. . a21 1/1', 'b 2/2', '. b1 1/1']);
    kernel.dispatch({ type: 'query.set', query: sortN('asc') }, 'user');
    expect(view(model)).toEqual(['b 1/2', '. b1 1/1', 'a 2/2', '. a2 1/2', '. . a21 1/1', '. a1 2/2']);
  });

  it('a duplicate id at any level: the first row stays, duplicate-row-id', () => {
    const { model } = nested([{ id: 'a', n: 1, kids: [{ id: 'a', n: 2 }, { id: 'c', n: 3 }] }]);
    expect(model.counts.total).toBe(2);
    expect(model.problems.map((p) => p.code)).toContain('duplicate-row-id');
    expect(model.row(k('a'))?.data.n).toBe(1);
  });

  it('an object that holds itself does not hang the walk', () => {
    const x: N = { id: 'x', n: 0 };
    x.kids = [x, { id: 'y', n: 1 }];
    const { model, kernel } = nested([x]);
    openAll(kernel);
    expect(view(model)).toEqual(['x 1/1', '. y 1/1']);
  });

  it('a children function that throws or gives no array: a leaf', () => {
    const { model, kernel } = setup({ children: (r) => { if (r.id === 'b') throw new Error('no'); return r.kids; } }, [{ id: 'a', n: 1, kids: 'x' as never }, { id: 'b', n: 2, kids: [{ id: 'c', n: 3 }] }]);
    openAll(kernel);
    expect(view(model)).toEqual(['a 1/2', 'b 2/2']);
    expect(model.counts.total).toBe(2);
  });
});

describe('transactions on nested rows (parents from the walk’s index)', () => {
  it('add: a new root with its own children under it', () => {
    const { model, kernel } = nested();
    model.applyTransaction({ add: [{ id: 'c', n: 0, kids: [{ id: 'c1', n: 1 }] }] });
    openAll(kernel);
    expect(view(model).slice(-2)).toEqual(['c 3/3', '. c1 1/1']);
    expect(model.counts.total).toBe(8);
  });

  it('update keeps the parent; an update whose children list a new row puts that added row under it', () => {
    const { model, kernel } = nested();
    model.applyTransaction({ update: [{ id: 'a21', n: 4 }] });
    model.applyTransaction({ update: [{ id: 'b', n: 1, kids: [{ id: 'b1', n: 5 }, { id: 'b2', n: 6 }] }], add: [{ id: 'b2', n: 6 }] });
    openAll(kernel);
    expect(view(model)).toEqual(['a 1/2', '. a1 1/2', '. a2 2/2', '. . a21 1/1', 'b 2/2', '. b1 1/2', '. b2 2/2']);
    expect(model.row(k('a21'))?.data.n).toBe(4);
  });

  it('patch keeps the parent; remove makes the children orphans (root, tree-orphan); added back, they hang under it again', () => {
    const { model, kernel } = nested();
    model.applyTransaction({ patch: [{ id: 'a1', set: { n: 8 } }] });
    expect(tree(model).parentOf(k('a1'))).toBe(k('a'));
    const r = model.applyTransaction({ remove: ['a2'] });
    expect(r.kind).not.toBe('none');
    expect(tree(model).parentOf(k('a21'))).toBeNull();
    expect(model.problems).toContainEqual({ code: 'tree-orphan', severity: 'warning', path: 'parentId', detail: 'a21' });
    model.applyTransaction({ add: [{ id: 'a2', n: 1 }] });
    openAll(kernel);
    expect(tree(model).parentOf(k('a21'))).toBe(k('a2'));
    expect(tree(model).parentOf(k('a2'))).toBe(k('a'));
  });

  it('setRows builds the index again', () => {
    const { model, kernel } = nested();
    model.setRows([{ id: 'z', n: 1, kids: [{ id: 'a', n: 2 }] }]);
    openAll(kernel);
    expect(view(model)).toEqual(['z 1/1', '. a 1/1']);
  });
});

describe('path trees and filler rows', () => {
  it('missing levels become fillers: a label, a level, a group key; a row takes its own path’s place', () => {
    const { model, kernel } = paths();
    expect(view(model)).toEqual(['d 1/2', '[img] 2/2']);
    openAll(kernel);
    expect(view(model)).toEqual(['d 1/2', '. [2024] 1/2', '. . f1 1/1', '. [2025] 2/2', '. . f2 1/1', '[img] 2/2', '. g 1/1']);
    const d = tree(model);
    const at = d.indexOf(groupKey(['docs', '2024']));
    expect(at).toBe(1);
    expect(d.nodeAt(at as never)).toEqual({ key: groupKey(['docs', '2024']), kind: 'group', level: 1, label: '2024', path: ['docs', '2024'] });
    expect(d.keyAt(at as never)).toBe(groupKey(['docs', '2024']));
    expect(d.parentOf(groupKey(['docs', '2024']))).toBe(k('d'));
    expect(d.parentOf(k('f1'))).toBe(groupKey(['docs', '2024']));
    expect(d.parentOf(groupKey(['img']))).toBeNull();
    // Fillers are never counted as rows; select-all's count leaves them out.
    expect(model.counts).toEqual({ total: 4, filtered: 4, displayed: 7 });
    expect(d.dataCount).toBe(4);
  });

  it('fillers sit where their first row underneath does, in the source order or the sort’s', () => {
    const { model, kernel } = paths();
    openAll(kernel);
    kernel.dispatch({ type: 'query.set', query: sortN('asc') }, 'user');
    expect(view(model)).toEqual(['[img] 1/2', '. g 1/1', 'd 2/2', '. [2025] 1/2', '. . f2 1/1', '. [2024] 2/2', '. . f1 1/1']);
    kernel.dispatch({ type: 'query.set', query: sortN('desc') }, 'user');
    expect(view(model)).toEqual(['d 1/2', '. [2024] 1/2', '. . f1 1/1', '. [2025] 2/2', '. . f2 1/1', '[img] 2/2', '. g 1/1']);
  });

  it('a filler’s place follows its nearest rows only, not deeper ones under a row', () => {
    const rows: N[] = [
      { id: 'p', n: 9, path: ['x', 'p'] },
      { id: 'q', n: 1, path: ['x', 'p', 'q'] },
      { id: 'r', n: 5, path: ['r'] },
    ];
    const { model, kernel } = paths(rows);
    openAll(kernel);
    kernel.dispatch({ type: 'query.set', query: sortN('asc') }, 'user');
    // [x] stands where p (9) does, after r (5), though q (1) is under it.
    expect(view(model)).toEqual(['r 1/2', '[x] 2/2', '. p 1/1', '. . q 1/1']);
  });

  it('a filler opens and closes like a parent; its key stays in the set; it can be opened while hidden', () => {
    const { model, kernel } = paths();
    const f = groupKey(['docs', '2024']);
    expect(kernel.dispatch({ type: 'rows.expand', rows: [f], expanded: true }, 'user').ok).toBe(true);
    expect(model.isExpanded(f)).toBe(true);
    kernel.dispatch({ type: 'rows.expand', rows: [k('d')], expanded: true }, 'user');
    expect(view(model)).toEqual(['d 1/2', '. [2024] 1/2', '. . f1 1/1', '. [2025] 2/2', '[img] 2/2']);
    expect(kernel.expansion.has(f)).toBe(true);
    // A key no shape knows is a no-op; a data key that does not exist is refused.
    expect(kernel.dispatch({ type: 'rows.expand', rows: [groupKey(['nope'])], expanded: true }, 'user').ok).toBe(true);
    expect(kernel.dispatch({ type: 'rows.expand', rows: [k('nope')], expanded: true }, 'user').ok).toBe(false);
  });

  it('two rows with one path are siblings, the first the parent of deeper paths; an empty path is a root', () => {
    const rows: N[] = [
      { id: 'x', n: 1, path: ['a'] },
      { id: 'y', n: 2, path: ['a'] },
      { id: 'z', n: 3, path: ['a', 'b'] },
      { id: 'e', n: 4, path: [] },
      { id: 'u', n: 5, path: undefined as never },
    ];
    const { model, kernel } = paths(rows);
    openAll(kernel);
    expect(view(model)).toEqual(['x 1/4', '. z 1/1', 'y 2/4', 'e 3/4', 'u 4/4']);
  });

  it('segments are compared as text: 1 and "1" are one level', () => {
    const rows: N[] = [{ id: 'x', n: 1, path: [1 as never, 'x'] }, { id: 'y', n: 2, path: ['1', 'y'] }];
    const { model, kernel } = paths(rows);
    openAll(kernel);
    expect(view(model)).toEqual(['[1] 1/1', '. x 1/2', '. y 2/2']);
  });

  it('under a filter fillers never match: kept, muted, when a row below is shown; never counted', () => {
    const { model, kernel } = paths();
    kernel.dispatch({ type: 'query.set', query: makeQuery({ filter: { n: { type: 'number', op: 'gte', value: 5 } } }) }, 'user');
    expect(view(model)).toEqual(['d 1/1', '. [2024] 1/1 muted', '. . f1 1/1']);
    expect(model.counts.filtered).toBe(2);
    expect(tree(model).dataCount).toBe(2);
    kernel.dispatch({ type: 'query.set', query: makeQuery({ filter: { n: { type: 'number', op: 'equals', value: 2 } } }) }, 'user');
    expect(view(model)).toEqual(['[img] 1/1 muted', '. g 1/1']);
    expect(model.counts.filtered).toBe(1);
  });

  it('subtree mode: a filler under a match is shown with it', () => {
    const { model, kernel } = paths(PATHS, { filter: 'subtree' });
    openAll(kernel);
    kernel.dispatch({ type: 'query.set', query: makeQuery({ filter: { n: { type: 'number', op: 'equals', value: 7 } } }) }, 'user');
    expect(view(model)).toEqual(['d 1/1', '. [2024] 1/2 muted', '. . f1 1/1 muted', '. [2025] 2/2 muted', '. . f2 1/1 muted']);
  });

  it('a row moved to another path by a transaction: the old filler goes, keys never change', () => {
    const { model, kernel } = paths();
    model.applyTransaction({ update: [{ id: 'f1', n: 5, path: ['img', 'f1'] }] });
    openAll(kernel);
    // f1 (source 0) now comes first under [img], which takes its place: before d.
    expect(view(model)).toEqual(['[img] 1/2', '. f1 1/2', '. g 2/2', 'd 2/2', '. [2025] 1/1', '. . f2 1/1']);
    expect(tree(model).indexOf(groupKey(['docs', '2024']))).toBe(-1);
  });

  it('initial "all" opens the fillers too', () => {
    const { model } = paths(PATHS, { initial: 'all' });
    expect(model.displayed.count).toBe(7);
  });
});

describe('selection over fillers (independent, owner Q2)', () => {
  it('select-all, the header box and ranges skip fillers; toggling a filler is refused', () => {
    const { model, kernel } = paths();
    openAll(kernel);
    kernel.dispatch({ type: 'selection.all' }, 'user');
    const s = kernel.selection;
    expect(s.mode).toBe('include');
    expect([...s.keys].sort()).toEqual(['d', 'f1', 'f2', 'g'].map(k).sort());
    expect(headerSelection(s, model.displayed)).toBe('all');
    expect(kernel.dispatch({ type: 'selection.toggle', row: groupKey(['img']) }, 'user').ok).toBe(false);
    expect(kernel.dispatch({ type: 'selection.only', row: groupKey(['img']) }, 'user').ok).toBe(false);
    kernel.dispatch({ type: 'selection.only', row: k('d') }, 'user');
    kernel.dispatch({ type: 'selection.range', target: k('g'), additive: false }, 'user');
    expect([...kernel.selection.keys]).toEqual(['d', 'f1', 'f2', 'g'].map(k));
  });

  it('collapsing keeps hidden selected rows, counted (all three shapes)', () => {
    const parent = setup({ parentId: (r) => r.t }, [{ id: 'a', n: 1 }, { id: 'a1', n: 2, t: 'a' }]);
    const nest = nested([{ id: 'a', n: 1, kids: [{ id: 'a1', n: 2 }] }]);
    const path = paths([{ id: 'a1', n: 2, path: ['a', 'a1'] }]);
    for (const [g, top] of [[parent, k('a')], [nest, k('a')], [path, groupKey(['a'])]] as const) {
      let count: number | null = null;
      g.kernel.subscribe((e) => void (e.type === 'selectionChanged' && (count = e.count)));
      g.kernel.dispatch({ type: 'rows.expand', rows: [top as RowKey], expanded: true }, 'user');
      g.kernel.dispatch({ type: 'selection.toggle', row: k('a1') }, 'user');
      g.kernel.dispatch({ type: 'rows.expand', rows: [top as RowKey], expanded: false }, 'user');
      expect(g.model.displayed.indexOf(k('a1'))).toBe(-1);
      expect(g.kernel.selection.keys.has(k('a1'))).toBe(true);
      expect(count).toBe(1);
    }
  });
});
