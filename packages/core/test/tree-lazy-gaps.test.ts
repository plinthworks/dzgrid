import { describe, it, expect } from 'vitest';
import { makeQuery } from '@dzgrid/core';
import { csvRows, toCsv } from '@dzgrid/core/csv';
import { flush, k, lk, ROWS, setupA, UTC, type LR } from './support/lazy.js';
import { setupB } from './support/lazy-server.js';

/**
 * Lazy children: the orderings and mixes the step-7 tests leave out (coverage review of
 * 1b23ee0). Each test names the mutant it kills (see the review report), or is an `it.fails`
 * repro of a bug found.
 */
const kids = (p: string, ...ids: string[]): LR[] => ids.map((id, i) => ({ id, p, n: i }));
const lazyKids = (p: string, ...ids: string[]): LR[] => ids.map((id, i) => ({ id, p, n: i, lazy: true }));

describe('refresh, setRows and the cache of loaded ids', () => {
  it('a refresh while a load runs aborts it and asks again (M1)', () => {
    const s = setupA();
    s.open('a');
    s.kernel.dispatch({ type: 'rows.refresh' }, 'user');
    expect(s.loads[0]!.signal.aborted).toBe(true);
    expect(s.loads.map((l) => l.row.id)).toEqual(['a', 'a']);
    expect(s.shape.lazy.diagnostics.live).toBe(1);
  });

  it('an answer echoing a row the host already holds: told duplicate, the new ones added, and a refresh keeps the host\'s row (M2)', async () => {
    const s = setupA();
    s.open('a');
    s.loads[0]!.resolve([{ id: 'a1', p: 'a', n: 0 }, { id: 'c1', p: 'a', n: 1 }, { id: 'a1', p: 'a', n: 2 }]);
    await flush();
    expect(s.model.problems.map((p) => p.code)).toEqual(['duplicate-row-id', 'duplicate-row-id']);
    expect(s.shown()).toEqual(['a 1/3', '. a1 1/1', 'b 2/3', 'c 3/3']);
    expect(s.shape.lazy.diagnostics).toMatchObject({ answered: 1, live: 0 });
    s.kernel.dispatch({ type: 'rows.refresh' }, 'user');
    expect(s.model.row(k('c1'))).toBeDefined();
    expect(s.model.row(k('a1'))).toBeUndefined();
  });

  it('setRows forgets which ids the loads brought: a refresh after it keeps the host\'s rows of the same ids (M3)', async () => {
    const s = setupA();
    s.open('a');
    s.loads[0]!.resolve(kids('a', 'a1'));
    await flush();
    // The host now gives a1 itself.
    s.model.setRows([{ id: 'a', n: 3, lazy: true }, { id: 'a1', p: 'a', n: 0 }]);
    s.kernel.dispatch({ type: 'rows.refresh' }, 'user');
    expect(s.model.row(k('a1'))).toBeDefined();
    expect(s.shown()).toEqual(['a 1/1', '. a1 1/1']);
  });

  it('two refreshes: the second removes only what the second round of loads brought, and tells nothing (M4)', async () => {
    const s = setupA();
    s.open('a');
    s.loads[0]!.resolve(kids('a', 'a1'));
    await flush();
    s.kernel.dispatch({ type: 'rows.refresh' }, 'user');
    s.loads[1]!.resolve(kids('a', 'a2'));
    await flush();
    // The host adds back a row with the first round's id: it is the host's now.
    s.model.applyTransaction({ add: [{ id: 'a1', p: 'b', n: 0 }] });
    s.kernel.dispatch({ type: 'rows.refresh' }, 'user');
    expect(s.model.row(k('a1'))).toBeDefined();
    expect(s.model.row(k('a2'))).toBeUndefined();
    expect(s.model.problems).toEqual([]);
  });

  // Was a bug: refresh() removed every id in `loaded`, even rows the host removed since: the model
  // told an error-level `unknown-row-id` (path remove[0]) the host never caused.
  it('a refresh after the host removed a loaded row tells no problem', async () => {
    const s = setupA();
    s.open('a');
    s.loads[0]!.resolve(kids('a', 'a1', 'a2'));
    await flush();
    s.model.applyTransaction({ remove: ['a1'] });
    const told: string[] = [];
    s.kernel.subscribe((e) => {
      if (e.type === 'problems') told.push(...e.problems.map((p) => p.code));
    });
    s.kernel.dispatch({ type: 'rows.refresh' }, 'user');
    expect(s.model.row(k('a2'))).toBeUndefined();
    expect(told).toEqual([]);
  });

  // Was a bug: setRows forgot the answered parents (load() deleted their state) but, given the very
  // same row objects, the model showed nothing new: the open parent answered empty stayed a leaf,
  // and the next unrelated change (here a sort) suddenly started its load.
  it('setRows of the same rows after an empty answer: no load deferred to the next sort', async () => {
    const s = setupA();
    s.open('b');
    s.loads[0]!.resolve([]);
    await flush();
    s.model.setRows(ROWS);
    const after = s.loads.length;
    s.kernel.dispatch({ type: 'query.set', query: makeQuery({ sort: [{ column: 'n', dir: 'desc' }] }) }, 'user');
    expect(s.loads.length).toBe(after);
  });

  it('setRows during a load giving the parent children: the load aborted, its late answer dropped', async () => {
    const s = setupA();
    s.open('a');
    s.model.setRows([{ id: 'a', n: 3, lazy: true }, { id: 'a0', p: 'a', n: 1 }]);
    expect(s.loads[0]!.signal.aborted).toBe(true);
    s.loads[0]!.resolve(kids('a', 'a1'));
    await flush();
    expect(s.model.row(k('a1'))).toBeUndefined();
    expect(s.shown()).toEqual(['a 1/1', '. a0 1/1']);
  });

  it('setRows during a load (the documented deviation): the answer applied, and a refresh then removes it', async () => {
    const s = setupA();
    s.open('a');
    s.model.setRows([{ id: 'a', n: 7, lazy: true }]);
    expect(s.loads[0]!.signal.aborted).toBe(false);
    s.loads[0]!.resolve(kids('a', 'a1'));
    await flush();
    expect(s.shown()).toEqual(['a 1/1', '. a1 1/1']);
    s.kernel.dispatch({ type: 'rows.refresh' }, 'user');
    expect(s.shown()).toEqual(['a 1/1', '. … 1/-1']);
    expect(s.loads.length).toBe(2);
  });
});

