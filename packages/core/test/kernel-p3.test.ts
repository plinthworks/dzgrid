import { describe, it, expect } from 'vitest';
import {
  clientRows, createColumnModel, createKernel, dataKey, localeCtx, makeQuery,
  type ClientModel, type GridEvent, type RowModel,
} from '@dzgrid/core';

type R = { id: string; n: number; t: string };
const rows = (n: number) => Array.from({ length: n }, (_, i): R => ({ id: `r${i}`, n: i, t: i % 2 ? 'odd' : 'even' }));
const k = (id: string) => dataKey(id)!;

function client(n = 6) {
  const columns = createColumnModel<R>([{ id: 'n', type: 'number' }, { id: 't' }]);
  const model = clientRows<R>({ rows: rows(n), getRowId: (r) => r.id, columns, ctx: localeCtx({ locale: 'en-US' }) });
  return { columns, model };
}

/**
 * A model that stands for a server one: it shows the client model's rows, but rows it does not
 * show still "exist" (other pages), and select-all means the whole query.
 */
function serverLike(m: ClientModel<R>, total: number | null): RowModel<R> & { refreshed: number } {
  let refreshed = 0;
  return {
    kind: 'source',
    get ops() { return { filter: 'server', quick: 'server', sort: 'server', page: 'server' } as const; },
    get displayed() { return m.displayed; },
    get status() { return m.status; },
    get counts() { return { total, filtered: total, displayed: m.displayed.count }; },
    selectAll: 'query',
    keeps: () => true,
    row: (key) => m.row(key),
    setQuery: (q, s) => m.setQuery(q, s),
    setColumns: (c, s) => m.setColumns(c, s),
    setContext: (c, s) => m.setContext(c, s),
    invalidate: () => { refreshed++; },
    subscribe: (fn) => m.subscribe(fn),
    destroy: () => m.destroy(),
    get refreshed() { return refreshed; },
  };
}

const log = <T,>(kernel: { subscribe(fn: (e: GridEvent<T>) => void): () => void }) => {
  const events: GridEvent<T>[] = [];
  kernel.subscribe((e) => events.push(e));
  return events;
};

describe('the kernel over any row model', () => {
  it('owns the query and pushes it', () => {
    const { columns, model } = client();
    const kernel = createKernel<R>({ rows: model, columns });
    kernel.dispatch({ type: 'sort.toggle', column: 'n', multi: false }, 'user');
    expect(kernel.query.sort).toEqual([{ column: 'n', dir: 'asc' }]);
    expect(model.query.key).toBe(kernel.query.key);
  });

  it('sets the whole filter, one column, and the search, each said once', () => {
    const { columns, model } = client();
    const kernel = createKernel<R>({ rows: model, columns });
    const events = log<R>(kernel);
    kernel.dispatch({ type: 'filter.column', column: 't', filter: { type: 'text', op: 'equals', value: 'odd' } }, 'user');
    expect(model.counts.filtered).toBe(3);
    kernel.dispatch({ type: 'filter.set', filter: { t: { type: 'text', op: 'equals', value: 'odd' } } }, 'user');
    kernel.dispatch({ type: 'quick.set', text: '3' }, 'user');
    kernel.dispatch({ type: 'filter.column', column: 't', filter: null }, 'user');
    expect(events.filter((e) => e.type === 'filterChanged').length).toBe(2);
    expect(events.filter((e) => e.type === 'quickChanged').map((e) => e.type === 'quickChanged' && e.text)).toEqual(['3']);
    expect(kernel.query.filter).toEqual({});
  });

  it('refuses a filter on a column that does not exist', () => {
    const { columns, model } = client();
    const kernel = createKernel<R>({ rows: model, columns });
    expect(kernel.dispatch({ type: 'filter.column', column: 'zz', filter: { type: 'text', op: 'contains', value: 'a' } }, 'user')).toMatchObject({ ok: false, reason: 'unknown-column' });
  });

  it('selects all displayed rows on a client model', () => {
    const { columns, model } = client();
    const kernel = createKernel<R>({ rows: model, columns });
    kernel.dispatch({ type: 'filter.column', column: 't', filter: { type: 'text', op: 'equals', value: 'odd' } }, 'user');
    kernel.dispatch({ type: 'selection.all' }, 'user');
    expect(kernel.selection).toMatchObject({ mode: 'include' });
    expect(kernel.selection.keys.size).toBe(3);
  });

  it('keeps selected keys a server model does not show (other pages)', () => {
    const { columns, model } = client();
    const server = serverLike(model, 1000);
    const kernel = createKernel<R>({ rows: server, columns });
    kernel.dispatch({ type: 'selection.set', selection: { mode: 'include', keys: new Set([k('r1'), k('far-away')]) } }, 'user');
    model.applyTransaction({ remove: ['r1'] });
    expect([...kernel.selection.keys].sort()).toEqual([k('far-away'), k('r1')].sort());
  });

  it('selects all of a server query as everything-except, tied to that query, cleared when it changes', () => {
    const { columns, model } = client();
    const server = serverLike(model, 1000);
    const kernel = createKernel<R>({ rows: server, columns });
    const events = log<R>(kernel);
    kernel.dispatch({ type: 'selection.all' }, 'user');
    const all = events.find((e) => e.type === 'selectionChanged');
    expect(kernel.selection).toMatchObject({ mode: 'exclude' });
    expect(all).toMatchObject({ count: 1000, query: { key: kernel.query.key } });
    events.length = 0;
    kernel.dispatch({ type: 'filter.column', column: 't', filter: { type: 'text', op: 'equals', value: 'odd' } }, 'user');
    expect(kernel.selection).toMatchObject({ mode: 'include' });
    expect(kernel.selection.keys.size).toBe(0);
    expect(events.find((e) => e.type === 'selectionChanged')).toMatchObject({ source: 'data', query: null });
  });

  it('counts an everything-except selection as null when the total is unknown', () => {
    const { columns, model } = client();
    const kernel = createKernel<R>({ rows: serverLike(model, null), columns });
    const events = log<R>(kernel);
    kernel.dispatch({ type: 'selection.all' }, 'user');
    expect(events.find((e) => e.type === 'selectionChanged')).toMatchObject({ count: null });
  });

  it('asks the model to fetch again on rows.refresh', () => {
    const { columns, model } = client();
    const server = serverLike(model, 10);
    const kernel = createKernel<R>({ rows: server, columns });
    kernel.dispatch({ type: 'rows.refresh' }, 'user');
    expect(server.refreshed).toBe(1);
  });

  it('emits nothing for a filter equal to the current one', () => {
    const { columns, model } = client();
    const kernel = createKernel<R>({ rows: model, columns });
    kernel.dispatch({ type: 'filter.set', filter: { t: { type: 'text', op: 'equals', value: 'odd' } } }, 'user');
    const events = log<R>(kernel);
    kernel.dispatch({ type: 'query.set', query: makeQuery({ filter: JSON.parse('{"t":{"value":"odd","op":"equals","type":"text"}}') }) }, 'user');
    expect(events).toEqual([]);
  });

  it('gives a client model its counts with the displayed count, and its policies', () => {
    const { model } = client(6);
    expect(model.counts).toEqual({ total: 6, filtered: 6, displayed: 6 });
    expect(model.selectAll).toBe('displayed');
    expect(model.ops).toEqual({ filter: 'client', quick: 'client', sort: 'client', page: 'off' });
    expect(model.keeps(k('r1'))).toBe(true);
    expect(model.keeps(k('nope'))).toBe(false);
  });
});

