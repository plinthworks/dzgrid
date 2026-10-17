import { describe, it, expect } from 'vitest';
import {
  createColumnModel, createKernel, dataKey, localeCtx, makeQuery,
  type GridEvent, type ModelChange, type ModelEnv, type SourceBinding,
} from '@dzgrid/core';
import { sourceRows, type DataSource, type SourceRowsOptions } from '@dzgrid/core/server';
import { fakeSource, rowsOf, type Call } from './support/fake-source.js';

type R = { id: string; name: string };
const UTC = localeCtx({ locale: 'en-US' });
const k = (id: string) => dataKey(id)!;

function setup(o: { options?: SourceRowsOptions; env?: Partial<ModelEnv<R>>; fake?: Parameters<typeof fakeSource>[0] } = {}) {
  const fake = fakeSource(o.fake);
  const columns = createColumnModel<R>([{ id: 'name' }]);
  const binding = sourceRows<R>(fake.source as DataSource<R>, o.options);
  const model = binding.create({ getRowId: (r) => r.id, columns, ctx: UTC, abort: fake.abort, ...o.env });
  const changes: ModelChange<R>[] = [];
  model.subscribe((c) => changes.push(c));
  return { ...fake, model, columns, binding, changes, kinds: () => changes.map((c) => c.kind) };
}
type Setup = ReturnType<typeof setup>;
const ids = (s: Setup) => {
  const d = s.model.displayed;
  return Array.from({ length: d.count }, (_, i) => String(d.nodeAt(d.index(i)!).id));
};
const answer = (call: Call, rows: string[], more: Record<string, unknown> = {}) => call.resolve({ rows: rowsOf(rows), ...more });
const paged = (pageSize: number, options?: SourceRowsOptions) => setup({ env: { page: { pageSize } }, ...(options && { options }) });

describe('construction and the request', () => {
  it('starts loading with no rows and asks for the first page at once', () => {
    const s = setup();
    expect(s.model.status).toEqual({ phase: 'loading' });
    expect(s.model.displayed.count).toBe(0);
    expect(s.calls.length).toBe(1);
    const req = s.calls[0]!.req;
    expect({ ...req, signal: undefined }).toEqual({
      filter: {}, sort: [], page: { index: 0, size: 50, offset: 0, cursor: null }, params: {}, zone: 'UTC',
      key: '{"filter":{},"page":{"cursor":null,"index":0,"offset":0,"size":50},"params":{},"sort":[],"zone":"UTC"}',
      signal: undefined,
    });
    expect('quick' in req).toBe(false);
    expect(req.signal.aborted).toBe(false);
    expect(s.model.diagnostics).toEqual({ fetches: 1, gate: { begun: 1, accepted: 0, dropped: { superseded: 0, 'stale-epoch': 0, aborted: 0, destroyed: 0 } } });
  });

  it('is a source model of server pages: select-all means the query, every key is kept', () => {
    const s = setup();
    expect(s.model.kind).toBe('source');
    expect(s.model.ops).toEqual({ filter: 'server', quick: 'server', sort: 'server', page: 'server' });
    expect(s.model.selectAll).toBe('query');
    expect(s.model.keeps(k('anything'))).toBe(true);
    expect(s.model.page).toEqual({ index: 0, size: 50, sizes: [25, 50, 100], total: null, pageCount: null, hasNext: false, canJump: true });
    expect(s.model.counts).toEqual({ total: null, filtered: null, displayed: 0 });
    expect(s.model.problems).toEqual([]);
  });

  it('takes the page size and sizes from the pagination setting', () => {
    const s = setup({ env: { page: { pageSize: 2, pageSizes: [2, 4] } } });
    expect(s.calls[0]!.req.page).toEqual({ index: 0, size: 2, offset: 0, cursor: null });
    expect(s.model.page).toMatchObject({ size: 2, sizes: [2, 4] });
  });

  it('sends the static params and the zone, both in the key', () => {
    const s = setup({ options: { params: { tenant: 'b', n: 2 } }, env: { ctx: localeCtx({ locale: 'fr-FR', timeZone: 'Asia/Riyadh' }) } });
    const req = s.calls[0]!.req;
    expect(req.params).toEqual({ tenant: 'b', n: 2 });
    expect(req.zone).toBe('Asia/Riyadh');
    expect(req.key).toBe('{"filter":{},"page":{"cursor":null,"index":0,"offset":0,"size":50},"params":{"n":2,"tenant":"b"},"sort":[],"zone":"Asia/Riyadh"}');
  });

  it('asks the first time with the initial query, and the kernel pushing the same query asks nothing more', () => {
    const query = makeQuery({ sort: [{ column: 'name', dir: 'desc' }], filter: { name: { type: 'text', op: 'contains', value: 'a' } } });
    const s = setup({ env: { query } });
    const kernel = createKernel<R>({ rows: s.model, columns: s.columns, query });
    expect(s.calls.length).toBe(1);
    expect(s.calls[0]!.req).toMatchObject({ sort: [{ column: 'name', dir: 'desc' }], filter: { name: { type: 'text', op: 'contains', value: 'a' } } });
    kernel.destroy();
  });

  it('sends the search only when it is not blank', () => {
    const s = setup();
    s.model.setQuery(makeQuery({ quick: '   ' }));
    expect(s.calls.length).toBe(1);
    s.model.setQuery(makeQuery({ quick: 'ab' }));
    expect(s.calls[1]!.req.quick).toBe('ab');
  });

  it('tells bad options and takes the defaults', () => {
    const s = setup({ options: { paging: 'pages' as never, maxRows: 0 }, env: { page: { pageSize: 0 }, operations: { page: 'server', sort: 'client' } } });
    expect(s.model.problems.map((p) => [p.code, p.severity, p.path])).toEqual([
      ['invalid-operations', 'error', 'operations.sort'],
      ['invalid-page', 'error', 'source.paging'],
      ['invalid-page', 'error', 'source.maxRows'],
      ['invalid-page', 'error', 'pagination.pageSize'],
    ]);
    expect(s.model.page).toMatchObject({ size: 50, canJump: true });
    expect(setup({ options: { maxRows: 2.5 } }).model.problems.map((p) => p.path)).toEqual(['source.maxRows']);
    expect(setup({ options: { maxRows: 10, paging: 'offset' } }).model.problems).toEqual([]);
  });

  it('cannot jump with cursors, and warns of cursors without server pages', () => {
    expect(setup({ options: { paging: 'cursor' } }).model.page).toMatchObject({ canJump: false });
    expect(setup({ options: { paging: 'cursor' } }).model.problems).toEqual([]);
    const off = setup({ options: { paging: 'cursor' }, env: { operations: { page: 'client' } } });
    expect(off.model.problems).toEqual([{ code: 'invalid-page', severity: 'warning', path: 'source.paging' }]);
  });

  it('takes the abort factory of the options, then of the grid, then a plain one of its own', () => {
    const made: string[] = [];
    const handle = (who: string) => () => {
      made.push(who);
      const signal = { aborted: false, reason: undefined as unknown };
      return { signal, abort: (r: unknown) => { signal.aborted = true; signal.reason = r; } };
    };
    setup({ options: { abort: handle('options') }, env: { abort: handle('env') } });
    setup({ env: { abort: handle('env') } });
    expect(made).toEqual(['options', 'env']);
    const plain = setup({ env: { abort: undefined } });
    const first = plain.calls[0]!.req.signal;
    plain.model.setPage({ index: 1 });
    expect(first).toMatchObject({ aborted: true, reason: 'superseded' });
    expect(plain.calls[1]!.req.signal).toMatchObject({ aborted: false });
  });
});