describe('retry, collapse-all, the filter layer, the order of loading rows', () => {
  it('retry on a row still loading forgets nothing: one live request, no second one (M5)', () => {
    const s = setupA();
    s.open('a');
    s.shape.lazy.retry(k('a'));
    s.model.applyTransaction({ update: [{ id: 'b', n: 1, lazy: true }] });
    expect(s.loads.length).toBe(1);
    expect(s.shape.lazy.diagnostics.live).toBe(1);
  });

  it('retry after a collapse does nothing; opening again asks again', async () => {
    const s = setupA();
    s.open('a');
    s.loads[0]!.reject(new Error('x'));
    await flush();
    s.open('a', false);
    s.shape.lazy.retry(k('a'));
    expect(s.loads.length).toBe(1);
    expect(s.shown()).toEqual(['a 1/3', 'b 2/3', 'c 3/3']);
    s.open('a');
    expect(s.loads.length).toBe(2);
  });

  it('collapse from depth 1: a root loading keeps loading, a nested one closes (M6)', async () => {
    const s = setupA();
    s.open('a');
    s.loads[0]!.resolve(lazyKids('a', 'a1'));
    await flush();
    s.open('a1');
    s.open('b');
    s.kernel.dispatch({ type: 'rows.expandAll', expanded: false, depth: 1 }, 'user');
    expect(s.model.isExpanded!(k('b'))).toBe(true);
    expect(s.model.isExpanded!(k('a1'))).toBe(false);
    expect(s.loads[2]!.signal.aborted).toBe(false);
    expect(s.loads[1]!.signal.aborted).toBe(true);
  });

  it('under a filter, closing a loading parent (the filter\'s layer) aborts it', () => {
    const s = setupA();
    s.kernel.dispatch({ type: 'query.set', query: makeQuery({ filter: { n: { type: 'number', op: 'gt', value: 0 } } }) }, 'user');
    s.open('a');
    expect(s.shown()).toContain('. … 1/-1');
    s.open('a', false);
    expect(s.loads[0]!.signal.aborted).toBe(true);
    expect(s.shown()).toEqual(['a 1/3', 'b 2/3', 'c 3/3', '. c1 1/1']);
  });

  it('loading rows opened bottom-up stand under their own parents (M8)', () => {
    const s = setupA();
    s.open('b');
    s.open('a');
    expect(s.shown()).toEqual(['a 1/3', '. … 1/-1', 'b 2/3', '. … 1/-1', 'c 3/3']);
    expect(s.d().indexOf(lk('a'))).toBe(1);
    expect(s.d().indexOf(lk('b'))).toBe(3);
    expect(s.d().indexOf(k('c'))).toBe(4);
  });

  it('a declared parent three levels down loads like a root (M9)', async () => {
    const s = setupA();
    s.open('a');
    s.loads[0]!.resolve(lazyKids('a', 'a1'));
    await flush();
    s.open('a1');
    s.loads[1]!.resolve(lazyKids('a1', 'a11'));
    await flush();
    s.open('a11');
    expect(s.loads.map((l) => l.row.id)).toEqual(['a', 'a1', 'a11']);
    expect(s.shown()).toContain('. . . … 1/-1');
  });

  it('a quick search hiding a loading parent aborts it; cleared, the parent asks again', async () => {
    const s = setupA();
    s.open('a');
    s.kernel.dispatch({ type: 'query.set', query: makeQuery({ quick: 'b' }) }, 'user');
    expect(s.loads[0]!.signal.aborted).toBe(true);
    s.kernel.dispatch({ type: 'query.set', query: makeQuery({ quick: '' }) }, 'user');
    expect(s.loads.length).toBe(2);
    s.loads[0]!.resolve(kids('a', 'old'));
    s.loads[1]!.resolve(kids('a', 'new'));
    await flush();
    expect(s.model.row(k('old'))).toBeUndefined();
    expect(s.shown()).toEqual(['a 1/3', '. new 1/1', 'b 2/3', 'c 3/3']);
  });
});

