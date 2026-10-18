import { describe, it, expect } from 'vitest';
import {
  createColumnModel, createKernel, localeCtx, makeQuery,
  type ColumnDef, type FilterModel, type GridEvent, type ModelChange, type ModelEnv, type OperationsInput, type ValuesHandle,
} from '@dzgrid/core';
import { sourceRows, type DataSource, type SourceRowsOptions } from '@dzgrid/core/server';
import { fakeSource, rowsOf } from './support/fake-source.js';

/** docs/behaviors/value-list.md, on a server. */
type R = { id: string; name: string; city?: string };
const UTC = localeCtx({ locale: 'en-US' });
const DEFS: ColumnDef<R>[] = [{ id: 'name' }, { id: 'city' }, { id: 'n', type: 'number' }, { id: 't', type: 'instant' }, { id: 'off', filter: false }];

function setup(o: { operations?: OperationsInput; options?: SourceRowsOptions; env?: Partial<ModelEnv<R>>; fake?: Parameters<typeof fakeSource>[0] } = {}) {
  const fake = fakeSource({ values: true, ...o.fake });
  const columns = createColumnModel<R>(DEFS);
  const model = sourceRows<R>(fake.source as DataSource<R>, o.options).create({
    getRowId: (r) => r.id, columns, ctx: UTC, abort: fake.abort, ...(o.operations && { operations: o.operations }), ...o.env,
  });
  const changes: ModelChange<R>[] = [];
  model.subscribe((c) => changes.push(c));
  return { ...fake, model, columns, changes };
}
const q = (filter: FilterModel = {}, quick = '') => makeQuery({ filter, quick });
const req = (s: ReturnType<typeof setup>, i = s.valueCalls.length - 1) => {
  const { signal, ...rest } = s.valueCalls[i]!.req;
  return rest;
};
const watch = (h: ValuesHandle) => {
  const seen: [string, unknown][] = [];
  h.subscribe(() => seen.push([h.status, h.result]));
  return seen;
};
const vals = (h: ValuesHandle) => h.result && h.result.values.map((v) => [v.value, v.label, v.count, ...(v.selected ? ['selected'] : [])]);

describe('the request', () => {
  it('carries the column, the search trimmed, the limit, the wire filter without this column, the server search, params, zone, key', () => {
    const s = setup({ options: { params: { tenant: 'a' } } });
    s.model.setQuery(q({ city: { type: 'set', include: ['Oran'] }, n: { type: 'number', op: 'gt', value: 1 } }, 'abc'));
    const fetches = s.calls.length;
    s.model.setValues!('city', { search: '  Al ' });
    expect(s.calls.length).toBe(fetches);
    expect(s.valueCalls.length).toBe(1);
    expect(req(s)).toEqual({
      column: 'city', search: 'Al', limit: 2000, filter: { n: { type: 'number', op: 'gt', value: 1 } }, quick: 'abc', params: { tenant: 'a' }, zone: 'UTC',
      key: '{"column":"city","filter":{"n":{"op":"gt","type":"number","value":1}},"limit":2000,"params":{"tenant":"a"},"quick":"abc","search":"Al","zone":"UTC"}',
    });
    expect(s.valueCalls[0]!.req.signal.aborted).toBe(false);
  });

  it('sends a max as the limit; no quick when the search runs in the browser or is blank', () => {
    const s = setup({ operations: { page: 'off', filter: 'server' } });
    s.model.setQuery(q({}, 'abc'));
    s.model.setValues!('city', { max: 5 });
    expect(req(s)).toEqual({ column: 'city', search: '', limit: 5, filter: {}, params: {}, zone: 'UTC', key: '{"column":"city","filter":{},"limit":5,"params":{},"search":"","zone":"UTC"}' });
    const t = setup();
    t.model.setQuery(q({}, '   '));
    t.model.setValues!('city');
    expect('quick' in req(t)).toBe(false);
  });

  it('a filter on the column itself, and a half-typed one elsewhere, travel nowhere', () => {
    const s = setup();
    s.model.setQuery(q({ city: { type: 'text', op: 'contains', value: 'x' }, name: { type: 'text', op: 'contains', value: '' } }));
    s.model.setValues!('city');
    expect(req(s).filter).toEqual({});
  });

  it('counts the requests', () => {
    const s = setup();
    const h = s.model.setValues!('city');
    h.search('a');
    h.refresh();
    expect(s.model.diagnostics.valueFetches).toBe(3);
    expect(s.model.diagnostics.fetches).toBe(1);
  });
});