describe('status and kinds: one change per call', () => {
  it('first answer: one query change from the data, idle', () => {
    const s = paged(2);
    answer(s.calls[0]!, ['a', 'b'], { total: 4 });
    expect(s.kinds()).toEqual(['query']);
    expect(s.changes[0]).toMatchObject({ source: 'data', problems: [] });
    expect(s.changes[0]!.displayed).toBe(s.model.displayed);
    expect(s.model.status).toEqual({ phase: 'idle' });
    expect(ids(s)).toEqual(['a', 'b']);
  });

  it('a page asked: one page change, loading, the rows unchanged; its answer: another page change', () => {
    const s = paged(2);
    answer(s.calls[0]!, ['a', 'b'], { total: 4 });
    const before = s.model.displayed;
    s.model.setPage({ index: 1 }, 'user');
    expect(s.changes[1]).toMatchObject({ kind: 'page', source: 'user' });
    expect(s.changes[1]!.displayed).toBe(before);
    expect(s.model.status).toEqual({ phase: 'loading' });
    answer(s.calls[1]!, ['c', 'd'], { total: 4 });
    expect(s.kinds()).toEqual(['query', 'page', 'page']);
    expect(ids(s)).toEqual(['c', 'd']);
  });

  it('a refresh: a status change, then rows for the same page', () => {
    const s = paged(2);
    answer(s.calls[0]!, ['a', 'b'], { total: 4 });
    s.model.invalidate();
    expect(s.calls[1]!.req.page).toEqual(s.calls[0]!.req.page);
    expect(s.calls[1]!.req.key).toBe(s.calls[0]!.req.key);
    expect(s.changes[1]).toMatchObject({ kind: 'status', source: 'api' });
    answer(s.calls[1]!, ['a', 'b2'], { total: 4 });
    expect(s.kinds()).toEqual(['query', 'status', 'rows']);
    expect(ids(s)).toEqual(['a', 'b2']);
  });

  it('a refresh while loading changes nothing shown: no change, a new call', () => {
    const s = paged(2);
    s.model.invalidate();
    expect(s.changes).toEqual([]);
    expect(s.calls.length).toBe(2);
    expect(s.aborted).toEqual([['c1', 'superseded']]);
  });

  it('a source that answers at once: one change per call', () => {
    const s = setup({ env: { page: { pageSize: 2 } }, fake: { reply: (req) => ({ rows: rowsOf([`p${req.page!.index}`]), total: 6 }) } });
    expect(s.model.status).toEqual({ phase: 'idle' });
    expect(ids(s)).toEqual(['p0']);
    s.model.setPage({ index: 2 }, 'user');
    expect(s.kinds()).toEqual(['page']);
    // The answer came inside the call: the change is the call's, with its source.
    expect(s.changes[0]!.source).toBe('user');
    expect(ids(s)).toEqual(['p2']);
    s.model.invalidate();
    expect(s.kinds()).toEqual(['page', 'rows']);
    s.model.setQuery(makeQuery({ quick: 'x' }));
    expect(s.kinds()).toEqual(['page', 'rows', 'query']);
    expect(s.model.page).toMatchObject({ index: 0 });
  });

  it('a plain value (no thenable) is applied at once', () => {
    const s = setup({ fake: { reply: () => ({ rows: rowsOf(['a']), total: 1 }) } });
    expect(ids(s)).toEqual(['a']);
    expect(s.model.status).toEqual({ phase: 'idle' });
  });

  it('a real Promise is applied when it settles', async () => {
    const s = setup({ fake: { promise: true } });
    answer(s.calls[0]!, ['a'], { total: 1 });
    expect(ids(s)).toEqual([]);
    await Promise.resolve();
    await Promise.resolve();
    expect(ids(s)).toEqual(['a']);
    expect(s.kinds()).toEqual(['query']);
  });

  it('forwards a column or language change with its own kind, and asks nothing', () => {
    const s = paged(2);
    answer(s.calls[0]!, ['a', 'b'], { total: 2 });
    s.model.setColumns(createColumnModel<R>([{ id: 'name', header: 'Name' }]), 'host');
    s.model.setContext(localeCtx({ locale: 'fr-FR' }), 'host');
    expect(s.kinds()).toEqual(['query', 'context', 'context']);
    expect(s.changes[1]!.source).toBe('host');
    expect(s.calls.length).toBe(1);
    expect(ids(s)).toEqual(['a', 'b']);
  });

  it('an equal server query asks nothing', () => {
    const s = setup();
    s.model.setQuery(makeQuery());
    s.model.setQuery(makeQuery({ quick: ' ' }));
    expect(s.calls.length).toBe(1);
    expect(s.changes).toEqual([]);
  });
});

