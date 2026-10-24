// Phase 5 step 2 on a server's model (owner S2-O2, edit-reapply.md; edit-save.md 17–18): a fetched set
// puts edits back in order in the browser; a server-run sort or filter is marked stale and asked again
// once; the application context reaches a kind's `wire`.
import { describe, it, expect } from 'vitest';
import { createColumnModel, createKernel, localeCtx, makeQuery, type AnyFilterKind, type GridEvent, type ModelEnv, type OperationsInput, type ValueReader } from '@dzgrid/core';
import { sourceRows, type DataSource } from '@dzgrid/core/server';
import { fakeSource, rowsOf } from './support/fake-source.js';

type R = { id: string; name: string; note?: string };
const UTC = localeCtx({ locale: 'en-US' });
const asc = [{ column: 'name', dir: 'asc' as const }];

/** A floor the application sets: sent to the server as `{min}` from the context. */
const floor: AnyFilterKind = {
  name: 'floor',
  read: (s) => s,
  active: () => true,
  wire: (_s, _ctx, _zone, context) => ({ min: (context as { min?: number } | undefined)?.min ?? 0 }),
};

/** A browser kind: names longer than the context's `len`. */
const local: AnyFilterKind = {
  name: 'local',
  read: (s) => s,
  active: () => true,
  test: (_s, _ctx, context) => (v) => String(v).length > ((context as { len?: number } | undefined)?.len ?? 0),
};
const SERVER: OperationsInput = { page: 'server', sort: 'server', filter: 'server', quick: 'server' };

function setup(operations: OperationsInput, page = true, more: Partial<ModelEnv<R>> = {}) {
  const fake = fakeSource();
  const columns = createColumnModel<R>([{ id: 'name' }, { id: 'note' }]);
  const model = sourceRows<R>(fake.source as DataSource<R>).create({
    getRowId: (r) => r.id, columns, ctx: UTC, abort: fake.abort, operations,
    filterKinds: (n) => (n === 'floor' ? floor : n === 'local' ? local : undefined),
    ...(page && { page: { pageSize: 10 } }),
    ...more,
  });
  const kernel = createKernel<R>({ rows: model, columns });
  const cells = new Map<string, string>();
  let version = 0;
  const reader: ValueReader<R> = {
    get version() { return version; },
    overlay: true,
    value: (col, row, id) => (cells.has(id) ? cells.get(id) : col.read(row)),
  };
  const edit = (id: string, v: string, columns: readonly string[] | null = ['name']) => {
    cells.set(id, v);
    version++;
    kernel.dispatch({ type: 'edits.reader', reader, ...(columns && { columns }) }, 'user');
  };
  const events: GridEvent<R>[] = [];
  kernel.subscribe((e) => events.push(e));
  const ids = () => Array.from({ length: model.displayed.count }, (_, i) => String((model.displayed.nodeAt(model.displayed.index(i)!) as { id: unknown }).id));
  return { ...fake, model, kernel, edit, ids, events };
}
const answerLast = (s: ReturnType<typeof setup>, ids: string[]) => s.calls.at(-1)!.resolve({ rows: rowsOf(ids), total: ids.length });

describe('a fetched set', () => {
  it('puts edits back in order in the browser, with no request', () => {
    const s = setup({ page: 'client', sort: 'client', filter: 'client', quick: 'client' }, false);
    answerLast(s, ['a', 'b', 'c']);
    s.kernel.dispatch({ type: 'sort.set', sort: asc }, 'user');
    expect(s.ids()).toEqual(['a', 'b', 'c']);
    const asked = s.calls.length;
    s.edit('a', 'zz');
    expect(s.ids()).toEqual(['a', 'b', 'c']);
    expect(s.kernel.orderStale).toBe(true);
    s.kernel.dispatch({ type: 'rows.reapply' }, 'user');
    expect(s.ids()).toEqual(['b', 'c', 'a']);
    expect(s.kernel.orderStale).toBe(false);
    expect(s.calls.length).toBe(asked);
  });
});

