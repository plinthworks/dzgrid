import { describe, it, expect } from 'vitest';
import {
  clientRows, createColumnModel, createKernel, dataKey, localeCtx, makeQuery, DEFAULT_PAGE_SIZE, DEFAULT_PAGE_SIZES,
  type ClientModel, type GridEvent, type ModelChange, type PageOptions,
} from '@dzgrid/core';
import { mulberry32 } from './support/rng.js';

type R = { id: string; n: number; t: string };
const rows = (n: number) => Array.from({ length: n }, (_, i): R => ({ id: `r${i}`, n: i, t: i % 3 ? 'b' : 'a' }));
const k = (id: string) => dataKey(id)!;
const ids = (m: ClientModel<R>) => Array.from({ length: m.displayed.count }, (_, i) => String(m.displayed.nodeAt(m.displayed.index(i)!).id));

function paged(n = 12, page: PageOptions | null = { pageSize: 5 }) {
  const columns = createColumnModel<R>([{ id: 'n', type: 'number' }, { id: 't' }]);
  const model = clientRows<R>({ rows: rows(n), getRowId: (r) => r.id, columns, ctx: localeCtx({ locale: 'en-US' }), ...(page && { page }) });
  const changes: ModelChange<R>[] = [];
  model.subscribe((c) => changes.push(c));
  return { columns, model, changes };
}

