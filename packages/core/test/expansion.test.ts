import { describe, it, expect } from 'vitest';
import {
  clientRows, createColumnModel, createKernel, dataKey, groupKey, detailKey, headerSelection, localeCtx, makeQuery, selectOnly,
  type GridEvent, type RowKey, type RowNode,
} from '@dzgrid/core';
import { stubShape, type SR } from './support/stub-shape.js';

/**
 * Step 2 of Phase 4 (docs/behaviors/tree-view.md, tree-keys.md, tree-selection.md): the base's
 * seams for trees, tested through a stub shape (`support/stub-shape.ts`) before `@dzgrid/core/tree`.
 */
const k = (id: string) => dataKey(id)!;
const ROWS: SR[] = [
  { id: 'a', n: 3 },
  { id: 'a1', p: 'a', n: 2 },
  { id: 'a2', p: 'a', n: 1 },
  { id: 'a21', p: 'a2', n: 9 },
  { id: 'b', n: 1 },
  { id: 'b1', p: 'b', n: 5 },
];

function setup(o: { extra?: boolean; rows?: SR[] } = {}) {
  const columns = createColumnModel<SR>([{ id: 'n', type: 'number' }, { id: 't' }]);
  const shape = stubShape(o);
  const model = clientRows<SR>({ rows: o.rows ?? ROWS, getRowId: (r) => r.id, columns, ctx: localeCtx({ locale: 'en-US' }), shape });
  const kernel = createKernel<SR>({ rows: model, columns });
  const events: GridEvent<SR>[] = [];
  kernel.subscribe((e) => events.push(e));
  return { model, kernel, events, shape, columns };
}
const shown = (m: { displayed: { count: number; keyAt(i: never): RowKey; index(n: number): unknown } }) =>
  Array.from({ length: m.displayed.count }, (_, i) => m.displayed.keyAt(m.displayed.index(i) as never));

describe('row nodes (types)', () => {
  it('narrows the union by kind: data rows carry data, fillers a label, details their master', () => {
    const nodes: RowNode<SR>[] = [
      { key: k('a'), kind: 'data', level: 0, id: 'a', data: ROWS[0]! },
      { key: groupKey(['x']), kind: 'group', level: 0, label: 'x', path: ['x'] },
      { key: detailKey(k('a')), kind: 'detail', level: 1, master: k('a'), data: ROWS[0]! },
    ];
    const seen = nodes.map((n) => (n.kind === 'data' ? n.data.id : n.kind === 'group' ? n.label : n.master));
    expect(seen).toEqual(['a', 'x', k('a')]);
  });
});

