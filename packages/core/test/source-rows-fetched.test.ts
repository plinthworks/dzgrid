import { describe, it, expect } from 'vitest';
import {
  createColumnModel, createKernel, dataKey, localeCtx, makeQuery,
  type GridEvent, type ModelChange, type ModelEnv, type OperationsInput,
} from '@dzgrid/core';
import { sourceRows, type DataSource, type SourceRowsOptions } from '@dzgrid/core/server';
import { fakeSource, rowsOf, type Call } from './support/fake-source.js';

type R = { id: string; name: string };
const UTC = localeCtx({ locale: 'en-US' });
const k = (id: string) => dataKey(id)!;
const asc = [{ column: 'name', dir: 'asc' as const }];
const desc = [{ column: 'name', dir: 'desc' as const }];
const has = (value: string) => ({ name: { type: 'text' as const, op: 'contains' as const, value } });

/** A fetched set: the search (or what `operations` says) on the server, paged in the browser by 2. */
function setup(o: { operations?: OperationsInput; options?: SourceRowsOptions; env?: Partial<ModelEnv<R>>; fake?: Parameters<typeof fakeSource>[0] } = {}) {
  const fake = fakeSource(o.fake);
  const columns = createColumnModel<R>([{ id: 'name' }]);
  const binding = sourceRows<R>(fake.source as DataSource<R>, o.options);
  const model = binding.create({
    getRowId: (r) => r.id, columns, ctx: UTC, abort: fake.abort,
    operations: o.operations ?? { page: 'client', quick: 'server', filter: 'server' },
    page: { pageSize: 2 },
    ...o.env,
  });
  const changes: ModelChange<R>[] = [];
  model.subscribe((c) => changes.push(c));
  return { ...fake, model, columns, binding, changes, kinds: () => changes.map((c) => c.kind) };
}
type Setup = ReturnType<typeof setup>;
const ids = (s: Setup) => {
  const d = s.model.displayed;
  return Array.from({ length: d.count }, (_, i) => String((d.nodeAt(d.index(i)!) as { id: unknown }).id));
};
const answer = (call: Call, rows: string[], more: Record<string, unknown> = {}) => call.resolve({ rows: rowsOf(rows), ...more });
const shape = (s: Setup) => s.model.problems.map((p) => [p.code, p.severity, p.path]);

