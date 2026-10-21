import { describe, it, expect } from 'vitest';
import { makeQuery } from '@dzgrid/core';
import { flush, k, lk, type LR } from './support/lazy.js';
import { setupB } from './support/lazy-server.js';

/**
 * Server children (B) — Phase 4 step 7, docs/behaviors/tree-lazy.md, docs/phase-4-steps/step07-plan.md:
 * roots by `fetch` (paged by the server), a parent's children by `children`, through the request
 * gate, one channel per parent, the query epoch in each request.
 */
const ROOTS: LR[] = [{ id: 'a', n: 3, lazy: true }, { id: 'b', n: 1, lazy: true }, { id: 'c', n: 2 }];
const kids = (parent: string, ...ids: string[]): LR[] => ids.map((id, i) => ({ id, p: parent, n: i, lazy: i === 0 }));

async function ready(o: Parameters<typeof setupB>[0] = {}) {
  const s = setupB(o);
  s.fetches[0]!.resolve({ rows: ROOTS, total: 3 });
  await flush();
  return s;
}

describe('the roots, a tree on a server', () => {
  it('shows the roots the server sends as a tree, declared parents closed; the tree is not refused', async () => {
    const s = await ready();
    expect(s.shown()).toEqual(['a 1/3', 'b 2/3', 'c 3/3']);
    expect(s.d().childrenAt(s.d().index(0)!)).toBe(-1);
    expect(s.model.problems).toEqual([]);
    expect(s.model.expansion?.size).toBe(0);
  });

  it('the kernel opens a row of a server tree: rowExpanded, a change of kind expand, from the model', async () => {
    const s = await ready();
    const kinds: string[] = [];
    s.model.subscribe((c) => kinds.push(c.kind));
    expect(s.open('a').ok).toBe(true);
    expect(kinds).toEqual(['expand']);
    expect(s.events.filter((e) => e.type === 'rowExpanded')).toEqual([{ type: 'rowExpanded', source: 'user', rows: [k('a')], expanded: true }]);
    expect(s.model.isExpanded!(k('a'))).toBe(true);
    s.kernel.dispatch({ type: 'rows.expandAll', expanded: false }, 'user');
    expect(s.model.expansion?.size).toBe(0);
  });
});

describe('a child request', () => {
  it('carries the parent (key, id, row), the server query as sent for rows, the epoch, a key and a signal', async () => {
    const s = await ready({ env: { query: makeQuery({ sort: [{ column: 'n', dir: 'desc' }], filter: { n: { type: 'number', op: 'gt', value: 0 } } }) } });
    s.open('a');
    expect(s.kids.length).toBe(1);
    const req = s.kids[0]!.req;
    expect(req.parent).toBe(k('a'));
    expect(req.id).toBe('a');
    expect(req.row).toEqual(ROOTS[0]);
    expect(req.sort).toEqual([{ column: 'n', dir: 'desc' }]);
    expect(req.filter).toEqual(s.fetches[0]!.req.filter);
    expect(req.params).toEqual({});
    expect(req.zone).toBe('UTC');
    expect(req.epoch).toBe(1);
    expect('page' in req).toBe(false);
    expect(req.signal.aborted).toBe(false);
    expect(JSON.parse(req.key)).toEqual({ epoch: req.epoch, filter: req.filter, id: 'a', params: {}, parent: k('a'), sort: req.sort, zone: 'UTC' });
    expect(s.shown()).toEqual(['a 1/3', '. … 1/-1', 'b 2/3', 'c 3/3']);
    expect(s.model.diagnostics.childFetches).toBe(1);
  });

  it('the answer (a list or { rows }) takes the loading row\'s place; parents answered in any order', async () => {
    const s = await ready();
    s.open('a');
    s.open('b');
    s.kids[1]!.resolve({ rows: kids('b', 'b1') });
    await flush();
    s.kids[0]!.resolve(kids('a', 'a1', 'a2'));
    await flush();
    expect(s.shown()).toEqual(['a 1/3', '. a1 1/2', '. a2 2/2', 'b 2/3', '. b1 1/1', 'c 3/3']);
    expect(s.model.diagnostics.gate.accepted).toBe(3);
  });

  it('a failure shows the error row; retry asks again on the same channel', async () => {
    const s = await ready();
    s.open('a');
    s.kids[0]!.reject(new Error('500'));
    await flush();
    expect(s.shown()).toEqual(['a 1/3', '. ! 1/-1', 'b 2/3', 'c 3/3']);
    s.shape.lazy.retry(k('a'));
    expect(s.kids.length).toBe(2);
    s.kids[1]!.resolve(kids('a', 'a1'));
    await flush();
    expect(s.shown()).toEqual(['a 1/3', '. a1 1/1', 'b 2/3', 'c 3/3']);
  });

  it('an answer that is neither a list nor { rows } fails', async () => {
    const s = await ready();
    s.open('a');
    s.kids[0]!.resolve({ nope: 1 });
    await flush();
    expect(s.shown()).toEqual(['a 1/3', '. ! 1/-1', 'b 2/3', 'c 3/3']);
  });
});