describe('server pages: go, size, clamp, the offset window', () => {
  it('asks the offset of the page', () => {
    const s = paged(2);
    s.model.setPage({ index: 3 });
    expect(s.calls[1]!.req.page).toEqual({ index: 3, size: 2, offset: 6, cursor: null });
  });

  it('a new size keeps the first row: page 4 at 25 to 100 is page 1', () => {
    const s = paged(25);
    s.model.setPage({ index: 4 });
    s.model.setPage({ size: 100 });
    expect(s.last().req.page).toEqual({ index: 1, size: 100, offset: 100, cursor: null });
    expect(s.model.page).toMatchObject({ index: 1, size: 100 });
    s.model.setPage({ size: 10, index: 7 });
    expect(s.last().req.page).toEqual({ index: 7, size: 10, offset: 70, cursor: null });
  });

  it('reports the page asked at once, the total of the last answer', () => {
    const s = paged(2);
    answer(s.calls[0]!, ['a', 'b'], { total: 5 });
    expect(s.model.page).toMatchObject({ index: 0, total: 5, pageCount: 3, hasNext: true });
    s.model.setPage({ index: 2 });
    expect(s.model.page).toMatchObject({ index: 2, total: 5, pageCount: 3, hasNext: false });
    expect(s.model.counts).toEqual({ total: 5, filtered: 5, displayed: 2 });
  });

  it('clamps to the last page when the total is known, at the new size too', () => {
    const s = paged(2);
    answer(s.calls[0]!, ['a', 'b'], { total: 5 });
    s.model.setPage({ index: 9 });
    expect(s.last().req.page).toMatchObject({ index: 2, offset: 4 });
    answer(s.last(), ['e'], { total: 5 });
    s.model.setPage({ size: 1, index: 9 });
    expect(s.last().req.page).toMatchObject({ index: 4, size: 1, offset: 4 });
  });

  it('the same ask, or a bad one, does nothing', () => {
    const s = paged(2);
    answer(s.calls[0]!, ['a', 'b'], { total: 5 });
    s.model.setPage({ index: 0 });
    s.model.setPage({ size: 2 });
    s.model.setPage({ index: 0, size: 2 });
    s.model.setPage({ index: -1 });
    s.model.setPage({ size: 0 });
    s.model.setPage({ index: 1.5 });
    expect(s.calls.length).toBe(1);
    expect(s.kinds()).toEqual(['query']);
    s.model.setPage({ index: 1 });
    s.model.setPage({ index: 1 });
    expect(s.calls.length).toBe(2);
  });

  it('counts a filtered or searched query with no total, its matches as filtered', () => {
    const s = paged(2);
    s.model.setQuery(makeQuery({ filter: { name: { type: 'text', op: 'contains', value: 'a' } } }));
    answer(s.last(), ['a', 'b'], { total: 7 });
    expect(s.model.counts).toEqual({ total: null, filtered: 7, displayed: 2 });
    s.model.setQuery(makeQuery({ quick: 'b' }));
    answer(s.last(), ['b'], { total: 1 });
    expect(s.model.counts).toEqual({ total: null, filtered: 1, displayed: 1 });
    s.model.setQuery(makeQuery({ sort: [{ column: 'name', dir: 'asc' }] }));
    answer(s.last(), ['a', 'b'], { total: 9 });
    expect(s.model.counts).toEqual({ total: 9, filtered: 9, displayed: 2 });
  });
});

describe('an unknown total', () => {
  it('infers hasNext from a full page, with a warning told once', () => {
    const s = paged(2);
    answer(s.calls[0]!, ['a', 'b']);
    expect(s.model.page).toMatchObject({ total: null, pageCount: null, hasNext: true });
    const warning = { code: 'invalid-page-response', severity: 'warning', path: 'response.hasNext' };
    expect(s.changes[0]!.told).toEqual([warning]);
    expect(s.model.problems).toEqual([warning]);
    s.model.setPage({ index: 1 });
    expect(s.changes[1]!.told).toBeUndefined();
    answer(s.last(), ['c']);
    expect(s.model.page).toMatchObject({ index: 1, hasNext: false });
    s.model.setPage({ index: 2 });
    answer(s.last(), ['e'], { hasNext: true });
    expect(s.model.problems).toEqual([]);
    expect(s.model.counts).toEqual({ total: null, filtered: null, displayed: 1 });
  });

  it('an explicit hasNext wins over the total and over the rows', () => {
    const s = paged(2);
    answer(s.calls[0]!, ['a', 'b'], { total: 10, hasNext: false });
    expect(s.model.page).toMatchObject({ total: 10, pageCount: 5, hasNext: false });
    s.model.invalidate();
    answer(s.last(), ['a'], { hasNext: true });
    expect(s.model.page).toMatchObject({ total: null, hasNext: true });
    expect(s.model.problems).toEqual([]);
  });

  it('keeps rows beyond the page size, with a warning', () => {
    const s = paged(2);
    answer(s.calls[0]!, ['a', 'b', 'c'], { total: 3 });
    expect(ids(s)).toEqual(['a', 'b', 'c']);
    expect(s.model.problems).toEqual([{ code: 'invalid-page-response', severity: 'warning', path: 'response.rows' }]);
  });

  it('reads a bad total as none', () => {
    for (const total of [-1, 2.5, '3', Number.NaN, Number.POSITIVE_INFINITY]) {
      const s = paged(2);
      answer(s.calls[0]!, ['a'], { total, hasNext: false });
      expect(s.model.page, String(total)).toMatchObject({ total: null, pageCount: null, hasNext: false });
      expect(s.model.problems).toEqual([{ code: 'invalid-page-response', severity: 'warning', path: 'response.total' }]);
    }
    const zero = paged(2);
    answer(zero.calls[0]!, [], { total: 0 });
    expect(zero.model.problems).toEqual([]);
    expect(zero.model.page).toMatchObject({ total: 0, pageCount: 1 });
  });

  it('reads a hasNext that is not a boolean as none', () => {
    const s = paged(2);
    answer(s.calls[0]!, ['a', 'b'], { total: 6, hasNext: 'yes' });
    expect(s.model.problems).toEqual([{ code: 'invalid-page-response', severity: 'warning', path: 'response.hasNext' }]);
    expect(s.model.page).toMatchObject({ hasNext: true, pageCount: 3 });
    const both = paged(2);
    answer(both.calls[0]!, ['a'], { total: 'x', hasNext: 1 });
    expect(both.model.problems.map((p) => p.path)).toEqual(['response.total', 'response.hasNext']);
    expect(both.model.page).toMatchObject({ hasNext: false });
  });

  it('warns on every answer that lacks both, not once per model', () => {
    const s = paged(2);
    answer(s.calls[0]!, ['a', 'b']);
    s.model.invalidate();
    answer(s.last(), ['a', 'b']);
    expect(s.changes.map((c) => c.told?.length ?? 0)).toEqual([1, 0, 1]);
  });
});