describe('the fetched set: one request for everything the server part matches', () => {
  it('asks once, with no page, and pages the answer in the browser', () => {
    const s = setup();
    const req = s.calls[0]!.req;
    expect('page' in req).toBe(false);
    expect({ ...req, signal: undefined }).toEqual({ filter: {}, params: {}, zone: 'UTC', key: '{"filter":{},"params":{},"zone":"UTC"}', signal: undefined });
    answer(s.calls[0]!, ['a', 'b', 'c']);
    expect(ids(s)).toEqual(['a', 'b']);
    expect(s.model.page).toEqual({ index: 0, size: 2, sizes: [25, 50, 100], total: 3, pageCount: 2, hasNext: true, canJump: true });
    s.model.setPage({ index: 1 }, 'user');
    expect(ids(s)).toEqual(['c']);
    expect(s.calls.length).toBe(1);
    expect(s.kinds()).toEqual(['query', 'page']);
    expect(s.changes[1]!.source).toBe('user');
  });

  it('ignores total, hasNext and nextCursor, and the page size: no warning', () => {
    const s = setup();
    answer(s.calls[0]!, ['a', 'b', 'c', 'd', 'e'], { total: 99, hasNext: true, nextCursor: 'x' });
    expect(s.model.problems).toEqual([]);
    expect(s.model.counts).toEqual({ total: 5, filtered: 5, displayed: 2 });
    expect(s.model.page).toMatchObject({ total: 5, pageCount: 3 });
    // Neither total nor hasNext is no fault either.
    s.model.invalidate();
    answer(s.last(), ['a']);
    expect(s.model.problems).toEqual([]);
  });

  it('a malformed answer is refused, like a server page', () => {
    const s = setup();
    answer(s.calls[0]!, ['a', 'b']);
    s.model.invalidate();
    s.last().resolve({ rows: 'no' });
    expect(s.model.status).toMatchObject({ phase: 'error' });
    expect(shape(s)).toEqual([['invalid-page-response', 'error', 'response']]);
    expect(ids(s)).toEqual(['a', 'b']);
  });

  it('a client-part change asks nothing: sorted and cut again in the browser', () => {
    const s = setup();
    answer(s.calls[0]!, ['b', 'c', 'a']);
    s.model.setPage({ index: 1 });
    s.model.setQuery(makeQuery({ sort: asc }), 'user');
    expect(s.calls.length).toBe(1);
    expect(ids(s)).toEqual(['a', 'b']);
    expect(s.model.page).toMatchObject({ index: 0 });
    expect(s.model.status).toEqual({ phase: 'idle' });
    expect(s.kinds()).toEqual(['query', 'page', 'query']);
  });

  it('a blank search is not sent and asks nothing', () => {
    const s = setup();
    answer(s.calls[0]!, ['a']);
    s.model.setQuery(makeQuery({ quick: '   ' }));
    expect(s.calls.length).toBe(1);
    expect(s.changes.length).toBe(1);
  });

  it('a server-part change: a new epoch; the old rows stay, paged, until the answer goes back to page 0', () => {
    const s = setup();
    answer(s.calls[0]!, ['a', 'b', 'c', 'd', 'e']);
    s.model.setQuery(makeQuery({ filter: has('a') }), 'user');
    expect(s.calls[1]!.req.filter).toEqual(has('a'));
    expect(s.model.status).toEqual({ phase: 'loading' });
    // The stale rows can still be paged while the new set loads.
    s.model.setPage({ index: 2 }, 'user');
    expect(ids(s)).toEqual(['e']);
    answer(s.calls[1]!, ['a', 'ab', 'ba']);
    expect(ids(s)).toEqual(['a', 'ab']);
    expect(s.model.page).toMatchObject({ index: 0, total: 3 });
    expect(s.kinds()).toEqual(['query', 'query', 'page', 'query']);
  });

  it('a refresh keeps the page (clamped when the set shrinks)', () => {
    const s = setup();
    answer(s.calls[0]!, ['a', 'b', 'c', 'd', 'e']);
    s.model.setPage({ index: 1 });
    s.model.invalidate();
    answer(s.last(), ['a', 'b', 'c', 'd', 'e', 'f']);
    expect(ids(s)).toEqual(['c', 'd']);
    s.model.setPage({ index: 2 });
    s.model.invalidate();
    answer(s.last(), ['a', 'b', 'c']);
    expect(s.model.page).toMatchObject({ index: 1 });
    expect(ids(s)).toEqual(['c']);
    expect(s.kinds()).toEqual(['query', 'page', 'status', 'rows', 'page', 'status', 'rows']);
  });

  it('both parts at once: the client part applies to the old rows now, the server part when it answers', () => {
    const s = setup();
    answer(s.calls[0]!, ['b', 'c', 'a']);
    s.model.setQuery(makeQuery({ sort: desc, quick: 'x' }), 'user');
    expect(s.calls[1]!.req.quick).toBe('x');
    expect('sort' in s.calls[1]!.req).toBe(false);
    expect(ids(s)).toEqual(['c', 'b']);
    expect(s.kinds()).toEqual(['query', 'query']);
    answer(s.calls[1]!, ['xa', 'xc', 'xb']);
    expect(ids(s)).toEqual(['xc', 'xb']);
  });

  it('a failure keeps the rows and the page; the retry asks the same set', () => {
    const s = setup();
    answer(s.calls[0]!, ['a', 'b', 'c']);
    s.model.setPage({ index: 1 });
    s.model.invalidate();
    s.last().reject('down');
    expect(s.model.status).toMatchObject({ phase: 'error', failure: 'down' });
    expect(s.changes.at(-1)!.failure).toEqual({ error: 'down', key: s.calls[0]!.req.key, page: null });
    expect(ids(s)).toEqual(['c']);
    s.model.invalidate();
    expect(s.last().req.key).toBe(s.calls[0]!.req.key);
  });

  it('a purge drops the rows at once; the answer is a query change on page 0', () => {
    const s = setup();
    answer(s.calls[0]!, ['a', 'b', 'c']);
    s.model.setPage({ index: 1 });
    s.model.invalidate({ purge: true });
    expect(ids(s)).toEqual([]);
    expect(s.model.counts).toEqual({ total: null, filtered: null, displayed: 0 });
    answer(s.last(), ['a', 'b', 'c']);
    expect(s.model.page).toMatchObject({ index: 0 });
    expect(s.kinds()).toEqual(['query', 'page', 'query', 'query']);
  });

  it('a new source: a new epoch, page 0 once it answers', () => {
    const s = setup();
    answer(s.calls[0]!, ['a', 'b', 'c']);
    s.model.setPage({ index: 1 });
    s.model.setSource(sourceRows<R>(s.source as DataSource<R>, { params: { v: 2 } }));
    expect(s.last().req.params).toEqual({ v: 2 });
    expect(ids(s)).toEqual(['c']);
    answer(s.last(), ['a', 'b', 'c']);
    expect(s.model.page).toMatchObject({ index: 0 });
  });

  it('select-all means the rows shown; a key no longer fetched is not kept', () => {
    const s = setup();
    answer(s.calls[0]!, ['a', 'b', 'c']);
    expect(s.model.selectAll).toBe('displayed');
    expect(s.model.keeps(k('a'))).toBe(true);
    expect(s.model.keeps(k('z'))).toBe(false);
    expect(s.model.row(k('c'))).toMatchObject({ key: k('c'), data: { id: 'c', name: 'c' } });
    expect(s.model.row(k('z'))).toBeUndefined();
  });

  it('page off: one scrolling list, no page, page commands ignored', () => {
    const s = setup({ operations: { page: 'off', quick: 'server' }, env: { page: undefined } });
    answer(s.calls[0]!, ['a', 'b', 'c']);
    expect(s.model.page).toBeNull();
    expect(ids(s)).toEqual(['a', 'b', 'c']);
    s.model.setPage({ index: 1 });
    expect(s.changes.length).toBe(1);
    expect(s.model.problems).toEqual([]);
  });

  it('page client without a pagination setting: the default size', () => {
    const s = setup({ operations: 'client', env: { page: undefined } });
    answer(s.calls[0]!, ['a', 'b', 'c']);
    expect(s.model.page).toMatchObject({ index: 0, size: 50, sizes: [25, 50, 100], total: 3 });
    expect(s.model.problems).toEqual([]);
  });

  it('page client with a bad size: told once, the default taken', () => {
    const s = setup({ env: { page: { pageSize: 0 } } });
    expect(shape(s)).toEqual([['invalid-page', 'error', 'pagination.pageSize']]);
    answer(s.calls[0]!, ['a']);
    expect(s.model.page).toMatchObject({ size: 50 });
  });
});

