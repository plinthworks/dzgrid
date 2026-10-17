import { describe, it, expect } from 'vitest';
import { createColumnModel, localeCtx, makeQuery, type ModelChange, type ModelEnv } from '@dzgrid/core';
import { sourceRows, type DataSource, type SourceRowsOptions } from '@dzgrid/core/server';
import { fakeSource, rowsOf, type Call } from './support/fake-source.js';

type R = { id: string; name: string };
const UTC = localeCtx({ locale: 'en-US' });

/** Server pages of 2 by cursor. */
function setup(o: { options?: SourceRowsOptions; env?: Partial<ModelEnv<R>> } = {}) {
  const fake = fakeSource();
  const columns = createColumnModel<R>([{ id: 'name' }]);
  const binding = sourceRows<R>(fake.source as DataSource<R>, { paging: 'cursor', ...o.options });
  const model = binding.create({ getRowId: (r) => r.id, columns, ctx: UTC, abort: fake.abort, page: { pageSize: 2 }, ...o.env });
  const changes: ModelChange<R>[] = [];
  model.subscribe((c) => changes.push(c));
  return { ...fake, model, binding, changes, kinds: () => changes.map((c) => c.kind) };
}
type Setup = ReturnType<typeof setup>;
const ids = (s: Setup) => {
  const d = s.model.displayed;
  return Array.from({ length: d.count }, (_, i) => String(d.nodeAt(d.index(i)!).id));
};
const answer = (call: Call, rows: string[], more: Record<string, unknown> = {}) => call.resolve({ rows: rowsOf(rows), ...more });
const win = (s: Setup, n = s.calls.length) => s.calls[n - 1]!.req.page;
const shape = (s: Setup) => s.model.problems.map((p) => [p.code, p.severity, p.path]);

describe('cursor pages: next and back', () => {
  it('asks page 0 with no cursor, then each page with the cursor the page before gave', () => {
    const s = setup();
    expect(win(s)).toEqual({ index: 0, size: 2, offset: 0, cursor: null });
    answer(s.calls[0]!, ['a', 'b'], { hasNext: true, nextCursor: 'k1' });
    s.model.setPage({ index: 1 });
    expect(win(s)).toEqual({ index: 1, size: 2, offset: 2, cursor: 'k1' });
    answer(s.last(), ['c', 'd'], { hasNext: true, nextCursor: 'k2' });
    s.model.setPage({ index: 2 });
    expect(win(s)).toEqual({ index: 2, size: 2, offset: 4, cursor: 'k2' });
    answer(s.last(), ['e'], { hasNext: false });
    s.model.setPage({ index: 1 });
    expect(win(s)).toEqual({ index: 1, size: 2, offset: 2, cursor: 'k1' });
    s.model.setPage({ index: 0 });
    expect(win(s)).toEqual({ index: 0, size: 2, offset: 0, cursor: null });
    expect(s.model.problems).toEqual([]);
  });

  it('puts the cursor in the key: the same page by two cursors is two asks', () => {
    const s = setup();
    answer(s.calls[0]!, ['a', 'b'], { hasNext: true, nextCursor: 'k1' });
    s.model.setPage({ index: 1 });
    expect(s.last().req.key).toContain('"cursor":"k1"');
  });

  it('cannot jump: past the highest page reached, the ask stops there', () => {
    const s = setup();
    answer(s.calls[0]!, ['a', 'b'], { hasNext: true, nextCursor: 'k1' });
    s.model.setPage({ index: 4 });
    expect(win(s)).toMatchObject({ index: 1, cursor: 'k1' });
    expect(s.model.page).toMatchObject({ index: 1, canJump: false });
    // Page 1 not answered yet: no cursor for page 2, the ask stays on 1.
    s.model.setPage({ index: 2 });
    expect(s.calls.length).toBe(2);
  });

  it('hasNext needs the next cursor: false while the next page loads, true once it says one', () => {
    const s = setup();
    answer(s.calls[0]!, ['a', 'b'], { hasNext: true, nextCursor: 'k1' });
    expect(s.model.page!.hasNext).toBe(true);
    s.model.setPage({ index: 1 });
    expect(s.model.page!.hasNext).toBe(false);
    answer(s.last(), ['c', 'd'], { hasNext: true, nextCursor: 'k2' });
    expect(s.model.page!.hasNext).toBe(true);
  });

  it('a cursor from the total: a page inside the total with its cursor has a next', () => {
    const s = setup();
    answer(s.calls[0]!, ['a', 'b'], { total: 5, nextCursor: 'k1' });
    expect(s.model.page).toMatchObject({ total: 5, pageCount: 3, hasNext: true, canJump: false });
    expect(s.model.problems).toEqual([]);
    s.model.setPage({ index: 1 });
    expect(win(s)).toMatchObject({ cursor: 'k1' });
  });

  it('clamps by the total and by the cursors, the lower of the two', () => {
    const s = setup();
    answer(s.calls[0]!, ['a', 'b'], { total: 4, nextCursor: 'k1' });
    s.model.setPage({ index: 1 });
    answer(s.last(), ['c', 'd'], { total: 4, hasNext: true, nextCursor: 'k2' });
    // The cursor allows page 2, the total does not (2 pages).
    s.model.setPage({ index: 2 });
    expect(s.calls.length).toBe(2);
  });

  it('ignores a cursor when the page says nothing follows', () => {
    const s = setup();
    answer(s.calls[0]!, ['a', 'b'], { hasNext: false, nextCursor: 'k1' });
    expect(s.model.page!.hasNext).toBe(false);
    s.model.setPage({ index: 1 });
    expect(s.calls.length).toBe(1);
    expect(s.model.problems).toEqual([]);
  });
});

