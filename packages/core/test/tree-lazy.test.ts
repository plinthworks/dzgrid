import { describe, it, expect } from 'vitest';
import { makeQuery, type RowKey } from '@dzgrid/core';
import { flush, k, lk, ROWS, setupA, type LR } from './support/lazy.js';

/**
 * Lazy children, the host's loader (A) — Phase 4 step 7, docs/behaviors/tree-lazy.md,
 * docs/phase-4-steps/step07-plan.md. `a` and `b` have children not loaded yet; `c` has one in memory.
 */
const kids = (parent: string, ...ids: string[]): LR[] => ids.map((id, i) => ({ id, p: parent, n: 10 - i }));

describe('a declared parent, closed', () => {
  it('shows as a parent with an unknown number of children (-1), closed; a row with none declared is a leaf', () => {
    const s = setupA();
    const d = s.d();
    expect(s.shown()).toEqual(['a 1/3', 'b 2/3', 'c 3/3']);
    expect([0, 1, 2].map((i) => d.childrenAt(d.index(i)!))).toEqual([-1, -1, 1]);
    expect(d.expandedAt(d.index(0)!)).toBe(false);
    expect(s.loads.length).toBe(0);
  });

  it('a declared row is opened by rows.expand (not a no-op), with one rowExpanded from the user', () => {
    const s = setupA();
    expect(s.open('a').ok).toBe(true);
    expect([...s.kernel.expansion]).toEqual([k('a')]);
    const ev = s.events.filter((e) => e.type === 'rowExpanded');
    expect(ev).toEqual([{ type: 'rowExpanded', source: 'user', rows: [k('a')], expanded: true }]);
  });
});

describe('opening a declared parent with nothing loaded', () => {
  it('shows one loading row under it (level + 1, 1 of unknown), and asks once, with the row', () => {
    const s = setupA();
    s.open('a');
    expect(s.shown()).toEqual(['a 1/3', '. … 1/-1', 'b 2/3', 'c 3/3']);
    const d = s.d();
    const node = d.nodeAt(d.index(1)!);
    expect(node).toEqual({ key: lk('a'), kind: 'loading', level: 1, parent: k('a'), failed: false });
    expect(d.keyAt(d.index(1)!)).toBe(lk('a'));
    expect(d.indexOf(lk('a'))).toBe(1);
    expect(d.indexOf(k('b'))).toBe(2);
    expect(d.childrenAt(d.index(1)!)).toBe(0);
    expect(d.expandedAt(d.index(1)!)).toBe(false);
    expect(d.matchedAt(d.index(1)!)).toBe(true);
    expect(d.childrenAt(d.index(0)!)).toBe(-1);
    expect(d.expandedAt(d.index(0)!)).toBe(true);
    // Not data: select-all takes the three rows only.
    expect(d.dataCount).toBe(3);
    expect(s.loads.map((l) => l.row.id)).toEqual(['a']);
    expect(s.loads[0]!.signal.aborted).toBe(false);
    expect(s.shape.lazy.diagnostics).toMatchObject({ started: 1, live: 1 });
  });

  it('a second opening, another change, or a sort while loading starts no second request', () => {
    const s = setupA();
    s.open('a');
    s.open('a');
    s.kernel.dispatch({ type: 'query.set', query: makeQuery({ sort: [{ column: 'n', dir: 'asc' }] }) }, 'user');
    s.open('b');
    expect(s.loads.map((l) => l.row.id)).toEqual(['a', 'b']);
    expect(s.shown()).toEqual(['b 1/3', '. … 1/-1', 'c 2/3', 'a 3/3', '. … 1/-1']);
  });

  it('the answer takes the loading row\'s place, sorted; no rowExpanded for the load; told as a data change', async () => {
    const s = setupA();
    s.kernel.dispatch({ type: 'query.set', query: makeQuery({ sort: [{ column: 'n', dir: 'asc' }] }) }, 'user');
    s.open('a');
    const before = s.events.length;
    s.loads[0]!.resolve(kids('a', 'a1', 'a2', 'a3'));
    await flush();
    expect(s.shown()).toEqual(['b 1/3', 'c 2/3', 'a 3/3', '. a3 1/3', '. a2 2/3', '. a1 3/3']);
    const after = s.events.slice(before);
    expect(after.some((e) => e.type === 'rowExpanded')).toBe(false);
    expect(after.find((e) => e.type === 'modelUpdated')).toMatchObject({ source: 'data' });
    expect(s.shape.lazy.diagnostics).toMatchObject({ started: 1, answered: 1, live: 0 });
    expect(s.model.counts.total).toBe(7);
    expect(s.d().childrenAt(s.d().index(2)!)).toBe(3);
  });

  it('a load answering a list synchronously, or a thenable, works the same', async () => {
    const s = setupA({ lazy: { load: (row) => (row.id === 'a' ? kids('a', 'a1') : ({ then: (ok: (v: LR[]) => void) => ok(kids('b', 'b1')) } as never)) } });
    s.open('a');
    s.open('b');
    await flush();
    expect(s.shown()).toEqual(['a 1/3', '. a1 1/1', 'b 2/3', '. b1 1/1', 'c 3/3']);
  });

  it('an answer of no child makes a leaf', async () => {
    const s = setupA();
    s.open('a');
    s.loads[0]!.resolve([]);
    await flush();
    expect(s.shown()).toEqual(['a 1/3', 'b 2/3', 'c 3/3']);
    expect(s.d().childrenAt(s.d().index(0)!)).toBe(0);
    // A leaf now: opening or closing it is a no-op.
    s.open('a', false);
    expect(s.kernel.expansion.has(k('a'))).toBe(true);
  });

  it('children whose parent id names another row go there; the parent asked is a leaf', async () => {
    const s = setupA();
    s.open('a');
    s.loads[0]!.resolve([{ id: 'x', p: 'c', n: 0 }]);
    await flush();
    s.open('c');
    expect(s.shown()).toEqual(['a 1/3', 'b 2/3', 'c 3/3', '. c1 1/2', '. x 2/2']);
  });
});