describe('a pagination setting while paging is off', () => {
  it('page off wins: warned at pagination, the setting ignored', () => {
    const s = setup({ operations: { page: 'off', quick: 'server' } });
    expect(shape(s)).toEqual([['invalid-page', 'warning', 'pagination']]);
    answer(s.calls[0]!, ['a', 'b', 'c']);
    expect(s.model.page).toBeNull();
    expect(ids(s)).toEqual(['a', 'b', 'c']);
  });

  it('a bad value in an ignored setting is not told twice: only the warning', () => {
    const s = setup({ operations: { page: 'off', quick: 'server' }, env: { page: { pageSize: -1 } } });
    expect(shape(s)).toEqual([['invalid-page', 'warning', 'pagination']]);
  });

  it('the warning stays with the model, not with an answer', () => {
    const s = setup({ operations: { page: 'off', quick: 'server' } });
    answer(s.calls[0]!, ['a']);
    s.model.setQuery(makeQuery({ quick: 'x' }));
    answer(s.last(), ['x']);
    expect(shape(s)).toEqual([['invalid-page', 'warning', 'pagination']]);
  });
});

describe('counts of the fetched set', () => {
  it('none before the first answer; the set length after', () => {
    const s = setup();
    expect(s.model.counts).toEqual({ total: null, filtered: null, displayed: 0 });
    answer(s.calls[0]!, ['a', 'b', 'c']);
    expect(s.model.counts).toEqual({ total: 3, filtered: 3, displayed: 2 });
  });

  it('total null while the server filters or searches; filtered is what the browser kept', () => {
    const s = setup({ operations: { page: 'client', filter: 'server', quick: 'client' } });
    s.model.setQuery(makeQuery({ filter: has('a') }));
    answer(s.last(), ['a', 'ab', 'ba']);
    expect(s.model.counts).toEqual({ total: null, filtered: 3, displayed: 2 });
    s.model.setQuery(makeQuery({ filter: has('a'), quick: 'b' }));
    expect(s.calls.length).toBe(2);
    expect(s.model.counts).toEqual({ total: null, filtered: 2, displayed: 2 });
    // A search on the server is a filter too.
    const q = setup();
    q.model.setQuery(makeQuery({ quick: 'a' }));
    answer(q.last(), ['a']);
    expect(q.model.counts).toEqual({ total: null, filtered: 1, displayed: 1 });
  });

  it('a client filter alone keeps the total: the set is everything', () => {
    const s = setup({ operations: 'client' });
    answer(s.calls[0]!, ['a', 'b', 'ab']);
    s.model.setQuery(makeQuery({ filter: has('a') }));
    expect(s.model.counts).toEqual({ total: 3, filtered: 2, displayed: 2 });
  });

  it('a new epoch forgets the counts while it loads: no stale filtered set read as the whole', () => {
    const s = setup();
    s.model.setQuery(makeQuery({ quick: 'a' }));
    answer(s.last(), ['a', 'ab']);
    // The search cleared: the rows shown are still the matches of "a", not everything.
    s.model.setQuery(makeQuery({ quick: '' }));
    expect(ids(s)).toEqual(['a', 'ab']);
    expect(s.model.counts).toEqual({ total: null, filtered: null, displayed: 2 });
    answer(s.last(), ['a', 'ab', 'b']);
    expect(s.model.counts).toEqual({ total: 3, filtered: 3, displayed: 2 });
  });

  it('a query changed and changed back is a new epoch too: no counts until it answers', () => {
    const s = setup();
    answer(s.calls[0]!, ['a', 'b', 'c']);
    s.model.setQuery(makeQuery({ quick: 'a' }));
    s.model.setQuery(makeQuery({ quick: '' }));
    expect(s.model.counts).toEqual({ total: null, filtered: null, displayed: 2 });
    answer(s.last(), ['a', 'b', 'c']);
    expect(s.model.counts).toEqual({ total: 3, filtered: 3, displayed: 2 });
    expect(s.kinds().at(-1)).toBe('rows');
  });

  it('a query changed and changed back starts again on page 0, as any search change (step 18, the audit permutations)', () => {
    const s = setup();
    answer(s.calls[0]!, ['a', 'b', 'c', 'd', 'e']);
    s.model.setPage({ index: 2 });
    s.model.setQuery(makeQuery({ quick: 'a' }));
    s.last().reject('down');
    // The old set paged while the new one failed, then the search put back as it was.
    s.model.setPage({ index: 1 });
    s.model.setQuery(makeQuery({ quick: '' }));
    answer(s.last(), ['a', 'b', 'c', 'd', 'e']);
    expect(s.model.page).toMatchObject({ index: 0 });
    expect(ids(s)).toEqual(['a', 'b']);
    // A refresh still keeps the page.
    s.model.setPage({ index: 2 });
    s.model.invalidate();
    answer(s.last(), ['a', 'b', 'c', 'd', 'e']);
    expect(s.model.page).toMatchObject({ index: 2 });
  });

  it('a refresh of the same set keeps them; a failure of a new epoch does not bring them back', () => {
    const s = setup();
    answer(s.calls[0]!, ['a', 'b', 'c']);
    s.model.invalidate();
    expect(s.model.counts).toEqual({ total: 3, filtered: 3, displayed: 2 });
    s.model.setContext(localeCtx({ locale: 'en-US', timeZone: 'Asia/Riyadh' }));
    s.last().reject('down');
    expect(s.model.counts).toEqual({ total: null, filtered: null, displayed: 2 });
  });
});

