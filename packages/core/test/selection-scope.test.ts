import { describe, it, expect } from 'vitest';
import {
  clientRows, createColumnModel, createKernel, dataKey, localeCtx, makeQuery,
  type GridEvent, type OperationsInput,
} from '@dzgrid/core';
import { sourceRows, type DataSource, type Json } from '@dzgrid/core/server';
import { fakeSource, rowsOf, type Call } from './support/fake-source.js';

/**
 * Step 7: what "all" is tied to (the filters, the search, the params, the
 * zone and, for a search in the browser, the columns it reads), select-all
 * across pages in the browser (`selection.allFiltered`), the header box over
 * what its click acts on, and the owner's `keepOnFilter` (docs/behaviors/server-selection.md).
 */
type R = { id: string; n: number; t: string };
const k = (id: string) => dataKey(id)!;
const UTC = localeCtx({ locale: 'en-US' });
const RIYADH = localeCtx({ locale: 'en-US', timeZone: 'Asia/Riyadh' });
const odd = { type: 'text', op: 'equals', value: 'odd' } as const;
const rows = (n: number) => Array.from({ length: n }, (_, i): R => ({ id: `r${i}`, n: i, t: i % 2 ? 'odd' : 'even' }));

const log = (kernel: { subscribe(fn: (e: GridEvent<R>) => void): () => void }) => {
  const events: GridEvent<R>[] = [];
  kernel.subscribe((e) => events.push(e));
  return events;
};
type Sel = Extract<GridEvent<R>, { type: 'selectionChanged' }>;
const sel = (events: GridEvent<R>[]) => events.filter((e): e is Sel => e.type === 'selectionChanged');

function client(n = 12, o: { page?: number; keep?: boolean } = {}) {
  const columns = createColumnModel<R>([{ id: 'n', type: 'number' }, { id: 't' }]);
  const model = clientRows<R>({ rows: rows(n), getRowId: (r) => r.id, columns, ctx: UTC, ...(o.page && { page: { pageSize: o.page } }) });
  const kernel = createKernel<R>({ rows: model, columns, ...(o.keep !== undefined && { keepSelectionOnFilter: o.keep }) });
  return { columns, model, kernel, events: log(kernel) };
}

/** A server's rows over a fake source: server pages of 50 by default. */
function server(o: { operations?: OperationsInput; params?: Record<string, Json>; keep?: boolean; pageSize?: number } = {}) {
  const fake = fakeSource();
  const columns = createColumnModel<R>([{ id: 'n', type: 'number' }, { id: 't' }]);
  const model = sourceRows<R>(fake.source as DataSource<R>, { ...(o.params && { params: o.params }) }).create({
    getRowId: (r) => r.id, columns, ctx: UTC, abort: fake.abort,
    operations: o.operations ?? 'server', page: { pageSize: o.pageSize ?? 50 },
  });
  const kernel = createKernel<R>({ rows: model, columns, ...(o.keep !== undefined && { keepSelectionOnFilter: o.keep }) });
  const events = log(kernel);
  const answer = (ids: string[], more: Record<string, unknown> = {}, call: Call = fake.last()) =>
    call.resolve({ rows: ids.map((id) => ({ id, n: Number(id.slice(1)), t: 'x' })), ...more });
  return { ...fake, fake, columns, model, kernel, events, answer };
}
const ids = (n: number, from = 0) => Array.from({ length: n }, (_, i) => `r${from + i}`);