describe('client paging, the model', () => {
  it('is off without page options', () => {
    const { model, changes } = paged(12, null);
    expect(model.page).toBeNull();
    expect(model.ops.page).toBe('off');
    model.setPage({ index: 1 });
    expect(changes).toEqual([]);
    expect(model.displayed.count).toBe(12);
  });

  it('shows one page: its rows, counts and state; defaults', () => {
    const { model } = paged();
    expect(model.ops.page).toBe('client');
    expect(ids(model)).toEqual(['r0', 'r1', 'r2', 'r3', 'r4']);
    expect(model.counts).toEqual({ total: 12, filtered: 12, displayed: 5 });
    expect(model.page).toEqual({ index: 0, size: 5, sizes: DEFAULT_PAGE_SIZES, total: 12, pageCount: 3, hasNext: true, canJump: true });
    expect(paged(3, {}).model.page).toMatchObject({ size: DEFAULT_PAGE_SIZE, pageCount: 1, hasNext: false });
    expect(DEFAULT_PAGE_SIZES).toEqual([25, 50, 100]);
  });

  it('goes to a page once, with its source; the same page changes nothing; past the end clamps', () => {
    const { model, changes } = paged();
    model.setPage({ index: 2 }, 'user');
    expect(ids(model)).toEqual(['r10', 'r11']);
    expect(changes.map((c) => [c.kind, c.source])).toEqual([['page', 'user']]);
    const shown = model.displayed;
    model.setPage({ index: 2 });
    expect(model.displayed).toBe(shown);
    expect(changes.length).toBe(1);
    model.setPage({ index: 9 });
    expect(model.page!.index).toBe(2);
    expect(changes.length).toBe(1);
  });

  it('a new size keeps the page holding the old first row', () => {
    const { model } = paged(200, { pageSize: 25 });
    model.setPage({ index: 4 });
    model.setPage({ size: 100 });
    expect(model.page).toMatchObject({ index: 1, size: 100 });
    // Not a clamp: page 15 of 10 (rows 150-159) is page 7 of 20 (rows 140-159), of 10 pages.
    model.setPage({ size: 10, index: 15 });
    model.setPage({ size: 20 });
    expect(model.page).toMatchObject({ index: 7, size: 20, pageCount: 10 });
    // Size first, then the index in the new size.
    model.setPage({ size: 10, index: 3 });
    expect(model.page).toMatchObject({ index: 3, size: 10 });
    expect(ids(model)[0]).toBe('r30');
  });

  it('a page change filters and sorts nothing again', () => {
    const { model } = paged(100, { pageSize: 10 });
    model.setQuery(makeQuery({ sort: [{ column: 't', dir: 'asc' }] }));
    const before = model.diagnostics;
    model.setPage({ index: 3 });
    model.setPage({ index: 4 });
    const after = model.diagnostics;
    for (const key of ['filterRuns', 'sortRuns', 'keyBuilds', 'rankBuilds', 'foldBuilds'] as const) expect(after[key], key).toBe(before[key]);
    expect(after.pageCuts).toBe(before.pageCuts + 2);
  });

  it('goes back to the first page when the filter, the search or the sort change; not for an equal query', () => {
    for (const q of [
      makeQuery({ filter: { t: { type: 'text', op: 'equals', value: 'b' } } }),
      makeQuery({ quick: 'b' }),
      makeQuery({ sort: [{ column: 'n', dir: 'desc' }] }),
    ]) {
      const { model, changes } = paged();
      model.setPage({ index: 2 });
      changes.length = 0;
      model.setQuery(q);
      expect(model.page!.index).toBe(0);
      expect(changes.map((c) => c.kind)).toEqual(['query']);
      model.setPage({ index: 1 });
      model.setQuery(makeQuery({ sort: q.sort, filter: q.filter, quick: q.quick }));
      expect(model.page!.index).toBe(1);
    }
  });

  it('keeps the page through a refresh of the rows and reapply; clamps when they shrink, telling it once', () => {
    const { model, changes } = paged();
    model.setPage({ index: 2 });
    model.setRows(rows(12));
    model.reapply();
    expect(model.page!.index).toBe(2);
    changes.length = 0;
    model.applyTransaction({ remove: ['r10', 'r11'] });
    expect(model.page).toMatchObject({ index: 1, pageCount: 2, hasNext: false });
    expect(ids(model)).toEqual(['r5', 'r6', 'r7', 'r8', 'r9']);
    expect(changes.map((c) => c.kind)).toEqual(['rows']);
    model.setRows(rows(3));
    expect(model.page).toMatchObject({ index: 0, pageCount: 1 });
  });

  it('shows a row of the page updated in place', () => {
    const { model } = paged();
    model.applyTransaction({ patch: [{ id: 'r1', set: { t: 'zz' } }] });
    expect(model.displayed.nodeAt(model.displayed.index(1)!).data.t).toBe('zz');
  });

  it('finds a row of a short page in a large list, and not one of another page', () => {
    const { model } = paged(1000, { pageSize: 10 });
    model.setQuery(makeQuery({ sort: [{ column: 'n', dir: 'desc' }] }));
    model.setPage({ index: 3 });
    expect(model.displayed.indexOf(k('r969'))).toBe(0);
    expect(model.displayed.indexOf(k('r960'))).toBe(9);
    expect(model.displayed.indexOf(k('r959'))).toBe(-1);
    expect(model.displayed.indexOf(k('nope'))).toBe(-1);
  });

  it('holds the rows of other pages: they are found and kept, but not displayed', () => {
    const { model } = paged();
    expect(model.row(k('r9'))).toBeDefined();
    expect(model.keeps(k('r9'))).toBe(true);
    expect(model.displayed.indexOf(k('r9'))).toBe(-1);
    expect(model.displayed.indexOf(k('r3'))).toBe(3);
  });

  it('refuses a bad size in the options, and takes the default', () => {
    for (const pageSize of [0, -1, 1.5, Number.NaN]) {
      const { model } = paged(12, { pageSize });
      expect(model.page!.size).toBe(DEFAULT_PAGE_SIZE);
      expect(model.problems).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'invalid-page', path: 'pagination.pageSize' })]));
    }
    const { model } = paged(12, { pageSizes: [0, 10] });
    expect(model.page!.sizes).toEqual(DEFAULT_PAGE_SIZES);
    expect(model.problems).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'invalid-page', path: 'pagination.pageSizes' })]));
  });

  it('cuts the whole list into its pages, whatever the filter, sort and size', () => {
    const rnd = mulberry32(7);
    for (let run = 0; run < 50; run++) {
      const n = Math.floor(rnd() * 60);
      const size = 1 + Math.floor(rnd() * 12);
      const q = makeQuery({ sort: rnd() < 0.5 ? [{ column: 'n', dir: 'desc' }] : [], filter: rnd() < 0.5 ? { t: { type: 'text', op: 'equals', value: 'b' } } : {} });
      const whole = paged(n, null).model;
      whole.setQuery(q);
      const { model } = paged(n, { pageSize: size });
      model.setQuery(q);
      const all: string[] = [];
      for (let p = 0; p < model.page!.pageCount!; p++) {
        model.setPage({ index: p });
        all.push(...ids(model));
      }
      expect(all, `run ${run}`).toEqual(ids(whole));
    }
  });
});