describe('maxRows: a fetched set too large is warned of, and kept', () => {
  it('warns above maxRows, at response.rows, told once per answer', () => {
    const s = setup({ options: { maxRows: 2 } });
    answer(s.calls[0]!, ['a', 'b', 'c']);
    expect(shape(s)).toEqual([['fetched-set-large', 'warning', 'response.rows']]);
    expect(s.changes[0]!.told).toEqual([{ code: 'fetched-set-large', severity: 'warning', path: 'response.rows' }]);
    expect(s.model.counts).toMatchObject({ total: 3 });
    s.model.setPage({ index: 1 });
    expect(s.changes[1]!.told).toBeUndefined();
    s.model.invalidate();
    answer(s.last(), ['a', 'b', 'c', 'd']);
    expect(s.changes.at(-1)!.told).toHaveLength(1);
  });

  it('at maxRows exactly, no warning; the next answer under it clears it', () => {
    const s = setup({ options: { maxRows: 2 } });
    answer(s.calls[0]!, ['a', 'b']);
    expect(s.model.problems).toEqual([]);
    s.model.invalidate();
    answer(s.last(), ['a', 'b', 'c']);
    s.model.invalidate();
    answer(s.last(), ['a']);
    expect(s.model.problems).toEqual([]);
  });

  it('a new query forgets the warning of the old set', () => {
    const s = setup({ options: { maxRows: 1 } });
    answer(s.calls[0]!, ['a', 'b']);
    s.model.setQuery(makeQuery({ quick: 'a' }));
    expect(s.model.problems).toEqual([]);
  });

  it('100 000 by default, and when maxRows is bad', () => {
    const big = Array.from({ length: 100_001 }, (_, i) => `r${i}`);
    for (const options of [{}, { maxRows: 0 }]) {
      const s = setup({ options, operations: { page: 'off', quick: 'server' }, env: { page: undefined } });
      answer(s.calls[0]!, big.slice(0, 100_000));
      expect(s.model.problems.filter((p) => p.code === 'fetched-set-large')).toEqual([]);
      s.model.invalidate();
      answer(s.last(), big);
      expect(s.model.problems.filter((p) => p.code === 'fetched-set-large')).toHaveLength(1);
    }
  });

  it('server pages never check it', () => {
    const s = setup({ operations: 'server', options: { maxRows: 1 } });
    answer(s.calls[0]!, ['a', 'b'], { total: 2 });
    expect(s.model.problems).toEqual([]);
  });
});