describe('a client model with a shape', () => {
  it('shows what the shape builds, with nothing open at first', () => {
    const { model } = setup();
    expect(shown(model)).toEqual([k('a'), k('b')]);
    expect(model.expansion!.size).toBe(0);
  });

  it('re-flattens only on setExpansion: no filter, no sort run again, one displayed build, kind expand', () => {
    const { model, shape } = setup();
    model.setQuery(makeQuery({ sort: [{ column: 'n', dir: 'asc' }], filter: { n: { type: 'number', op: 'gt', value: 0 } } }));
    const before = { ...model.diagnostics };
    const changes: string[] = [];
    model.subscribe((c) => changes.push(`${c.kind}:${c.source}`));
    const input = shape.calls.at(-1)!;
    model.setExpansion(new Set([k('a')]), 'user');
    const after = model.diagnostics;
    expect(after.filterRuns).toBe(before.filterRuns);
    expect(after.sortRuns).toBe(before.sortRuns);
    expect(after.displayedBuilds).toBe(before.displayedBuilds + 1);
    expect(changes).toEqual(['expand:user']);
    const call = shape.calls.at(-1)!;
    // The same order and the same matches, by identity: only the expansion moved.
    expect(call.order).toBe(input.order);
    expect(call.matched).toBe(input.matched);
    expect([...call.expansion]).toEqual([k('a')]);
    expect(call.version).toBeGreaterThan(input.version);
    expect(shown(model)).toEqual([k('b'), k('a'), k('a2'), k('a1')]);
  });

  it('hands the shape every row sorted, not only the matches: an ancestor keeps its place', () => {
    const { model, shape } = setup();
    model.setQuery(makeQuery({ sort: [{ column: 'n', dir: 'asc' }], filter: { n: { type: 'number', op: 'gt', value: 4 } } }));
    const call = shape.calls.at(-1)!;
    expect(call.order!.length).toBe(ROWS.length);
    expect(call.filterActive).toBe(true);
    expect([...call.matched!]).toEqual([0, 0, 0, 1, 0, 1]);
    expect(model.counts.filtered).toBe(2);
    // A filter change under the same sort does not sort again.
    const sorts = model.diagnostics.sortRuns;
    model.setQuery(makeQuery({ sort: [{ column: 'n', dir: 'asc' }], filter: { n: { type: 'number', op: 'gt', value: 2 } } }));
    expect(model.diagnostics.sortRuns).toBe(sorts);
    expect([...shape.calls.at(-1)!.matched!]).toEqual([1, 0, 0, 1, 0, 1]);
  });

  it('refuses browser pages with a tree (unsupported-combination) and shows the tree unpaged', () => {
    const columns = createColumnModel<SR>([{ id: 'n', type: 'number' }]);
    const model = clientRows<SR>({ rows: ROWS, getRowId: (r) => r.id, columns, ctx: localeCtx({ locale: 'en-US' }), shape: stubShape(), page: { pageSize: 1 } });
    expect(model.page).toBeNull();
    expect(model.ops.page).toBe('off');
    expect(model.problems).toContainEqual({ code: 'unsupported-combination', severity: 'warning', path: 'pagination', detail: 'tree' });
    expect(shown(model)).toEqual([k('a'), k('b')]);
  });
});