describe('closing, hiding and forgetting stop the load', () => {
  it('a collapse while loading aborts it and drops its answer; opening again asks again', async () => {
    const s = setupA();
    s.open('a');
    s.open('a', false);
    expect(s.loads[0]!.signal.aborted).toBe(true);
    expect(s.shown()).toEqual(['a 1/3', 'b 2/3', 'c 3/3']);
    s.loads[0]!.resolve(kids('a', 'a1'));
    await flush();
    expect(s.model.row(k('a1'))).toBeUndefined();
    s.open('a');
    expect(s.loads.length).toBe(2);
    s.loads[1]!.resolve(kids('a', 'a2'));
    await flush();
    expect(s.shown()).toEqual(['a 1/3', '. a2 1/1', 'b 2/3', 'c 3/3']);
    expect(s.shape.lazy.diagnostics).toMatchObject({ started: 2, answered: 1, aborted: 1, live: 0 });
  });

  it('an ancestor closed hides the loading row: aborted; shown again, it asks again', async () => {
    const s = setupA({ rows: [{ id: 'r', n: 0 }, { id: 'a', p: 'r', n: 1, lazy: true }] });
    s.open('r');
    s.open('a');
    expect(s.shown()).toEqual(['r 1/1', '. a 1/1', '. . … 1/-1']);
    s.open('r', false);
    expect(s.loads[0]!.signal.aborted).toBe(true);
    s.open('r');
    expect(s.loads.length).toBe(2);
    expect(s.shown()).toEqual(['r 1/1', '. a 1/1', '. . … 1/-1']);
  });

  it('a filter hiding the parent aborts its load; a declared row hidden by a filter is never asked', () => {
    const s = setupA();
    s.open('a');
    s.kernel.dispatch({ type: 'query.set', query: makeQuery({ filter: { n: { type: 'number', op: 'lt', value: 3 } } }) }, 'user');
    expect(s.loads[0]!.signal.aborted).toBe(true);
    expect(s.shown()).toEqual(['b 1/2', 'c 2/2']);
    s.open('b');
    expect(s.loads.map((l) => l.row.id)).toEqual(['a', 'b']);
  });

  it('the parent row removed by the host aborts its load', () => {
    const s = setupA();
    s.open('a');
    s.model.applyTransaction({ remove: ['a'] });
    expect(s.loads[0]!.signal.aborted).toBe(true);
    expect(s.shape.lazy.diagnostics.live).toBe(0);
  });

  it('reset aborts every load and forgets them', () => {
    const s = setupA();
    s.open('a');
    s.open('b');
    s.shape.lazy.reset();
    expect(s.loads.every((l) => l.signal.aborted)).toBe(true);
    expect(s.shape.lazy.diagnostics).toMatchObject({ aborted: 2, live: 0 });
  });
});