describe('the client shorthand with a source', () => {
  it('fetched once: sort, search, filter and pages in the browser; refetched on refresh, zone and source only', () => {
    const s = setup({ operations: 'client' });
    expect(s.model.ops).toEqual({ filter: 'client', quick: 'client', sort: 'client', page: 'client' });
    answer(s.calls[0]!, ['c', 'a', 'b']);
    s.model.setQuery(makeQuery({ quick: 'a', sort: desc, filter: has('a') }));
    s.model.setPage({ size: 1 });
    s.model.setContext(localeCtx({ locale: 'fr-FR' }));
    expect(s.calls.length).toBe(1);
    expect({ ...s.calls[0]!.req, signal: undefined }).toEqual({ params: {}, zone: 'UTC', key: '{"params":{},"zone":"UTC"}', signal: undefined });
    s.model.setContext(localeCtx({ locale: 'fr-FR', timeZone: 'Asia/Riyadh' }));
    expect(s.calls.length).toBe(2);
    expect(s.last().req.zone).toBe('Asia/Riyadh');
    s.model.invalidate();
    expect(s.calls.length).toBe(3);
    s.model.setSource(sourceRows<R>(s.source as DataSource<R>));
    expect(s.calls.length).toBe(4);
  });
});

describe('the quick search warm-up', () => {
  it('a search in the browser warms the fetched rows: the inner model builds them', () => {
    const s = setup({ operations: 'client' });
    answer(s.calls[0]!, ['a', 'b', 'c']);
    const w = s.model.warmSearch!();
    expect(w.progress).toBe(0);
    expect(w.step(1000)).toBe(true);
    expect(w.progress).toBe(1);
  });

  it('a search on the server needs none: done at once', () => {
    const s = setup();
    answer(s.calls[0]!, ['a', 'b', 'c']);
    const w = s.model.warmSearch!();
    expect(w.progress).toBe(1);
    expect(w.step(0)).toBe(true);
  });
});

