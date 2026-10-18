import { describe, it, expect } from 'vitest';
import { clientRows, createColumnModel, createKernel, localeCtx, makeQuery, type GridEvent } from '@dzgrid/core';
import { sourceRows, type DataSource } from '@dzgrid/core/server';
import { fakeSource } from './support/fake-source.js';

/**
 * Bugs found in step 9's value lists (review and test analysis of 8b45b62): each test states the
 * behaviour the spec asks (value-list.md), and fails on 8b45b62. The seeded source-switch variant is in
 * values-interleave.test.ts.
 */
type R = { id: string; city?: string };
const setup = () => {
  const a = fakeSource({ values: true });
  const m = sourceRows<R>(a.source as DataSource<R>, { params: { t: 1 } }).create({ getRowId: (r) => r.id, columns: createColumnModel<R>([{ id: 'city' }, { id: 'name' }]), ctx: localeCtx({ locale: 'en-US' }), abort: a.abort });
  return { a, m };
};

describe('a new source while a server list is open', () => {
  it('another source with the same params: asked again, never the old source\'s list kept as current', () => {
    const { a, m } = setup();
    const h = m.setValues!('city');
    a.lastValues().resolve([{ value: 'fromA' }]);
    const b = fakeSource({ values: true });
    m.setSource(sourceRows<R>(b.source as DataSource<R>, { params: { t: 1 } }));
    expect(b.valueCalls.length).toBe(1);
    expect(h.status).toBe('loading');
  });

  it('a source without values: no TypeError as the failure, nothing counted as asked', () => {
    const { a, m } = setup();
    const h = m.setValues!('city');
    a.lastValues().resolve([{ value: 'fromA' }]);
    m.setSource(sourceRows<R>({ fetch: a.source.fetch } as DataSource<R>, { params: { t: 2 } }));
    expect(h.failure).not.toBeInstanceOf(TypeError);
    expect(m.diagnostics.valueFetches).toBe(1);
    // value-list.md: "A source without values gives available: false and an empty list".
    expect(h.result!.values.map((v) => v.value)).not.toContain('fromA');
  });

  it('a source without values: the open list becomes unavailable, idle, empty, no failure; one notification', () => {
    const { a, m } = setup();
    const h = m.setValues!('city');
    a.lastValues().resolve([{ value: 'fromA', count: 1 }]);
    let told = 0;
    h.subscribe(() => told++);
    m.setSource(sourceRows<R>({ fetch: a.source.fetch } as DataSource<R>, { params: { t: 2 } }));
    expect([h.available, h.status, h.result, h.failure, h.problems, told]).toEqual([false, 'idle', { values: [], blanks: null, truncated: false }, undefined, [], 1]);
    // A search or a refresh there asks nothing and fails nothing.
    h.search('x');
    h.refresh();
    expect([h.status, h.failure, m.diagnostics.valueFetches]).toEqual(['idle', undefined, 1]);
  });

  it('an empty list going unavailable is told too (the list is the same, `available` is not)', () => {
    const { a, m } = setup();
    const h = m.setValues!('city');
    a.lastValues().resolve([]);
    let told = 0;
    h.subscribe(() => told++);
    m.setSource(sourceRows<R>({ fetch: a.source.fetch } as DataSource<R>, { params: { t: 2 } }));
    expect([h.available, h.status, told]).toEqual([false, 'idle', 1]);
  });

  it('back to a source with values: asked again, available again', () => {
    const { a, m } = setup();
    const h = m.setValues!('city');
    a.lastValues().resolve([{ value: 'fromA', count: 1 }]);
    m.setSource(sourceRows<R>({ fetch: a.source.fetch } as DataSource<R>, { params: { t: 2 } }));
    const c = fakeSource({ values: true });
    m.setSource(sourceRows<R>(c.source as DataSource<R>, { params: { t: 3 } }));
    expect([c.valueCalls.length, h.available, h.status, m.diagnostics.valueFetches]).toEqual([1, true, 'loading', 2]);
    c.lastValues().resolve([{ value: 'fromC', count: 2 }]);
    expect(h.result!.values.map((v) => v.value)).toEqual(['fromC']);
  });
});

describe('while a new search loads, the old list stays whole', () => {
  it('a language change mid-load does not filter the old list\'s ticked values by the new search', () => {
    const { a, m } = setup();
    m.setQuery(makeQuery({ filter: { city: { type: 'set', include: ['ghost'] } } }));
    const h = m.setValues!('city');
    a.lastValues().resolve([{ value: 'Oran', count: 1 }]);
    const old = h.result!.values.map((v) => v.value);
    expect(old).toEqual(['ghost', 'Oran']);
    h.search('zz');
    m.setContext(localeCtx({ locale: 'fr-FR' }));
    expect(h.status).toBe('loading');
    // value-list.md: "While a server's list loads, the old one stays".
    expect(h.result!.values.map((v) => v.value)).toEqual(old);
  });
});