describe('an empty page past the end', () => {
  it('steps back to the page shown, kept on screen, hasNext false, fetched no more', () => {
    const s = paged(2);
    answer(s.calls[0]!, ['a', 'b'], { hasNext: true });
    s.model.setPage({ index: 1 });
    const shown = s.model.displayed;
    answer(s.calls[1]!, []);
    expect(s.calls.length).toBe(2);
    expect(s.model.displayed).toBe(shown);
    expect(s.model.page).toMatchObject({ index: 0, hasNext: false, total: null });
    expect(s.model.status).toEqual({ phase: 'idle' });
    expect(s.kinds()).toEqual(['query', 'page', 'page']);
  });

  it('steps back with a fetch when the page before is not the one shown', () => {
    const s = paged(2);
    answer(s.calls[0]!, ['a', 'b'], { hasNext: true });
    s.model.setPage({ index: 2 });
    answer(s.calls[1]!, [], { hasNext: false });
    expect(s.calls.length).toBe(3);
    expect(s.calls[2]!.req.page).toMatchObject({ index: 1, offset: 2 });
    expect(s.model.page).toMatchObject({ index: 1 });
    expect(s.model.status).toEqual({ phase: 'loading' });
    expect(ids(s)).toEqual(['a', 'b']);
    answer(s.calls[2]!, ['c', 'd'], { hasNext: true });
    expect(s.calls.length).toBe(3);
    expect(ids(s)).toEqual(['c', 'd']);
    // The empty page 2 is the end: page 1 has no next, whatever its answer said.
    expect(s.model.page).toMatchObject({ index: 1, hasNext: false });
    expect(s.kinds()).toEqual(['query', 'page', 'page', 'page']);
  });

  it('keeps stepping back, halfway to the page on screen, while the pages stay empty', () => {
    const s = paged(2);
    answer(s.calls[0]!, ['a', 'b'], { hasNext: true });
    s.model.setPage({ index: 3 });
    answer(s.calls[1]!, []);
    answer(s.calls[2]!, []);
    expect(s.calls.map((c) => c.req.page!.index)).toEqual([0, 3, 1]);
    expect(s.model.page).toMatchObject({ index: 0, hasNext: false });
    expect(ids(s)).toEqual(['a', 'b']);
  });

  it('the end is a row count: it holds at another size', () => {
    const s = paged(2);
    answer(s.calls[0]!, ['a', 'b'], { hasNext: true });
    s.model.setPage({ index: 1 });
    answer(s.calls[1]!, [], { hasNext: false });
    s.model.setPage({ size: 1 });
    answer(s.last(), ['a'], { hasNext: true });
    expect(s.model.page).toMatchObject({ index: 0, size: 1, hasNext: true });
    s.model.setPage({ index: 1 });
    answer(s.last(), ['b'], { hasNext: true });
    expect(s.model.page).toMatchObject({ index: 1, hasNext: false });
  });

  it('a new epoch forgets the end', () => {
    const s = paged(2);
    answer(s.calls[0]!, ['a', 'b'], { hasNext: true });
    s.model.setPage({ index: 1 });
    answer(s.calls[1]!, [], { hasNext: false });
    s.model.setQuery(makeQuery({ quick: 'a' }));
    answer(s.last(), ['a', 'b'], { hasNext: true });
    expect(s.model.page).toMatchObject({ index: 0, hasNext: true });
  });

  it('an empty first page is the empty list: total 0', () => {
    const s = paged(2);
    answer(s.calls[0]!, []);
    expect(s.model.page).toMatchObject({ index: 0, total: 0, pageCount: 1, hasNext: false });
    expect(s.model.counts).toEqual({ total: 0, filtered: 0, displayed: 0 });
    expect(s.calls.length).toBe(1);
    const more = paged(2);
    answer(more.calls[0]!, [], { hasNext: true });
    expect(more.model.page).toMatchObject({ total: null, hasNext: true });
  });

  it('with a known total, asks the last page once more', () => {
    const s = paged(2);
    answer(s.calls[0]!, ['a', 'b'], { total: 10 });
    s.model.setPage({ index: 4 });
    answer(s.calls[1]!, [], { total: 3 });
    expect(s.calls.length).toBe(3);
    expect(s.calls[2]!.req.page).toMatchObject({ index: 1, offset: 2 });
    expect(s.model.page).toMatchObject({ index: 1, total: 3, pageCount: 2 });
    expect(ids(s)).toEqual(['a', 'b']);
    answer(s.calls[2]!, ['c'], { total: 3 });
    expect(ids(s)).toEqual(['c']);
    expect(s.model.status).toEqual({ phase: 'idle' });
    expect(s.kinds()).toEqual(['query', 'page', 'page', 'page']);
  });

  it('with a total of 0, shows the empty first page and asks nothing', () => {
    const s = paged(2);
    answer(s.calls[0]!, ['a', 'b'], { total: 10 });
    s.model.setPage({ index: 3 });
    answer(s.calls[1]!, [], { total: 0 });
    expect(s.calls.length).toBe(2);
    expect(ids(s)).toEqual([]);
    expect(s.model.page).toMatchObject({ index: 0, total: 0, pageCount: 1, hasNext: false });
    expect(s.model.status).toEqual({ phase: 'idle' });
    // The rows replace the page shown (page 0): a rows change.
    expect(s.kinds()).toEqual(['query', 'page', 'rows']);
  });

  it('with a total that covers the page, trusts the rows: the empty page is shown', () => {
    const s = paged(2);
    answer(s.calls[0]!, ['a', 'b'], { total: 10 });
    s.model.setPage({ index: 2 });
    answer(s.calls[1]!, [], { total: 10 });
    expect(s.calls.length).toBe(2);
    expect(ids(s)).toEqual([]);
    expect(s.model.page).toMatchObject({ index: 2, total: 10 });
    // The last page itself, empty: shown, not asked again.
    const last = paged(2);
    answer(last.calls[0]!, ['a', 'b'], { total: 5 });
    last.model.setPage({ index: 2 });
    answer(last.calls[1]!, [], { total: 5 });
    expect(last.calls.length).toBe(2);
    expect(last.model.page).toMatchObject({ index: 2, total: 5 });
    expect(ids(last)).toEqual([]);
  });

  it('the page before at another size is not the page shown: it is fetched', () => {
    const s = paged(2);
    answer(s.calls[0]!, ['a', 'b'], { hasNext: true });
    s.model.setPage({ size: 1, index: 1 });
    answer(s.calls[1]!, [], { hasNext: false });
    expect(s.calls.length).toBe(3);
    expect(s.calls[2]!.req.page).toEqual({ index: 0, size: 1, offset: 0, cursor: null });
    answer(s.calls[2]!, ['a'], { hasNext: true });
    expect(ids(s)).toEqual(['a']);
    expect(s.model.page).toMatchObject({ index: 0, size: 1, hasNext: false });
  });
});