describe('through the kernel', () => {
  const withKernel = (s: Setup) => {
    const kernel = createKernel<R>({ rows: s.model, columns: s.columns });
    const events: GridEvent<R>[] = [];
    kernel.subscribe((e) => events.push(e));
    return { kernel, events };
  };

  it('select-all takes the rows of the page shown, as keys', () => {
    const s = setup();
    const { kernel } = withKernel(s);
    answer(s.calls[0]!, ['a', 'b', 'c']);
    kernel.dispatch({ type: 'selection.all' }, 'user');
    expect(kernel.selection.mode).toBe('include');
    expect([...kernel.selection.keys]).toEqual([k('a'), k('b')]);
  });

  it('a page command reaches the inner pages; no request', () => {
    const s = setup();
    const { kernel, events } = withKernel(s);
    answer(s.calls[0]!, ['a', 'b', 'c']);
    kernel.dispatch({ type: 'page.go', index: 1 }, 'user');
    expect(ids(s)).toEqual(['c']);
    expect(s.calls.length).toBe(1);
    expect(events.filter((e) => e.type === 'pageChanged').at(-1)).toMatchObject({ source: 'user', page: { index: 1, total: 3 } });
  });

  it('a host everything-except selection: its count follows the set, told again when a refresh moves it', () => {
    const s = setup();
    const { kernel, events } = withKernel(s);
    answer(s.calls[0]!, ['a', 'b', 'c']);
    kernel.dispatch({ type: 'selection.set', selection: { mode: 'exclude', keys: new Set([k('a')]) } }, 'host');
    const counts = () => events.filter((e) => e.type === 'selectionChanged').map((e) => (e as { count: number | null }).count);
    expect(counts()).toEqual([2]);
    kernel.dispatch({ type: 'rows.refresh' }, 'user');
    answer(s.last(), ['a', 'b', 'c', 'd', 'e']);
    expect(counts()).toEqual([2, 4]);
    // Another zone (step 7): "all" was tied to the old one, so it is cleared, not recounted.
    kernel.dispatch({ type: 'rows.refresh' }, 'user');
    s.model.setContext(localeCtx({ locale: 'en-US', timeZone: 'Asia/Riyadh' }));
    answer(s.last(), ['a', 'b']);
    expect(counts()).toEqual([2, 4, 0]);
    expect(kernel.selection.mode).toBe('include');
  });

  it('a too large set is told as problems', () => {
    const s = setup({ options: { maxRows: 1 } });
    const { events } = withKernel(s);
    answer(s.calls[0]!, ['a', 'b']);
    expect(events.filter((e) => e.type === 'problems')).toMatchObject([{ problems: [{ code: 'fetched-set-large' }] }]);
  });
});