describe('the answer', () => {
  it('a list: kept in order, labels default to the value, counts null when absent, zero counts dropped', () => {
    const s = setup();
    const h = s.model.setValues!('city');
    expect([h.status, h.result, h.available]).toEqual(['loading', null, true]);
    const seen = watch(h);
    s.lastValues().resolve([{ value: 'Oran', label: 'Wahran', count: 3 }, { value: 'Alger', count: 0 }, { value: 'Annaba' }]);
    expect(h.status).toBe('idle');
    expect(h.result).toEqual({ values: [{ value: 'Oran', label: 'Wahran', count: 3 }, { value: 'Annaba', label: 'Annaba', count: null }], blanks: null, truncated: false });
    expect(h.problems).toEqual([]);
    expect(seen.map((x) => x[0])).toEqual(['idle']);
  });

  it('an object: blanks and truncated as the host says', () => {
    const s = setup();
    const h = s.model.setValues!('city');
    s.lastValues().resolve({ values: [{ value: 'a', count: 1 }], blanks: 4, truncated: true });
    expect(h.result).toEqual({ values: [{ value: 'a', label: 'a', count: 1 }], blanks: 4, truncated: true });
  });

  it('applies to the list only: no model change, no rows request, no fetchFailed on failure', () => {
    const s = setup();
    const k = createKernel<R>({ rows: s.model, columns: s.columns });
    const events: GridEvent<R>[] = [];
    k.subscribe((e) => events.push(e));
    const h = k.values('city');
    s.lastValues().resolve([{ value: 'a' }]);
    h.search('b');
    s.lastValues().reject('boom');
    expect([h.status, h.failure]).toEqual(['error', 'boom']);
    expect(h.result!.values.map((v) => v.value)).toEqual(['a']);
    expect(s.changes).toEqual([]);
    expect(events).toEqual([]);
    expect(s.calls.length).toBe(1);
    expect(s.model.status.phase).toBe('loading');
    h.refresh();
    expect(h.status).toBe('loading');
    expect(req(s).key).toBe(s.valueCalls[1]!.req.key);
    s.lastValues().resolve([{ value: 'b' }]);
    expect([h.status, vals(h)]).toEqual(['idle', [['b', 'b', null]]]);
    expect('failure' in h && h.failure !== undefined).toBe(false);
  });

  it('a synchronous source, a Promise, a throw', async () => {
    const sync = setup({ fake: { valuesReply: () => [{ value: 'a', count: 1 }] } });
    const h = sync.model.setValues!('city');
    expect([h.status, vals(h)]).toEqual(['idle', [['a', 'a', 1]]]);

    const thrown = setup({ fake: { valuesReply: () => { throw new Error('down'); } } });
    const t = thrown.model.setValues!('city');
    expect(t.status).toBe('error');
    expect((t.failure as Error).message).toBe('down');

    const p = setup({ fake: { promise: true } });
    const a = p.model.setValues!('city');
    p.lastValues().resolve([{ value: 'x' }]);
    await Promise.resolve();
    await Promise.resolve();
    expect([a.status, vals(a)]).toEqual(['idle', [['x', 'x', null]]]);
  });

  it('the owner\'s rule on a server: a ticked value the list lacks comes first, count 0, selected', () => {
    const s = setup();
    s.model.setQuery(q({ city: { type: 'set', include: ['Tlemcen', 'Oran'] } }));
    const h = s.model.setValues!('city');
    s.lastValues().resolve([{ value: 'Oran', count: 2 }, { value: 'Tlemcen', count: 0 }, { value: 'Alger', count: 5 }]);
    expect(vals(h)).toEqual([['Tlemcen', 'Tlemcen', 0, 'selected'], ['Oran', 'Oran', 2], ['Alger', 'Alger', 5]]);
    // A search the ticked value does not match leaves it out; one it matches keeps it.
    h.search('ora');
    s.lastValues().resolve([{ value: 'Oran', count: 2 }]);
    expect(vals(h)).toEqual([['Oran', 'Oran', 2]]);
    h.search('tlem');
    s.lastValues().resolve([]);
    expect(vals(h)).toEqual([['Tlemcen', 'Tlemcen', 0, 'selected']]);
  });

  it('a ticked number the server lacks is labelled by the codec', () => {
    const s = setup({ env: { ctx: localeCtx({ locale: 'fr-FR' }) } });
    s.model.setQuery(q({ n: { type: 'set', include: ['1234.5'] } }));
    const h = s.model.setValues!('n');
    s.lastValues().resolve([]);
    expect(vals(h)).toEqual([['1234.5', '1\u202f234,5', 0, 'selected']]);
  });
});