describe('epochs and the gate', () => {
  it('pages asked quickly: the last shows, the late one never', () => {
    const s = paged(2);
    answer(s.calls[0]!, ['a', 'b'], { total: 6 });
    s.model.setPage({ index: 1 });
    s.model.setPage({ index: 2 });
    answer(s.calls[2]!, ['e', 'f'], { total: 6 });
    answer(s.calls[1]!, ['c', 'd'], { total: 6 });
    expect(ids(s)).toEqual(['e', 'f']);
    expect(s.aborted).toEqual([['c2', 'superseded']]);
    expect(s.kinds()).toEqual(['query', 'page', 'page', 'page']);
    expect(s.model.diagnostics.gate).toMatchObject({ begun: 3, accepted: 2, dropped: { superseded: 1 } });
  });

  it('another filter: a new epoch, the first page, the old answer dropped as stale', () => {
    const s = paged(2);
    answer(s.calls[0]!, ['a', 'b'], { total: 6 });
    s.model.setPage({ index: 2 });
    const filter = { name: { type: 'text' as const, op: 'contains' as const, value: 'x' } };
    s.model.setQuery(makeQuery({ filter }), 'user');
    expect(s.changes[2]).toMatchObject({ kind: 'query', source: 'user' });
    expect(s.model.page).toMatchObject({ index: 0 });
    expect(s.last().req).toMatchObject({ filter, page: { index: 0, offset: 0 } });
    expect(s.aborted).toEqual([['c2', 'stale-epoch']]);
    answer(s.calls[1]!, ['e', 'f'], { total: 6 });
    expect(ids(s)).toEqual(['a', 'b']);
    answer(s.last(), ['x'], { total: 1 });
    expect(ids(s)).toEqual(['x']);
    expect(s.kinds()).toEqual(['query', 'page', 'query', 'query']);
    expect(s.model.diagnostics.gate.dropped['stale-epoch']).toBe(1);
  });

  it('a sort change is a new epoch too', () => {
    const s = paged(2);
    s.model.setQuery(makeQuery({ sort: [{ column: 'name', dir: 'desc' }] }));
    expect(s.aborted).toEqual([['c1', 'stale-epoch']]);
    expect(s.last().req.sort).toEqual([{ column: 'name', dir: 'desc' }]);
  });

  it('back to the query shown, same page: its answer is a rows change', () => {
    const s = paged(2);
    answer(s.calls[0]!, ['a', 'b'], { total: 6 });
    s.model.setQuery(makeQuery({ quick: 'x' }));
    s.model.setQuery(makeQuery());
    expect(s.calls.length).toBe(3);
    answer(s.calls[2]!, ['a', 'b'], { total: 6 });
    expect(s.kinds()).toEqual(['query', 'query', 'query', 'rows']);
  });

  it('a zone change is a new epoch; a language change is not', () => {
    const s = paged(2);
    answer(s.calls[0]!, ['a', 'b'], { total: 6 });
    s.model.setPage({ index: 1 });
    answer(s.calls[1]!, ['c', 'd'], { total: 6 });
    s.model.setContext(localeCtx({ locale: 'ar-SA' }));
    expect(s.calls.length).toBe(2);
    s.model.setContext(localeCtx({ locale: 'ar-SA', timeZone: 'Asia/Riyadh' }), 'host');
    expect(s.calls.length).toBe(3);
    expect(s.last().req).toMatchObject({ zone: 'Asia/Riyadh', page: { index: 0 } });
    expect(s.changes.at(-1)).toMatchObject({ kind: 'query', source: 'host' });
    expect(s.model.page).toMatchObject({ index: 0 });
  });
});

