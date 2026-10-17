import { describe, it, expect } from 'vitest';
import { clientRows, createColumnModel, createKernel, dataKey, localeCtx, makeQuery, resolveOperations, splitQuery, type GridEvent, type RowModel, type ClientModel } from '@dzgrid/core';
type R = { id: string; n: number; t: string };
const rows = (n: number) => Array.from({ length: n }, (_, i): R => ({ id: `r${i}`, n: i, t: i % 2 ? 'odd' : 'even' }));
const k = (id: string) => dataKey(id)!;
function client(n = 6) {
  const columns = createColumnModel<R>([{ id: 'n', type: 'number' }, { id: 't' }]);
  const model = clientRows<R>({ rows: rows(n), getRowId: (r) => r.id, columns, ctx: localeCtx({ locale: 'en-US' }) });
  return { columns, model };
}
function serverLike(m: ClientModel<R>, total: number | null) {
  const pushed: string[] = [];
  const s: RowModel<R> & { pushed: string[] } = {
    kind: 'source', ops: { filter: 'server', quick: 'server', sort: 'server', page: 'server' },
    get displayed() { return m.displayed; }, get status() { return m.status; },
    get counts() { return { total, filtered: total, displayed: m.displayed.count }; },
    selectAll: 'query', keeps: () => true, row: (key) => m.row(key),
    setQuery: (q, src) => { pushed.push(q.key); m.setQuery(q, src); }, setColumns: (c, src) => m.setColumns(c, src), setContext: (c, src) => m.setContext(c, src),
    page: null,
    setPage() {},
    invalidate: () => {}, subscribe: (fn) => m.subscribe(fn), destroy: () => m.destroy(), pushed,
  };
  return s;
}
const log = (kernel: any) => { const ev: GridEvent<R>[] = []; kernel.subscribe((e: any) => ev.push(e)); return ev; };
const odd = { type: 'text', op: 'equals', value: 'odd' } as const;