describe('server pages, sorted on the server', () => {
  it('Phase 5 step 7 review 4: an edit landing while a request is in flight (a page asked before the save): that answer does not clear the mark (it was computed without the edit); the next request\'s does', () => {
    const s = setup(SERVER);
    s.kernel.dispatch({ type: 'sort.set', sort: asc }, 'user');
    s.calls.at(-1)!.resolve({ rows: rowsOf(['a', 'b', 'c']), total: 25 });
    const asked = s.calls.length;
    s.kernel.dispatch({ type: 'page.go', index: 1 }, 'api');
    expect(s.calls.length).toBe(asked + 1);
    // The page request left; then the edit (the typed text kept at the page change, step 7).
    s.edit('a', 'zz');
    expect(s.kernel.orderStale).toBe(true);
    answerLast(s, ['d', 'e']);
    expect(s.kernel.orderStale).toBe(true);
    s.kernel.dispatch({ type: 'rows.reapply' }, 'user');
    answerLast(s, ['d', 'e']);
    expect(s.kernel.orderStale).toBe(false);
  });

  it('an edit of the sorted column marks the order stale; the reapply asks once more, the same request', () => {
    const s = setup({ page: 'server', sort: 'server', filter: 'server', quick: 'server' });
    s.kernel.dispatch({ type: 'sort.set', sort: asc }, 'user');
    answerLast(s, ['a', 'b', 'c']);
    const asked = s.calls.length;
    const key = s.calls.at(-1)!.req.key;
    s.edit('a', 'zz');
    expect(s.kernel.orderStale).toBe(true);
    expect(s.calls.length).toBe(asked);
    s.kernel.dispatch({ type: 'rows.reapply' }, 'user');
    expect(s.calls.length).toBe(asked + 1);
    expect(s.calls.at(-1)!.req.key).toBe(key);
    // Stale until the server's answer (RISK): a failure keeps the mark.
    expect(s.kernel.orderStale).toBe(true);
    answerLast(s, ['b', 'c', 'a']);
    expect(s.kernel.orderStale).toBe(false);
  });

  it('an edit of a column the server neither sorts nor filters leaves the order up to date', () => {
    const s = setup({ page: 'server', sort: 'server', filter: 'server', quick: 'server' });
    answerLast(s, ['a', 'b']);
    s.edit('a', 'zz');
    expect(s.kernel.orderStale).toBe(false);
    s.kernel.dispatch({ type: 'rows.reapply' }, 'user');
    // Nothing the server runs was touched: nothing to ask.
    expect(s.calls.length).toBe(1);
  });

  it('a new query clears the mark: its answer is in the server\'s order', () => {
    const s = setup({ page: 'server', sort: 'server', filter: 'server', quick: 'server' });
    s.kernel.dispatch({ type: 'sort.set', sort: asc }, 'user');
    answerLast(s, ['a', 'b', 'c']);
    s.edit('a', 'zz');
    expect(s.kernel.orderStale).toBe(true);
    s.kernel.dispatch({ type: 'sort.set', sort: [{ column: 'name', dir: 'desc' }] }, 'user');
    answerLast(s, ['c', 'b', 'a']);
    expect(s.kernel.orderStale).toBe(false);
  });
});

describe('the context in a kind\'s wire form', () => {
  it('a changed wire asks once; a context that wires the same asks nothing', () => {
    const s = setup({ page: 'server', sort: 'server', filter: 'server', quick: 'server' });
    s.kernel.dispatch({ type: 'query.set', query: makeQuery({ filter: { name: { type: 'custom', kind: 'floor', state: {} } } }) }, 'user');
    answerLast(s, ['a']);
    expect(s.calls.at(-1)!.req.filter).toEqual({ name: { type: 'custom', kind: 'floor', value: { min: 0 } } });
    const asked = s.calls.length;
    s.kernel.dispatch({ type: 'context.app', value: { min: 3 } }, 'host');
    expect(s.calls.length).toBe(asked + 1);
    expect(s.calls.at(-1)!.req.filter).toEqual({ name: { type: 'custom', kind: 'floor', value: { min: 3 } } });
    s.kernel.dispatch({ type: 'context.app', value: { min: 3, other: true } }, 'host');
    expect(s.calls.length).toBe(asked + 1);
  });
});