describe('cursor pages: a next without a cursor', () => {
  it('hasNext true without nextCursor: warned at response.nextCursor and read as false', () => {
    const s = setup();
    answer(s.calls[0]!, ['a', 'b'], { hasNext: true });
    expect(shape(s)).toEqual([['invalid-page-response', 'warning', 'response.nextCursor']]);
    expect(s.changes[0]!.told).toEqual([{ code: 'invalid-page-response', severity: 'warning', path: 'response.nextCursor' }]);
    expect(s.model.page!.hasNext).toBe(false);
    s.model.setPage({ index: 1 });
    expect(s.calls.length).toBe(1);
  });

  it('a null or non-string cursor is no cursor', () => {
    for (const nextCursor of [null, 7, undefined]) {
      const s = setup();
      answer(s.calls[0]!, ['a', 'b'], { hasNext: true, nextCursor });
      expect(shape(s), String(nextCursor)).toEqual([['invalid-page-response', 'warning', 'response.nextCursor']]);
      expect(s.model.page!.hasNext).toBe(false);
    }
  });

  it('an empty cursor string is a cursor', () => {
    const s = setup();
    answer(s.calls[0]!, ['a', 'b'], { hasNext: true, nextCursor: '' });
    expect(s.model.problems).toEqual([]);
    s.model.setPage({ index: 1 });
    expect(win(s)).toMatchObject({ cursor: '' });
  });

  it('a next from the total, or inferred, without a cursor: warned too', () => {
    const t = setup();
    answer(t.calls[0]!, ['a', 'b'], { total: 5 });
    expect(shape(t)).toEqual([['invalid-page-response', 'warning', 'response.nextCursor']]);
    expect(t.model.page).toMatchObject({ total: 5, pageCount: 3, hasNext: false });
    const i = setup();
    answer(i.calls[0]!, ['a', 'b']);
    expect(shape(i)).toEqual([
      ['invalid-page-response', 'warning', 'response.hasNext'],
      ['invalid-page-response', 'warning', 'response.nextCursor'],
    ]);
    expect(i.model.page!.hasNext).toBe(false);
  });

  it('the last page of a total needs no cursor', () => {
    const s = setup();
    answer(s.calls[0]!, ['a', 'b'], { total: 2 });
    expect(s.model.problems).toEqual([]);
  });

  it('offset paging never reads the cursor', () => {
    const s = setup({ options: { paging: 'offset' } });
    answer(s.calls[0]!, ['a', 'b'], { hasNext: true });
    expect(s.model.problems).toEqual([]);
    expect(s.model.page!.hasNext).toBe(true);
    s.model.setPage({ index: 1 });
    expect(win(s)).toEqual({ index: 1, size: 2, offset: 2, cursor: null });
  });
});