describe('failure and retry', () => {
  it('an accepted failure: status error with the host error unchanged, the asked page and the rows kept', () => {
    const s = paged(2);
    answer(s.calls[0]!, ['a', 'b'], { total: 6 });
    s.model.setPage({ index: 1 });
    const boom = new Error('boom');
    s.calls[1]!.reject(boom);
    expect(s.model.status).toMatchObject({ phase: 'error', failure: boom });
    expect((s.model.status as { failure: unknown }).failure).toBe(boom);
    expect(s.model.page).toMatchObject({ index: 1 });
    expect(ids(s)).toEqual(['a', 'b']);
    expect(s.kinds()).toEqual(['query', 'page', 'status']);
    expect(s.changes[2]).toMatchObject({ source: 'data', failure: { error: boom, key: s.calls[1]!.req.key, page: 1 } });
    expect(s.changes[2]!.failure!.error).toBe(boom);
    expect(s.model.diagnostics.gate.accepted).toBe(2);
  });

  it('retry asks the same page again under a new number', () => {
    const s = paged(2);
    answer(s.calls[0]!, ['a', 'b'], { total: 6 });
    s.model.setPage({ index: 1 });
    s.calls[1]!.reject('down');
    s.model.setPage({ index: 1 });
    expect(s.calls.length).toBe(2);
    s.model.invalidate();
    expect(s.calls[2]!.req.key).toBe(s.calls[1]!.req.key);
    expect(s.model.status).toEqual({ phase: 'loading' });
    answer(s.calls[2]!, ['c', 'd'], { total: 6 });
    expect(s.model.status).toEqual({ phase: 'idle' });
    expect(ids(s)).toEqual(['c', 'd']);
    expect(s.kinds()).toEqual(['query', 'page', 'status', 'status', 'page']);
    expect(s.changes.filter((c) => c.failure).length).toBe(1);
  });

  it('a second failure is another status change', () => {
    const s = paged(2);
    s.calls[0]!.reject('one');
    s.model.invalidate();
    s.calls[1]!.reject('two');
    expect(s.kinds()).toEqual(['status', 'status', 'status']);
    expect(s.model.status).toMatchObject({ phase: 'error', failure: 'two' });
  });

  it('a stale failure is dropped silently', () => {
    const s = paged(2);
    answer(s.calls[0]!, ['a', 'b'], { total: 6 });
    s.model.setPage({ index: 1 });
    s.model.setPage({ index: 2 });
    s.calls[1]!.reject('late');
    expect(s.model.status).toEqual({ phase: 'loading' });
    expect(s.kinds()).toEqual(['query', 'page', 'page']);
    answer(s.calls[2]!, ['e'], { total: 6 });
    expect(s.changes.some((c) => c.failure)).toBe(false);
  });

  it('a source that throws has failed, like a rejection', () => {
    const boom = new Error('sync');
    const s = setup({ fake: { reply: () => { throw boom; } } });
    expect(s.model.status).toMatchObject({ phase: 'error', failure: boom });
    s.model.invalidate();
    expect(s.kinds()).toEqual(['status']);
    expect(s.changes[0]!.failure).toMatchObject({ error: boom, page: 0 });
    expect(s.calls.length).toBe(2);
  });

  it('a thenable whose then throws has failed', () => {
    const boom = new Error('then');
    const s = setup({ fake: { reply: () => ({ then() { throw boom; } }) } });
    expect(s.model.status).toMatchObject({ phase: 'error', failure: boom });
  });
});

describe('destroy in flight', () => {
  it('aborts what waits, ignores what comes, and says nothing more', () => {
    const s = paged(2);
    answer(s.calls[0]!, ['a', 'b'], { total: 6 });
    s.model.setPage({ index: 1 });
    const n = s.changes.length;
    s.model.destroy();
    expect(s.aborted).toEqual([['c2', 'destroyed']]);
    answer(s.calls[1]!, ['c', 'd'], { total: 6 });
    s.model.setPage({ index: 2 });
    s.model.invalidate();
    s.model.setQuery(makeQuery({ quick: 'z' }));
    s.model.setSource(sourceRows<R>(fakeSource().source));
    expect(s.calls.length).toBe(2);
    expect(s.changes.length).toBe(n);
    expect(s.model.diagnostics.gate.dropped.destroyed).toBe(1);
    expect(s.model.diagnostics.fetches).toBe(2);
    s.model.destroy();
  });

  it('a failure after destroy is dropped too', () => {
    const s = paged(2);
    s.model.destroy();
    s.calls[0]!.reject('late');
    expect(s.changes).toEqual([]);
    expect(s.model.status).toEqual({ phase: 'loading' });
  });

  it('a listener added before destroy hears nothing after it', () => {
    const s = paged(2);
    let heard = 0;
    s.model.subscribe(() => heard++);
    s.model.destroy();
    answer(s.calls[0]!, ['a'], { total: 1 });
    expect(heard).toBe(0);
  });
});