describe('review follow-ups (server)', () => {
  const sorted = () => {
    const s = setup(SERVER);
    s.kernel.dispatch({ type: 'sort.set', sort: asc }, 'user');
    answerLast(s, ['a', 'b', 'c']);
    return s;
  };

  it('an edit of a column the server filters is stale (S1)', () => {
    const s = setup(SERVER);
    s.kernel.dispatch({ type: 'filter.set', filter: { name: { type: 'text', op: 'contains', value: 'a' } } }, 'user');
    answerLast(s, ['a']);
    s.edit('a', 'zz');
    expect(s.kernel.orderStale).toBe(true);
  });

  it('an edit under a server search is stale (S2)', () => {
    const s = setup(SERVER);
    s.kernel.dispatch({ type: 'quick.set', text: 'a' }, 'user');
    answerLast(s, ['a']);
    s.edit('a', 'zz', ['note']);
    expect(s.kernel.orderStale).toBe(true);
  });

  it('an edit naming no columns marks a server-sorted grid stale (S3)', () => {
    const s = sorted();
    s.edit('a', 'zz', null);
    expect(s.kernel.orderStale).toBe(true);
  });

  it('a failed request keeps the mark; the retry\'s answer clears it (RISK)', () => {
    const s = sorted();
    s.edit('a', 'zz');
    s.kernel.dispatch({ type: 'rows.reapply' }, 'user');
    s.calls.at(-1)!.reject(new Error('down'));
    expect(s.kernel.orderStale).toBe(true);
    s.kernel.dispatch({ type: 'rows.refresh' }, 'user');
    answerLast(s, ['b', 'c', 'a']);
    expect(s.kernel.orderStale).toBe(false);
  });

  it('a page change clears the mark with its answer (S5b, O9)', () => {
    const s = sorted();
    s.edit('a', 'zz');
    s.kernel.dispatch({ type: 'page.size', size: 25 }, 'user');
    answerLast(s, ['b', 'c', 'a']);
    expect(s.kernel.orderStale).toBe(false);
  });

  it('a reapply by the user is told with source user: the order change at once, the flip at the answer, from the data (S6, S7)', () => {
    const s = sorted();
    s.edit('a', 'zz');
    s.events.length = 0;
    s.kernel.dispatch({ type: 'rows.reapply' }, 'user');
    expect(s.events.filter((e) => e.type === 'modelUpdated').map((e) => [(e as { kind: string }).kind, e.source])).toEqual([['order', 'user']]);
    answerLast(s, ['b', 'c', 'a']);
    expect(s.events.filter((e) => e.type === 'orderStale').map((e) => [(e as { stale: boolean }).stale, e.source])).toEqual([[false, 'data']]);
  });

  it('a model created with the context sends it in the first request, and the same context later asks nothing (R2)', () => {
    const query = makeQuery({ filter: { name: { type: 'custom', kind: 'floor', state: {} } } });
    const app = { min: 3 };
    const s = setup(SERVER, true, { query, app });
    expect(s.calls.length).toBe(1);
    expect(s.calls[0]!.req.filter).toEqual({ name: { type: 'custom', kind: 'floor', value: { min: 3 } } });
    s.kernel.dispatch({ type: 'context.app', value: app }, 'host');
    expect(s.calls.length).toBe(1);
  });
});

describe('review follow-ups (fetched set)', () => {
  const fetched = () => {
    const s = setup({ page: 'client', sort: 'client', filter: 'client', quick: 'client' }, false);
    answerLast(s, ['a', 'bb', 'ccc']);
    return s;
  };

  it('a context change refilters in the browser, with no request (S4)', () => {
    const s = fetched();
    s.kernel.dispatch({ type: 'query.set', query: makeQuery({ filter: { name: { type: 'custom', kind: 'local', state: {} } } }) }, 'user');
    expect(s.ids()).toEqual(['a', 'bb', 'ccc']);
    const asked = s.calls.length;
    s.kernel.dispatch({ type: 'context.app', value: { len: 1 } }, 'host');
    expect(s.ids()).toEqual(['bb', 'ccc']);
    expect(s.calls.length).toBe(asked);
  });

  it('an edit of a column nothing reads stays fresh (S9)', () => {
    const s = fetched();
    s.kernel.dispatch({ type: 'sort.set', sort: asc }, 'user');
    s.edit('a', 'zz', ['note']);
    expect(s.kernel.orderStale).toBe(false);
  });
});