describe('order of requests', () => {
  it('a new search supersedes: the old list kept while loading, a late answer dropped', () => {
    const s = setup();
    const h = s.model.setValues!('city');
    s.valueCalls[0]!.resolve([{ value: 'a' }]);
    const first = h.result;
    const seen = watch(h);
    h.search('b');
    h.search('bo');
    expect(s.aborted).toEqual([['v2', 'superseded']]);
    expect([h.status, h.result]).toEqual(['loading', first]);
    s.valueCalls[1]!.resolve([{ value: 'b' }]);
    expect(h.result).toBe(first);
    s.valueCalls[2]!.resolve([{ value: 'bo' }]);
    expect(vals(h)).toEqual([['bo', 'bo', null]]);
    expect(seen.map((x) => x[0])).toEqual(['loading', 'idle']);
    h.search(' bo ');
    expect(s.valueCalls.length).toBe(3);
  });

  it('close cancels (aborted): a late answer or failure is dropped, never an error, never told', () => {
    const s = setup();
    const h = s.model.setValues!('city');
    const seen = watch(h);
    h.close();
    expect(s.aborted).toEqual([['v1', 'aborted']]);
    s.lastValues().reject('late');
    expect([h.status, h.result, seen]).toEqual(['loading', null, []]);
    h.search('x');
    h.refresh();
    expect(s.valueCalls.length).toBe(1);
  });

  it('a second list on the same column closes the first; two columns are independent', () => {
    const s = setup();
    const a = s.model.setValues!('city');
    const n = s.model.setValues!('n');
    const b = s.model.setValues!('city');
    expect(s.aborted).toEqual([['v1', 'aborted']]);
    s.valueCalls[1]!.resolve([{ value: '1' }]);
    s.valueCalls[2]!.resolve([{ value: 'c' }]);
    expect([a.status, vals(n), vals(b)]).toEqual(['loading', [['1', '1', null]], [['c', 'c', null]]]);
  });

  it('a new epoch with another request: asked again, the old list shown, in flight dropped (stale-epoch)', () => {
    const s = setup();
    const h = s.model.setValues!('city');
    s.lastValues().resolve([{ value: 'a' }]);
    const first = h.result;
    s.model.setQuery(q({ name: { type: 'text', op: 'contains', value: 'z' } }));
    expect(s.valueCalls.length).toBe(2);
    expect(req(s).filter).toEqual({ name: { type: 'text', op: 'contains', value: 'z' } });
    expect([h.status, h.result]).toEqual(['loading', first]);
    s.model.setQuery(q({ name: { type: 'text', op: 'contains', value: 'zz' } }));
    expect(s.aborted.filter((x) => x[0].startsWith('v'))).toEqual([['v2', 'stale-epoch']]);
    expect(s.valueCalls.length).toBe(3);
    s.valueCalls[1]!.resolve([{ value: 'stale' }]);
    expect(h.result).toBe(first);
    s.valueCalls[2]!.resolve([{ value: 'zz' }]);
    expect(vals(h)).toEqual([['zz', 'zz', null]]);
  });

  it('a new epoch with the same request (the column\'s own filter applied): kept, nothing asked; the ticked flags follow', () => {
    const s = setup();
    const h = s.model.setValues!('city');
    s.lastValues().resolve([{ value: 'a', count: 1 }]);
    const seen = watch(h);
    const fetches = s.calls.length;
    s.model.setQuery(q({ city: { type: 'set', include: ['a'] } }));
    expect(s.calls.length).toBe(fetches + 1);
    expect(s.valueCalls.length).toBe(1);
    expect(h.status).toBe('idle');
    expect(seen).toEqual([]);
    s.model.setQuery(q({ city: { type: 'set', include: ['a', 'gone'] } }));
    expect(s.valueCalls.length).toBe(1);
    expect(vals(h)).toEqual([['gone', 'gone', 0, 'selected'], ['a', 'a', 1]]);
    expect(seen.length).toBe(1);
  });

  it('a ticked value the list lacks: no new list object, no notification, for a change that changes nothing', () => {
    const s = setup({ env: { page: { pageSize: 1 } } });
    s.model.setQuery(q({ city: { type: 'set', include: ['gone'] } }));
    const h = s.model.setValues!('city');
    s.lastValues().resolve([{ value: 'a' }]);
    const shown = h.result;
    const seen = watch(h);
    s.last().resolve({ rows: rowsOf(['a']), total: 3 });
    s.model.setPage({ index: 1 });
    expect(h.result).toBe(shown);
    expect(seen).toEqual([]);
  });

  it('a new epoch with the same request while it is in flight: asked again', () => {
    const s = setup();
    const h = s.model.setValues!('city');
    s.model.setQuery(q({ city: { type: 'set', include: ['a'] } }));
    expect(s.aborted.filter((x) => x[0].startsWith('v'))).toEqual([['v1', 'stale-epoch']]);
    expect(s.valueCalls.length).toBe(2);
    expect(s.valueCalls[1]!.req.key).toBe(s.valueCalls[0]!.req.key);
    s.valueCalls[1]!.resolve([{ value: 'a' }]);
    expect(h.status).toBe('idle');
  });

  it('a rows answer, a page change, a language change: nothing asked', () => {
    const s = setup({ env: { page: { pageSize: 1 } } });
    s.model.setValues!('city');
    s.last().resolve({ rows: rowsOf(['a']), total: 3 });
    s.model.setPage({ index: 1 });
    s.model.setContext(localeCtx({ locale: 'fr-FR' }));
    expect(s.valueCalls.length).toBe(1);
  });

  it('a zone change that moves an instant filter, new params: asked again with them', () => {
    const s = setup();
    s.model.setQuery(q({ t: { type: 'instant', op: 'onDay', day: '2026-03-05' } }));
    const h = s.model.setValues!('city');
    s.lastValues().resolve([{ value: 'a' }]);
    s.model.setContext(localeCtx({ locale: 'en-US', timeZone: 'Africa/Algiers' }));
    expect(s.valueCalls.length).toBe(2);
    expect(req(s).zone).toBe('Africa/Algiers');
    expect((req(s).filter as any).t.resolved).toEqual({ from: '2026-03-04T23:00:00.000Z', to: '2026-03-05T23:00:00.000Z' });
    s.model.setSource(sourceRows<R>(s.source as DataSource<R>, { params: { tenant: 'b' } }));
    expect(s.valueCalls.length).toBe(3);
    expect(req(s).params).toEqual({ tenant: 'b' });
    expect(h.status).toBe('loading');
  });

  it('a failure kept under the same request after a new epoch', () => {
    const s = setup();
    const h = s.model.setValues!('city');
    s.lastValues().reject('x');
    s.model.setQuery(q({ city: { type: 'set', include: ['a'] } }));
    expect([h.status, s.valueCalls.length]).toEqual(['error', 1]);
  });

  it('destroy: aborted (destroyed), the handle inert, nothing told', () => {
    const s = setup();
    const h = s.model.setValues!('city');
    const seen = watch(h);
    s.model.destroy();
    expect(s.aborted).toContainEqual(['v1', 'destroyed']);
    s.lastValues().resolve([{ value: 'late' }]);
    h.search('again');
    expect([h.status, h.result, seen, s.valueCalls.length]).toEqual(['loading', null, [], 1]);
  });
});