describe('a failure, and Retry', () => {
  it('a rejected load turns the loading row into the error row (same key); retry asks again', async () => {
    const s = setupA();
    const told: [RowKey, boolean][] = [];
    s.shape.lazy.on((p, ok) => told.push([p, ok]));
    s.open('a');
    s.loads[0]!.reject(new Error('503'));
    await flush();
    expect(s.shown()).toEqual(['a 1/3', '. ! 1/-1', 'b 2/3', 'c 3/3']);
    expect(s.d().nodeAt(s.d().index(1)!)).toEqual({ key: lk('a'), kind: 'loading', level: 1, parent: k('a'), failed: true });
    expect(told).toEqual([[k('a'), false]]);
    expect(s.loads.length).toBe(1);
    s.shape.lazy.retry(k('a'));
    expect(s.shown()).toEqual(['a 1/3', '. … 1/-1', 'b 2/3', 'c 3/3']);
    expect(s.loads.length).toBe(2);
    s.loads[1]!.resolve(kids('a', 'a1'));
    await flush();
    expect(s.shown()).toEqual(['a 1/3', '. a1 1/1', 'b 2/3', 'c 3/3']);
    expect(told).toEqual([[k('a'), false], [k('a'), true]]);
    expect(s.shape.lazy.diagnostics).toMatchObject({ started: 2, answered: 1, failed: 1 });
  });

  it('a load that throws at once, or answers what is not a list, fails too', async () => {
    const s = setupA({ lazy: { load: (row) => { if (row.id === 'a') throw new Error('no'); return 'nope' as never; } } });
    s.open('a');
    s.open('b');
    await flush();
    expect(s.shown()).toEqual(['a 1/3', '. ! 1/-1', 'b 2/3', '. ! 1/-1', 'c 3/3']);
  });

  it('with no loader at all, opening fails (the error row), never hangs loading', async () => {
    const s = setupA({ noLoad: true });
    s.open('a');
    await flush();
    expect(s.shown()).toEqual(['a 1/3', '. ! 1/-1', 'b 2/3', 'c 3/3']);
  });

  it('retry on a row that is not failed does nothing; collapsing a failed row forgets the failure', async () => {
    const s = setupA();
    s.shape.lazy.retry(k('a'));
    s.open('a');
    s.shape.lazy.retry(k('a'));
    expect(s.loads.length).toBe(1);
    s.loads[0]!.reject('x');
    await flush();
    s.open('a', false);
    s.open('a');
    expect(s.shown()).toEqual(['a 1/3', '. … 1/-1', 'b 2/3', 'c 3/3']);
    expect(s.loads.length).toBe(2);
  });
});

describe('the cache', () => {
  it('opening again a parent loaded asks nothing', async () => {
    const s = setupA();
    s.open('a');
    s.loads[0]!.resolve(kids('a', 'a1'));
    await flush();
    s.open('a', false);
    s.open('a');
    expect(s.loads.length).toBe(1);
    expect(s.shown()).toEqual(['a 1/3', '. a1 1/1', 'b 2/3', 'c 3/3']);
  });

  it('setRows forgets the cache: an open parent whose children went asks again; a load running for a row still open goes on', async () => {
    const s = setupA();
    s.open('a');
    s.loads[0]!.resolve(kids('a', 'a1'));
    await flush();
    s.open('b');
    s.model.setRows([{ id: 'a', n: 3, lazy: true }, { id: 'b', n: 1, lazy: true }]);
    expect(s.loads[1]!.signal.aborted).toBe(false);
    expect(s.loads.map((l) => l.row.id)).toEqual(['a', 'b', 'a']);
    expect(s.shown()).toEqual(['a 1/2', '. … 1/-1', 'b 2/2', '. … 1/-1']);
    s.loads[1]!.resolve(kids('b', 'b1'));
    await flush();
    expect(s.shown()).toEqual(['a 1/2', '. … 1/-1', 'b 2/2', '. b1 1/1']);
  });

  it('setRows without the parent loading stops its load', () => {
    const s = setupA();
    s.open('b');
    s.model.setRows([{ id: 'a', n: 3, lazy: true }]);
    expect(s.loads[0]!.signal.aborted).toBe(true);
    expect(s.shape.lazy.diagnostics.live).toBe(0);
  });

  it('setRows with the same rows changes nothing: the load running goes on', () => {
    const s = setupA();
    s.open('a');
    s.model.setRows(ROWS);
    expect(s.loads[0]!.signal.aborted).toBe(false);
    expect(s.shown()[1]).toBe('. … 1/-1');
  });

  it('a refresh removes the rows the loads brought, and the open parents load again', async () => {
    const s = setupA();
    s.open('a');
    s.loads[0]!.resolve(kids('a', 'a1', 'a2'));
    await flush();
    s.open('a1');
    s.kernel.dispatch({ type: 'rows.refresh' }, 'user');
    expect(s.model.row(k('a1'))).toBeUndefined();
    expect(s.model.row(k('c1'))).toBeDefined();
    expect(s.shown()).toEqual(['a 1/3', '. … 1/-1', 'b 2/3', 'c 3/3']);
    expect(s.loads.length).toBe(2);
  });
});

