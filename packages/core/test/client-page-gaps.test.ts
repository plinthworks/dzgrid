import { describe, it, expect } from 'vitest';
import { clientRows, createColumnModel, createKernel, localeCtx, DEFAULT_PAGE_SIZES, type ClientModel, type GridEvent, type ModelChange, type PageOptions } from '@dzgrid/core';
import { checkPage, pageOf } from '@dzgrid/core/internal';

type R = { id: string; n: number };
const rows = (n: number) => Array.from({ length: n }, (_, i): R => ({ id: `r${i}`, n: i }));
function paged(n = 12, page: PageOptions = { pageSize: 5 }) {
  const columns = createColumnModel<R>([{ id: 'n', type: 'number' }]);
  const model = clientRows<R>({ rows: rows(n), getRowId: (r) => r.id, columns, ctx: localeCtx({ locale: 'en-US' }), page });
  const changes: ModelChange<R>[] = [];
  model.subscribe((c) => changes.push(c));
  const kernel = createKernel<R, ClientModel<R>>({ rows: model, columns });
  const events: GridEvent<R>[] = [];
  kernel.subscribe((e) => events.push(e));
  const pageEvents = () => events.filter((e) => e.type === 'pageChanged');
  return { model, kernel, changes, events, pageEvents };
}

describe('client paging, gaps', () => {
  // M09: index 0 refused would make "back to the first page" impossible through the kernel.
  it('page.go 0 is accepted and goes back to the first page', () => {
    expect(checkPage({ index: 0 })).toEqual([]);
    const { kernel, model, pageEvents } = paged();
    kernel.dispatch({ type: 'page.go', index: 2 }, 'user');
    expect(kernel.dispatch({ type: 'page.go', index: 0 }, 'user')).toEqual({ ok: true });
    expect(model.page!.index).toBe(0);
    expect(pageEvents().at(-1)).toMatchObject({ source: 'user', page: { index: 0 } });
  });

  // M13: a size change that leaves index, total and pageCount alike must still be told.
  it('page.size through the kernel changes the size and tells pageChanged, even with the same page count', () => {
    const { kernel, model, pageEvents } = paged(12, { pageSize: 5 });
    expect(kernel.dispatch({ type: 'page.size', size: 4 }, 'user')).toEqual({ ok: true });
    expect(model.page).toMatchObject({ index: 0, size: 4, pageCount: 3 });
    expect(model.displayed.count).toBe(4);
    expect(pageEvents()).toHaveLength(1);
    expect(pageEvents()[0]).toMatchObject({ source: 'user', page: { size: 4 } });
  });

  // M28 / M33: pageChanged only when the page state changed, not on every model change.
  it('does not tell pageChanged for a change that leaves the page alike', () => {
    const fresh = paged();
    fresh.model.applyTransaction({ patch: [{ id: 'r1', set: { n: 100 } }] });
    expect(fresh.pageEvents()).toEqual([]);
    const { kernel, model, pageEvents } = paged();
    kernel.dispatch({ type: 'page.go', index: 1 }, 'user');
    expect(pageEvents()).toHaveLength(1);
    model.applyTransaction({ patch: [{ id: 'r6', set: { n: 100 } }] });
    kernel.dispatch({ type: 'selection.toggle', row: model.displayed.nodeAt(model.displayed.index(0)!).key }, 'user');
    model.reapply();
    expect(pageEvents()).toHaveLength(1);
  });

  // M21: the model is public (kernel.rows); a bad value given to it directly changes nothing.
  it('the model ignores a bad index or size given directly', () => {
    const { model, changes } = paged();
    model.setPage({ index: 1 });
    changes.length = 0;
    const shown = model.displayed;
    for (const p of [{ index: -1 }, { index: 1.5 }, { size: 0 }, { size: -2 }, { size: Number.NaN }]) {
      model.setPage(p);
      expect(model.page, JSON.stringify(p)).toMatchObject({ index: 1, size: 5 });
    }
    expect(model.displayed).toBe(shown);
    expect(changes).toEqual([]);
  });

  // M02: an empty list of sizes is a bad value: told, and the default taken.
  it('refuses an empty pageSizes', () => {
    const { model } = paged(12, { pageSizes: [] });
    expect(model.page!.sizes).toEqual(DEFAULT_PAGE_SIZES);
    expect(model.problems).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'invalid-page', path: 'pagination.pageSizes' })]));
  });

  // M27: without a source, the model tells 'api'.
  it('a page change without a source is told as api', () => {
    const { model, changes } = paged();
    model.setPage({ index: 1 });
    expect(changes.map((c) => c.source)).toEqual(['api']);
  });

  // M07: pageOf clamps (the server model will feed it raw indexes).
  it('pageOf clamps the index into the pages that exist', () => {
    const cfg = { size: 5, sizes: [5] };
    expect(pageOf(cfg, 9, 12)).toMatchObject({ index: 2, hasNext: false });
    expect(pageOf(cfg, -3, 12)).toMatchObject({ index: 0, hasNext: true });
    expect(pageOf(cfg, 4, 0)).toMatchObject({ index: 0, pageCount: 1, hasNext: false });
  });
});