describe('the kernel: expansion', () => {
  it('opens rows with rows.expand: the model re-flattens, one rowExpanded with keys only', () => {
    const { kernel, model, events } = setup();
    expect(kernel.dispatch({ type: 'rows.expand', rows: [k('a')], expanded: true }, 'user')).toEqual({ ok: true });
    expect([...kernel.expansion]).toEqual([k('a')]);
    expect(shown(model)).toEqual([k('a'), k('a1'), k('a2'), k('b')]);
    const told = events.filter((e) => e.type === 'rowExpanded');
    expect(told).toEqual([{ type: 'rowExpanded', source: 'user', rows: [k('a')], expanded: true }]);
    const updated = events.find((e) => e.type === 'modelUpdated');
    expect(updated && updated.type === 'modelUpdated' && updated.kind).toBe('expand');
    // After modelUpdated: whoever hears rowExpanded reads the new rows.
    expect(events.findIndex((e) => e.type === 'modelUpdated')).toBeLessThan(events.findIndex((e) => e.type === 'rowExpanded'));
  });

  it('tells only the rows whose state changed, and nothing when none did', () => {
    const { kernel, events } = setup();
    kernel.dispatch({ type: 'rows.expand', rows: [k('a')], expanded: true }, 'api');
    events.length = 0;
    expect(kernel.dispatch({ type: 'rows.expand', rows: [k('a'), k('b')], expanded: true }, 'api')).toEqual({ ok: true });
    expect(events.filter((e) => e.type === 'rowExpanded')).toEqual([{ type: 'rowExpanded', source: 'api', rows: [k('b')], expanded: true }]);
    events.length = 0;
    expect(kernel.dispatch({ type: 'rows.expand', rows: [k('a'), k('b')], expanded: true }, 'api')).toEqual({ ok: true });
    expect(events).toEqual([]);
    expect(kernel.dispatch({ type: 'rows.expand', rows: [k('b1')], expanded: false }, 'api')).toEqual({ ok: true });
    expect(events).toEqual([]);
  });

  it('closes rows; the expansion is not in the query: no page, selection or query reset', () => {
    const { kernel, events } = setup();
    kernel.dispatch({ type: 'selection.toggle', row: k('a') }, 'user');
    kernel.dispatch({ type: 'rows.expand', rows: [k('a')], expanded: true }, 'user');
    const key = kernel.query.key;
    events.length = 0;
    kernel.dispatch({ type: 'rows.expand', rows: [k('a')], expanded: false }, 'user');
    expect(kernel.query.key).toBe(key);
    expect([...kernel.selection.keys]).toEqual([k('a')]);
    expect(events.map((e) => e.type)).toEqual(['modelUpdated', 'rowExpanded']);
    expect(kernel.expansion.size).toBe(0);
  });

  it('refuses an unknown row and a grid with no shape, changing nothing', () => {
    const { kernel, events } = setup();
    expect(kernel.dispatch({ type: 'rows.expand', rows: [k('a'), k('zz')], expanded: true }, 'api')).toMatchObject({ ok: false, reason: 'unknown-row' });
    expect(kernel.expansion.size).toBe(0);
    const columns = createColumnModel<SR>([{ id: 'n', type: 'number' }]);
    const flat = createKernel<SR>({ rows: clientRows<SR>({ rows: ROWS, getRowId: (r) => r.id, columns, ctx: localeCtx({ locale: 'en-US' }) }), columns });
    expect(flat.dispatch({ type: 'rows.expand', rows: [k('a')], expanded: true }, 'api')).toMatchObject({ ok: false, reason: 'expansion-off' });
    expect(flat.dispatch({ type: 'rows.expandAll', expanded: true }, 'api')).toMatchObject({ ok: false, reason: 'expansion-off' });
    expect(flat.expansion.size).toBe(0);
    expect(events).toEqual([]);
  });

  it('expandAll opens every parent, or those above a depth, in one event; collapses likewise', () => {
    const { kernel, model, events } = setup();
    kernel.dispatch({ type: 'rows.expandAll', expanded: true, depth: 1 }, 'user');
    expect([...kernel.expansion].sort()).toEqual([k('a'), k('b')].sort());
    expect(shown(model)).toEqual([k('a'), k('a1'), k('a2'), k('b'), k('b1')]);
    kernel.dispatch({ type: 'rows.expandAll', expanded: true }, 'user');
    expect(shown(model)).toEqual([k('a'), k('a1'), k('a2'), k('a21'), k('b'), k('b1')]);
    const told = events.filter((e) => e.type === 'rowExpanded');
    expect(told.map((e) => e.type === 'rowExpanded' && [...e.rows].sort())).toEqual([[k('a'), k('b')].sort(), [k('a2')]]);
    // Collapse below depth 1: the roots stay open.
    events.length = 0;
    kernel.dispatch({ type: 'rows.expandAll', expanded: false, depth: 1 }, 'user');
    expect([...kernel.expansion].sort()).toEqual([k('a'), k('b')].sort());
    expect(events.filter((e) => e.type === 'rowExpanded')).toEqual([{ type: 'rowExpanded', source: 'user', rows: [k('a2')], expanded: false }]);
    kernel.dispatch({ type: 'rows.expandAll', expanded: false }, 'user');
    expect(kernel.expansion.size).toBe(0);
    events.length = 0;
    kernel.dispatch({ type: 'rows.expandAll', expanded: false }, 'user');
    expect(events).toEqual([]);
    expect(kernel.dispatch({ type: 'rows.expandAll', expanded: true, depth: -1 }, 'user')).toMatchObject({ ok: false, reason: 'invalid-depth' });
    expect(kernel.dispatch({ type: 'rows.expandAll', expanded: true, depth: 1.5 }, 'user')).toMatchObject({ ok: false, reason: 'invalid-depth' });
  });

  it('collapsing below a depth leaves the keys of rows without children alone', () => {
    const { kernel } = setup();
    // b1 has no children: an open key kept for a lazy load later (step 7), not a parent below the depth.
    kernel.dispatch({ type: 'rows.expand', rows: [k('a'), k('a2'), k('b1')], expanded: true }, 'user');
    kernel.dispatch({ type: 'rows.expandAll', expanded: false, depth: 1 }, 'user');
    expect([...kernel.expansion].sort()).toEqual([k('a'), k('b1')].sort());
  });

  it('moves a focus a collapse hides to the nearest shown ancestor, same column', () => {
    const { kernel, events } = setup();
    kernel.dispatch({ type: 'rows.expandAll', expanded: true }, 'user');
    kernel.dispatch({ type: 'focus.set', focus: { kind: 'cell', row: k('a21'), column: 't' } }, 'user');
    events.length = 0;
    kernel.dispatch({ type: 'rows.expand', rows: [k('a')], expanded: false }, 'api');
    expect(kernel.focus).toEqual({ kind: 'cell', row: k('a'), column: 't' });
    expect(events.map((e) => e.type)).toEqual(['modelUpdated', 'focusChanged', 'rowExpanded']);
    expect(events[1]).toMatchObject({ source: 'data' });
  });

  it('a focus that stays shown does not move', () => {
    const { kernel } = setup();
    kernel.dispatch({ type: 'rows.expandAll', expanded: true }, 'user');
    kernel.dispatch({ type: 'focus.set', focus: { kind: 'cell', row: k('b1'), column: 'n' } }, 'user');
    kernel.dispatch({ type: 'rows.expand', rows: [k('a')], expanded: false }, 'user');
    expect(kernel.focus).toEqual({ kind: 'cell', row: k('b1'), column: 'n' });
  });

  it('prunes the keys of removed rows; a reload keeps those still there', () => {
    const { kernel, model, events } = setup();
    kernel.dispatch({ type: 'rows.expandAll', expanded: true }, 'user');
    events.length = 0;
    model.applyTransaction({ remove: ['a2'] });
    expect([...kernel.expansion].sort()).toEqual([k('a'), k('b')].sort());
    expect(events.filter((e) => e.type === 'rowExpanded')).toEqual([]);
    // Re-added under the same id: closed (its key left the set).
    model.applyTransaction({ add: [{ id: 'a2', p: 'a', n: 1 }] });
    expect(kernel.expansion.has(k('a2'))).toBe(false);
    model.setRows([{ id: 'a', n: 1 }, { id: 'a1', p: 'a', n: 1 }]);
    expect([...kernel.expansion]).toEqual([k('a')]);
    expect(shown(model)).toEqual([k('a'), k('a1')]);
  });
});