describe('probe core', () => {
  it('C1 an equal query is not pushed to the model again', () => {
    const { columns, model } = client(); const s = serverLike(model, 100);
    const kernel = createKernel<R>({ rows: s, columns });
    kernel.dispatch({ type: 'quick.set', text: 'x' }, 'user');
    const n = s.pushed.length;
    kernel.dispatch({ type: 'quick.set', text: 'x' }, 'user');
    kernel.dispatch({ type: 'filter.column', column: 't', filter: null }, 'user');
    expect(s.pushed.length).toBe(n);
  });
  it('C2 a host exclude selection after a clear is tied to the filters in force, and dropped when they change', () => {
    const { columns, model } = client(); const kernel = createKernel<R>({ rows: serverLike(model, 100), columns });
    kernel.dispatch({ type: 'selection.all' }, 'user');
    kernel.dispatch({ type: 'selection.clear' }, 'user');
    const ev = log(kernel);
    kernel.dispatch({ type: 'selection.set', selection: { mode: 'exclude', keys: new Set([k('r1')]) } }, 'host');
    expect(ev.find((e) => e.type === 'selectionChanged')).toMatchObject({ query: { key: kernel.query.key }, count: 99 });
    kernel.dispatch({ type: 'sort.toggle', column: 'n', multi: false }, 'user');
    expect(kernel.selection).toMatchObject({ mode: 'exclude' });
    kernel.dispatch({ type: 'filter.column', column: 't', filter: odd }, 'user');
    expect(kernel.selection).toEqual({ mode: 'include', keys: new Set() });
  });
  it('C3 select-all on a server, then a row unticked: still tied; dropped on query change', () => {
    const { columns, model } = client(); const kernel = createKernel<R>({ rows: serverLike(model, 100), columns });
    kernel.dispatch({ type: 'selection.all' }, 'user');
    const ev = log(kernel);
    kernel.dispatch({ type: 'selection.toggle', row: k('r2') }, 'user');
    expect(ev.at(-1)).toMatchObject({ type: 'selectionChanged', count: 99, query: { key: kernel.query.key } });
    kernel.dispatch({ type: 'sort.toggle', column: 'n', multi: false }, 'user');
    expect(kernel.selection).toMatchObject({ mode: 'exclude' });
    kernel.dispatch({ type: 'filter.column', column: 't', filter: odd }, 'user');
    expect(kernel.selection).toEqual({ mode: 'include', keys: new Set() });
  });
  it('C3b select-all event order on a filter change: selection drop, then the model, then filterChanged; state readable', () => {
    const { columns, model } = client(); const kernel = createKernel<R>({ rows: serverLike(model, 100), columns });
    kernel.dispatch({ type: 'selection.all' }, 'user');
    const seen: string[] = [];
    kernel.subscribe((e) => { seen.push(e.type + ':' + Object.keys(kernel.query.filter).length); });
    kernel.dispatch({ type: 'filter.column', column: 't', filter: odd }, 'user');
    expect(seen.filter((s) => !s.startsWith('focus'))).toEqual(['selectionChanged:1', 'modelUpdated:1', 'filterChanged:1']);
  });
  it('C4 select-all on a server forgets the anchor', () => {
    const { columns, model } = client(); const kernel = createKernel<R>({ rows: serverLike(model, 100), columns });
    kernel.dispatch({ type: 'selection.toggle', row: k('r1') }, 'user');
    kernel.dispatch({ type: 'selection.all' }, 'user');
    expect(kernel.anchor).toBeNull();
    expect(kernel.dispatch({ type: 'selection.range', target: k('r3'), additive: false }, 'user')).toMatchObject({ ok: false });
  });
  it('C5 filter.column null leaves no key', () => {
    const { columns, model } = client(); const kernel = createKernel<R>({ rows: model, columns });
    kernel.dispatch({ type: 'filter.column', column: 't', filter: odd }, 'user');
    kernel.dispatch({ type: 'filter.column', column: 'n', filter: { type: 'number', op: 'gt', value: 1 } as any }, 'user');
    kernel.dispatch({ type: 'filter.column', column: 't', filter: null }, 'user');
    expect(Object.keys(kernel.query.filter)).toEqual(['n']);
    expect(kernel.query.key).toBe(makeQuery({ filter: { n: { type: 'number', op: 'gt', value: 1 } as any } }).key);
  });
  it('C6 an initial query is pushed to the model', () => {
    const { columns, model } = client();
    const q = makeQuery({ sort: [{ column: 'n', dir: 'desc' }] });
    createKernel<R>({ rows: model, columns, query: q });
    expect(model.query.key).toBe(q.key);
    expect(model.displayed.keyAt(model.displayed.index(0)!)).toBe(k('r5'));
  });
  it('C7 resolveOperations branches', () => {
    const codes = (r: any) => r.problems.map((p: any) => p.path);
    let r = resolveOperations('server', false);
    expect(r.ops).toEqual({ filter: 'client', quick: 'client', sort: 'client', page: 'off' }); expect(codes(r)).toEqual(['operations']);
    r = resolveOperations('database' as any, true);
    expect(r.ops.page).toBe('server'); expect(codes(r)).toEqual(['operations']);
    r = resolveOperations('database' as any, false);
    expect(r.ops.page).toBe('off'); expect(codes(r)).toEqual(['operations']);
    r = resolveOperations({ page: 'weekly' as any }, true);
    expect(r.ops).toEqual({ filter: 'server', quick: 'server', sort: 'server', page: 'server' }); expect(codes(r)).toEqual(['operations.page']);
    r = resolveOperations({ page: 'server' }, false);
    expect(r.ops).toEqual({ filter: 'client', quick: 'client', sort: 'client', page: 'off' }); expect(codes(r)).toEqual(['operations.page']);
    r = resolveOperations({ page: 'off', sort: 'server' }, false);
    expect(r.ops.sort).toBe('client'); expect(codes(r)).toEqual(['operations.sort']);
    r = resolveOperations({ page: 'off' }, true);
    expect(r.ops).toEqual({ filter: 'client', quick: 'client', sort: 'client', page: 'off' }); expect(r.problems).toEqual([]);
  });
  it('C8 splitQuery keys equal for equal parts in another key order, different otherwise', () => {
    const ops = { filter: 'server', quick: 'server', sort: 'client', page: 'client' } as const;
    const a = splitQuery(makeQuery({ filter: { t: { type: 'text', op: 'equals', value: 'x' }, n: { type: 'number', op: 'gt', value: 1 } as any }, sort: [{ column: 'n', dir: 'asc' }] }), ops);
    const b = splitQuery(makeQuery({ filter: JSON.parse('{"n":{"value":1,"op":"gt","type":"number"},"t":{"value":"x","type":"text","op":"equals"}}'), sort: [{ column: 'n', dir: 'desc' }] }), ops);
    expect(a.server.key).toBe(b.server.key);
    const c = splitQuery(makeQuery({ quick: 'y' }), ops);
    expect(c.server.key).not.toBe(a.server.key);
    expect(splitQuery(makeQuery({ quick: '  ' }), ops).server.key).toBe(splitQuery(makeQuery(), ops).server.key);
  });
});