describe('transactions on the parent while it loads', () => {
  it('moved under an open parent: the load goes on, the answer lands under it in its new place', async () => {
    const s = setupA();
    s.open('c');
    s.open('a');
    s.model.applyTransaction({ update: [{ id: 'a', p: 'c', n: 3, lazy: true }] });
    expect(s.loads[0]!.signal.aborted).toBe(false);
    expect(s.shown()).toEqual(['b 1/2', 'c 2/2', '. a 1/2', '. . … 1/-1', '. c1 2/2']);
    s.loads[0]!.resolve(kids('a', 'a1'));
    await flush();
    expect(s.shown()).toEqual(['b 1/2', 'c 2/2', '. a 1/2', '. . a1 1/1', '. c1 2/2']);
  });

  it('moved under a closed parent: aborted; shown again, it asks again', () => {
    const s = setupA();
    s.open('a');
    s.model.applyTransaction({ update: [{ id: 'a', p: 'b', n: 3, lazy: true }] });
    expect(s.loads[0]!.signal.aborted).toBe(true);
    s.open('b');
    expect(s.loads.length).toBe(2);
  });

  it('removed then added back while loading: the first answer is dropped', async () => {
    const s = setupA();
    s.open('a');
    s.model.applyTransaction({ remove: ['a'] });
    s.model.applyTransaction({ add: [{ id: 'a', n: 3, lazy: true }] });
    expect(s.loads[0]!.signal.aborted).toBe(true);
    s.loads[0]!.resolve(kids('a', 'a1'));
    await flush();
    expect(s.model.row(k('a1'))).toBeUndefined();
    expect(s.shape.lazy.diagnostics.live).toBe(0);
  });

  it('has() turning false while loading aborts the load; the row is a leaf', () => {
    const s = setupA();
    s.open('a');
    s.model.applyTransaction({ update: [{ id: 'a', n: 3, lazy: false }] });
    expect(s.loads[0]!.signal.aborted).toBe(true);
    expect(s.shown()).toEqual(['a 1/3', 'b 2/3', 'c 3/3']);
  });
});

describe('what the loading row must never be', () => {
  // Was a bug: the writer skipped only details, a loading row was written as an empty line ("2,,").
  it('the CSV of the rows shown holds no loading row, nor counts it', () => {
    const s = setupA();
    s.open('a');
    const r = csvRows(s.model, 'displayed', { mode: 'none' } as never)!;
    expect(r.count).toBe(3);
    const csv = toCsv({ rows: r.rows, columns: s.columns, ctx: UTC }, { bom: false });
    expect(csv.split('\r\n').filter(Boolean)).toEqual(['Level,n,id', '1,3,a', '1,1,b', '1,2,c']);
  });

  // Was a bug: clientRows.destroy() never told the shape: the load went on (not aborted, live 1)
  // and its answer was applied to the destroyed model. Only the DOM's lz.destroy() reset.
  it('a client model destroyed mid-load aborts the load and drops its answer', async () => {
    const s = setupA();
    s.open('a');
    s.model.destroy();
    expect(s.loads[0]!.signal.aborted).toBe(true);
    expect(s.shape.lazy.diagnostics.live).toBe(0);
    s.loads[0]!.resolve(kids('a', 'a1'));
    await flush();
    expect(s.model.row(k('a1'))).toBeUndefined();
  });
});

