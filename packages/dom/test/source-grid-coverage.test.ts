import { describe, it, expect, afterEach } from 'vitest';
import type { ColumnDef, GridEvent } from '@dzgrid/core';
import { sourceRows, type DataRequest, type DataSource } from '@dzgrid/core/server';
import { createGrid, type GridInstance } from '../src/grid.js';
import type { Geometry, ViewportBox } from '../src/render/measure.js';
import { EN } from '../src/locales/en.js';

type R = { id: string; name: string };
let grids: GridInstance<R, any>[] = [];
afterEach(() => { for (const g of grids) g.destroy(); grids = []; document.body.innerHTML = ''; });

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

function make(more: object = {}, f = fake()) {
  const box: ViewportBox = { block: 400, inline: 600, scrollTop: 0, scrollInline: 0 };
  const geometry: Geometry = { read: () => ({ ...box }), writeScrollTop: () => {}, writeScrollInline: () => {} };
  const host = document.createElement('div');
  document.body.append(host);
  const events: GridEvent<R>[] = [];
  const columns: ColumnDef<R, any>[] = [{ id: 'name' }];
  const settings = { source: sourceRows(f.source), operations: 'server', pagination: { pageSize: 2 }, getRowId: (r: R) => r.id, columns, messages: EN, onEvent: (e: GridEvent<R>) => events.push(e), ...more };
  const g = createGrid<R>(host, settings as never, { geometry, sync: true }) as GridInstance<R, any>;
  grids.push(g);
  const q = (s: string) => host.querySelector<HTMLElement>(s)!;
  const rowsShown = () => [...host.querySelectorAll('.dzg-layer > .dzg-row')].map((r) => r.querySelector('[data-col="name"]')!.textContent);
  const problems = () => events.flatMap((e) => (e.type === 'problems' ? e.problems.map((p) => p.path) : []));
  return { g, host, events, f, settings, rowsShown, problems, root: q('.dzg'), vp: q('.dzg-viewport'), overlay: q('.dzg-overlay') };
}

