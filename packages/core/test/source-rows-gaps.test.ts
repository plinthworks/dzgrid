import { describe, it, expect } from 'vitest';
import {
  createColumnModel, createKernel, dataKey, localeCtx, makeQuery,
  type GridEvent, type ModelChange, type ModelEnv,
} from '@dzgrid/core';
import { sourceRows, type DataRequest, type DataSource, type SourceRowsOptions } from '@dzgrid/core/server';
import { fakeSource, rowsOf, type Call } from './support/fake-source.js';

type R = { id: string; name: string };
const UTC = localeCtx({ locale: 'en-US' });
const k = (id: string) => dataKey(id)!;

function setup(o: { options?: SourceRowsOptions; env?: Partial<ModelEnv<R>>; fake?: Parameters<typeof fakeSource>[0] } = {}) {
  const fake = fakeSource(o.fake);
  const columns = createColumnModel<R>([{ id: 'name' }]);
  const binding = sourceRows<R>(fake.source as DataSource<R>, o.options);
  const model = binding.create({ getRowId: (r) => r.id, columns, ctx: UTC, abort: fake.abort, page: { pageSize: 2 }, ...o.env });
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
const withKernel = (s: Setup) => {
  const kernel = createKernel<R>({ rows: s.model, columns: s.columns });
  const events: GridEvent<R>[] = [];
  kernel.subscribe((e) => events.push(e));
  return { kernel, events, types: () => events.map((e) => e.type) };
};

describe('kernel: focus on answers', () => {
  it('keeps focus while a page loads; the answer moves it to the row at the same place, after modelUpdated, from the data', () => {
    const s = setup();
    const { kernel, events, types } = withKernel(s);
    answer(s.calls[0]!, ['a', 'b'], { total: 6 });
    kernel.dispatch({ type: 'focus.set', focus: { kind: 'cell', row: k('b'), column: 'name' } }, 'user');
    events.length = 0;
    kernel.dispatch({ type: 'page.go', index: 1 }, 'user');
    expect(types()).not.toContain('focusChanged');
    expect(kernel.focus).toEqual({ kind: 'cell', row: k('b'), column: 'name' });
    events.length = 0;
    answer(s.last(), ['c', 'd'], { total: 6 });
    // The page state was told at the ask and the total is the same: no second pageChanged.
    expect(types()).toEqual(['modelUpdated', 'focusChanged']);
    expect(events[1]).toMatchObject({ source: 'data', focus: { kind: 'cell', row: k('d') } });
  });

  it('a step back to the page on screen moves neither focus nor selection; one pageChanged from the data', () => {
    const s = setup();
    const { kernel, events, types } = withKernel(s);
    answer(s.calls[0]!, ['a', 'b'], { hasNext: true });
    kernel.dispatch({ type: 'focus.set', focus: { kind: 'cell', row: k('a'), column: 'name' } }, 'user');
    kernel.dispatch({ type: 'selection.toggle', row: k('b') }, 'user');
    kernel.dispatch({ type: 'page.go', index: 1 }, 'user');
    events.length = 0;
    answer(s.last(), [], { hasNext: false });
    expect(types()).toEqual(['modelUpdated', 'pageChanged']);
    expect(events[1]).toMatchObject({ source: 'data', page: { index: 0, hasNext: false } });
    expect(kernel.focus).toEqual({ kind: 'cell', row: k('a'), column: 'name' });
    expect([...kernel.selection.keys]).toEqual([k('b')]);
    expect(s.calls.length).toBe(2);
  });

  it('a purge sends focus to the header; the answer does not bring it back to a cell', () => {
    const s = setup();
    const { kernel } = withKernel(s);
    answer(s.calls[0]!, ['a', 'b'], { total: 6 });
    kernel.dispatch({ type: 'focus.set', focus: { kind: 'cell', row: k('a'), column: 'name' } }, 'user');
    s.model.invalidate({ purge: true });
    expect(kernel.focus).toEqual({ kind: 'header', column: 'name' });
    answer(s.last(), ['a', 'b'], { total: 6 });
    expect(kernel.focus).toEqual({ kind: 'header', column: 'name' });
  });
});

describe('kernel: everything-except counts with unknown totals', () => {
  it('select-all with no total yet counts null, and stays null while the total is unknown', () => {
    const s = setup();
    const { kernel, events } = withKernel(s);
    answer(s.calls[0]!, ['a', 'b'], { hasNext: true });
    kernel.dispatch({ type: 'selection.all' }, 'user');
    expect(events.at(-1)).toMatchObject({ type: 'selectionChanged', count: null, query: expect.anything() });
    kernel.dispatch({ type: 'selection.toggle', row: k('a') }, 'user');
    expect(events.at(-1)).toMatchObject({ type: 'selectionChanged', count: null });
  });

  it('filtered on the server, select-all counts the response total (filtered), not counts.total (null)', () => {
    const s = setup();
    const { kernel, events } = withKernel(s);
    answer(s.calls[0]!, ['a', 'b'], { total: 6 });
    kernel.dispatch({ type: 'quick.set', text: 'a' }, 'user');
    answer(s.last(), ['a'], { total: 4 });
    expect(s.model.counts).toEqual({ total: null, filtered: 4, displayed: 1 });
    kernel.dispatch({ type: 'selection.all' }, 'user');
    expect(events.at(-1)).toMatchObject({ type: 'selectionChanged', count: 4 });
    kernel.dispatch({ type: 'selection.toggle', row: k('a') }, 'user');
    expect(events.at(-1)).toMatchObject({ type: 'selectionChanged', count: 3 });
  });

  it('select-all survives a page change and a refresh, but not another search', () => {
    const s = setup();
    const { kernel } = withKernel(s);
    answer(s.calls[0]!, ['a', 'b'], { total: 6 });
    kernel.dispatch({ type: 'selection.all' }, 'user');
    kernel.dispatch({ type: 'page.go', index: 2 }, 'user');
    answer(s.last(), ['e', 'f'], { total: 6 });
    kernel.dispatch({ type: 'rows.refresh' }, 'user');
    answer(s.last(), ['e', 'f'], { total: 6 });
    expect(kernel.selection.mode).toBe('exclude');
    kernel.dispatch({ type: 'quick.set', text: 'x' }, 'user');
    expect(kernel.selection).toMatchObject({ mode: 'include' });
    expect(kernel.selection.keys.size).toBe(0);
  });
});

describe('kernel: pageChanged sources', () => {
  it('a source that answers at once: one pageChanged from the user, already carrying the answer', () => {
    const s = setup({ fake: { reply: (req) => ({ rows: rowsOf([`p${req.page!.index}`]), total: 6 }) } });
    const { kernel, events, types } = withKernel(s);
    kernel.dispatch({ type: 'page.go', index: 2 }, 'user');
    expect(types()).toEqual(['modelUpdated', 'pageChanged']);
    expect(events[1]).toMatchObject({ source: 'user', page: { index: 2, total: 6, hasNext: false } });
  });

  it('a page clamped by a known total: the asked page is the last, and the request says so', () => {
    const s = setup();
    const { kernel, events } = withKernel(s);
    answer(s.calls[0]!, ['a', 'b'], { total: 5 });
    events.length = 0;
    kernel.dispatch({ type: 'page.go', index: 9 }, 'user');
    expect(s.last().req.page).toMatchObject({ index: 2, offset: 4 });
    expect(events[1]).toMatchObject({ type: 'pageChanged', source: 'user', page: { index: 2 } });
  });

  it('a kernel listener that pages from pageChanged, with a source answering at once: settles, last ask shown', () => {
    const s = setup({ fake: { reply: (req) => ({ rows: rowsOf([`p${req.page!.index}`]), total: 10 }) } });
    const { kernel } = withKernel(s);
    let hops = 0;
    kernel.subscribe((e) => {
      if (e.type === 'pageChanged' && e.page.index < 3 && hops++ < 10) kernel.dispatch({ type: 'page.go', index: e.page.index + 1 }, 'user');
    });
    kernel.dispatch({ type: 'page.go', index: 1 }, 'user');
    expect(s.model.page!.index).toBe(3);
    expect(ids(s)).toEqual(['p3']);
    expect(s.changes.length).toBeGreaterThan(0);
  });
});

describe('thenables that misbehave', () => {
  const thenable = (then: (ok: (v: unknown) => void, err: (e: unknown) => void) => void) => ({ then });

  it('rejects then resolves: the failure counts, the late success is ignored', () => {
    const s = setup({ fake: { reply: (_req, call) => (call.name === 'c1' ? { rows: rowsOf(['a']), total: 1 } : thenable((ok, err) => { err('first'); ok({ rows: rowsOf(['z']), total: 1 }); })) } });
    s.model.invalidate();
    expect(s.model.status).toEqual({ phase: 'error', failure: 'first' });
    expect(ids(s)).toEqual(['a']);
  });

  it('a then getter that throws is a failure, not an escape', () => {
    const bad = Object.defineProperty({}, 'then', { get() { throw new Error('getter'); } });
    const s = setup({ fake: { reply: () => bad } });
    expect(s.model.status.phase).toBe('error');
    expect((s.model.status as { failure: Error }).failure.message).toBe('getter');
  });

  it('a thenable that settles with another thenable is not unwrapped: the answer is malformed', () => {
    const s = setup({ fake: { reply: () => thenable((ok) => ok(Promise.resolve({ rows: [] }))) } });
    expect(s.model.status.phase).toBe('error');
    expect(s.model.problems).toEqual([expect.objectContaining({ code: 'invalid-page-response', severity: 'error', path: 'response' })]);
  });

  it('a thenable that never calls back: loading, superseded by the next ask and aborted', () => {
    const s = setup({ fake: { reply: (req, call) => (call.name === 'c1' ? thenable(() => {}) : { rows: rowsOf(['b']), total: 4 }) } });
    expect(s.model.status.phase).toBe('loading');
    s.model.setPage({ index: 1 });
    expect(s.aborted).toEqual([['c1', 'superseded']]);
    expect(s.model.status.phase).toBe('idle');
    expect(ids(s)).toEqual(['b']);
  });

  it('a thenable calling back twice, later, for a superseded call: both dropped, counted once', () => {
    let late: ((v: unknown) => void) | undefined;
    const s = setup({ fake: { reply: (_req, call) => (call.name === 'c1' ? thenable((ok) => { late = ok; }) : { rows: rowsOf(['b']), total: 4 }) } });
    s.model.setPage({ index: 1 });
    const before = s.changes.length;
    late!({ rows: rowsOf(['x']), total: 4 });
    late!({ rows: rowsOf(['y']), total: 4 });
    expect(s.changes.length).toBe(before);
    expect(ids(s)).toEqual(['b']);
    expect(s.model.diagnostics.gate.dropped.superseded).toBe(1);
  });
});

describe('re-entrancy and destroy', () => {
  it('a source that destroys the model while asked, then answers: no change, no throw', () => {
    let model: { destroy(): void } | undefined;
    const fake = fakeSource({ reply: () => { model?.destroy(); return { rows: rowsOf(['a']), total: 1 }; } });
    const binding = sourceRows<R>(fake.source as DataSource<R>);
    const m = binding.create({ getRowId: (r) => r.id, columns: createColumnModel<R>([{ id: 'name' }]), ctx: UTC, page: { pageSize: 2 }, abort: fake.abort });
    const heard: unknown[] = [];
    m.subscribe((c) => heard.push(c));
    model = m;
    expect(() => m.invalidate()).not.toThrow();
    expect(heard).toEqual([]);
    expect(m.diagnostics.gate.dropped.destroyed).toBe(1);
    m.setPage({ index: 1 });
    expect(fake.calls.length).toBe(2);
  });

  it('a source that refreshes while asked: the newer ask wins, the first is superseded', () => {
    let model: { invalidate(): void } | undefined;
    let n = 0;
    const s = setup({ fake: { reply: () => { if (model && n++ === 0) model.invalidate(); return { rows: rowsOf([`r${n}`]), total: 1 }; } } });
    model = s.model;
    s.changes.length = 0;
    s.model.setPage({ size: 3 });
    expect(s.calls.length).toBe(3);
    expect(s.changes.length).toBe(1);
    expect(s.model.status.phase).toBe('idle');
    expect(s.model.diagnostics.gate.dropped.superseded).toBe(1);
  });

  it('a malformed answer is a problem until the next accepted answer clears it', () => {
    const s = setup();
    answer(s.calls[0]!, ['a', 'b'], { total: 6 });
    s.model.invalidate();
    s.last().resolve({ rows: 'nope' });
    expect(s.model.problems.map((p) => p.severity)).toEqual(['error']);
    expect(ids(s)).toEqual(['a', 'b']);
    s.model.invalidate();
    answer(s.last(), ['a', 'b'], { total: 6 });
    expect(s.model.problems).toEqual([]);
  });
});

/**
 * Bugs found by the test analysis of step 5 part 2, fixed since: each test failed before its fix.
 * Flip to `it` once fixed.
 */
describe('found bugs (expected behaviour)', () => {
  it('was a bug: the end found past an unknown total outlives a refresh that brings a total', () => {
    const s = setup();
    answer(s.calls[0]!, ['a', 'b'], { hasNext: true });
    s.model.setPage({ index: 1 });
    answer(s.last(), []);
    expect(s.model.page).toMatchObject({ index: 0, hasNext: false });
    // The data grew: a refresh of page 0 now says 10 rows.
    s.model.invalidate();
    answer(s.last(), ['a', 'b'], { total: 10 });
    // pageCount 5, index 0: there is a next page. Code says hasNext false (endAt still 2).
    expect(s.model.page).toMatchObject({ index: 0, total: 10, pageCount: 5, hasNext: true });
  });

  it('was a bug: the end outlives an explicit hasNext true on a later answer (purge too)', () => {
    const s = setup();
    answer(s.calls[0]!, ['a', 'b'], { hasNext: true });
    s.model.setPage({ index: 1 });
    answer(s.last(), []);
    s.model.invalidate({ purge: true });
    answer(s.last(), ['a', 'b'], { hasNext: true });
    expect(s.model.page!.hasNext).toBe(true);
  });

  it('was a bug: a page asked while a new query loads is clamped by the old query total', () => {
    const s = setup();
    answer(s.calls[0]!, ['a', 'b'], { total: 6 }); // 3 pages
    s.model.setQuery(makeQuery({ sort: [{ column: 'name', dir: 'desc' }] }));
    s.model.setPage({ index: 5 });
    // The new query's size is unknown: page 5 should be asked, not page 2.
    expect((s.last().req as DataRequest).page!.index).toBe(5);
  });

  it('was a bug (kernel): select-all before the total is known never gets its count when the total arrives', () => {
    const s = setup();
    const { kernel, events } = withKernel(s);
    kernel.dispatch({ type: 'selection.all' }, 'user');
    expect(events.at(-1)).toMatchObject({ type: 'selectionChanged', count: null });
    answer(s.calls[0]!, ['a', 'b'], { total: 6 });
    // The count a host shows ("6 selected") only travels in selectionChanged: nothing tells it 6.
    expect(events.filter((e) => e.type === 'selectionChanged').at(-1)).toMatchObject({ count: 6 });
  });
});

describe('warnings of an answer that no longer counts', () => {
  it('are forgotten by a new query and by a purge', () => {
    for (const next of ['query', 'purge'] as const) {
      const s = setup();
      // No total and no hasNext: a warning.
      answer(s.calls[0]!, ['a', 'b']);
      expect(s.model.problems.some((p) => p.code === 'invalid-page-response')).toBe(true);
      if (next === 'query') s.model.setQuery(makeQuery({ quick: 'x' }));
      else s.model.invalidate({ purge: true });
      expect(s.model.problems.some((p) => p.code === 'invalid-page-response'), next).toBe(false);
    }
  });
});