describe('rows that are not data (fillers, details)', () => {
  it('selection.allDisplayed takes the data rows shown only', () => {
    const { kernel, model } = setup({ extra: true });
    expect(model.displayed.nodeAt(model.displayed.index(0)!).kind).toBe('group');
    kernel.dispatch({ type: 'selection.allDisplayed' }, 'user');
    expect([...kernel.selection.keys].sort()).toEqual([k('a'), k('b')].sort());
  });

  it('the header box reads all when every data row shown is selected', () => {
    const { kernel, model } = setup({ extra: true });
    expect(headerSelection(selectOnly([k('a'), k('b')]), model.displayed)).toBe('all');
    expect(headerSelection(selectOnly([k('a')]), model.displayed)).toBe('some');
    expect(headerSelection({ mode: 'exclude', keys: new Set() }, model.displayed)).toBe('all');
    kernel.dispatch({ type: 'selection.allDisplayed' }, 'user');
    expect(kernel.headerState).toBe('all');
  });

  it('a Shift range skips them', () => {
    const { kernel } = setup({ extra: true });
    kernel.dispatch({ type: 'selection.only', row: k('a') }, 'user');
    kernel.dispatch({ type: 'selection.range', target: k('b'), additive: false }, 'user');
    expect([...kernel.selection.keys].sort()).toEqual([k('a'), k('b')].sort());
  });

  it('cannot be selected', () => {
    const { kernel } = setup({ extra: true });
    expect(kernel.dispatch({ type: 'selection.toggle', row: groupKey(['folder']) }, 'user')).toMatchObject({ ok: false });
    expect(kernel.dispatch({ type: 'selection.toggle', row: detailKey(k('a')) }, 'user')).toMatchObject({ ok: false });
  });
});