describe('where the list comes from', () => {
  it('after destroy: a closed list, nothing asked', () => {
    const s = setup();
    s.model.destroy();
    const h = s.model.setValues!('city');
    expect([h.available, s.valueCalls.length]).toEqual([false, 0]);
  });

  it('no values on the source: not available, empty, nothing asked, no problem', () => {
    const s = setup({ fake: { values: false } });
    const h = s.model.setValues!('city');
    expect([h.available, h.status, h.result, h.problems]).toEqual([false, 'idle', { values: [], blanks: null, truncated: false }, []]);
    h.search('a');
    expect(s.valueCalls.length).toBe(0);
  });

  it('filter in the browser (fetched set): the rows held, no request, even with values on the source', () => {
    const s = setup({ operations: { page: 'off' } });
    s.last().resolve({ rows: [{ id: '1', name: 'a', city: 'Oran' }, { id: '2', name: 'b', city: 'Oran' }, { id: '3', name: 'c', city: 'Alger' }] });
    const h = s.model.setValues!('city');
    expect(s.valueCalls.length).toBe(0);
    expect(vals(h)).toEqual([['Alger', 'Alger', 1], ['Oran', 'Oran', 2]]);
    expect(h.result!.blanks).toBe(0);
    let calls = 0;
    h.subscribe(() => calls++);
    s.model.setQuery(q({ name: { type: 'text', op: 'equals', value: 'a' } }));
    expect([calls, vals(h)]).toEqual([1, [['Oran', 'Oran', 1]]]);
    expect(s.valueCalls.length).toBe(0);
  });

  it('a fetched set filtered on the server: the server, never the rows held', () => {
    const s = setup({ operations: { page: 'off', filter: 'server' } });
    s.last().resolve({ rows: [{ id: '1', name: 'a', city: 'Oran' }] });
    const h = s.model.setValues!('city');
    expect(s.valueCalls.length).toBe(1);
    expect(h.result).toBe(null);
  });

  it('an unknown or unfilterable column: closed, with its problem, nothing asked', () => {
    const s = setup();
    expect(s.model.setValues!('nope').problems).toEqual([{ code: 'unknown-column', severity: 'error', path: 'values.nope' }]);
    expect(s.model.setValues!('off').problems).toEqual([{ code: 'invalid-filter', severity: 'error', path: 'values.off' }]);
    expect(s.valueCalls.length).toBe(0);
  });
});