describe('fetched-set reconciling (step 7)', () => {
  const withKernel = (s: Setup) => {
    const kernel = createKernel<R>({ rows: s.model, columns: s.columns });
    const events: GridEvent<R>[] = [];
    kernel.subscribe((e) => events.push(e));
    const told = () => events.filter((e) => e.type === 'selectionChanged') as Extract<GridEvent<R>, { type: 'selectionChanged' }>[];
    return { kernel, events, told };
  };
  /** a, b on page 0 and c on page 1 of a set of four, a and c selected (c is the anchor). */
  const picked = () => {
    const s = setup();
    const t = withKernel(s);
    answer(s.calls[0]!, ['a', 'b', 'c', 'd']);
    t.kernel.dispatch({ type: 'selection.toggle', row: k('a') }, 'user');
    t.kernel.dispatch({ type: 'page.go', index: 1 }, 'user');
    t.kernel.dispatch({ type: 'selection.toggle', row: k('c') }, 'user');
    t.events.length = 0;
    return { s, ...t };
  };

  it('a refresh that keeps the rows keeps the keys, and tells nothing', () => {
    const { s, kernel, told } = picked();
    kernel.dispatch({ type: 'rows.refresh' }, 'user');
    answer(s.last(), ['d', 'c', 'b', 'a']);
    expect(kernel.selection).toEqual({ mode: 'include', keys: new Set([k('a'), k('c')]) });
    expect(told()).toEqual([]);
    expect(kernel.anchor).toBe(k('c'));
  });

  it('keys missing from a new epoch’s answer are dropped: source data, reason rows-dropped; the anchor goes with its row', () => {
    const { s, kernel, told } = picked();
    kernel.dispatch({ type: 'quick.set', text: 'x' }, 'user');
    // Until the answer, the old set is held: nothing dropped.
    expect(kernel.selection.keys.size).toBe(2);
    expect(told()).toEqual([]);
    answer(s.last(), ['a', 'd']);
    expect(kernel.selection).toEqual({ mode: 'include', keys: new Set([k('a')]) });
    expect(told()).toEqual([expect.objectContaining({ source: 'data', count: 1, reason: 'rows-dropped', query: null })]);
    expect(kernel.anchor).toBeNull();
  });

  it('a new epoch whose request fails drops nothing', () => {
    const { s, kernel, told } = picked();
    kernel.dispatch({ type: 'quick.set', text: 'x' }, 'user');
    s.last().reject(new Error('503'));
    expect(kernel.selection.keys.size).toBe(2);
    expect(kernel.anchor).toBe(k('c'));
    expect(told()).toEqual([]);
  });

  it('a purge drops nothing until the next answer, which drops what it no longer has', () => {
    const { s, kernel, told } = picked();
    s.model.invalidate({ purge: true });
    expect(s.model.displayed.count).toBe(0);
    expect(kernel.selection.keys.size).toBe(2);
    expect(told()).toEqual([]);
    answer(s.last(), ['a', 'b']);
    expect(kernel.selection).toEqual({ mode: 'include', keys: new Set([k('a')]) });
    expect(told()).toEqual([expect.objectContaining({ count: 1, reason: 'rows-dropped' })]);
  });

  it('a browser-side change keeps include keys, even of rows it hides', () => {
    const s = setup({ operations: { page: 'client', quick: 'server' } });
    const { kernel } = withKernel(s);
    answer(s.calls[0]!, ['a', 'b', 'c']);
    kernel.dispatch({ type: 'selection.toggle', row: k('a') }, 'user');
    kernel.dispatch({ type: 'filter.column', column: 'name', filter: { type: 'text', op: 'equals', value: 'b' } }, 'user');
    expect([...kernel.selection.keys]).toEqual([k('a')]);
    expect(s.calls.length).toBe(1);
  });

  it('the focus on a row gone takes the row now at its place', () => {
    const s = setup();
    const { kernel } = withKernel(s);
    answer(s.calls[0]!, ['a', 'b', 'c']);
    kernel.dispatch({ type: 'focus.set', focus: { kind: 'cell', row: k('b'), column: 'name' } }, 'user');
    kernel.dispatch({ type: 'quick.set', text: 'x' }, 'user');
    answer(s.last(), ['a', 'c', 'e']);
    expect(kernel.focus).toEqual({ kind: 'cell', row: k('c'), column: 'name' });
  });
});