describe('cursor pages: what forgets the cursors', () => {
  it('a size change goes back to page 0 with no cursor (offset would keep the first row)', () => {
    const s = setup();
    answer(s.calls[0]!, ['a', 'b'], { hasNext: true, nextCursor: 'k1' });
    s.model.setPage({ index: 1 });
    answer(s.last(), ['c', 'd'], { hasNext: true, nextCursor: 'k2' });
    s.model.setPage({ index: 2 });
    answer(s.last(), ['e', 'f'], { hasNext: true, nextCursor: 'k3' });
    s.model.setPage({ size: 3 });
    expect(win(s)).toEqual({ index: 0, size: 3, offset: 0, cursor: null });
    expect(s.model.page).toMatchObject({ index: 0, size: 3, hasNext: false });
    answer(s.last(), ['a', 'b', 'c'], { hasNext: true, nextCursor: 'm1' });
    s.model.setPage({ index: 2 });
    expect(win(s)).toEqual({ index: 1, size: 3, offset: 3, cursor: 'm1' });
  });

  it('a size change with an index: page 0 still', () => {
    const s = setup();
    answer(s.calls[0]!, ['a', 'b'], { hasNext: true, nextCursor: 'k1' });
    s.model.setPage({ index: 1, size: 4 });
    expect(win(s)).toEqual({ index: 0, size: 4, offset: 0, cursor: null });
  });

  it('a new query: page 0, no cursor, the old cursors unusable', () => {
    const s = setup();
    answer(s.calls[0]!, ['a', 'b'], { hasNext: true, nextCursor: 'k1' });
    s.model.setPage({ index: 1 });
    answer(s.last(), ['c', 'd'], { hasNext: true, nextCursor: 'k2' });
    s.model.setQuery(makeQuery({ quick: 'x' }));
    expect(win(s)).toEqual({ index: 0, size: 2, offset: 0, cursor: null });
    s.model.setPage({ index: 1 });
    expect(s.calls.length).toBe(3);
    expect(s.model.page).toMatchObject({ index: 0, hasNext: false });
  });

  it('a purge: back to page 0, the cursors forgotten', () => {
    const s = setup();
    answer(s.calls[0]!, ['a', 'b'], { hasNext: true, nextCursor: 'k1' });
    s.model.setPage({ index: 1 });
    answer(s.last(), ['c', 'd'], { hasNext: true, nextCursor: 'k2' });
    s.model.invalidate({ purge: true });
    expect(win(s)).toEqual({ index: 0, size: 2, offset: 0, cursor: null });
    expect(s.model.page).toMatchObject({ index: 0, hasNext: false });
    s.model.setPage({ index: 1 });
    expect(s.calls.length).toBe(3);
  });

  it('a refresh keeps the page and its cursor', () => {
    const s = setup();
    answer(s.calls[0]!, ['a', 'b'], { hasNext: true, nextCursor: 'k1' });
    s.model.setPage({ index: 1 });
    answer(s.last(), ['c', 'd'], { hasNext: true, nextCursor: 'k2' });
    s.model.invalidate();
    expect(win(s)).toEqual({ index: 1, size: 2, offset: 2, cursor: 'k1' });
  });

  it('a page answered again says what follows it: later cursors go', () => {
    const s = setup();
    answer(s.calls[0]!, ['a', 'b'], { hasNext: true, nextCursor: 'k1' });
    s.model.setPage({ index: 1 });
    answer(s.last(), ['c', 'd'], { hasNext: true, nextCursor: 'k2' });
    s.model.setPage({ index: 0 });
    answer(s.last(), ['a', 'b'], { hasNext: true, nextCursor: 'k1b' });
    // Page 2's cursor came from page 1's older answer: page 2 is out of reach until page 1 answers again.
    s.model.setPage({ index: 2 });
    expect(win(s)).toEqual({ index: 1, size: 2, offset: 2, cursor: 'k1b' });
    // A refresh of page 0 that says nothing follows: no next, no page 1.
    const t = setup();
    answer(t.calls[0]!, ['a', 'b'], { hasNext: true, nextCursor: 'k1' });
    t.model.invalidate();
    answer(t.last(), ['a', 'b'], { hasNext: false });
    t.model.setPage({ index: 1 });
    expect(t.calls.length).toBe(2);
    expect(t.model.page!.hasNext).toBe(false);
  });

  it('a new source: page 0, no cursor', () => {
    const s = setup();
    answer(s.calls[0]!, ['a', 'b'], { hasNext: true, nextCursor: 'k1' });
    s.model.setPage({ index: 1 });
    s.model.setSource(sourceRows<R>(s.source as DataSource<R>, { paging: 'cursor' }));
    expect(win(s)).toEqual({ index: 0, size: 2, offset: 0, cursor: null });
    s.model.setPage({ index: 1 });
    expect(s.calls.length).toBe(3);
  });

  it('a failure keeps the cursors: the retry and the pages before still work', () => {
    const s = setup();
    answer(s.calls[0]!, ['a', 'b'], { hasNext: true, nextCursor: 'k1' });
    s.model.setPage({ index: 1 });
    s.last().reject(new Error('down'));
    s.model.invalidate();
    expect(win(s)).toEqual({ index: 1, size: 2, offset: 2, cursor: 'k1' });
  });
});