describe('columns and context through the kernel', () => {
  it('sets new column definitions: columnsChanged with the source, problems told, focus kept', () => {
    const { columns, model } = client();
    const kernel = createKernel<R>({ rows: model, columns });
    kernel.dispatch({ type: 'focus.set', focus: { kind: 'cell', row: k('r1'), column: 't' } }, 'user');
    const events = log<R>(kernel);
    kernel.dispatch({ type: 'columns.set', defs: [{ id: 'n', type: 'number' }, { id: 't', header: 'Kind' }, { id: 'n', type: 'number' }] }, 'host');
    expect(events.find((e) => e.type === 'columnsChanged')).toMatchObject({ source: 'host' });
    expect(events.find((e) => e.type === 'problems')).toMatchObject({ source: 'host', problems: [expect.objectContaining({ code: 'duplicate-column-id' })] });
    expect(kernel.focus).toEqual({ kind: 'cell', row: k('r1'), column: 't' });
    expect(columns.get('t')!.def.header).toBe('Kind');
  });

  it('moves focus off a column the new definitions drop', () => {
    const { columns, model } = client();
    const kernel = createKernel<R>({ rows: model, columns });
    kernel.dispatch({ type: 'focus.set', focus: { kind: 'cell', row: k('r1'), column: 't' } }, 'user');
    kernel.dispatch({ type: 'columns.set', defs: [{ id: 'n', type: 'number' }] }, 'host');
    expect(kernel.focus).toEqual({ kind: 'cell', row: k('r1'), column: 'n' });
  });

  it('sets the language through the model', () => {
    const { columns, model } = client();
    const kernel = createKernel<R>({ rows: model, columns });
    const events = log<R>(kernel);
    kernel.dispatch({ type: 'context.set', ctx: localeCtx({ locale: 'fr-FR' }) }, 'host');
    expect(events.find((e) => e.type === 'modelUpdated')).toMatchObject({ source: 'host', kind: 'context' });
  });
});

describe('step 0.1-0.3 review (kernel)', () => {
  it('ties a host’s everything-except selection to the filters, and clears it when they change', () => {
    const { columns, model } = client();
    const kernel = createKernel<R>({ rows: serverLike(model, 1000), columns });
    const events = log<R>(kernel);
    kernel.dispatch({ type: 'selection.set', selection: { mode: 'exclude', keys: new Set([k('r1')]) } }, 'host');
    expect(events.find((e) => e.type === 'selectionChanged')).toMatchObject({ query: { key: kernel.query.key } });
    kernel.dispatch({ type: 'filter.column', column: 't', filter: { type: 'text', op: 'equals', value: 'odd' } }, 'user');
    expect(kernel.selection.mode).toBe('include');
  });

  it('keeps "all" through a sort: sorting does not change which rows match', () => {
    const { columns, model } = client();
    const kernel = createKernel<R>({ rows: serverLike(model, 1000), columns });
    kernel.dispatch({ type: 'selection.all' }, 'user');
    kernel.dispatch({ type: 'sort.toggle', column: 'n', multi: false }, 'user');
    expect(kernel.selection.mode).toBe('exclude');
  });

  it('counts an everything-except selection over the rows the filters match, not all of them', () => {
    const { columns, model } = client();
    const server = Object.assign(Object.create(serverLike(model, 1000)) as RowModel<R>, {});
    Object.defineProperty(server, 'counts', { get: () => ({ total: 1000, filtered: 40, displayed: model.displayed.count }) });
    const kernel = createKernel<R>({ rows: server, columns });
    const events = log<R>(kernel);
    kernel.dispatch({ type: 'selection.all' }, 'user');
    kernel.dispatch({ type: 'selection.toggle', row: k('r1') }, 'user');
    expect(events.filter((e) => e.type === 'selectionChanged').map((e) => e.type === 'selectionChanged' && e.count)).toEqual([40, 39]);
  });
});