describe('a ticked value with rows beyond the cap', () => {
  it('stays reachable: listed (or flagged) so the user can untick it', () => {
    const rows = Array.from({ length: 5 }, (_, k) => ({ id: `r${k}`, city: `c${k}` }));
    const m = clientRows<R>({ rows, getRowId: (r) => r.id, columns: createColumnModel<R>([{ id: 'city' }]), ctx: localeCtx({ locale: 'en-US' }) });
    m.setQuery(makeQuery({ filter: { city: { type: 'set', include: ['c4'] } } }));
    const h = m.setValues('city', { max: 2 });
    expect(h.result!.truncated).toBe(true);
    // Fails on 8b45b62: c4 has a row, so the exception does not keep it, and the cap cuts it.
    expect(h.result!.values.map((v) => v.value)).toContain('c4');
  });
});

describe('notifications follow the content, not the object', () => {
  it('browser: another filter elsewhere that leaves the list the same tells nothing and keeps the object', () => {
    const rows = [{ id: 'a', city: 'Oran', name: 'x' }, { id: 'b', city: 'Alger', name: 'x' }];
    type Q = { id: string; city: string; name: string };
    const m = clientRows<Q>({ rows, getRowId: (r) => r.id, columns: createColumnModel<Q>([{ id: 'city' }, { id: 'name' }]), ctx: localeCtx({ locale: 'en-US' }) });
    const h = m.setValues('city');
    const first = h.result;
    let told = 0;
    h.subscribe(() => told++);
    m.setQuery(makeQuery({ filter: { name: { type: 'set', include: ['x'] } } }));
    expect([told, h.result]).toEqual([0, first]);
    expect(h.result).toBe(first);
  });

  it('server: a language change that relabels nothing tells nothing and keeps the object', () => {
    const { a, m } = setup();
    m.setQuery(makeQuery({ filter: { city: { type: 'set', include: ['ghost'] } } }));
    const h = m.setValues!('city');
    a.lastValues().resolve([{ value: 'Oran', count: 1 }]);
    const first = h.result;
    let told = 0;
    h.subscribe(() => told++);
    m.setContext(localeCtx({ locale: 'fr-FR' }));
    expect(told).toBe(0);
    expect(h.result).toBe(first);
  });

  it('server: a refresh answered the same: loading then idle, the same object kept', () => {
    const { a, m } = setup();
    const h = m.setValues!('city');
    a.lastValues().resolve([{ value: 'Oran', count: 1 }]);
    const first = h.result;
    const seen: string[] = [];
    h.subscribe(() => seen.push(h.status));
    h.refresh();
    a.lastValues().resolve([{ value: 'Oran', count: 1 }]);
    expect(seen).toEqual(['loading', 'idle']);
    expect(h.result).toBe(first);
  });
});

describe('the kernel tells a list\'s problems once by their content', () => {
  it('the same bad entry answered on every keystroke: told once', () => {
    const { a, m } = setup();
    const k = createKernel<R>({ rows: m, columns: createColumnModel<R>([{ id: 'city' }, { id: 'name' }]) });
    const events: GridEvent<R>[] = [];
    k.subscribe((e) => events.push(e));
    const h = k.values('city');
    a.lastValues().resolve([{ value: 'a', count: -1 }]);
    h.search('a');
    a.lastValues().resolve([{ value: 'a', count: -1 }]);
    h.search('ab');
    a.lastValues().resolve([{ value: 'a', count: -1 }]);
    expect(events.filter((e) => e.type === 'problems').length).toBe(1);
  });
});

describe('the request\'s filter', () => {
  it('omitted when nothing but this column is filtered, as the rows request omits it', () => {
    const { a, m } = setup();
    m.setQuery(makeQuery({ filter: { city: { type: 'set', include: ['Oran'] } } }));
    m.setValues!('city');
    expect('filter' in a.lastValues().req).toBe(false);
    expect(a.lastValues().req.key).not.toContain('filter');
  });
});

describe('invalidate: the host says the data changed', () => {
  it('an open server list asks again, the old list shown meanwhile', () => {
    const { a, m } = setup();
    const h = m.setValues!('city');
    a.lastValues().resolve([{ value: 'Oran', count: 1 }]);
    const first = h.result;
    m.invalidate();
    expect([a.valueCalls.length, h.status, h.result]).toEqual([2, 'loading', first]);
    a.lastValues().resolve([{ value: 'Oran', count: 2 }]);
    expect(h.result!.values[0]!.count).toBe(2);
  });

  it('a browser list follows rows changed in place', () => {
    const rows = [{ id: 'a', city: 'Oran' }];
    const m = clientRows<R>({ rows, getRowId: (r) => r.id, columns: createColumnModel<R>([{ id: 'city' }]), ctx: localeCtx({ locale: 'en-US' }) });
    const h = m.setValues('city');
    rows[0]!.city = 'Alger';
    m.invalidate();
    expect(h.result!.values.map((v) => v.value)).toEqual(['Alger']);
  });
});

describe('the browser counts under the filters that apply', () => {
  it('a half-typed filter on another column counts nothing again', () => {
    const rows = [{ id: 'a', city: 'Oran', name: 'x' }];
    type Q = { id: string; city: string; name: string };
    const m = clientRows<Q>({ rows, getRowId: (r) => r.id, columns: createColumnModel<Q>([{ id: 'city' }, { id: 'name' }]), ctx: localeCtx({ locale: 'en-US' }) });
    m.setValues('city');
    const before = m.diagnostics.countBuilds;
    m.setQuery(makeQuery({ filter: { name: { type: 'text', op: 'contains', value: '' } } }));
    expect(m.diagnostics.countBuilds).toBe(before);
  });
});