describe('a grid on a server: what the review left untested', () => {
  it('the first load has no rows to mark stale', () => {
    const t = make();
    expect(t.vp.getAttribute('aria-busy')).toBe('true');
    expect(t.root.hasAttribute('data-stale')).toBe(false);
  });

  it('after a failure: nothing busy, nothing stale, the error over the rows kept', () => {
    const t = make();
    t.f.answer(['a', 'b'], { total: 6 });
    t.g.kernel.dispatch({ type: 'page.go', index: 1 }, 'user');
    expect(t.vp.getAttribute('aria-busy')).toBe('true');
    t.f.fail(new Error('503'));
    expect(t.vp.hasAttribute('aria-busy')).toBe(false);
    expect(t.root.hasAttribute('data-stale')).toBe(false);
    expect(t.overlay.textContent).toBe(EN.text['grid.error']);
    // The retry loads again: busy, rows stale under no overlay.
    t.g.kernel.dispatch({ type: 'rows.refresh' }, 'user');
    expect(t.vp.getAttribute('aria-busy')).toBe('true');
    expect(t.root.hasAttribute('data-stale')).toBe(true);
    expect(t.overlay.hidden).toBe(true);
  });

  it("the host's overlay wins over a server's failure", () => {
    const t = make({ overlay: 'loading' });
    t.f.fail(new Error('down'));
    expect(t.overlay.textContent).toBe(EN.text['grid.loading']);
  });

  it('a first failure is told once, with the page asked, under the error overlay', () => {
    const host = document.createElement('div');
    document.body.append(host);
    const told: GridEvent<R>[] = [];
    const error = new Error('down');
    const source: DataSource<R> = { fetch: () => { throw error; } };
    const g = createGrid<R>(host, { source: sourceRows(source), operations: 'server', pagination: { pageSize: 2 }, getRowId: (r: R) => r.id, columns: [{ id: 'name' }], messages: EN, onEvent: (e: GridEvent<R>) => told.push(e) } as never, { sync: true });
    grids.push(g as never);
    const failed = told.filter((e) => e.type === 'fetchFailed');
    expect(failed).toHaveLength(1);
    expect(failed[0]).toMatchObject({ error, page: 0 });
    expect(host.querySelector('.dzg-overlay')!.textContent).toBe(EN.text['grid.error']);
    expect(host.querySelector('.dzg-viewport')!.hasAttribute('aria-busy')).toBe(false);
  });

  it("requests carry the window's own AbortSignal (what fetch() accepts), aborted when superseded", () => {
    const t = make();
    t.f.answer(['a', 'b'], { total: 6 });
    t.g.kernel.dispatch({ type: 'page.go', index: 1 }, 'user');
    const first = t.f.calls[1]!.req.signal;
    expect(first).toBeInstanceOf(window.AbortSignal);
    t.g.kernel.dispatch({ type: 'page.go', index: 2 }, 'user');
    expect(first.aborted).toBe(true);
    expect(t.f.calls[2]!.req.signal.aborted).toBe(false);
  });

  it('operations reach the source: a fetched set asks no page, and a browser search asks nothing', () => {
    const t = make({ operations: { filter: 'server', sort: 'server', quick: 'client', page: 'client' } });
    expect('page' in t.f.calls[0]!.req).toBe(false);
    t.f.answer(['a', 'b', 'c'], {});
    t.g.kernel.dispatch({ type: 'quick.set', text: 'b' }, 'user');
    expect(t.f.calls).toHaveLength(1);
    expect(t.rowsShown()).toEqual(['b']);
  });

  it('a source cannot be taken away: refused, and the grid keeps asking its own', () => {
    const t = make();
    t.f.answer(['a', 'b'], { total: 6 });
    t.g.update({ source: undefined } as never);
    expect(t.problems()).toContain('settings.source');
    t.g.kernel.dispatch({ type: 'rows.refresh' }, 'user');
    expect(t.f.calls).toHaveLength(2);
  });

  it('the settings spread whole again, same source: no new request, nothing refused', () => {
    const t = make();
    t.f.answer(['a', 'b'], { total: 6 });
    t.g.update({ ...t.settings, label: 'People' } as never);
    expect(t.f.calls).toHaveLength(1);
    expect(t.problems()).toEqual([]);
    expect(t.rowsShown()).toEqual(['a', 'b']);
  });

  it('a new source through update: the old rows stay, stale and busy, until the new ones come, from page 0', () => {
    const t = make();
    t.f.answer(['a', 'b'], { total: 6 });
    t.g.kernel.dispatch({ type: 'page.go', index: 1 }, 'user');
    t.f.answer(['c', 'd'], { total: 6 });
    const next = fake();
    t.g.update({ source: sourceRows(next.source) } as never);
    expect(next.calls).toHaveLength(1);
    expect(next.calls[0]!.req.page!.index).toBe(0);
    expect(t.rowsShown()).toEqual(['c', 'd']);
    expect(t.root.hasAttribute('data-stale')).toBe(true);
    expect(t.vp.getAttribute('aria-busy')).toBe('true');
    expect(t.overlay.hidden).toBe(true);
    next.answer(['n', 'm'], { total: 2 });
    expect(t.rowsShown()).toEqual(['n', 'm']);
    expect(t.root.hasAttribute('data-stale')).toBe(false);
  });

  it('a purge empties the grid: the loading overlay again, busy, not stale', () => {
    const t = make();
    t.f.answer(['a', 'b'], { total: 6 });
    (t.g.kernel.rows as { invalidate(o: object): void }).invalidate({ purge: true });
    expect(t.rowsShown()).toEqual([]);
    expect(t.overlay.textContent).toBe(EN.text['grid.loading']);
    expect(t.vp.getAttribute('aria-busy')).toBe('true');
    expect(t.root.hasAttribute('data-stale')).toBe(false);
  });

  it('every failure is announced, not only the first', async () => {
    const t = make();
    t.f.fail(new Error('a'));
    await new Promise((r) => setTimeout(r, 400));
    const live = t.host.querySelector('[aria-live]')!;
    expect(live.textContent).toContain(EN.text['announce.error']);
    t.g.kernel.dispatch({ type: 'rows.refresh' }, 'user');
    t.f.fail(new Error('b'));
    expect(t.events.filter((e) => e.type === 'fetchFailed')).toHaveLength(2);
  });
});
