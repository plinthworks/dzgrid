import { describe, it, expect, afterEach } from 'vitest';
import { makeQuery, type ColumnDef, type GridEvent } from '@dzgrid/core';
import { sourceRows, type DataRequest, type DataSource } from '@dzgrid/core/server';
import { createGrid, type GridInstance } from '../src/grid.js';
import type { Geometry, ViewportBox } from '../src/render/measure.js';
import { UPDATE_POLICY } from '../src/update.js';
import { EN } from '../src/locales/en.js';

type R = { id: string; name: string };
let grids: GridInstance<R, any>[] = [];
afterEach(() => { for (const g of grids) g.destroy(); grids = []; document.body.innerHTML = ''; });

/** A source answered by the test: each fetch waits for `answer` or `fail`. */
function fake() {
  const calls: { req: DataRequest; ok(v: unknown): void; err(e: unknown): void }[] = [];
  const source: DataSource<R> = {
    fetch: (req) => ({ then(ok: (v: never) => void, err: (e: unknown) => void) { calls.push({ req, ok: ok as never, err }); } }) as never,
  };
  const rows = (ids: string[]) => ids.map((id) => ({ id, name: id }));
  return {
    source, calls,
    answer: (ids: string[], more: object = { total: ids.length }, at = calls.length - 1) => calls[at]!.ok({ rows: rows(ids), ...more }),
    fail: (error: unknown, at = calls.length - 1) => calls[at]!.err(error),
  };
}

function make(more: object = {}) {
  const box: ViewportBox = { block: 400, inline: 600, scrollTop: 0, scrollInline: 0 };
  const geometry: Geometry = { read: () => ({ ...box }), writeScrollTop: () => {}, writeScrollInline: () => {} };
  const host = document.createElement('div');
  document.body.append(host);
  const events: GridEvent<R>[] = [];
  const f = fake();
  const columns: ColumnDef<R, any>[] = [{ id: 'name' }];
  const g = createGrid<R>(host, { source: sourceRows(f.source), operations: 'server', pagination: { pageSize: 2 }, getRowId: (r: R) => r.id, columns, messages: EN, onEvent: (e: GridEvent<R>) => events.push(e), ...more } as never, { geometry, sync: true }) as GridInstance<R, any>;
  grids.push(g);
  const q = <E extends Element = HTMLElement>(s: string) => host.querySelector<E & HTMLElement>(s);
  const rowsShown = () => [...host.querySelectorAll('.dzg-layer > .dzg-row')].map((r) => r.querySelector('[data-col="name"]')!.textContent);
  return { g, host, events, f, q, rowsShown, root: q('.dzg')!, vp: q('.dzg-viewport')!, overlay: q('.dzg-overlay')! };
}