describe('cursor pages: an empty page past the end', () => {
  it('steps back to the page shown, and the empty page is out of reach', () => {
    const s = setup();
    answer(s.calls[0]!, ['a', 'b'], { hasNext: true, nextCursor: 'k1' });
    s.model.setPage({ index: 1 });
    answer(s.last(), [], { hasNext: false });
    expect(s.calls.length).toBe(2);
    expect(s.model.page).toMatchObject({ index: 0, hasNext: false });
    expect(ids(s)).toEqual(['a', 'b']);
    s.model.setPage({ index: 1 });
    expect(s.calls.length).toBe(2);
  });

  it('steps back with a fetch, by the cursor of the page asked', () => {
    const s = setup();
    answer(s.calls[0]!, ['a', 'b'], { hasNext: true, nextCursor: 'k1' });
    for (const [i, rows] of [[1, ['c', 'd']], [2, ['e', 'f']], [3, ['g', 'h']], [4, ['i', 'j']]] as const) {
      s.model.setPage({ index: i });
      answer(s.last(), [...rows], { hasNext: true, nextCursor: `k${i + 1}` });
    }
    // Back to page 3, which the data no longer reaches: halfway back to page 0, by page 1's cursor.
    s.model.setPage({ index: 3 });
    expect(win(s)).toMatchObject({ index: 3, cursor: 'k3' });
    answer(s.last(), [], { hasNext: false });
    expect(win(s)).toEqual({ index: 1, size: 2, offset: 2, cursor: 'k1' });
    expect(ids(s)).toEqual(['i', 'j']);
    expect(s.model.page).toMatchObject({ index: 1 });
    // Page 3 is out of reach now; page 2 is, by its cursor.
    answer(s.last(), ['c', 'd'], { hasNext: true, nextCursor: 'k2' });
    expect(s.model.page).toMatchObject({ index: 1, hasNext: true });
    s.model.setPage({ index: 3 });
    expect(win(s)).toEqual({ index: 2, size: 2, offset: 4, cursor: 'k2' });
  });
});

describe('cursor pages: kinds', () => {
  it('one change per call; an answer for another page is a page change', () => {
    const s = setup();
    answer(s.calls[0]!, ['a', 'b'], { hasNext: true, nextCursor: 'k1' });
    s.model.setPage({ index: 1 });
    answer(s.last(), ['c', 'd'], { hasNext: true, nextCursor: 'k2' });
    s.model.setPage({ size: 3 });
    answer(s.last(), ['a', 'b', 'c'], { hasNext: false });
    expect(s.kinds()).toEqual(['query', 'page', 'page', 'page', 'page']);
  });
});