describe('what "all" is tied to (membershipOf)', () => {
  it('a zone change clears "all" on a server, told after the model with reason scope-changed', () => {
    const s = server();
    s.answer(ids(50), { total: 120 });
    s.kernel.dispatch({ type: 'selection.all' }, 'user');
    s.events.length = 0;
    s.kernel.dispatch({ type: 'context.set', ctx: RIYADH }, 'host');
    expect(s.kernel.selection).toEqual({ mode: 'include', keys: new Set() });
    const told = sel(s.events);
    expect(told).toHaveLength(1);
    expect(told[0]).toMatchObject({ source: 'data', count: 0, query: null, scope: null, reason: 'scope-changed' });
    const types = s.events.map((e) => e.type);
    expect(types.indexOf('modelUpdated')).toBeLessThan(types.indexOf('selectionChanged'));
    expect(s.kernel.selectionScope).toBeNull();
  });

  it('another source with other params clears "all"; include keys stay', () => {
    const s = server({ params: { ward: 'A' } });
    s.answer(ids(50), { total: 120 });
    s.kernel.dispatch({ type: 'selection.all' }, 'user');
    expect(s.kernel.selectionScope).toMatchObject({ params: { ward: 'A' }, zone: 'UTC' });
    s.model.setSource(sourceRows(s.source as DataSource<R>, { params: { ward: 'B' } }), 'host');
    expect(s.kernel.selection.mode).toBe('include');
    expect(sel(s.events).at(-1)).toMatchObject({ reason: 'scope-changed' });
    s.kernel.dispatch({ type: 'selection.toggle', row: k('r3') }, 'user');
    s.model.setSource(sourceRows(s.source as DataSource<R>, { params: { ward: 'C' } }), 'host');
    expect([...s.kernel.selection.keys]).toEqual([k('r3')]);
  });

  it('a half-typed filter leaves the request, so "all", as it was', () => {
    const s = server();
    s.answer(ids(50), { total: 120 });
    s.kernel.dispatch({ type: 'selection.all' }, 'user');
    s.events.length = 0;
    s.kernel.dispatch({ type: 'filter.column', column: 't', filter: { type: 'text', op: 'contains', value: '' } }, 'user');
    expect(s.kernel.selection).toMatchObject({ mode: 'exclude' });
    expect(sel(s.events)).toEqual([]);
    expect(s.kernel.selectionScope?.query.filter).toEqual({ t: { type: 'text', op: 'contains', value: '' } });
    // Typed on: the request changes, "all" goes.
    s.kernel.dispatch({ type: 'filter.column', column: 't', filter: { type: 'text', op: 'contains', value: 'a' } }, 'user');
    expect(s.kernel.selection.mode).toBe('include');
  });

  it('a column hidden under a search in the browser clears "all"; without a search it does not', () => {
    const c = client(12, { page: 5 });
    c.kernel.dispatch({ type: 'selection.allFiltered' }, 'user');
    c.kernel.dispatch({ type: 'column.state', patch: [{ id: 't', hidden: true }] }, 'user');
    expect(c.kernel.selection.mode).toBe('exclude');
    c.kernel.dispatch({ type: 'column.state', patch: [{ id: 't', hidden: false }] }, 'user');
    c.kernel.dispatch({ type: 'quick.set', text: 'odd' }, 'user');
    c.kernel.dispatch({ type: 'selection.allFiltered' }, 'user');
    expect(c.kernel.selection.mode).toBe('exclude');
    c.events.length = 0;
    c.kernel.dispatch({ type: 'column.state', patch: [{ id: 't', hidden: true }] }, 'user');
    expect(c.kernel.selection).toEqual({ mode: 'include', keys: new Set() });
    expect(sel(c.events)).toHaveLength(1);
    expect(sel(c.events)[0]).toMatchObject({ source: 'data', reason: 'scope-changed' });
  });

  it('a host exclude selection on an unpaged browser model is tied to the zone too', () => {
    const c = client(6);
    c.kernel.dispatch({ type: 'selection.set', selection: { mode: 'exclude', keys: new Set([k('r1')]) } }, 'host');
    expect(sel(c.events).at(-1)).toMatchObject({ count: 5, scope: { params: {}, zone: 'UTC' }, reason: null });
    c.kernel.dispatch({ type: 'context.set', ctx: localeCtx({ locale: 'fr-FR' }) }, 'host');
    expect(c.kernel.selection.mode).toBe('exclude');
    c.kernel.dispatch({ type: 'context.set', ctx: RIYADH }, 'host');
    expect(c.kernel.selection.mode).toBe('include');
  });

  it('the models say their scope and membership: never the sort or the page', () => {
    const c = client(6);
    expect(c.model.scope).toEqual({ params: {}, zone: 'UTC' });
    const a = makeQuery({ filter: { t: odd } });
    expect(c.model.membershipOf(a)).toBe(c.model.membershipOf(makeQuery({ filter: { t: odd }, sort: [{ column: 'n', dir: 'desc' }] })));
    expect(c.model.membershipOf(a)).not.toBe(c.model.membershipOf(makeQuery()));
    expect(c.model.membershipOf(makeQuery({ quick: 'x' }))).not.toBe(c.model.membershipOf(makeQuery()));
    const s = server({ params: { ward: 'A' } });
    expect(s.model.scope).toEqual({ params: { ward: 'A' }, zone: 'UTC' });
    expect(s.model.membershipOf(a)).toBe(s.model.membershipOf(makeQuery({ filter: { t: odd }, sort: [{ column: 'n', dir: 'asc' }] })));
    expect(s.model.membershipOf(a)).not.toBe(s.model.membershipOf(makeQuery()));
    expect(s.model.membershipOf(makeQuery({ quick: 'x' }))).not.toBe(s.model.membershipOf(makeQuery()));
    expect(s.model.membershipOf(makeQuery({ quick: '  ' }))).toBe(s.model.membershipOf(makeQuery()));
    s.model.setContext(RIYADH);
    expect(s.model.scope.zone).toBe('Asia/Riyadh');
  });

  it('a fetched set: a search in the browser reads the visible columns, a search on the server does not', () => {
    const browser = server({ operations: 'client' });
    const q = makeQuery({ quick: 'x' });
    const before = browser.model.membershipOf(q);
    browser.columns.apply([{ id: 't', hidden: true }], 'user');
    expect(browser.model.membershipOf(q)).not.toBe(before);
    const onServer = server({ operations: { page: 'client', quick: 'server' } });
    const was = onServer.model.membershipOf(q);
    onServer.columns.apply([{ id: 't', hidden: true }], 'user');
    expect(onServer.model.membershipOf(q)).toBe(was);
    // The client part's filter counts as much as the server's.
    expect(onServer.model.membershipOf(makeQuery({ filter: { t: odd } }))).not.toBe(onServer.model.membershipOf(makeQuery()));
  });
});