describe('a grid fed by a server', () => {
  it('first load: the loading overlay, busy, no rows; then the rows, nothing busy or stale', () => {
    const t = make();
    expect(t.overlay.hidden).toBe(false);
    expect(t.overlay.textContent).toBe(EN.text['grid.loading']);
    expect(t.vp.getAttribute('aria-busy')).toBe('true');
    expect(t.rowsShown()).toEqual([]);
    t.f.answer(['a', 'b'], { total: 6 });
    expect(t.rowsShown()).toEqual(['a', 'b']);
    expect(t.overlay.hidden).toBe(true);
    expect(t.vp.hasAttribute('aria-busy')).toBe(false);
    expect(t.root.hasAttribute('data-stale')).toBe(false);
    expect(t.vp.getAttribute('aria-rowcount')).toBe('3');
  });

  it('a second load keeps the rows, marked stale and busy, with no overlay', () => {
    const t = make();
    t.f.answer(['a', 'b'], { total: 6 });
    t.g.kernel.dispatch({ type: 'page.go', index: 1 }, 'user');
    expect(t.rowsShown()).toEqual(['a', 'b']);
    expect(t.root.hasAttribute('data-stale')).toBe(true);
    expect(t.vp.getAttribute('aria-busy')).toBe('true');
    expect(t.overlay.hidden).toBe(true);
    t.f.answer(['c', 'd'], { total: 6 });
    expect(t.rowsShown()).toEqual(['c', 'd']);
    expect(t.root.hasAttribute('data-stale')).toBe(false);
  });

  it('a failure: the error overlay over the rows kept, fetchFailed with the host error, announced; retry asks the same page', async () => {
    const t = make();
    t.f.answer(['a', 'b'], { total: 6 });
    t.g.kernel.dispatch({ type: 'page.go', index: 1 }, 'user');
    const error = new Error('503');
    t.f.fail(error);
    expect(t.overlay.hidden).toBe(false);
    expect(t.overlay.textContent).toBe(EN.text['grid.error'] + EN.text['grid.retry']);
    expect(t.rowsShown()).toEqual(['a', 'b']);
    expect(t.events.find((e) => e.type === 'fetchFailed')).toMatchObject({ error, page: 1 });
    // The live region empties, then speaks a moment later (so a repeat is heard).
    await new Promise((r) => setTimeout(r, 400));
    expect(t.host.querySelector('[aria-live]')!.textContent).toContain(EN.text['announce.error']);
    t.g.kernel.dispatch({ type: 'rows.refresh' }, 'user');
    expect(t.f.calls.at(-1)!.req.page!.index).toBe(1);
  });

  it('says no rows for an empty source and no matches for an empty filtered one; the host overlay still wins', () => {
    const t = make();
    t.f.answer([], { total: 0 });
    expect(t.overlay.textContent).toBe(EN.text['grid.noRows']);
    t.g.kernel.dispatch({ type: 'quick.set', text: 'zz' }, 'user');
    t.f.answer([], { total: 0 });
    expect(t.overlay.textContent).toBe(EN.text['grid.noMatches']);
    t.g.update({ overlay: 'loading' });
    expect(t.overlay.textContent).toBe(EN.text['grid.loading']);
  });

  it('a new source, live, asks again and drops the old answers', () => {
    const t = make();
    const old = t.f.calls[0]!;
    const next = fake();
    t.g.update({ source: sourceRows(next.source) } as never);
    old.ok({ rows: [{ id: 'x', name: 'x' }], total: 1 });
    expect(t.rowsShown()).toEqual([]);
    next.answer(['n'], { total: 1 });
    expect(t.rowsShown()).toEqual(['n']);
  });

  it('refuses what cannot change live: operations, rows on a source grid, a source on a rows grid', () => {
    expect(UPDATE_POLICY.operations).toBe('fixed');
    expect(UPDATE_POLICY.source).toBe('live');
    const t = make();
    t.g.update({ operations: 'client' } as never);
    t.g.update({ rows: [{ id: 'z', name: 'z' }] } as never);
    const paths = t.events.flatMap((e) => (e.type === 'problems' ? e.problems.map((p) => p.path) : []));
    expect(paths).toEqual(expect.arrayContaining(['settings.operations', 'settings.rows']));
    const host = document.createElement('div');
    document.body.append(host);
    const told: GridEvent<R>[] = [];
    const plain = createGrid<R>(host, { rows: [], getRowId: (r) => r.id, columns: [{ id: 'name' }], messages: EN, onEvent: (e) => told.push(e) }, { sync: true });
    grids.push(plain as never);
    plain.update({ source: sourceRows(fake().source) } as never);
    expect(told.some((e) => e.type === 'problems' && e.problems.some((p) => p.path === 'settings.source'))).toBe(true);
  });

  it('destroyed during a load: a late answer paints nothing, the request is aborted', () => {
    const t = make();
    const call = t.f.calls[0]!;
    t.g.destroy();
    expect(call.req.signal.aborted).toBe(true);
    expect(() => call.ok({ rows: [{ id: 'a', name: 'a' }], total: 1 })).not.toThrow();
  });

  it('operations on the server without a source are told', () => {
    const host = document.createElement('div');
    document.body.append(host);
    const told: GridEvent<R>[] = [];
    const g = createGrid<R>(host, { rows: [], operations: 'server', getRowId: (r: R) => r.id, columns: [{ id: 'name' }], messages: EN, onEvent: (e: GridEvent<R>) => told.push(e) } as never, { sync: true });
    grids.push(g as never);
    void makeQuery;
    expect(told.some((e) => e.type === 'problems' && e.problems.some((p) => p.code === 'invalid-operations'))).toBe(true);
  });
});