describe('stale answers never applied', () => {
  it('a collapse during the request aborts it (the gate cancels the parent\'s channel) and drops its answer', async () => {
    const s = await ready();
    s.open('a');
    s.open('a', false);
    expect(s.kids[0]!.req.signal.aborted).toBe(true);
    s.kids[0]!.resolve(kids('a', 'a1'));
    await flush();
    expect(s.model.row(k('a1'))).toBeUndefined();
    expect(s.model.diagnostics.gate.dropped.aborted).toBe(1);
  });

  it('closed and opened again: the first answer is dropped, the second applied, whatever their order', async () => {
    const s = await ready();
    s.open('a');
    s.open('a', false);
    s.open('a');
    s.kids[1]!.resolve(kids('a', 'new'));
    s.kids[0]!.resolve(kids('a', 'old'));
    await flush();
    expect(s.model.row(k('old'))).toBeUndefined();
    expect(s.shown()).toEqual(['a 1/3', '. new 1/1', 'b 2/3', 'c 3/3']);
  });

  it('a new epoch closes every row, aborts every child request, drops their answers; no rowExpanded', async () => {
    const s = await ready();
    s.open('c');
    s.open('a');
    s.open('b');
    s.kids[1]!.resolve(kids('b', 'b1'));
    await flush();
    const before = s.events.filter((e) => e.type === 'rowExpanded').length;
    s.kernel.dispatch({ type: 'query.set', query: makeQuery({ filter: { n: { type: 'number', op: 'gt', value: 0 } } }) }, 'user');
    expect(s.model.expansion?.size).toBe(0);
    expect(s.kids[0]!.req.signal.aborted).toBe(true);
    expect(s.events.filter((e) => e.type === 'rowExpanded').length).toBe(before);
    s.kids[0]!.resolve(kids('a', 'a1'));
    await flush();
    expect(s.model.row(k('a1'))).toBeUndefined();
    expect(s.model.diagnostics.gate.dropped['stale-epoch']).toBeGreaterThanOrEqual(1);
    // The roots of the new epoch replace the rows: the children loaded are gone.
    s.fetches[1]!.resolve({ rows: ROOTS, total: 3 });
    await flush();
    expect(s.model.row(k('b1'))).toBeUndefined();
    expect(s.shown()).toEqual(['a 1/3', 'b 2/3', 'c 3/3']);
    // Opened in the new epoch: asked with it.
    s.open('a');
    expect(s.last().req.epoch).toBe(s.kids[0]!.req.epoch + 1);
  });

  it('a request begun between the new epoch and its roots is asked in the new epoch, and goes on through the roots answer', async () => {
    const s = await ready();
    s.kernel.dispatch({ type: 'query.set', query: makeQuery({ sort: [{ column: 'n', dir: 'asc' }] }) }, 'user');
    s.open('a');
    const r = s.last();
    expect(r.req.epoch).toBe(2);
    s.fetches[1]!.resolve({ rows: ROOTS, total: 3 });
    await flush();
    expect(r.req.signal.aborted).toBe(false);
    expect(s.kids.length).toBe(1);
    r.resolve(kids('a', 'a1'));
    await flush();
    // The server sorts: its order is the order shown.
    expect(s.shown()).toEqual(['a 1/3', '. a1 1/1', 'b 2/3', 'c 3/3']);
  });
});

describe('a refresh, pages of roots', () => {
  it('a refresh asks the roots again in the same epoch; their answer replaces the rows; open parents load again', async () => {
    const s = await ready();
    s.open('a');
    s.kids[0]!.resolve(kids('a', 'a1'));
    await flush();
    s.kernel.dispatch({ type: 'rows.refresh' }, 'user');
    expect(s.fetches.length).toBe(2);
    expect(s.model.expansion?.has(k('a'))).toBe(true);
    s.fetches[1]!.resolve({ rows: ROOTS, total: 3 });
    await flush();
    expect(s.shown()).toEqual(['a 1/3', '. … 1/-1', 'b 2/3', 'c 3/3']);
    expect(s.kids.length).toBe(2);
    expect(s.kids[1]!.req.epoch).toBe(s.kids[0]!.req.epoch);
  });

  it('server pages count roots; children come whole (no page in a child request); another page forgets the loads', async () => {
    const s = setupB({ env: { page: { pageSize: 2 } } });
    expect(s.fetches[0]!.req.page).toMatchObject({ index: 0, size: 2 });
    s.fetches[0]!.resolve({ rows: ROOTS.slice(0, 2), total: 3 });
    await flush();
    expect(s.model.problems).toEqual([]);
    s.open('a');
    expect('page' in s.kids[0]!.req).toBe(false);
    s.kernel.dispatch({ type: 'page.go', index: 1 }, 'user');
    s.fetches[1]!.resolve({ rows: ROOTS.slice(2), total: 3 });
    await flush();
    expect(s.kids[0]!.req.signal.aborted).toBe(true);
    expect(s.shown()).toEqual(['c 1/1']);
    expect(s.model.expansion?.size).toBe(0);
  });

  it('without `children`, a declared parent fails (no loader): the error row', async () => {
    const s = await ready({ children: false });
    s.open('a');
    await flush();
    expect(s.shown()).toEqual(['a 1/3', '. ! 1/-1', 'b 2/3', 'c 3/3']);
  });

  it('destroy aborts the child requests; an answer after it is dropped by the gate', async () => {
    const s = await ready();
    s.open('a');
    s.model.destroy();
    expect(s.kids[0]!.req.signal.aborted).toBe(true);
    s.kids[0]!.resolve(kids('a', 'a1'));
    await flush();
    expect(s.model.row(k('a1'))).toBeUndefined();
    expect(s.model.diagnostics.gate.dropped.destroyed).toBe(1);
  });
});

describe('loading rows of a server tree', () => {
  it('a loading key is not a row of the server: never kept by selection, focusable while shown', async () => {
    const s = await ready();
    s.open('a');
    expect(s.d().indexOf(lk('a'))).toBe(1);
    expect(s.kernel.dispatch({ type: 'focus.set', focus: { kind: 'cell', row: lk('a'), column: 'n' } }, 'user').ok).toBe(true);
  });
});