describe('selection.allFiltered: every row the filters match, across pages', () => {
  it('on a paged browser model: everything-except, tied, kept across pages, cleared by a filter', () => {
    const c = client(12, { page: 5 });
    c.kernel.dispatch({ type: 'filter.column', column: 't', filter: odd }, 'user');
    c.kernel.dispatch({ type: 'selection.toggle', row: k('r1') }, 'user');
    c.events.length = 0;
    c.kernel.dispatch({ type: 'selection.allFiltered' }, 'user');
    expect(c.kernel.selection).toEqual({ mode: 'exclude', keys: new Set() });
    expect(c.kernel.anchor).toBeNull();
    expect(sel(c.events)).toEqual([expect.objectContaining({ source: 'user', count: 6, query: c.kernel.query, scope: { params: {}, zone: 'UTC' }, reason: null })]);
    c.kernel.dispatch({ type: 'selection.toggle', row: k('r1') }, 'user');
    expect(sel(c.events).at(-1)).toMatchObject({ count: 5 });
    c.kernel.dispatch({ type: 'page.go', index: 1 }, 'user');
    c.kernel.dispatch({ type: 'sort.toggle', column: 'n', multi: false }, 'user');
    expect(c.kernel.selection).toEqual({ mode: 'exclude', keys: new Set([k('r1')]) });
    c.kernel.dispatch({ type: 'filter.column', column: 't', filter: null }, 'user');
    expect(c.kernel.selection).toEqual({ mode: 'include', keys: new Set() });
    expect(sel(c.events).at(-1)).toMatchObject({ source: 'data', count: 0, reason: 'scope-changed' });
  });

  it('selection.all on a paged browser model still takes the page', () => {
    const c = client(12, { page: 5 });
    c.kernel.dispatch({ type: 'selection.all' }, 'user');
    expect(c.kernel.selection).toEqual({ mode: 'include', keys: new Set(ids(5).map(k)) });
    expect(sel(c.events).at(-1)).toMatchObject({ count: 5, query: null, scope: null });
  });

  it('on an unpaged browser model: the include set of the displayed rows, as allDisplayed', () => {
    const c = client(6);
    c.kernel.dispatch({ type: 'filter.column', column: 't', filter: odd }, 'user');
    c.kernel.dispatch({ type: 'selection.toggle', row: k('r1') }, 'user');
    c.kernel.dispatch({ type: 'selection.allFiltered' }, 'user');
    expect(c.kernel.selection).toEqual({ mode: 'include', keys: new Set([k('r1'), k('r3'), k('r5')]) });
    expect(c.kernel.anchor).toBe(k('r1'));
    expect(sel(c.events).at(-1)).toMatchObject({ count: 3, query: null });
  });

  it('nothing matches: the selection is cleared', () => {
    const c = client(12, { page: 5 });
    c.kernel.dispatch({ type: 'selection.toggle', row: k('r2') }, 'user');
    c.kernel.dispatch({ type: 'filter.column', column: 't', filter: { type: 'text', op: 'equals', value: 'none' } }, 'user');
    c.events.length = 0;
    c.kernel.dispatch({ type: 'selection.allFiltered' }, 'user');
    expect(c.kernel.selection).toEqual({ mode: 'include', keys: new Set() });
    expect(c.kernel.anchor).toBeNull();
    expect(sel(c.events)).toHaveLength(1);
  });

  it('on a fetched set paged in the browser: tied to the set; a browser-side sort keeps it, a server-side search clears it', () => {
    const s = server({ operations: { page: 'client', quick: 'server' }, pageSize: 2 });
    s.answer(['a', 'b', 'c', 'd', 'e']);
    s.kernel.dispatch({ type: 'selection.allFiltered' }, 'user');
    expect(s.kernel.selection.mode).toBe('exclude');
    expect(sel(s.events).at(-1)).toMatchObject({ count: 5 });
    s.kernel.dispatch({ type: 'selection.toggle', row: k('b') }, 'user');
    s.kernel.dispatch({ type: 'sort.toggle', column: 'n', multi: false }, 'user');
    s.kernel.dispatch({ type: 'page.go', index: 2 }, 'user');
    expect(s.kernel.selection).toEqual({ mode: 'exclude', keys: new Set([k('b')]) });
    expect(sel(s.events).at(-1)).toMatchObject({ count: 4 });
    s.kernel.dispatch({ type: 'quick.set', text: 'x' }, 'user');
    expect(s.kernel.selection.mode).toBe('include');
    expect(sel(s.events).at(-1)).toMatchObject({ reason: 'scope-changed' });
  });

  it('a client-part filter on a fetched set clears "all" too', () => {
    const s = server({ operations: { page: 'client', quick: 'server' }, pageSize: 2 });
    s.answer(['a', 'b', 'c']);
    s.kernel.dispatch({ type: 'selection.allFiltered' }, 'user');
    s.kernel.dispatch({ type: 'filter.column', column: 't', filter: odd }, 'user');
    expect(s.kernel.selection.mode).toBe('include');
    expect(s.calls).toHaveLength(1);
  });

  it('on server pages: the same as selection.all', () => {
    const s = server();
    s.answer(ids(50), { total: 120 });
    s.kernel.dispatch({ type: 'selection.toggle', row: k('r1') }, 'user');
    s.kernel.dispatch({ type: 'selection.allFiltered' }, 'user');
    expect(s.kernel.selection).toEqual({ mode: 'exclude', keys: new Set() });
    expect(s.kernel.anchor).toBeNull();
    expect(sel(s.events).at(-1)).toMatchObject({ count: 120, query: s.kernel.query, scope: { params: {}, zone: 'UTC' } });
    s.kernel.dispatch({ type: 'selection.toggle', row: k('r7') }, 'user');
    s.kernel.dispatch({ type: 'sort.toggle', column: 'n', multi: false }, 'user');
    expect(s.kernel.selection).toEqual({ mode: 'exclude', keys: new Set([k('r7')]) });
    s.kernel.dispatch({ type: 'filter.column', column: 't', filter: odd }, 'user');
    expect(s.kernel.selection).toEqual({ mode: 'include', keys: new Set() });
  });
});