describe('server children (B): pages, refresh, duplicates', () => {
  const roots = (): LR[] => [{ id: 'a', n: 3, lazy: true }, { id: 'b', n: 1, lazy: true }];

  it('a page change racing a child request: answered before the page, applied then gone; after, dropped', async () => {
    const s = setupB({ env: { page: { pageSize: 2 } } });
    s.fetches[0]!.resolve({ rows: roots(), total: 3 });
    await flush();
    s.open('a');
    s.open('b');
    s.kernel.dispatch({ type: 'page.go', index: 1 }, 'user');
    // a answers while page 2 is asked: page 1 is still shown, the answer belongs to it.
    s.kids[0]!.resolve(kids('a', 'a1'));
    await flush();
    expect(s.shown()).toEqual(['a 1/2', '. a1 1/1', 'b 2/2', '. … 1/-1']);
    s.fetches[1]!.resolve({ rows: [{ id: 'c', n: 2 }], total: 3 });
    await flush();
    expect(s.kids[1]!.req.signal.aborted).toBe(true);
    s.kids[1]!.resolve(kids('b', 'b1'));
    await flush();
    expect(s.model.row(k('b1'))).toBeUndefined();
    expect(s.shown()).toEqual(['c 1/1']);
    expect(s.shape.lazy.diagnostics.live).toBe(0);
  });

  it('an answer naming a root as a child: told duplicate, the others added, the parent not left loading', async () => {
    const s = setupB();
    s.fetches[0]!.resolve({ rows: roots(), total: 2 });
    await flush();
    s.open('a');
    s.kids[0]!.resolve([{ id: 'b', p: 'a', n: 0 }, { id: 'a1', p: 'a', n: 0 }]);
    await flush();
    expect(s.model.problems.map((p) => p.code)).toContain('duplicate-row-id');
    expect(s.shown()).toEqual(['a 1/2', '. a1 1/1', 'b 2/2']);
  });

  it('a new epoch while loading: the old request aborted and its answer dropped; a reopen asks in the new epoch', async () => {
    const s = setupB();
    s.fetches[0]!.resolve({ rows: roots(), total: 2 });
    await flush();
    s.open('a');
    s.kernel.dispatch({ type: 'query.set', query: makeQuery({ quick: 'x' }) }, 'user');
    s.fetches[1]!.resolve({ rows: roots(), total: 2 });
    await flush();
    s.open('a');
    expect(s.kids.map((r) => r.req.epoch)).toEqual([1, 2]);
    s.kids[0]!.resolve(kids('a', 'old'));
    await flush();
    expect(s.model.row(k('old'))).toBeUndefined();
    expect(s.shown()).toEqual(['a 1/2', '. … 1/-1', 'b 2/2']);
    expect(s.shape.lazy.diagnostics.live).toBe(1);
  });

  // Was a bug (A/B mismatch): A's refresh aborted running loads and asked again; B's refresh only
  // re-fetched the roots, so a child request begun before the refresh survived and its
  // pre-refresh answer was applied (tree-lazy.md: « the rows still open load their children again »).
  it('a refresh during a child request asks the children again after the roots answer', async () => {
    const s = setupB();
    s.fetches[0]!.resolve({ rows: [{ id: 'a', n: 3, lazy: true }], total: 1 });
    await flush();
    s.open('a');
    s.kernel.dispatch({ type: 'rows.refresh' }, 'user');
    expect(s.kids[0]!.req.signal.aborted).toBe(true);
    s.fetches[1]!.resolve({ rows: [{ id: 'a', n: 3, lazy: true }], total: 1 });
    await flush();
    s.kids[0]!.resolve(kids('a', 'old'));
    await flush();
    expect(s.model.row(k('old'))).toBeUndefined();
    expect(s.kids.length).toBe(2);
    expect(s.shape.lazy.diagnostics.live).toBe(1);
    s.kids[1]!.resolve(kids('a', 'new'));
    await flush();
    expect(s.shown()).toEqual(['a 1/1', '. new 1/1']);
  });

  it('a refresh whose roots answer the very rows held: the open parent still asks again', async () => {
    const rows: LR[] = [{ id: 'a', n: 3, lazy: true }];
    const s = setupB();
    s.fetches[0]!.resolve({ rows, total: 1 });
    await flush();
    s.open('a');
    s.kernel.dispatch({ type: 'rows.refresh' }, 'user');
    s.fetches[1]!.resolve({ rows, total: 1 });
    await flush();
    expect(s.kids.length).toBe(2);
    expect(s.shape.lazy.diagnostics.live).toBe(1);
  });
});