describe('step 5 part 4 review', () => {
  it('prepares a browser search over the rows a server sent, once they arrive', () => {
    const t = make({ operations: { filter: 'server', sort: 'server', quick: 'client', page: 'client' }, searchWarmup: 'idle' });
    const model = t.g.kernel.rows as { warmSearch?: () => unknown };
    let warmed = 0;
    const real = model.warmSearch!.bind(model);
    model.warmSearch = () => { warmed++; return real(); };
    t.f.answer(['a', 'b'], {});
    expect(warmed).toBeGreaterThan(0);
  });

  it('takes a settings object spread whole: rows or source left undefined are not a change', () => {
    const t = make();
    t.g.update({ rows: undefined, locale: 'en-US' } as never);
    const host = document.createElement('div');
    document.body.append(host);
    const told: GridEvent<R>[] = [];
    const plain = createGrid<R>(host, { rows: [], getRowId: (r: R) => r.id, columns: [{ id: 'name' }], messages: EN, onEvent: (e: GridEvent<R>) => told.push(e) }, { sync: true });
    grids.push(plain as never);
    plain.update({ source: undefined, locale: 'en-US' } as never);
    const problems = [...t.events, ...told].filter((e) => e.type === 'problems');
    expect(problems).toEqual([]);
  });

  it('tells a failure of the very first request, even a synchronous one', async () => {
    const host = document.createElement('div');
    document.body.append(host);
    const told: GridEvent<R>[] = [];
    const error = new Error('down');
    const source: DataSource<R> = { fetch: () => { throw error; } };
    const g = createGrid<R>(host, { source: sourceRows(source), operations: 'server', getRowId: (r: R) => r.id, columns: [{ id: 'name' }], messages: EN, onEvent: (e: GridEvent<R>) => told.push(e) } as never, { sync: true });
    grids.push(g as never);
    expect(told.find((e) => e.type === 'fetchFailed')).toMatchObject({ error });
    await new Promise((r) => setTimeout(r, 200));
    expect(host.querySelector('[aria-live]')!.textContent).toContain(EN.text['announce.error']);
  });
});

describe('step 5 parts 3-4 test analysis (DOM)', () => {
  it('a first failure is told with its request key', () => {
    const host = document.createElement('div');
    document.body.append(host);
    const told: GridEvent<R>[] = [];
    const source: DataSource<R> = { fetch: () => { throw new Error('down'); } };
    const g = createGrid<R>(host, { source: sourceRows(source), operations: 'server', getRowId: (r: R) => r.id, columns: [{ id: 'name' }], messages: EN, onEvent: (e: GridEvent<R>) => told.push(e) } as never, { sync: true });
    grids.push(g as never);
    const f = told.find((e) => e.type === 'fetchFailed') as { key: string } | undefined;
    expect(f?.key).toMatch(/^\{/);
  });

  it('the same rows given again to a source grid are no change', () => {
    const rows = [{ id: 'z', name: 'z' }];
    const t = make({ rows });
    t.g.update({ rows, locale: 'en-US' } as never);
    expect(t.events.some((e) => e.type === 'problems' && e.problems.some((p) => p.path === 'settings.rows'))).toBe(false);
  });
});