describe('the scope a bulk action reads', () => {
  it('selectionScope follows the sort in force; the event carried the one of its time', () => {
    const s = server({ params: { ward: 'A' } });
    s.answer(ids(50), { total: 120 });
    expect(s.kernel.selectionScope).toBeNull();
    s.kernel.dispatch({ type: 'selection.all' }, 'user');
    const told = sel(s.events).at(-1)!;
    expect(told.query!.sort).toEqual([]);
    s.kernel.dispatch({ type: 'sort.toggle', column: 'n', multi: false }, 'user');
    expect(s.kernel.selectionScope).toEqual({ query: s.kernel.query, params: { ward: 'A' }, zone: 'UTC' });
    expect(s.kernel.selectionScope!.query.sort).toEqual([{ column: 'n', dir: 'asc' }]);
    s.kernel.dispatch({ type: 'selection.toggle', row: k('r1') }, 'user');
    expect(s.kernel.selectionScope).not.toBeNull();
    s.kernel.dispatch({ type: 'selection.clear' }, 'user');
    expect(s.kernel.selectionScope).toBeNull();
  });

  it('an include selection has no scope', () => {
    const s = server();
    s.answer(ids(50), { total: 120 });
    s.kernel.dispatch({ type: 'selection.toggle', row: k('r1') }, 'user');
    expect(s.kernel.selectionScope).toBeNull();
    expect(sel(s.events).at(-1)).toMatchObject({ count: 1, query: null, scope: null, reason: null });
  });

  it('"all" cleared forgets the anchor of a row unticked in it', () => {
    const s = server();
    s.answer(ids(50), { total: 120 });
    s.kernel.dispatch({ type: 'selection.all' }, 'user');
    s.kernel.dispatch({ type: 'selection.toggle', row: k('r2') }, 'user');
    expect(s.kernel.anchor).toBe(k('r2'));
    s.kernel.dispatch({ type: 'quick.set', text: 'x' }, 'user');
    expect(s.kernel.anchor).toBeNull();
  });

  it('a filter change on "all" tells one selectionChanged, before the model and filterChanged', () => {
    const s = server();
    s.answer(ids(50), { total: 120 });
    s.kernel.dispatch({ type: 'selection.all' }, 'user');
    s.events.length = 0;
    s.kernel.dispatch({ type: 'filter.column', column: 't', filter: odd }, 'user');
    expect(s.events.map((e) => e.type).filter((t) => t !== 'pageChanged')).toEqual(['selectionChanged', 'modelUpdated', 'filterChanged']);
    expect(sel(s.events)[0]).toMatchObject({ source: 'data', reason: 'scope-changed', count: 0 });
  });
});