describe('another source, a purge', () => {
  it('ignores the same binding, or one it did not make', () => {
    const s = paged(2);
    s.model.setSource(s.binding);
    s.model.setSource({ create: () => { throw new Error('never'); } } as SourceBinding<R>);
    expect(s.calls.length).toBe(1);
    expect(s.changes).toEqual([]);
  });

  it('swaps the source: a new epoch, the first page, the old rows stale until the answer', () => {
    const s = paged(2);
    answer(s.calls[0]!, ['a', 'b'], { total: 6 });
    s.model.setPage({ index: 1 });
    const other = fakeSource();
    s.model.setSource(sourceRows<R>(other.source as DataSource<R>, { params: { v: 2 }, paging: 'cursor' }), 'host');
    expect(s.aborted).toEqual([['c2', 'stale-epoch']]);
    expect(s.calls.length).toBe(2);
    expect(other.calls.length).toBe(1);
    expect(other.calls[0]!.req).toMatchObject({ params: { v: 2 }, page: { index: 0, size: 2 } });
    expect(s.model.page).toMatchObject({ index: 0, canJump: true });
    expect(ids(s)).toEqual(['a', 'b']);
    expect(s.changes.at(-1)).toMatchObject({ kind: 'query', source: 'host' });
    answer(other.calls[0]!, ['a', 'b'], { total: 2 });
    expect(s.kinds()).toEqual(['query', 'page', 'query', 'query']);
    expect(s.model.diagnostics.fetches).toBe(3);
  });

  it('purge: the rows go at once, the same page is asked again, its answer a query change', () => {
    const s = paged(2);
    answer(s.calls[0]!, ['a', 'b'], { total: 6 });
    s.model.setPage({ index: 1 });
    answer(s.calls[1]!, ['c', 'd'], { total: 6 });
    s.model.invalidate({ purge: true });
    expect(ids(s)).toEqual([]);
    expect(s.model.status).toEqual({ phase: 'loading' });
    expect(s.last().req.page).toMatchObject({ index: 1 });
    expect(s.calls.length).toBe(3);
    answer(s.calls[2]!, ['c', 'd'], { total: 6 });
    expect(s.kinds()).toEqual(['query', 'page', 'page', 'query', 'query']);
    expect(ids(s)).toEqual(['c', 'd']);
  });

  it('purge before the first answer still gives one change', () => {
    const s = paged(2);
    s.model.invalidate({ purge: true });
    expect(s.kinds()).toEqual(['query']);
  });
});

describe('malformed answers, double settles, re-entrant sources', () => {
  for (const [label, response] of [['null', null], ['a number', 3], ['a string', 'rows'], ['no rows', { total: 2 }], ['rows not an array', { rows: { a: 1 } }]] as const) {
    it(`refuses ${label}: an accepted failure whose error is the problem`, () => {
      const s = paged(2);
      s.calls[0]!.resolve(response);
      const p = { code: 'invalid-page-response', severity: 'error', path: 'response' };
      expect(s.model.status).toMatchObject({ phase: 'error', failure: p });
      expect(s.changes[0]).toMatchObject({ kind: 'status', told: [p], failure: { error: p, page: 0 } });
      expect(s.model.problems).toEqual([p]);
      expect(ids(s)).toEqual([]);
    });
  }

  it('a malformed answer keeps the rows and the page asked', () => {
    const s = paged(2);
    answer(s.calls[0]!, ['a', 'b'], { total: 6 });
    s.model.setPage({ index: 2 });
    s.calls[1]!.resolve(undefined);
    expect(ids(s)).toEqual(['a', 'b']);
    expect(s.model.page).toMatchObject({ index: 2, total: 6 });
  });

  it('a second settle of one call is ignored', () => {
    const s = setup({ fake: { reply: (_req, call) => ({ then(ok: (v: unknown) => void, err: (e: unknown) => void) { ok({ rows: rowsOf(['a']), total: 1 }); ok({ rows: rowsOf(['b']), total: 1 }); err('no'); void call; } }) } });
    expect(ids(s)).toEqual(['a']);
    expect(s.model.status).toEqual({ phase: 'idle' });
    expect(s.model.diagnostics.gate).toMatchObject({ accepted: 1, dropped: { superseded: 0 } });
  });

  it('a throw after the answer is ignored', () => {
    const s = setup({ fake: { reply: () => ({ then(ok: (v: unknown) => void) { ok({ rows: rowsOf(['a']), total: 1 }); throw new Error('after'); } }) } });
    expect(s.model.status).toEqual({ phase: 'idle' });
    expect(ids(s)).toEqual(['a']);
  });

  it('a source that pages while it is asked: the newer ask wins, one model left consistent', () => {
    let model: { setPage(p: { index: number }): void } | null = null;
    const s = setup({
      env: { page: { pageSize: 2 } },
      fake: {
        reply: (req) => {
          if (req.page!.index === 0 && model) model.setPage({ index: 1 });
          return { rows: rowsOf([`p${req.page!.index}`]), total: 6 };
        },
      },
    });
    model = s.model;
    s.model.invalidate();
    expect(s.calls.map((c) => c.req.page!.index)).toEqual([0, 0, 1]);
    expect(ids(s)).toEqual(['p1']);
    expect(s.model.page).toMatchObject({ index: 1 });
    expect(s.model.status).toEqual({ phase: 'idle' });
    expect(s.kinds()).toEqual(['page']);
  });

  it('a listener that pages from inside a change is heard after it, one change each', () => {
    const s = paged(2);
    const seen: string[] = [];
    s.model.subscribe((c) => {
      seen.push(c.kind);
      if (c.kind === 'query') s.model.setPage({ index: 1 });
    });
    answer(s.calls[0]!, ['a', 'b'], { total: 6 });
    expect(seen).toEqual(['query', 'page']);
    expect(s.calls.length).toBe(2);
  });
});

describe('row identity on a page', () => {
  it('tells duplicate ids in a page, through the transaction', () => {
    const s = paged(3);
    s.calls[0]!.resolve({ rows: [{ id: 'a', name: 'a' }, { id: 'a', name: 'b' }], total: 2 });
    expect(s.changes[0]!.transaction?.problems.map((p) => p.code)).toEqual(['duplicate-row-id']);
    expect(s.model.problems.map((p) => p.code)).toEqual(['duplicate-row-id']);
    expect(s.model.row(k('a'))).toBeDefined();
    expect(s.model.row(k('zz'))).toBeUndefined();
  });

  it('the quick search is done in no time when it runs on the server', () => {
    const w = setup().model.warmSearch!();
    expect(w.step(1)).toBe(true);
    expect(w.progress).toBe(1);
    w.cancel();
  });
});