describe('the answer read (invalid-values-response)', () => {
  const read = (response: unknown, o: { max?: number } = {}) => {
    const s = setup();
    const h = s.model.setValues!('city', o);
    s.lastValues().resolve(response);
    return h;
  };
  const shape = (h: ValuesHandle) => h.problems.map((p) => [p.code, p.severity, p.path]);

  it('not a list: an error, the status and failure, nothing kept', () => {
    for (const r of [null, 5, 'x', {}, { values: 'x' }, { rows: [] }]) {
      const h = read(r);
      expect(h.status, JSON.stringify(r)).toBe('error');
      expect(h.result).toBe(null);
      expect(shape(h)).toEqual([['invalid-values-response', 'error', 'response']]);
      expect(h.failure).toEqual({ code: 'invalid-values-response', severity: 'error', path: 'response' });
    }
  });

  it('an entry without a string value: dropped, a warning at its index', () => {
    const h = read([{ value: 'a' }, null, { value: 3 }, 'b', { label: 'x' }]);
    expect(vals(h)).toEqual([['a', 'a', null]]);
    expect(shape(h)).toEqual([1, 2, 3, 4].map((i) => ['invalid-values-response', 'warning', `response.values[${i}]`]));
    expect(h.status).toBe('idle');
  });

  it('ten warnings at most, then one summary', () => {
    const h = read([...Array.from({ length: 12 }, () => ({ value: 1 })), { value: 'ok' }]);
    expect(vals(h)).toEqual([['ok', 'ok', null]]);
    expect(h.problems.length).toBe(11);
    expect(h.problems[9]!.path).toBe('response.values[9]');
    expect(h.problems[10]).toEqual({ code: 'invalid-values-response', severity: 'warning', path: 'response.values', detail: '2 more' });
  });

  it('a value seen before: the first wins, a warning', () => {
    const h = read([{ value: 'a', count: 1 }, { value: 'a', count: 2 }]);
    expect(vals(h)).toEqual([['a', 'a', 1]]);
    expect(shape(h)).toEqual([['invalid-values-response', 'warning', 'response.values[1]']]);
  });

  it('a bad count: null, a warning; a label not text: the value, a warning', () => {
    const h = read([{ value: 'a', count: -1 }, { value: 'b', count: 1.5 }, { value: 'c', count: '2' }, { value: 'd', label: 5, count: 2 }, { value: 'e', label: null }]);
    expect(vals(h)).toEqual([['a', 'a', null], ['b', 'b', null], ['c', 'c', null], ['d', 'd', 2], ['e', 'e', null]]);
    expect(shape(h)).toEqual([
      ['invalid-values-response', 'warning', 'response.values[0].count'],
      ['invalid-values-response', 'warning', 'response.values[1].count'],
      ['invalid-values-response', 'warning', 'response.values[2].count'],
      ['invalid-values-response', 'warning', 'response.values[3].label'],
    ]);
  });

  it('more than the limit: cut, truncated, a warning', () => {
    const h = read([{ value: 'a' }, { value: 'b' }, { value: 'c' }], { max: 2 });
    expect(h.result).toEqual({ values: [{ value: 'a', label: 'a', count: null }, { value: 'b', label: 'b', count: null }], blanks: null, truncated: true });
    expect(shape(h)).toEqual([['invalid-values-response', 'warning', 'response.values']]);
    expect(read([{ value: 'a' }, { value: 'b' }], { max: 2 }).problems).toEqual([]);
    // Zero counts dropped first: they never use the limit.
    expect(read([{ value: 'a', count: 0 }, { value: 'b' }, { value: 'c' }], { max: 2 }).result!.truncated).toBe(false);
  });

  it('bad blanks or truncated: null or false, a warning', () => {
    const h = read({ values: [], blanks: -2, truncated: 'yes' });
    expect(h.result).toEqual({ values: [], blanks: null, truncated: false });
    expect(shape(h)).toEqual([['invalid-values-response', 'warning', 'response.blanks'], ['invalid-values-response', 'warning', 'response.truncated']]);
  });

  it('the kernel tells a list\'s new problems once', () => {
    const s = setup();
    const k = createKernel<R>({ rows: s.model, columns: s.columns });
    const events: GridEvent<R>[] = [];
    k.subscribe((e) => events.push(e));
    const h = k.values('city');
    s.lastValues().resolve([{ value: 'a' }, { value: 'a' }]);
    expect(events).toEqual([{ type: 'problems', source: 'data', problems: [{ code: 'invalid-values-response', severity: 'warning', path: 'response.values[1]' }] }]);
    h.search('b');
    s.lastValues().resolve([{ value: 'b' }]);
    expect(events.length).toBe(1);
  });
});