describe('the header box (headerState): what its click acts on', () => {
  it('server pages, everything-except: all, some, none', () => {
    const s = server();
    s.answer(['r0', 'r1'], { total: 2 });
    expect(s.kernel.headerState).toBe('none');
    s.kernel.dispatch({ type: 'selection.all' }, 'user');
    expect(s.kernel.headerState).toBe('all');
    s.kernel.dispatch({ type: 'selection.toggle', row: k('r0') }, 'user');
    expect(s.kernel.headerState).toBe('some');
    s.kernel.dispatch({ type: 'selection.toggle', row: k('r1') }, 'user');
    // Every row unticked: the count is 0.
    expect(s.kernel.headerState).toBe('none');
  });

  it('server pages, include: none, some (keys on another page), all (every row of the query)', () => {
    const s = server({ pageSize: 2 });
    s.answer(['r0', 'r1'], { total: 3 });
    s.kernel.dispatch({ type: 'page.go', index: 1 }, 'user');
    s.answer(['r2'], { total: 3 });
    s.kernel.dispatch({ type: 'selection.set', selection: { mode: 'include', keys: new Set([k('r0')]) } }, 'host');
    // The page shown has none of them; the box speaks for the query.
    expect(s.kernel.headerState).toBe('some');
    s.kernel.dispatch({ type: 'selection.set', selection: { mode: 'include', keys: new Set([k('r0'), k('r1'), k('r2')]) } }, 'host');
    expect(s.kernel.headerState).toBe('all');
    s.kernel.dispatch({ type: 'selection.clear' }, 'user');
    expect(s.kernel.headerState).toBe('none');
  });

  it('server pages with an unknown total: all with no row unticked, some otherwise', () => {
    const s = server();
    s.answer(['r0', 'r1'], { hasNext: true });
    s.kernel.dispatch({ type: 'selection.all' }, 'user');
    expect(s.kernel.headerState).toBe('all');
    s.kernel.dispatch({ type: 'selection.toggle', row: k('r0') }, 'user');
    expect(s.kernel.headerState).toBe('some');
    s.kernel.dispatch({ type: 'selection.set', selection: { mode: 'include', keys: new Set([k('r0'), k('r1')]) } }, 'host');
    expect(s.kernel.headerState).toBe('some');
  });

  it('in the browser: over the rows displayed, as before', () => {
    const c = client(12, { page: 5 });
    expect(c.kernel.headerState).toBe('none');
    c.kernel.dispatch({ type: 'selection.all' }, 'user');
    expect(c.kernel.headerState).toBe('all');
    c.kernel.dispatch({ type: 'page.go', index: 1 }, 'user');
    expect(c.kernel.headerState).toBe('none');
    c.kernel.dispatch({ type: 'selection.allFiltered' }, 'user');
    c.kernel.dispatch({ type: 'selection.toggle', row: k('r6') }, 'user');
    expect(c.kernel.headerState).toBe('some');
    c.kernel.dispatch({ type: 'page.go', index: 0 }, 'user');
    expect(c.kernel.headerState).toBe('all');
  });

  it('is read again when the count moves under the same selection', () => {
    const s = server();
    s.answer(['r0', 'r1'], { total: 3 });
    s.kernel.dispatch({ type: 'selection.set', selection: { mode: 'include', keys: new Set([k('r0'), k('r1')]) } }, 'host');
    expect(s.kernel.headerState).toBe('some');
    s.kernel.dispatch({ type: 'rows.refresh' }, 'user');
    s.answer(['r0', 'r1'], { total: 2 });
    expect(s.kernel.headerState).toBe('all');
  });
});