describe('expand-all, the filter, the focus', () => {
  it('expand-all opens loaded parents only: no request; collapse-all closes a loading row\'s parent too', () => {
    const s = setupA();
    s.kernel.dispatch({ type: 'rows.expandAll', expanded: true }, 'user');
    expect(s.loads.length).toBe(0);
    expect([...s.kernel.expansion]).toEqual([k('c')]);
    expect(s.model.expandable()).toEqual([k('c')]);
    s.open('a');
    s.kernel.dispatch({ type: 'rows.expandAll', expanded: false }, 'user');
    expect(s.kernel.expansion.size).toBe(0);
    expect(s.loads[0]!.signal.aborted).toBe(true);
  });

  it('collapse-all under a filter closes an open loading row too', () => {
    const s = setupA();
    s.kernel.dispatch({ type: 'query.set', query: makeQuery({ filter: { n: { type: 'number', op: 'gt', value: 0 } } }) }, 'user');
    s.open('a');
    s.kernel.dispatch({ type: 'rows.expandAll', expanded: false }, 'user');
    expect(s.loads[0]!.signal.aborted).toBe(true);
    expect(s.shown()).toEqual(['a 1/3', 'b 2/3', 'c 3/3']);
  });

  it('a filter applies to the loaded rows; a declared parent whose loaded rows are all filtered out is a leaf, not asked again', async () => {
    const s = setupA();
    s.open('a');
    s.loads[0]!.resolve(kids('a', 'a1', 'a2'));
    await flush();
    s.kernel.dispatch({ type: 'query.set', query: makeQuery({ filter: { n: { type: 'number', op: 'lt', value: 9.5 } } }) }, 'user');
    // c opens by itself: its child c1 (5) matches (tree-filter.md).
    expect(s.shown()).toEqual(['a 1/3', '. a2 1/1', 'b 2/3', 'c 3/3', '. c1 1/1']);
    s.kernel.dispatch({ type: 'query.set', query: makeQuery({ filter: { n: { type: 'number', op: 'lt', value: 4 } } }) }, 'user');
    expect(s.shown()).toEqual(['a 1/3', 'b 2/3', 'c 3/3']);
    expect(s.d().childrenAt(s.d().index(0)!)).toBe(0);
    expect(s.loads.length).toBe(1);
  });

  it('the focus on the loading row goes to the first child when they arrive, to the parent when it closes', async () => {
    const s = setupA();
    s.open('a');
    s.kernel.dispatch({ type: 'focus.set', focus: { kind: 'cell', row: lk('a'), column: 'n' } }, 'user');
    expect(s.kernel.focus).toEqual({ kind: 'cell', row: lk('a'), column: 'n' });
    s.loads[0]!.resolve(kids('a', 'a1', 'a2'));
    await flush();
    expect(s.kernel.focus).toEqual({ kind: 'cell', row: k('a1'), column: 'n' });
    s.open('b');
    s.kernel.dispatch({ type: 'focus.set', focus: { kind: 'cell', row: lk('b'), column: 'n' } }, 'user');
    s.loads[1]!.reject('x');
    await flush();
    expect(s.kernel.focus).toEqual({ kind: 'cell', row: lk('b'), column: 'n' });
    s.open('b', false);
    expect(s.kernel.focus).toEqual({ kind: 'cell', row: k('b'), column: 'n' });
  });

  it('an empty answer with the focus on the loading row: the focus goes to the parent', async () => {
    const s = setupA();
    s.open('a');
    s.kernel.dispatch({ type: 'focus.set', focus: { kind: 'cell', row: lk('a'), column: 'n' } }, 'user');
    s.loads[0]!.resolve([]);
    await flush();
    expect(s.kernel.focus).toEqual({ kind: 'cell', row: k('a'), column: 'n' });
  });

  it('parentOf a loading row is its parent while it shows; the loading row is not a parent', () => {
    const s = setupA();
    s.open('a');
    const d = s.d();
    expect(d.parentOf!(lk('a'))).toBe(k('a'));
    expect(d.parentOf!(k('b'))).toBeNull();
    s.kernel.dispatch({ type: 'rows.expand', rows: [lk('a')], expanded: true }, 'user');
    expect(s.shown()).toEqual(['a 1/3', '. … 1/-1', 'b 2/3', 'c 3/3']);
  });

  it('the CSV of all rows holds no loading row', () => {
    const s = setupA();
    s.open('a');
    const all = s.model.allRows;
    expect(Array.from({ length: all.count }, (_, i) => all.nodeAt(all.index(i)!).kind)).toEqual(['data', 'data', 'data', 'data']);
  });
});

describe('shapes', () => {
  it('works with paths: the loaded rows say their place', async () => {
    type P = LR & { path: string[] };
    const rows: P[] = [{ id: 'a', n: 1, lazy: true, path: ['A'] }];
    const s = setupA({ rows: rows as LR[], tree: { parentId: undefined, path: (r) => (r as P).path } });
    s.open('a');
    s.loads[0]!.resolve([{ id: 'a1', n: 2, path: ['A', 'x'] }]);
    await flush();
    expect(s.shown()).toEqual(['a 1/1', '. a1 1/1']);
  });
});