describe('client paging, the kernel', () => {
  function grid(n = 12) {
    const { columns, model } = paged(n);
    const kernel = createKernel<R, ClientModel<R>>({ rows: model, columns });
    const events: GridEvent<R>[] = [];
    kernel.subscribe((e) => events.push(e));
    return { kernel, model, events };
  }

  it('page.go tells pageChanged once, after modelUpdated, with the new state readable', () => {
    const { kernel, events, model } = grid();
    const seen: string[] = [];
    kernel.subscribe((e) => { if (e.type === 'pageChanged') seen.push(`${e.page.index}:${model.page!.index}:${ids(model)[0]}`); });
    expect(kernel.dispatch({ type: 'page.go', index: 1 }, 'user')).toEqual({ ok: true });
    expect(events.map((e) => e.type)).toEqual(['modelUpdated', 'pageChanged']);
    expect(events[1]).toMatchObject({ source: 'user', page: { index: 1 } });
    expect(seen).toEqual(['1:1:r5']);
    expect(kernel.dispatch({ type: 'page.go', index: 99 }, 'user')).toEqual({ ok: true });
    expect(model.page!.index).toBe(2);
  });

  it('refuses a bad index or size, and paging that is off', () => {
    const { kernel } = grid();
    for (const index of [-1, Number.NaN, 1.5]) {
      expect(kernel.dispatch({ type: 'page.go', index }, 'user')).toMatchObject({ ok: false, reason: 'invalid-page', problems: [{ code: 'invalid-page', path: 'page.index' }] });
    }
    expect(kernel.dispatch({ type: 'page.size', size: 0 }, 'user')).toMatchObject({ ok: false, reason: 'invalid-page', problems: [{ path: 'page.size' }] });
    const columns = createColumnModel<R>([{ id: 'n', type: 'number' }]);
    const off = createKernel<R>({ rows: clientRows<R>({ rows: rows(3), getRowId: (r) => r.id, columns, ctx: localeCtx({ locale: 'en-US' }) }), columns });
    expect(off.dispatch({ type: 'page.go', index: 1 }, 'user')).toMatchObject({ ok: false, reason: 'paging-off' });
  });

  it('tells pageChanged when a filter sends the page back to the first, and when only the total changes', () => {
    const { kernel, events } = grid();
    kernel.dispatch({ type: 'page.go', index: 2 }, 'user');
    events.length = 0;
    kernel.dispatch({ type: 'filter.column', column: 't', filter: { type: 'text', op: 'equals', value: 'b' } }, 'user');
    expect(events.find((e) => e.type === 'pageChanged')).toMatchObject({ page: { index: 0, total: 8 } });
    events.length = 0;
    kernel.rows.applyTransaction({ remove: ['r1'] });
    expect(events.find((e) => e.type === 'pageChanged')).toMatchObject({ page: { index: 0, total: 7 } });
  });

  it('keeps the selection across pages; select-all takes the page; a range across pages is refused', () => {
    const { kernel, events } = grid();
    kernel.dispatch({ type: 'selection.toggle', row: k('r1') }, 'user');
    events.length = 0;
    kernel.dispatch({ type: 'page.go', index: 1 }, 'user');
    expect(events.some((e) => e.type === 'selectionChanged')).toBe(false);
    expect([...kernel.selection.keys]).toEqual([k('r1')]);
    kernel.dispatch({ type: 'selection.clear' }, 'user');
    kernel.dispatch({ type: 'selection.all' }, 'user');
    expect([...kernel.selection.keys].sort()).toEqual(['r5', 'r6', 'r7', 'r8', 'r9'].map(k).sort());
    kernel.dispatch({ type: 'selection.toggle', row: k('r6') }, 'user');
    kernel.dispatch({ type: 'page.go', index: 0 }, 'user');
    expect(kernel.dispatch({ type: 'selection.range', target: k('r2'), additive: false }, 'user')).toMatchObject({ ok: false });
  });

  it('moves the focus to the same place on the new page, the last row of a shorter one, the header of an empty one', () => {
    const { kernel, events } = grid();
    kernel.dispatch({ type: 'focus.set', focus: { kind: 'cell', row: k('r4'), column: 't' } }, 'user');
    events.length = 0;
    kernel.dispatch({ type: 'page.go', index: 1 }, 'user');
    expect(kernel.focus).toEqual({ kind: 'cell', row: k('r9'), column: 't' });
    expect(events.find((e) => e.type === 'focusChanged')).toMatchObject({ source: 'data' });
    kernel.dispatch({ type: 'page.go', index: 2 }, 'user');
    expect(kernel.focus).toEqual({ kind: 'cell', row: k('r11'), column: 't' });
    kernel.dispatch({ type: 'filter.column', column: 't', filter: { type: 'text', op: 'equals', value: 'none' } }, 'user');
    expect(kernel.focus).toEqual({ kind: 'header', column: 't' });
  });
});