describe('keepOnFilter (owner decision): an include selection on a filter change', () => {
  it('is kept by default, in the browser and on a server', () => {
    const c = client(6);
    c.kernel.dispatch({ type: 'selection.toggle', row: k('r2') }, 'user');
    c.kernel.dispatch({ type: 'filter.column', column: 't', filter: odd }, 'user');
    expect([...c.kernel.selection.keys]).toEqual([k('r2')]);
    const s = server();
    s.answer(ids(50), { total: 120 });
    s.kernel.dispatch({ type: 'selection.toggle', row: k('r2') }, 'user');
    s.kernel.dispatch({ type: 'filter.column', column: 't', filter: odd }, 'user');
    expect([...s.kernel.selection.keys]).toEqual([k('r2')]);
  });

  it('false: a filter or search change clears it, told before the model; a sort or a page never does', () => {
    const c = client(12, { page: 5, keep: false });
    c.kernel.dispatch({ type: 'selection.toggle', row: k('r2') }, 'user');
    c.kernel.dispatch({ type: 'sort.toggle', column: 'n', multi: false }, 'user');
    c.kernel.dispatch({ type: 'page.go', index: 1 }, 'user');
    expect([...c.kernel.selection.keys]).toEqual([k('r2')]);
    c.events.length = 0;
    c.kernel.dispatch({ type: 'filter.column', column: 't', filter: { type: 'text', op: 'equals', value: 'even' } }, 'api');
    expect(c.kernel.selection).toEqual({ mode: 'include', keys: new Set() });
    expect(c.kernel.anchor).toBeNull();
    expect(c.events.map((e) => e.type).filter((t) => t === 'selectionChanged' || t === 'modelUpdated' || t === 'filterChanged')).toEqual(['selectionChanged', 'modelUpdated', 'filterChanged']);
    expect(sel(c.events)[0]).toMatchObject({ source: 'data', count: 0, reason: 'scope-changed' });
    c.kernel.dispatch({ type: 'selection.toggle', row: k('r4') }, 'user');
    c.kernel.dispatch({ type: 'quick.set', text: '4' }, 'host');
    expect(c.kernel.selection.keys.size).toBe(0);
  });

  it('false on a server: an include selection and "all" alike, one event; an empty selection tells nothing', () => {
    const s = server({ keep: false });
    s.answer(ids(50), { total: 120 });
    s.kernel.dispatch({ type: 'selection.toggle', row: k('r2') }, 'user');
    s.events.length = 0;
    s.kernel.dispatch({ type: 'filter.column', column: 't', filter: { type: 'text', op: 'contains', value: '' } }, 'user');
    expect(s.kernel.selection.keys.size).toBe(0);
    expect(sel(s.events)).toHaveLength(1);
    s.kernel.dispatch({ type: 'selection.all' }, 'user');
    s.events.length = 0;
    s.kernel.dispatch({ type: 'quick.set', text: 'z' }, 'user');
    expect(s.kernel.selection).toEqual({ mode: 'include', keys: new Set() });
    expect(sel(s.events)).toHaveLength(1);
    s.events.length = 0;
    s.kernel.dispatch({ type: 'quick.set', text: 'zz' }, 'user');
    expect(sel(s.events)).toEqual([]);
  });

  it('false: "all" goes on a filter edit that leaves the request as it was', () => {
    const s = server({ keep: false });
    s.answer(ids(50), { total: 120 });
    s.kernel.dispatch({ type: 'selection.all' }, 'user');
    s.kernel.dispatch({ type: 'filter.column', column: 't', filter: { type: 'text', op: 'contains', value: '' } }, 'user');
    expect(s.kernel.selection).toEqual({ mode: 'include', keys: new Set() });
  });

  it('is live through selection.keepOnFilter', () => {
    const c = client(6);
    expect(c.kernel.dispatch({ type: 'selection.keepOnFilter', keep: false }, 'host')).toEqual({ ok: true });
    c.kernel.dispatch({ type: 'selection.toggle', row: k('r2') }, 'user');
    c.kernel.dispatch({ type: 'filter.column', column: 't', filter: odd }, 'user');
    expect(c.kernel.selection.keys.size).toBe(0);
    c.kernel.dispatch({ type: 'selection.keepOnFilter', keep: true }, 'host');
    c.kernel.dispatch({ type: 'selection.toggle', row: k('r1') }, 'user');
    c.kernel.dispatch({ type: 'filter.column', column: 't', filter: null }, 'user');
    expect([...c.kernel.selection.keys]).toEqual([k('r1')]);
  });
});