describe('through the kernel', () => {
  const log = <T,>(kernel: { subscribe(fn: (e: GridEvent<T>) => void): () => void }) => {
    const events: GridEvent<T>[] = [];
    kernel.subscribe((e) => events.push(e));
    return events;
  };

  it('select-all is everything-except, kept across pages; included keys of other pages survive', () => {
    const s = paged(2);
    const kernel = createKernel<R>({ rows: s.model, columns: s.columns });
    answer(s.calls[0]!, ['a', 'b'], { total: 6 });
    kernel.dispatch({ type: 'selection.set', selection: { mode: 'include', keys: new Set([k('a')]) } }, 'user');
    kernel.dispatch({ type: 'page.go', index: 1 }, 'user');
    answer(s.last(), ['c', 'd'], { total: 6 });
    expect([...kernel.selection.keys]).toEqual([k('a')]);
    kernel.dispatch({ type: 'selection.all' }, 'user');
    kernel.dispatch({ type: 'page.go', index: 2 }, 'user');
    answer(s.last(), ['e', 'f'], { total: 6 });
    expect(kernel.selection.mode).toBe('exclude');
  });

  it('pageChanged from the user at the ask, then from the data when the total arrives', () => {
    const s = paged(2);
    const kernel = createKernel<R>({ rows: s.model, columns: s.columns });
    answer(s.calls[0]!, ['a', 'b'], { total: 6 });
    const events = log<R>(kernel);
    kernel.dispatch({ type: 'page.go', index: 1 }, 'user');
    expect(events.map((e) => e.type)).toEqual(['modelUpdated', 'pageChanged']);
    expect(events[1]).toMatchObject({ source: 'user', page: { index: 1, total: 6 } });
    events.length = 0;
    answer(s.last(), ['c', 'd'], { total: 7 });
    expect(events.map((e) => e.type)).toEqual(['modelUpdated', 'pageChanged']);
    expect(events[1]).toMatchObject({ source: 'data', page: { index: 1, total: 7, pageCount: 4 } });
  });

  it('a bent answer is told as problems; a failure as fetchFailed after modelUpdated', () => {
    const s = paged(2);
    const kernel = createKernel<R>({ rows: s.model, columns: s.columns });
    const events = log<R>(kernel);
    answer(s.calls[0]!, ['a', 'b']);
    expect(events.map((e) => e.type)).toEqual(['modelUpdated', 'pageChanged', 'problems']);
    expect(events[2]).toMatchObject({ source: 'data', problems: [{ code: 'invalid-page-response', path: 'response.hasNext' }] });
    events.length = 0;
    kernel.dispatch({ type: 'rows.refresh' }, 'user');
    s.last().reject('down');
    expect(events.map((e) => e.type)).toEqual(['modelUpdated', 'modelUpdated', 'fetchFailed']);
    expect(events[2]).toEqual({ type: 'fetchFailed', source: 'data', error: 'down', key: s.last().req.key, page: 0 });
  });

  it('a page command refused by the kernel never reaches the source', () => {
    const s = paged(2);
    const kernel = createKernel<R>({ rows: s.model, columns: s.columns });
    expect(kernel.dispatch({ type: 'page.size', size: 0 }, 'user')).toMatchObject({ ok: false, reason: 'invalid-page' });
    expect(s.calls.length).toBe(1);
  });
});

describe('step 5 part 2 review', () => {
  it('forgets the old query’s total when the query changes: no "no rows" while the new one loads', () => {
    const s = paged(2);
    answer(s.calls[0]!, ['a', 'b'], { total: 6 });
    s.model.setQuery(makeQuery({ filter: { name: { type: 'text', op: 'equals', value: 'zz' } } }));
    answer(s.calls[1]!, [], { total: 0 });
    expect(s.model.counts.filtered).toBe(0);
    s.model.setQuery(makeQuery());
    expect(s.model.status.phase).toBe('loading');
    expect(s.model.counts).toMatchObject({ total: null, filtered: null });
    expect(s.model.page).toMatchObject({ total: null, pageCount: null });
    // Nor does it clamp the new query's pages to the old one's count.
    s.model.setPage({ index: 2 });
    expect(s.model.page!.index).toBe(2);
  });

  it('keeps the total for a page change within the same query', () => {
    const s = paged(2);
    answer(s.calls[0]!, ['a', 'b'], { total: 6 });
    s.model.setPage({ index: 1 });
    expect(s.model.page).toMatchObject({ index: 1, total: 6, pageCount: 3 });
  });

  it('goes back from an empty page far past an unknown end in a few requests, to the page on screen', () => {
    const s = paged(2);
    answer(s.calls[0]!, ['a', 'b'], { hasNext: true });
    s.model.setPage({ index: 1000 });
    // Every page after the first is empty: halfway back each time (500, 250, …, 1), then page 0 kept.
    while (s.model.status.phase === 'loading') answer(s.calls.at(-1)!, []);
    expect(s.calls.length).toBeLessThanOrEqual(12);
    expect(s.model.page).toMatchObject({ index: 0, hasNext: false });
    expect(ids(s)).toEqual(['a', 'b']);
  });

  it('finds an unknown end in a few requests, not one per page', () => {
    const s = paged(2);
    // Page 1000 asked before the first page answered: nothing of this query on screen.
    s.model.setPage({ index: 1000 });
    for (let i = 1; i < 40 && s.model.status.phase === 'loading'; i++) {
      const c = s.calls.at(-1)!;
      const at = c.req.page!.index;
      if (at > 3) answer(c, []);
      else answer(c, [`r${at}a`, `r${at}b`], { hasNext: true });
    }
    expect(s.model.status.phase).toBe('idle');
    expect(s.calls.length).toBeLessThan(15);
    expect(s.model.displayed.count).toBe(2);
  });
});