describe('reconciling: rows dropped are told as such', () => {
  it('a removed selected row: reason rows-dropped, source data', () => {
    const c = client(6);
    c.kernel.dispatch({ type: 'selection.set', selection: { mode: 'include', keys: new Set([k('r1'), k('r2')]) } }, 'host');
    c.events.length = 0;
    c.model.applyTransaction({ remove: ['r1'] });
    expect(sel(c.events)).toEqual([expect.objectContaining({ source: 'data', count: 1, reason: 'rows-dropped' })]);
  });

  it('an unticked row of "all" removed: the selection does not shrink, no rows-dropped', () => {
    const c = client(12, { page: 5 });
    c.kernel.dispatch({ type: 'selection.allFiltered' }, 'user');
    c.kernel.dispatch({ type: 'selection.toggle', row: k('r1') }, 'user');
    c.events.length = 0;
    c.model.applyTransaction({ remove: ['r1'] });
    expect(c.kernel.selection).toEqual({ mode: 'exclude', keys: new Set() });
    expect(sel(c.events)).toEqual([expect.objectContaining({ count: 11, reason: null })]);
  });
});

describe('fakes of the RowModel', () => {
  it('a client model of rows with a search: the visible columns in its membership', () => {
    const c = client(4);
    const q = makeQuery({ quick: 'odd' });
    const before = c.model.membershipOf(q);
    c.columns.apply([{ id: 'n', hidden: true }], 'user');
    expect(c.model.membershipOf(q)).not.toBe(before);
    expect(c.model.membershipOf(makeQuery())).toBe(c.model.membershipOf(makeQuery({ sort: [{ column: 't', dir: 'asc' }] })));
  });
});

describe('step 7 review: what membership ignores', () => {
  it('the order and pinning of the columns a search reads', () => {
    const c = client(4);
    const q = makeQuery({ quick: 'odd' });
    const before = c.model.membershipOf(q);
    c.columns.apply([{ id: 't', order: 0 }], 'user');
    expect(c.model.membershipOf(q)).toBe(before);
    c.columns.apply([{ id: 'n', pinned: 'start' }], 'user');
    expect(c.model.membershipOf(q)).toBe(before);
  });

  it('spaces around or between the words of a search', () => {
    const c = client(4);
    const m = (quick: string) => c.model.membershipOf(makeQuery({ quick }));
    expect(m('odd ')).toBe(m('odd'));
    expect(m('  odd')).toBe(m('odd'));
    expect(m('  ')).toBe(m(''));
  });
});
